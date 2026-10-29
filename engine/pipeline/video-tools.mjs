import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import puppeteer from 'puppeteer-core';

export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);
export function run(command, args, options = {}) {
  return exec(command, args.map(String), {cwd: ENGINE, maxBuffer: 16 * 1024 * 1024, ...options});
}
export async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(temp, file);
}
export async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
export async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function fingerprint({files = [], values = {}}) {
  const contents = await Promise.all([...new Set(files)].sort().map(async file => [file, await fileHash(file)]));
  return createHash('sha256').update(JSON.stringify({contents, values})).digest('hex');
}
export class StageCache {
  constructor(directory) { this.directory = directory; }
  async run(name, inputs, outputs, action, force = false) {
    const key = await fingerprint(inputs), file = path.join(this.directory, `${name}.json`);
    const previous = await readJSON(file, null);
    if (!force && previous?.key === key) {
      try {
        if (previous.outputHash === await fingerprint({files: outputs})) return {cached: true, seconds: 0, key};
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    // A failed rebuild must never leave a successful cache record.
    await fs.rm(file, {force: true});
    const start = performance.now();
    await action();
    const outputHash = await fingerprint({files: outputs});
    const seconds = (performance.now() - start) / 1000;
    await writeJSON(file, {key, outputHash, seconds, completed: new Date().toISOString()});
    return {cached: false, seconds, key};
  }
}
export function renderOptions(env = process.env) {
  const preview = env.PREVIEW === '1';
  const fps = preview ? 15 : 30, scale = preview ? .5 : 1;
  const total = Number(env.DUR ?? 54.1), from = Number(env.FROM ?? 0), to = Number(env.TO ?? total);
  if (![total, from, to].every(Number.isFinite) || total <= 0 || from < 0 || to > total || to <= from) {
    throw new Error('Invalid DUR/FROM/TO: require 0 <= FROM < TO <= DUR');
  }
  const start = Math.round(from * fps) / fps;
  const frames = Math.round((to - start) * fps);
  if (frames < 1) throw new Error('Interval is shorter than one frame');
  const settle = Number(env.SETTLE_FRAMES ?? 0);
  if (!Number.isInteger(settle) || settle < 0 || settle > 2) throw new Error('SETTLE_FRAMES must be 0, 1 or 2');
  return {fps, scale, start, frames, duration: frames / fps, settle, quality: preview ? 80 : 95};
}
// Shared setup keeps validation, stills and video on the same fonts and viewport.
export async function openPage(file) {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--allow-file-access-from-files', '--disable-crash-reporter', '--disable-breakpad', '--disable-crashpad-for-testing',
      ...(process.env.DISABLE_GPU === '1' ? ['--disable-gpu'] : [])],
  });
  // При параллельном запуске Chrome оставляет chrome_crashpad_handler, который держит stderr Chrome открытым,
  // и Node не завершается. После закрытия браузера отпускаем его каналы сами.
  const close = browser.close.bind(browser);
  browser.close = async () => {
    try { await close(); }
    finally { const child = browser.process(); for (const stream of [child?.stdin, child?.stdout, child?.stderr]) stream?.destroy(); }
  };
  try {
    const page = await browser.newPage();
    await page.setViewport({width: 1080, height: 1920});
    const errors = [], dependencies = new Set([path.resolve(file)]), remote = [], pending = [];
    page.on('pageerror', e => errors.push({code: 'javascript', message: e.message}));
    page.on('request', req => {
      if (req.url().startsWith('file:')) dependencies.add(fileURLToPath(new URL(req.url())));
    });
    page.on('requestfailed', req => errors.push({code: 'resource', message: `${req.url()}: ${req.failure()?.errorText}`}));
    page.on('response', response => {
      if (response.status() >= 400) errors.push({code: 'resource', message: `${response.url()}: HTTP ${response.status()}`});
      if (/^https?:/.test(response.url())) pending.push((async () => {
        try {
          remote.push([response.url(), createHash('sha256').update(await response.buffer()).digest('hex')]);
        } catch (e) { errors.push({code: 'resource', message: `${response.url()}: ${e.message}`}); }
      })());
    });
    await page.goto(pathToFileURL(path.resolve(file)).href, {waitUntil: 'load', timeout: 60000});
    // Optional async compositions (Three.js shaders, models) must finish before any capture.
    await page.evaluate(async () => {
      if (!window.VIDEO_READY) return;
      let timer;
      try {
        await Promise.race([window.VIDEO_READY, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('VIDEO_READY timed out after 60000ms')), 60000);
        })]);
      } finally { clearTimeout(timer); }
    });
    const failures = await page.evaluate(async () => {
      const failed = [], fonts = new Set();
      let text = document.body.textContent;
      for (const el of document.querySelectorAll('body *')) {
        if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
        if (el.textContent?.trim()) {
          const s = getComputedStyle(el);
          fonts.add(`${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`);
        }
        // иконки .mi движок рисует через ::before {content: attr(data-i)}: у элемента нет текста, но шрифт нужен
        for (const pseudo of ['::before', '::after']) {
          const s = getComputedStyle(el, pseudo);
          if (!s.content || s.content === 'none' || s.content === 'normal') continue;
          fonts.add(`${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`);
          text += ' ' + s.content.replace(/^["']|["']$/g, '');
        }
      }
      await Promise.all([...fonts].map(font => document.fonts.load(font, text)
        .catch(e => failed.push(`Font ${font}: ${e.message}`))));
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode().catch(() => failed.push(`Image: ${img.src}`))));
      return failed;
    });
    errors.push(...failures.map(message => ({code: 'resource', message})));
    await Promise.all(pending);
    return {browser, page, errors, dependencies, remote};
  } catch (e) { await browser.close(); throw e; }
}
export async function probe(file) {
  return JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])).stdout);
}
