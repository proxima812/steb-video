import { mkdir, readdir, readFile, writeFile, realpath, stat, rm, copyFile, rename } from 'node:fs/promises';
import path from 'node:path';

export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
const AUDIO = /\.(mp3|wav|m4a|flac|ogg)$/i;
const shared: Record<string, string> = {
  wallpapers: 'video/wallpapers', avatars: 'video/avatar', images: 'video/assets/images',
  voices: 'video/assets/voices', music: 'video/music', sfx: 'video/sfx',
};
const local: Record<string, string> = { images: 'img', music: 'music', voices: '.' };
const cleanText = (s: string) => s.replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/[—–]/g, '-');
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function createAuthoring(root: string) {
  const video = path.join(root, 'video');
  // Check each existing ancestor before creating directories, including symlinks.
  async function contained(abs: string) {
    const base = await realpath(root);
    if (!abs.startsWith(root + path.sep)) throw new InputError('Путь вне проекта');
    let probe = abs;
    while (true) {
      try {
        const actual = await realpath(probe);
        if (actual !== base && !actual.startsWith(base + path.sep)) throw new InputError('Путь ведет вне проекта');
        return;
      } catch (e: any) { if (e.code !== 'ENOENT') throw e; probe = path.dirname(probe); }
    }
  }
  async function videoDir(id: string) {
    if (!id || id.split('/').some(x => !x || x === '.' || x === '..') || id.includes('\\')) throw new InputError('Некорректный ролик');
    const dir = path.resolve(video, id);
    if (!dir.startsWith(video + path.sep)) throw new InputError('Некорректный ролик');
    await contained(dir);
    if (!(await stat(path.join(dir, 'v.html')).catch(() => null))?.isFile()) throw new InputError('Ролик не найден', 404);
    return dir;
  }
  async function createVideo(input: { title: string; script: string }) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 100) throw new InputError('Название: от 1 до 100 символов');
    if (typeof input.script !== 'string' || input.script.length > 30000) throw new InputError('Сценарий: не более 30000 символов');
    const title = cleanText(input.title.trim());
    const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50) || 'new-video';
    const template = await readFile(path.join(root, 'engine/templates/template.html'), 'utf8');
    const masked = template.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
    const sections = [...masked.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)];
    if (!sections.length) throw new Error('В шаблоне нет сцен');
    const scene = `<section class="s white pal-sky" data-s="0" data-e="5" data-camk="1 #studio-title 1.08 1; 3.5 c 1 1">\n  <div id="studio-title" class="h2">${escape(title)}</div>\n</section>\n<section class="s white pal-violet outro" data-s="5" data-e="7.5" data-tr="down" data-deco="none"></section>`;
    const last = sections.at(-1)!;
    const html = template.slice(0, sections[0].index) + scene + template.slice(last.index! + last[0].length);
    await contained(video);
    await mkdir(video, { recursive: true });
    const numbers: number[] = [];
    for (const entry of await readdir(video, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      numbers.push(Number(/^(\d+)/.exec(entry.name)?.[1] || 0));
      // Nested series can own numbers even without a v.html yet.
      for (const sub of await readdir(path.join(video, entry.name), { withFileTypes: true }))
        if (sub.isDirectory()) numbers.push(Number(/^(\d+)/.exec(sub.name)?.[1] || 0));
    }
    let n = Math.max(0, ...numbers) + 1;
    // A number reservation also protects simultaneous requests with different titles.
    let lock: string;
    for (;;) {
      if (n >= 100 && n <= 109) n = 110;
      lock = path.join(video, `.studio-number-${n}`);
      try {
        await mkdir(lock);
        if ((await readdir(video)).some(name => Number(/^(\d+)/.exec(name)?.[1]) === n)) {
          await rm(lock, { recursive: true }); n++; continue;
        }
        break;
      } catch (e: any) { if (e.code !== 'EEXIST') throw e; n++; }
    }
    const id = `${n}-${slug}`, dir = path.join(video, id);
    let created = false;
    try {
      await mkdir(dir); created = true;
      for (const sub of ['img', 'music', 'work', 'output']) await mkdir(path.join(dir, sub));
      await writeFile(path.join(dir, 'субтитры.txt'), cleanText(input.script.trim()) + '\n', { flag: 'wx' });
      await writeFile(path.join(dir, 'video.json'), JSON.stringify({ title, duration: 7.5, noSfx: true, music: 'none' }, null, 2) + '\n', { flag: 'wx' });
      await writeFile(path.join(dir, 'v.html'), html, { flag: 'wx' });
      return id;
    } catch (e) { if (created) await rm(dir, { recursive: true, force: true }); throw e; }
    finally { await rm(lock!, { recursive: true, force: true }); }
  }
  async function upload(file: File, kind: string, id: string) {
    if (!Object.hasOwn(shared, kind)) throw new InputError('Неизвестная категория');
    if (!file.size || file.size > 100 * 1024 * 1024) throw new InputError('Размер файла: от 1 байта до 100 МБ');
    if (/[\\/]/.test(file.name)) throw new InputError('Некорректное имя файла');
    const isAudio = ['voices', 'music', 'sfx'].includes(kind);
    if (!(isAudio ? AUDIO : IMAGE).test(file.name)) throw new InputError(isAudio ? 'Нужен аудиофайл MP3, WAV, M4A, FLAC или OGG' : 'Нужно изображение PNG, JPG, WEBP, GIF или AVIF');
    if (id && !Object.hasOwn(local, kind)) throw new InputError('Эта категория хранится в общей библиотеке');
    const dir = id ? path.join(await videoDir(id), local[kind]) : path.join(root, shared[kind]);
    await contained(dir);
    await mkdir(dir, { recursive: true });
    const ext = path.extname(file.name).toLowerCase();
    let stem = path.basename(file.name, path.extname(file.name)).replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 100).trim() || 'asset';
    if (kind === 'voices' && id && !/^voice/i.test(stem)) stem = 'voice-' + stem;
    const bytes = new Uint8Array(await file.arrayBuffer());
    for (let i = 0; i < 10000; i++) {
      const name = `${stem}${i ? '-' + (i + 1) : ''}${ext}`, dest = path.join(dir, name);
      try {
        await writeFile(dest, bytes, { flag: 'wx' });
        return { name, path: path.relative(root, dest).split(path.sep).join('/'), size: file.size };
      } catch (e: any) { if (e.code !== 'EEXIST') throw e; }
    }
    throw new InputError('Слишком много файлов с таким именем');
  }
  // Операции с video.json одного ролика (выбор звука, импорт музыки) выполняются строго по очереди.
  const queues = new Map<string, Promise<unknown>>();
  function exclusive<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const run = (queues.get(dir) ?? Promise.resolve()).then(fn);
    const tail = run.catch(() => {});
    queues.set(dir, tail);
    tail.then(() => { if (queues.get(dir) === tail) queues.delete(dir); });
    return run;
  }
  type AudioInput = { voice?: string; music?: string; base: unknown };
  async function setAudio(id: string, input: AudioInput) {
    const dir = await videoDir(id);
    return exclusive(dir, () => writeAudio(dir, input));
  }
  /** fn выполняется в очереди ролика; save - запись video.json внутри той же очереди */
  async function withAudio<T>(id: string, fn: (dir: string, save: (input: AudioInput) => Promise<void>) => Promise<T>) {
    const dir = await videoDir(id);
    return exclusive(dir, () => fn(dir, input => writeAudio(dir, input)));
  }
  async function writeAudio(dir: string, input: AudioInput) {
    const configFile = path.join(dir, 'video.json');
    const raw = await readFile(configFile, 'utf8').catch((e: any) => { if (e.code === 'ENOENT') return null; throw e; });
    const current = raw ? JSON.parse(raw) : null;
    if (JSON.stringify(current) !== JSON.stringify(input.base)) throw new InputError('Настройки изменились. Обновите ролик и повторите.', 409);
    const config = { ...(current || {}) };
    for (const key of ['voice', 'music'] as const) {
      const value = input[key];
      if (value === undefined) continue;
      if (key === 'music' && value === 'none') { config.music = 'none'; continue; }
      if (typeof value !== 'string' || !/^(video|music)\//.test(value) || value.split('/').includes('..') || !AUDIO.test(value)) throw new InputError('Выберите аудио из библиотеки');
      const abs = path.resolve(root, value);
      await contained(abs);
      if (!(await stat(abs).catch(() => null))?.isFile()) throw new InputError('Аудиофайл не найден');
      config[key] = path.relative(dir, abs).split(path.sep).join('/');
    }
    const backups = path.join(dir, 'work/studio-backups');
    await contained(backups);
    await mkdir(backups, { recursive: true });
    if (raw) await copyFile(configFile, path.join(backups, `video-${Date.now()}-${crypto.randomUUID()}.json`));
    const temp = path.join(dir, `.studio-config-${crypto.randomUUID()}.json`);
    try { await writeFile(temp, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' }); await rename(temp, configFile); }
    finally { await rm(temp, { force: true }); }
  }
  /** бэкап с уникальным именем: существующие бэкапы не перезаписываются */
  async function backup(dir: string, file: string, prefix: string, ext: string) {
    const backups = path.join(dir, 'work/studio-backups');
    await contained(backups);
    await mkdir(backups, { recursive: true });
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    for (let i = 0; i < 1000; i++) {
      const dest = path.join(backups, `${prefix}-${ts}${i ? '-' + (i + 1) : ''}${ext}`);
      try { await copyFile(file, dest, 1); return dest; } catch (e: any) { if (e.code !== 'EEXIST') throw e; }
    }
    throw new InputError('Не удалось создать бэкап');
  }
  async function atomicWrite(dir: string, file: string, text: string) {
    const temp = path.join(dir, `.studio-write-${crypto.randomUUID()}.tmp`);
    try { await writeFile(temp, text, { flag: 'wx' }); await rename(temp, file); }
    finally { await rm(temp, { force: true }); }
  }
  const pageLocks = new Set<string>();
  /** сохранение v.html: проверка базы (409), бэкап прежней версии, атомарная запись */
  async function savePage(id: string, html: unknown, base: unknown) {
    if (typeof html !== 'string' || !html.trim()) throw new InputError('Пустой v.html');
    if (html.length > 20 * 1024 * 1024) throw new InputError('v.html больше 20 МБ');
    if (html.includes('data-studio-id=')) throw new InputError('В тексте осталась служебная разметка превью (data-studio-id). Сохранение отменено.');
    const dir = await videoDir(id), page = path.join(dir, 'v.html');
    if (pageLocks.has(dir)) throw new InputError('Сохранение уже идет, повторите', 409);
    pageLocks.add(dir);
    try {
      const current = await readFile(page, 'utf8');
      if (base != null && base !== current) throw new InputError('v.html изменился на диске после открытия', 409);
      if (current === html) return { backup: null };
      const b = await backup(dir, page, 'v', '.html');
      await atomicWrite(dir, page, html);
      return { backup: path.relative(root, b).split(path.sep).join('/') };
    } finally { pageLocks.delete(dir); }
  }
  /** пользовательские пресеты компонентов ролика: work/studio-presets.json */
  async function presets(id: string) {
    const file = path.join(await videoDir(id), 'work/studio-presets.json');
    const raw = await readFile(file, 'utf8').catch(() => '[]');
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  async function savePresets(id: string, list: unknown) {
    if (!Array.isArray(list) || list.length > 200) throw new InputError('Пресеты: список до 200 элементов');
    const clean = list.map((x: any) => {
      if (!x || typeof x.name !== 'string' || typeof x.html !== 'string' || !x.name.trim() || x.name.length > 80 || x.html.length > 200000) throw new InputError('Пресет: имя до 80 символов и HTML');
      if (x.html.includes('data-studio-id=')) throw new InputError('Пресет содержит служебную разметку превью');
      return { name: x.name.trim(), html: x.html, kind: String(x.kind || ''), created: String(x.created || new Date().toISOString()) };
    });
    const dir = await videoDir(id), work = path.join(dir, 'work');
    await contained(work);
    await mkdir(work, { recursive: true });
    await atomicWrite(work, path.join(work, 'studio-presets.json'), JSON.stringify(clean, null, 2) + '\n');
    return clean;
  }
  return { createVideo, upload, setAudio, withAudio, savePage, presets, savePresets, videoDir, contained };
}
