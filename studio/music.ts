// Внешний каталог музыки (только чтение) и импорт одного трека в music/ ролика.
// Открываются только файлы под явно заданным корнем: путь относительный, без "..", realpath внутри корня.
import { copyFile, mkdir, readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { InputError } from './authoring';

export const MUSIC_EXT = /\.(mp3|wav|m4a|flac|ogg)$/i;
export type Track = { path: string; name: string; dir: string; size: number; mtime: number };
export type Catalog = { root: string; available: boolean; error?: string; tracks: Track[]; skipped: number; truncated: boolean };
const MAX_FILES = 5000, MAX_DEPTH = 8;

export function createMusic(root: string) {
  const configured = path.resolve(root);

  async function realRoot() {
    try {
      const r = await realpath(configured);
      if (!(await stat(r)).isDirectory()) throw new InputError('Папка музыки не является каталогом', 503);
      return r;
    } catch (e: any) {
      if (e instanceof InputError) throw e;
      throw new InputError(e.code === 'ENOENT' ? `Папка музыки не найдена: ${configured}` : e.code === 'EACCES' || e.code === 'EPERM' ? `Нет доступа к папке музыки: ${configured}` : `Папка музыки недоступна: ${e.message}`, 503);
    }
  }

  async function list(): Promise<Catalog> {
    let base: string;
    try { base = await realRoot(); } catch (e: any) { return { root: configured, available: false, error: e.message, tracks: [], skipped: 0, truncated: false }; }
    const tracks: Track[] = [];
    let skipped = 0, truncated = false;
    const walk = async (dir: string, rel: string, depth: number) => {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { skipped++; return; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        if (tracks.length >= MAX_FILES) { truncated = true; return; }
        const abs = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
        // симлинки проверяем по realpath: наружу корня не ходим
        let real = abs;
        if (e.isSymbolicLink()) { try { real = await realpath(abs); } catch { skipped++; continue; } if (!within(base, real)) { skipped++; continue; } }
        const st = await stat(real).catch(() => null);
        if (!st) { skipped++; continue; }
        if (st.isDirectory()) { if (depth < MAX_DEPTH) await walk(real, r, depth + 1); continue; }
        if (!st.isFile()) continue;
        if (!MUSIC_EXT.test(e.name)) { skipped++; continue; }
        tracks.push({ path: r, name: e.name.replace(MUSIC_EXT, ''), dir: rel, size: st.size, mtime: st.mtimeMs });
      }
    };
    await walk(base, '', 0);
    tracks.sort((a, b) => a.path.localeCompare(b.path, 'ru', { numeric: true }));
    return { root: configured, available: true, tracks, skipped, truncated };
  }

  /** абсолютный путь трека по относительному; иначе InputError */
  async function resolve(rel: unknown): Promise<string> {
    if (typeof rel !== 'string' || !rel || rel.length > 1000 || rel.includes('\0') || rel.includes('\\') || path.isAbsolute(rel) || /^[a-z]+:/i.test(rel)) throw new InputError('Некорректный путь трека');
    if (rel.split('/').some(x => !x || x === '.' || x === '..')) throw new InputError('Некорректный путь трека');
    if (!MUSIC_EXT.test(rel)) throw new InputError('Формат не поддерживается: нужен MP3, WAV, M4A, FLAC или OGG', 415);
    const base = await realRoot();
    let real: string;
    try { real = await realpath(path.join(base, rel)); } catch { throw new InputError('Трек не найден', 404); }
    if (!within(base, real)) throw new InputError('Путь ведет вне папки музыки', 403);
    if (!(await stat(real)).isFile()) throw new InputError('Трек не найден', 404);
    return real;
  }

  return { root: configured, list, resolve };
}

const within = (base: string, p: string) => p === base || p.startsWith(base + path.sep);

async function hashFile(p: string) {
  const h = createHash('sha256');
  await new Promise<void>((ok, fail) => createReadStream(p).on('data', d => h.update(d)).on('end', () => ok()).on('error', fail));
  return h.digest('hex');
}

/** копия трека в dir (music/ ролика) без перезаписи; совпадающий по содержимому файл переиспользуется */
export async function copyInto(src: string, dir: string): Promise<{ file: string; created: boolean }> {
  const ext = path.extname(src).toLowerCase();
  const stem = path.basename(src, path.extname(src)).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'track';
  const size = (await stat(src)).size;
  let srcHash: string | null = null;
  for (let i = 0; i < 1000; i++) {
    const name = `${stem}${i ? '-' + (i + 1) : ''}${ext}`, dest = path.join(dir, name);
    const st = await stat(dest).catch(() => null);
    if (st) {
      if (st.isFile() && st.size === size && (srcHash ??= await hashFile(src)) === await hashFile(dest)) return { file: dest, created: false };
      continue;
    }
    try {
      // COPYFILE_EXCL: существующий файл не перезаписывается даже при гонке
      await copyFile(src, dest, 1);
      return { file: dest, created: true };
    } catch (e: any) { if (e.code !== 'EEXIST') { await rm(dest, { force: true }).catch(() => {}); throw e; } }
  }
  throw new InputError('Слишком много файлов с таким именем');
}

/** диапазон байтов для Range-запроса */
export function byteRange(header: string | null, size: number): { start: number; end: number } | 'invalid' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return header ? 'invalid' : null;
  let start: number, end: number;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

type Author = {
  contained: (abs: string) => Promise<void>;
  withAudio: <T>(id: string, fn: (dir: string, save: (input: { music?: string; base: unknown }) => Promise<void>) => Promise<T>) => Promise<T>;
};
/** выбранный трек -> music/ ролика -> video.json (проверка base и бэкап). Вся операция идет в очереди ролика вместе с другими
 *  записями video.json, поэтому созданный файл не может переиспользовать параллельный импорт; если сохранить настройки
 *  не удалось, удаляется только файл, созданный этим вызовом. afterCopy - точка остановки для тестов. */
export async function importTrack(author: Author, projectRoot: string, id: string, src: string, base: unknown, hooks: { afterCopy?: () => Promise<void> } = {}) {
  return author.withAudio(id, async (dir, save) => {
    const raw = await readFile(path.join(dir, 'video.json'), 'utf8').catch((e: any) => { if (e.code === 'ENOENT') return null; throw e; });
    if (JSON.stringify(raw ? JSON.parse(raw) : null) !== JSON.stringify(base)) throw new InputError('Настройки изменились. Обновите ролик и повторите.', 409);
    const mdir = path.join(dir, 'music');
    await author.contained(mdir);
    await mkdir(mdir, { recursive: true });
    const { file, created } = await copyInto(src, mdir);
    const rel = path.relative(projectRoot, file).split(path.sep).join('/');
    try { await hooks.afterCopy?.(); await save({ music: rel, base }); }
    catch (e) { if (created) await rm(file, { force: true }); throw e; }
    return { path: rel, created };
  });
}
