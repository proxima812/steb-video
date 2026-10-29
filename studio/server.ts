// Studio: локальный сервер дашборда. Отдает файлы проекта (/video, /engine), API ассетов и роликов,
// сохраняет правки v.html (с бэкапом в work/studio-backups) и запускает engine/pipeline/video.mjs.
import { readdir, stat, readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAuthoring, InputError } from './authoring';
import { byteRange, createMusic, importTrack } from './music';

const ROOT = path.resolve(import.meta.dir, '..');
const VIDEO = path.join(ROOT, 'video');
const authoring = createAuthoring(ROOT);
// внешний каталог музыки: только чтение (studio/docs/visual-editor.md, «Страница Музыка»)
const music = createMusic(process.env.STUDIO_MUSIC_ROOT || '/Users/samgold/Desktop/музыка');
const DIST = path.join(import.meta.dir, 'dist');
const PORT = Number(process.env.STUDIO_PORT || 4321);
const IMG = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const AUD = /\.(mp3|wav|m4a|flac|ogg)$/i;
const VOICE = /^(ElevenLabs_.*|voice.*)\.(mp3|wav|m4a|flac|ogg)$/i;
const SHARED = new Set(['assets', 'avatar', 'sfx', 'wallpapers', 'music']);

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);

async function files(dir: string, re: RegExp) {
  try {
    const names = (await readdir(dir)).filter(n => re.test(n) && !n.startsWith('.')).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
    return Promise.all(names.map(async name => ({ name, path: rel(path.join(dir, name)), size: (await stat(path.join(dir, name))).size })));
  } catch { return []; }
}
const readText = (p: string) => readFile(p, 'utf8').catch(() => null);
const readJson = async (p: string) => { const t = await readText(p); try { return t ? JSON.parse(t) : null; } catch { return null; } };

// ---------- ролики ----------
async function videoDirs(): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory() || e.name.startsWith('.') || (depth === 0 && SHARED.has(e.name))) continue;
      const abs = path.join(dir, e.name);
      if (existsSync(path.join(abs, 'v.html'))) out.push(path.relative(VIDEO, abs).split(path.sep).join('/'));
      else if (depth < 1) await walk(abs, depth + 1);
    }
  };
  await walk(VIDEO, 0);
  return out.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}

function videoAbs(id: string) {
  const abs = path.resolve(VIDEO, id);
  if (!abs.startsWith(VIDEO + path.sep) || !existsSync(path.join(abs, 'v.html'))) return null;
  return abs;
}

function parseAttrs(s: string) {
  const a: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) a[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return a;
}

function parseSections(html: string) {
  const out = [];
  // комментарии не трогаем: секции внутри <!-- --> не считаются
  const masked = html.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
  for (const m of masked.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)) {
    const start = m.index!, end = start + m[0].length, attrs = parseAttrs(m[1]);
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&rarr;/g, '→').replace(/&mdash;/g, '—').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const cls = (attrs.class || '').split(/\s+/).filter(Boolean);
    const wall = /--wall:\s*url\(([^)]+)\)/.exec(attrs.style || '')?.[1]?.replace(/['"]/g, '');
    out.push({
      index: out.length, html: html.slice(start, end), attrs, text: text.slice(0, 140),
      s: Number(attrs['data-s'] ?? 0), e: Number(attrs['data-e'] ?? 0),
      bg: cls.includes('black') ? 'black' : cls.includes('white') ? 'white' : cls.find(c => ['dark', 'light', 'electric', 'candy'].includes(c)) || '',
      pal: cls.find(c => c.startsWith('pal-'))?.slice(4) || '',
      outro: cls.includes('outro'), tr: attrs['data-tr'] || '',
      wall: wall ? normalizeRef(wall) : null,
    });
  }
  return out;
}

// ../video/x, ../../video/x -> video/x (пути из v.html считаются от engine/)
function normalizeRef(ref: string) {
  const clean = decodeURI(ref.split(/[?#]/)[0]).replace(/^(\.\.\/)+/, '');
  return clean.startsWith('video/') || clean.startsWith('engine/') ? clean : 'engine/' + clean;
}

function referencedAssets(html: string) {
  const refs = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const r = m[1] || m[2];
    if (!r || /^(https?:|data:|#)/.test(r)) continue;
    const n = normalizeRef(r);
    if (n.startsWith('video/') && (IMG.test(n) || AUD.test(n))) refs.add(n);
  }
  return [...refs];
}

async function voiceOf(abs: string, cfg: any) {
  if (cfg?.voice) return rel(path.resolve(abs, cfg.voice));
  const v = (await files(abs, AUD)).find(f => VOICE.test(f.name));
  return v?.path ?? null;
}
async function musicOf(abs: string, cfg: any) {
  if (cfg?.music === 'none') return null;
  if (cfg?.music) return rel(path.resolve(abs, cfg.music));
  return (await files(path.join(abs, 'music'), AUD))[0]?.path ?? null;
}

async function outputs(abs: string) {
  const out: { label: string; path: string }[] = [];
  const o = path.join(abs, 'output');
  if (existsSync(path.join(o, 'video.mp4'))) out.push({ label: 'Финал', path: rel(path.join(o, 'video.mp4')) });
  for (const e of await readdir(o, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory() && /^(preview|clip)/.test(e.name) && existsSync(path.join(o, e.name, 'video.mp4')))
      out.push({ label: e.name === 'preview' ? 'Превью' : e.name, path: rel(path.join(o, e.name, 'video.mp4')) });
  }
  return out;
}

async function mtimeOf(abs: string) {
  let m = 0;
  for (const f of ['v.html', 'video.json', 'words.json', 'three.mjs']) {
    const s = await stat(path.join(abs, f)).catch(() => null);
    if (s) m = Math.max(m, s.mtimeMs);
  }
  return m;
}

async function summary(id: string) {
  const abs = path.join(VIDEO, id);
  const html = (await readText(path.join(abs, 'v.html'))) || '';
  const cfg = await readJson(path.join(abs, 'video.json'));
  const sections = parseSections(html);
  const name = id.split('/').pop()!;
  const num = /^(\d+)/.exec(name)?.[1] ?? '';
  const outs = await outputs(abs);
  return {
    id, num, slug: name.replace(/^\d+-/, ''),
    duration: cfg?.duration ?? Math.max(0, ...sections.map(s => s.e)),
    scenes: sections.length,
    cover: existsSync(path.join(abs, 'output/cover.jpg')) ? rel(path.join(abs, 'output/cover.jpg')) : null,
    hasFinal: outs.some(o => o.label === 'Финал'),
    posted: existsSync(path.join(abs, 'posted.json')),
    mtime: await mtimeOf(abs),
  };
}

async function detail(id: string) {
  const abs = path.join(VIDEO, id);
  const html = (await readText(path.join(abs, 'v.html'))) || '';
  const cfg = await readJson(path.join(abs, 'video.json'));
  return {
    ...(await summary(id)),
    page: rel(path.join(abs, 'v.html')),
    config: cfg,
    sections: parseSections(html),
    words: (await readJson(path.join(abs, 'words.json'))) || [],
    voice: await voiceOf(abs, cfg),
    music: await musicOf(abs, cfg),
    outputs: await outputs(abs),
    assets: referencedAssets(html),
    review: await readText(path.join(abs, 'output/pipeline-review.md')),
    plan: await readText(path.join(abs, 'output/plan.md')),
    notes: (await readJson(path.join(abs, 'work/studio-notes.json'))) || {},
  };
}

// ---------- черновик для превью ----------
// Размеченная копия черновика (data-studio-id) живет только в памяти и отдается из папки ролика,
// чтобы <base href="../../engine/"> и пути ролика работали как у v.html.
const DRAFT_FILE = '__studio-draft.html';
const drafts = new Map<string, string[]>(); // id -> ключи по порядку
const draftHtml = new Map<string, string>();
let draftSeq = 0;
function putDraft(id: string, html: string) {
  const key = `${Date.now().toString(36)}-${++draftSeq}`;
  const list = drafts.get(id) || [];
  list.push(key); draftHtml.set(`${id}|${key}`, html);
  while (list.length > 6) draftHtml.delete(`${id}|${list.shift()}`);
  drafts.set(id, list);
  return key;
}

// LaTeX -> SVG существующим engine/pipeline/tex2svg.mjs на копии черновика во временной папке вне проекта
async function texToSvg(html: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-tex-'));
  try {
    await writeFile(path.join(dir, 'v.html'), html);
    const proc = Bun.spawn(['node', 'engine/pipeline/tex2svg.mjs', dir], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
    const timer = setTimeout(() => proc.kill(), 60000);
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    clearTimeout(timer);
    if (code !== 0) throw new InputError('tex2svg: ' + (err.split('\n').find(l => /Error|LaTeX/.test(l)) || err.trim().split('\n').pop() || `код ${code}`));
    return { html: await readFile(path.join(dir, 'v.html'), 'utf8'), log: out.trim() };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

// ---------- ассеты ----------
async function assets() {
  const ids = await videoDirs();
  const pages = await Promise.all(ids.map(async id => ({ id, html: (await readText(path.join(VIDEO, id, 'v.html'))) || '' })));
  const usedIn = (p: string) => {
    const name = p.split('/').pop()!;
    return pages.filter(v => v.html.includes(name) || v.html.includes(encodeURI(name))).map(v => v.id);
  };
  type A = { name: string; path: string; size: number; source?: string; usedIn: string[] };
  const withUse = (list: { name: string; path: string; size: number }[], extra: { source?: string } = {}): A[] => list.map(a => ({ ...a, ...extra, usedIn: usedIn(a.path) }));

  const images: A[] = [...withUse(await files(path.join(VIDEO, 'assets/images'), IMG), { source: 'общие' })];
  const music: A[] = [...withUse(await files(path.join(ROOT, 'music'), AUD), { source: 'общие' })];
  const voices: A[] = withUse(await files(path.join(VIDEO, 'assets/voices'), AUD), { source: 'общие' });
  music.push(...withUse(await files(path.join(VIDEO, 'music'), AUD), { source: 'общие' }));
  for (const id of ids) {
    const abs = path.join(VIDEO, id), cfg = await readJson(path.join(abs, 'video.json'));
    for (const f of await files(path.join(abs, 'img'), IMG)) images.push({ ...f, source: id, usedIn: usedIn(f.path).filter(v => v === id) });
    const m = await musicOf(abs, cfg);
    for (const f of await files(path.join(abs, 'music'), AUD)) music.push({ ...f, source: id, usedIn: f.path === m ? [id] : [] });
    const v = await voiceOf(abs, cfg);
    for (const f of await files(abs, AUD)) if (VOICE.test(f.name)) voices.push({ ...f, source: id, usedIn: f.path === v ? [id] : [] });
  }
  // Audio usage comes from video.json as well as legacy automatic discovery.
  for (const id of ids) {
    const abs = path.join(VIDEO, id), cfg = await readJson(path.join(abs, 'video.json'));
    for (const [list, selected] of [[music, await musicOf(abs, cfg)], [voices, await voiceOf(abs, cfg)]] as const)
      for (const a of list) if (a.path === selected && !a.usedIn.includes(id)) a.usedIn.push(id);
  }
  return {
    wallpapers: withUse(await files(path.join(VIDEO, 'wallpapers'), IMG)),
    avatars: [...withUse(await files(path.join(VIDEO, 'avatar'), IMG)), ...withUse(await files(path.join(VIDEO, 'avatar/cut'), IMG), { source: 'cut' })],
    images, sfx: withUse(await files(path.join(VIDEO, 'sfx'), AUD)), music, voices,
  };
}

async function palettes() {
  const css = (await readText(path.join(ROOT, 'engine/styles/p5-world.css'))) || '';
  const out: Record<string, { fg: string; bg: string }> = {};
  for (const m of css.matchAll(/\.pal-([a-z]+)\{--pal-fg:(#[0-9a-fA-F]+);--pal-bg:(#[0-9a-fA-F]+)\}/g)) out[m[1]] = { fg: m[2], bg: m[3] };
  return out;
}

// ---------- сборка ----------
type Job = { id: string; video: string; mode: string; args: string[]; status: 'running' | 'done' | 'error' | 'stopped'; code: number | null; log: string[]; started: number; ended?: number; proc?: ReturnType<typeof Bun.spawn> };
const jobs = new Map<string, Job>();
let jobSeq = 0;

function startJob(video: string, body: any) {
  if ([...jobs.values()].some(j => j.video === video && j.status === 'running')) throw new Error('Сборка этого ролика уже идет');
  const args = ['engine/pipeline/video.mjs', 'video/' + video];
  const mode = String(body.mode || 'preview');
  if (mode === 'check') args.push('--check-only');
  else if (mode === 'preview') args.push('--preview');
  else if (mode === 'force') args.push('--force');
  else if (mode !== 'final') throw new Error('Неизвестный режим: ' + mode);
  if (body.from != null && body.to != null && mode !== 'check') args.push('--from', String(+body.from), '--to', String(+body.to));
  const job: Job = { id: String(++jobSeq), video, mode, args, status: 'running', code: null, log: [`$ node ${args.join(' ')}`], started: Date.now() };
  const proc = Bun.spawn(['node', ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, FORCE_COLOR: '0' } });
  job.proc = proc;
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of stream) {
      buf += dec.decode(chunk, { stream: true });
      const parts = buf.split(/\r?\n|\r/); buf = parts.pop()!;
      for (const p of parts) if (p.trim()) job.log.push(p.replace(/\x1b\[[0-9;]*m/g, ''));
    }
    if (buf.trim()) job.log.push(buf);
  };
  Promise.all([pump(proc.stdout as ReadableStream), pump(proc.stderr as ReadableStream), proc.exited]).then(([, , code]) => {
    job.code = code; job.ended = Date.now();
    if (job.status === 'running') job.status = code === 0 ? 'done' : 'error';
    job.log.push(job.status === 'done' ? 'Готово' : `Завершено с кодом ${code}`);
  });
  jobs.set(job.id, job);
  return job;
}
const jobView = (j: Job, since = 0) => ({ id: j.id, video: j.video, mode: j.mode, args: j.args, status: j.status, code: j.code, started: j.started, ended: j.ended, total: j.log.length, lines: j.log.slice(since) });

// ---------- статика ----------
const AUDIO_TYPE: Record<string, string> = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.ogg': 'audio/ogg' };
function serveFile(req: Request, abs: string) {
  const f = Bun.file(abs);
  const size = f.size;
  const type = AUDIO_TYPE[path.extname(abs).toLowerCase()] || f.type;
  const headers: Record<string, string> = { 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Type': type };
  const range = size > 0 ? byteRange(req.headers.get('range'), size) : null;
  if (range === 'invalid') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  if (range) return new Response(f.slice(range.start, range.end + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': String(range.end - range.start + 1) } });
  return new Response(f, { headers });
}

async function staticFrom(req: Request, base: string, pathname: string) {
  const abs = path.resolve(base, '.' + decodeURIComponent(pathname));
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  const s = await stat(abs).catch(() => null);
  return s?.isFile() ? serveFile(req, abs) : null;
}

// ---------- маршруты ----------
async function api(req: Request, url: URL): Promise<Response> {
  const parts = url.pathname.split('/').slice(2).map(decodeURIComponent); // ['videos', id, ...]
  const method = req.method;
  if (parts[0] === 'assets' && method === 'POST') {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail('Выберите файл');
    return json(await authoring.upload(file, String(form.get('kind') || ''), String(form.get('video') || '')), 201);
  }
  if (parts[0] === 'assets' && method === 'GET') return json(await assets());
  if (parts[0] === 'palettes' && method === 'GET') return json(await palettes());
  if (parts[0] === 'music' && parts.length === 1 && method === 'GET') return json(await music.list());
  if (parts[0] === 'music' && parts[1] === 'file' && (method === 'GET' || method === 'HEAD')) return serveFile(req, await music.resolve(url.searchParams.get('path')));
  if (parts[0] === 'tex' && method === 'POST') {
    const { html } = await req.json();
    if (typeof html !== 'string' || html.length > 20 * 1024 * 1024) return fail('Нужен текст v.html');
    return json(await texToSvg(html));
  }
  if (parts[0] === 'videos' && parts.length === 1) {
    if (method === 'POST') {
      const id = await authoring.createVideo(await req.json());
      return json(await summary(id), 201);
    }
    if (method === 'GET') return json(await Promise.all((await videoDirs()).map(summary)));
    return fail('Метод не поддерживается', 405);
  }
  if (parts[0] === 'jobs') {
    if (parts.length === 1) return json([...jobs.values()].reverse().map(j => jobView(j, j.log.length)));
    const job = jobs.get(parts[1]);
    if (!job) return fail('Нет такой сборки', 404);
    if (parts[2] === 'stop' && method === 'POST') { job.status = 'stopped'; job.proc?.kill(); return json(jobView(job, job.log.length)); }
    return json(jobView(job, Number(url.searchParams.get('since') || 0)));
  }
  if (parts[0] === 'videos') {
    const id = parts[1], abs = videoAbs(id);
    if (!abs) return fail('Ролик не найден', 404);
    const action = parts[2];
    if (!action && method === 'GET') return json(await detail(id));
    if (action === 'audio' && method === 'PUT') {
      await authoring.setAudio(id, await req.json());
      return json(await detail(id));
    }
    if (action === 'mtime') return json({ mtime: await mtimeOf(abs) });
    if (action === 'source' && method === 'GET') return json({ html: await readText(path.join(abs, 'v.html')) });
    if (action === 'source' && method === 'PUT') {
      const { html, base } = await req.json();
      const saved = await authoring.savePage(id, html, base);
      return json({ ...(await detail(id)), backup: saved.backup });
    }
    if (action === 'draft' && method === 'POST') {
      const { html } = await req.json();
      if (typeof html !== 'string' || html.length > 20 * 1024 * 1024) return fail('Нужен текст черновика');
      return json({ key: putDraft(id, html) });
    }
    if (action === 'presets' && method === 'GET') return json(await authoring.presets(id));
    if (action === 'presets' && method === 'PUT') return json(await authoring.savePresets(id, await req.json()));
    if (action === 'music' && method === 'POST') {
      const body = await req.json();
      const src = await music.resolve(body.path);
      const r = await importTrack(authoring, ROOT, id, src, body.base);
      return json({ ...(await detail(id)), imported: r });
    }
    if (action === 'section' && method === 'PUT') {
      const index = Number(parts[3]);
      const { html, base } = await req.json();
      const page = (await readText(path.join(abs, 'v.html')))!;
      const sec = parseSections(page)[index];
      if (!sec) return fail('Нет сцены ' + index, 404);
      if (base != null && base !== sec.html) return fail('Сцена изменилась на диске после открытия. Обновите страницу.', 409);
      const start = page.indexOf(sec.html);
      await authoring.savePage(id, page.slice(0, start) + String(html) + page.slice(start + sec.html.length), page);
      return json(await detail(id));
    }
    if (action === 'notes' && method === 'PUT') {
      await mkdir(path.join(abs, 'work'), { recursive: true });
      await writeFile(path.join(abs, 'work/studio-notes.json'), JSON.stringify(await req.json(), null, 2));
      return json({ ok: true });
    }
    if (action === 'render' && method === 'POST') {
      try { return json(jobView(startJob(id, await req.json()))); } catch (e: any) { return fail(e.message, 409); }
    }
  }
  return fail('Не найдено', 404);
}

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  maxRequestBodySize: 101 * 1024 * 1024,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        const origin = req.headers.get('origin');
        if (!['GET', 'HEAD'].includes(req.method) && origin) {
          const host = new URL(origin).hostname;
          if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return fail('Запрос разрешен только из локальной студии', 403);
        }
        return await api(req, url);
      }
      if (url.pathname.startsWith('/video/') && url.pathname.endsWith('/' + DRAFT_FILE)) {
        const id = decodeURIComponent(url.pathname.slice('/video/'.length, -DRAFT_FILE.length - 1));
        const html = videoAbs(id) && draftHtml.get(`${id}|${url.searchParams.get('k')}`);
        return html ? new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }) : new Response('Черновик не найден', { status: 404 });
      }
      if (url.pathname.startsWith('/video/') || url.pathname.startsWith('/engine/') || url.pathname.startsWith('/music/'))
        return (await staticFrom(req, ROOT, url.pathname)) || new Response('Not found', { status: 404 });
      if (existsSync(DIST)) return (await staticFrom(req, DIST, url.pathname)) || serveFile(req, path.join(DIST, 'index.html'));
      return new Response('Studio API. Интерфейс: bun run dev (http://localhost:5173) или bun run start.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (e: any) {
      if (e instanceof InputError) return fail(e.message, e.status);
      console.error(e);
      return fail(e.message || String(e), 500);
    }
  },
});
console.log(`Studio API: http://localhost:${PORT}`);
