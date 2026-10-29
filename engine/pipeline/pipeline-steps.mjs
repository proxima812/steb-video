// Шаги конвейера pipeline/video.mjs, вынесенные отдельно: параллельный рендер кадров, планировка, рывки, классы движка.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ENGINE, run, writeJSON} from '../pipeline/video-tools.mjs';

// Анимация считается только от render(t), поэтому кадры можно снимать кусками в нескольких Chrome
// и склеить без перекодирования. Каждый кусок начинается с ключевого кадра.
export function renderChunks(frames, workers) {
  const n = Math.max(1, Math.min(workers, Math.floor(frames / 60)));
  return Array.from({length: n}, (_, i) => [Math.round(i * frames / n), Math.round((i + 1) * frames / n)]);
}
export function defaultWorkers() {
  return Number(process.env.WORKERS ?? Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))));
}
// Несколько одновременных Chrome оставляют после себя chrome_crashpad_handler (по одному на запуск, ppid 1).
// Запоминаем, какие были до рендера, и после завершаем только новые от Google Chrome.
async function crashpads() {
  const {stdout} = await run('ps', ['-axo', 'pid=,ppid=,command=']);
  return new Set(stdout.split('\n').filter(l => /Google Chrome.*chrome_crashpad_handler/.test(l))
    .map(l => l.trim().split(/\s+/)).filter(([, ppid]) => ppid === '1').map(([pid]) => +pid));
}
async function killNewCrashpads(before) {
  for (const pid of await crashpads()) if (!before.has(pid)) { try { process.kill(pid); } catch {} }
}
export async function renderParallel({env, options, out, workers = defaultWorkers()}) {
  const {start, fps, frames} = options, chunks = renderChunks(frames, workers);
  const render = (extra) => run(process.execPath, [path.join(ENGINE, 'pipeline/render.mjs')], {env: {...env, AUDIO: 'none', ...extra}});
  if (chunks.length === 1) return (await render({OUT: out})).stdout.trim();
  const begun = performance.now(), dir = `${out}.chunks`, before = await crashpads();
  await fs.rm(dir, {recursive: true, force: true});
  await fs.mkdir(dir, {recursive: true});
  try {
    const parts = chunks.map((_, i) => path.join(dir, `${String(i).padStart(2, '0')}.mp4`));
    // Границы кусков - по номерам кадров; последний кончается ровно на исходном TO, чтобы округление не вышло за DUR.
    const jobs = chunks.map(([a, b], i) => render({FROM: String(start + a / fps),
      TO: i === chunks.length - 1 ? String(env.TO ?? env.DUR) : String(start + b / fps), OUT: parts[i]}));
    try { await Promise.all(jobs); }
    catch (e) { for (const job of jobs) job.child?.kill('SIGTERM'); await Promise.allSettled(jobs); throw e; }
    const list = path.join(dir, 'list.txt');
    await fs.writeFile(list, parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    const temp = out.replace(/\.mp4$/i, '') + '.concat.mp4';
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', temp]);
    await fs.rename(temp, out);
    const stats = await Promise.all(parts.map(async p => JSON.parse(await fs.readFile(`${p}.render.json`, 'utf8'))));
    const elapsedSeconds = (performance.now() - begun) / 1000, total = stats.reduce((s, x) => s + x.frames, 0);
    if (total !== frames) throw new Error(`Rendered ${total} frames instead of ${frames}`);
    await writeJSON(`${out}.render.json`, {...stats[0], start, frames, duration: frames / fps, workers: chunks.length,
      seekMs: stats.reduce((s, x) => s + x.seekMs, 0), screenshotMs: stats.reduce((s, x) => s + x.screenshotMs, 0),
      backpressureMs: stats.reduce((s, x) => s + x.backpressureMs, 0), elapsedSeconds, framesPerSecond: frames / elapsedSeconds});
    return `Rendered ${frames} frames in ${elapsedSeconds.toFixed(2)}s (${(frames / elapsedSeconds).toFixed(1)} fps, ${chunks.length} workers)`;
  } finally { await fs.rm(dir, {recursive: true, force: true}); await killNewCrashpads(before); }
}

// Планировка (checks/frame-layout.mjs) по нормам AGENTS.md: заполненность, наезды камеры, текст на плашке.
export async function layoutCheck(page, out) {
  await run(process.execPath, [path.join(ENGINE, 'checks/frame-layout.mjs')], {env: {...process.env, PAGE: page, OUT: out}});
  const {rows, cams, spill = [], quality} = JSON.parse(await fs.readFile(out, 'utf8'));
  const warnings = [];
  for (const [k, r] of rows.entries()) {
    const norm = k === 0 ? 70 : 50;
    if (!r.empty && r.fill < norm) warnings.push(`сцена ${r.i} (${r.t} с): заполнено ${r.fill}%, норма ${norm}%+`);
  }
  for (const c of cams) if (!c.ok) warnings.push(`наезд ${c.t} с на ${c.tg}: цель вне safe zone (${c.box || c.err})`);
  for (const s of spill) warnings.push(`наезд: текст на плашке или за краем ${s}`);
  if(quality){
    for(const c of quality.camera)warnings.push(`камера ${c.time} с: ${c.code} #${c.target}`);
    for(const c of quality.contrast)warnings.push(`контраст сцены ${c.scene}: «${c.text}» ${c.ratio}:1 < ${c.minimum}:1`);
    for(const c of quality.smallText)warnings.push(`мелкий текст сцены ${c.scene}: «${c.text}» ${c.size}px`);
    for(const c of quality.overflow)warnings.push(`обрезка текста сцены ${c.scene}: «${c.text}»`);
  }
  return warnings;
}

// Рывки в готовом MP4 (checks/motion-check.py считает кадры при 30 fps, поэтому только для финала).
export async function motionCheck(video, out) {
  let stdout, ok = true;
  try { ({stdout} = await run('python3', [path.join(ENGINE, 'checks/motion-check.py'), video])); }
  catch (e) { if (e.code !== 1 || !e.stdout) throw e; stdout = e.stdout; ok = false; }
  await fs.writeFile(out, stdout);
  const [, jerks = '0', cuts = '0'] = stdout.match(/рывков (\d+), слишком резких смен (\d+)/) || [];
  return {ok, jerks: +jerks, cuts: +cuts, details: stdout.split('\n').filter(l => l.startsWith('  ')).map(l => l.trim())};
}

// Свой компонент ролика с именем класса движка (.row, .card) получает чужие стили и разваливает верстку.
// Считаются только голые правила «.row{...}»: правка в контексте (.p5w .pic, .electric .bd, .bd.on) - намеренная.
const stripBlocks = css => { let prev; css = css.replace(/\/\*[\s\S]*?\*\//g, ''); do { prev = css; css = css.replace(/\{[^{}]*\}/g, '{}'); } while (css !== prev); return css; };
export function cssClasses(css) {
  return new Set([...stripBlocks(css).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]));
}
export function ownClassCollisions(html, engineClasses) {
  const out = new Map();
  for (const [, css] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[^{]+\{/g, '');
    for (const [, selectors] of flat.matchAll(/([^{}]+)\{[^{}]*\}/g)) for (const raw of selectors.split(',')) {
      const name = raw.trim().match(/^\.(-?[_a-zA-Z][\w-]*)$/)?.[1];   // только голое «.row{...}»
      if (name && engineClasses.has(name)) out.set(name, raw.trim());
    }
  }
  return [...out].map(([name, selector]) => ({name, selector}));
}
export async function classCheck(page, dependencies) {
  const sheets = dependencies.filter(f => f.endsWith('.css') && path.dirname(f) === path.join(ENGINE, 'styles'));
  const engineClasses = new Set();
  for (const f of sheets) for (const c of cssClasses(await fs.readFile(f, 'utf8'))) engineClasses.add(c);
  return ownClassCollisions(await fs.readFile(page, 'utf8'), engineClasses)
    .map(({name, selector}) => `класс .${name} уже есть в движке (правило «${selector}»): если это свой компонент - назови иначе, если правка движка - пиши .p5w .${name}`);
}
