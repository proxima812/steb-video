import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAuthoring } from './authoring';
import { byteRange, createMusic, importTrack } from './music';

let root: string, lib: string, outside: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'studio-music-root-'));
  lib = await mkdtemp(path.join(tmpdir(), 'studio-music-lib-'));
  outside = await mkdtemp(path.join(tmpdir(), 'studio-music-out-'));
  await mkdir(path.join(root, 'engine/templates'), { recursive: true });
  await mkdir(path.join(root, 'video'), { recursive: true });
  await writeFile(path.join(root, 'engine/templates/template.html'), await readFile(new URL('../engine/templates/template.html', import.meta.url)));
  await mkdir(path.join(lib, 'Альбом/Диск 1'), { recursive: true });
  await writeFile(path.join(lib, 'бит мощный .mp3'), 'beat');
  await writeFile(path.join(lib, 'Опенгеймер.MP3'), 'upper');
  await writeFile(path.join(lib, 'Альбом/Диск 1/трек — 1.flac'), 'flac');
  await writeFile(path.join(lib, 'notes.txt'), 'x');
  await writeFile(path.join(lib, '.DS_Store'), 'x');
  await writeFile(path.join(outside, 'secret.mp3'), 'secret');
  await symlink(path.join(outside, 'secret.mp3'), path.join(lib, 'link.mp3'));
  await symlink(outside, path.join(lib, 'outdir'));
});
afterEach(async () => { for (const d of [root, lib, outside]) await rm(d, { recursive: true, force: true }); });

test('каталог: рекурсивно, регистр расширения, симлинки наружу пропускаются', async () => {
  const c = await createMusic(lib).list();
  expect(c.available).toBe(true);
  expect(c.tracks.map(t => t.path).sort()).toEqual(['Альбом/Диск 1/трек — 1.flac', 'бит мощный .mp3', 'Опенгеймер.MP3'].sort());
  expect(c.tracks.find(t => t.path.endsWith('.flac'))!.dir).toBe('Альбом/Диск 1');
  expect(c.skipped).toBe(3); // notes.txt, link.mp3, outdir
});

test('недоступная папка - понятная ошибка', async () => {
  const c = await createMusic(path.join(lib, 'нет')).list();
  expect(c.available).toBe(false);
  expect(c.error).toContain('не найдена');
});

test('resolve: только относительные пути внутри корня', async () => {
  const m = createMusic(lib);
  expect(await m.resolve('Опенгеймер.MP3')).toEndWith('Опенгеймер.MP3');
  for (const bad of ['../secret.mp3', '/etc/passwd.mp3', path.join(outside, 'secret.mp3'), 'a/../b.mp3', '', 'x\\y.mp3', 'file:///a.mp3', 'link.mp3', 'outdir/secret.mp3'])
    await expect(m.resolve(bad)).rejects.toThrow();
  await expect(m.resolve('notes.txt')).rejects.toThrow('Формат');
  await expect(m.resolve('нет.mp3')).rejects.toThrow('не найден');
});

test('Range: корректные и ошибочные диапазоны', () => {
  expect(byteRange(null, 100)).toBeNull();
  expect(byteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
  expect(byteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
  expect(byteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
  expect(byteRange('bytes=200-300', 100)).toBe('invalid');
  expect(byteRange('items=1-2', 100)).toBe('invalid');
});

test('импорт: копия в music/ без перезаписи, повтор того же файла, video.json с бэкапом, исходник не тронут', async () => {
  const author = createAuthoring(root), m = createMusic(lib);
  const id = await author.createVideo({ title: 'Музыка', script: '' });
  const cfgFile = path.join(root, 'video', id, 'video.json');
  const base = JSON.parse(await readFile(cfgFile, 'utf8'));
  const r1 = await importTrack(author, root, id, await m.resolve('бит мощный .mp3'), base);
  expect(r1).toEqual({ path: `video/${id}/music/бит-мощный.mp3`, created: true });
  const cfg1 = JSON.parse(await readFile(cfgFile, 'utf8'));
  expect(cfg1.music).toBe('music/бит-мощный.mp3');
  expect(cfg1.noSfx).toBe(true);
  // тот же трек: файл переиспользуется
  const r2 = await importTrack(author, root, id, await m.resolve('бит мощный .mp3'), cfg1);
  expect(r2.created).toBe(false);
  // другое содержимое с тем же именем - суффикс
  await writeFile(path.join(lib, 'бит-мощный.mp3'), 'другой');
  const r3 = await importTrack(author, root, id, await m.resolve('бит-мощный.mp3'), JSON.parse(await readFile(cfgFile, 'utf8')));
  expect(r3.path).toEndWith('бит-мощный-2.mp3');
  expect(await readFile(path.join(root, 'video', id, 'music/бит-мощный.mp3'), 'utf8')).toBe('beat');
  expect((await readdir(path.join(root, 'video', id, 'work/studio-backups'))).length).toBe(3);
  expect(await readFile(path.join(lib, 'бит мощный .mp3'), 'utf8')).toBe('beat');
  // устаревшая база: ничего не копируется
  await expect(importTrack(author, root, id, await m.resolve('Опенгеймер.MP3'), base)).rejects.toThrow('изменились');
  expect(await readdir(path.join(root, 'video', id, 'music'))).toHaveLength(2);
});

test('savePage: конфликт базы, уникальные бэкапы, служебная разметка отклоняется', async () => {
  const author = createAuthoring(root);
  const id = await author.createVideo({ title: 'Страница', script: '' });
  const page = path.join(root, 'video', id, 'v.html');
  const v0 = await readFile(page, 'utf8');
  await author.savePage(id, v0 + '<!-- 1 -->', v0);
  await author.savePage(id, v0 + '<!-- 2 -->', v0 + '<!-- 1 -->');
  const backups = await readdir(path.join(root, 'video', id, 'work/studio-backups'));
  expect(backups.filter(b => b.startsWith('v-'))).toHaveLength(2);
  await expect(author.savePage(id, 'x', v0)).rejects.toThrow('изменился');
  await expect(author.savePage(id, v0.replace('<section', '<section data-studio-id="s0"'), v0 + '<!-- 2 -->')).rejects.toThrow('data-studio-id');
  expect(await readFile(page, 'utf8')).toBe(v0 + '<!-- 2 -->');
  const list = await author.savePresets(id, [{ name: 'Карточка', html: '<div class="card">x</div>', kind: 'card' }]);
  expect((await author.presets(id))[0].name).toBe(list[0].name);
  await expect(author.savePresets(id, [{ name: '', html: '' }])).rejects.toThrow();
});

test('импорт: две вкладки с одним файлом - первая задержана после копии, файл успешного импорта не удаляется', async () => {
  const author = createAuthoring(root), m = createMusic(lib);
  const id = await author.createVideo({ title: 'Гонка', script: '' });
  const dir = path.join(root, 'video', id), cfgFile = path.join(dir, 'video.json');
  const base = JSON.parse(await readFile(cfgFile, 'utf8'));
  const src = await m.resolve('бит мощный .mp3');
  let release!: () => void, copied!: () => void;
  const gate = new Promise<void>(r => release = r), reached = new Promise<void>(r => copied = r);
  const first = importTrack(author, root, id, src, base, { afterCopy: async () => { copied(); await gate; } });
  await reached; // первая вкладка создала файл и стоит перед записью video.json
  let secondDone = false;
  const second = importTrack(author, root, id, src, base).then(r => { secondDone = true; return r; }, e => { secondDone = true; throw e; });
  await new Promise(r => setTimeout(r, 30));
  expect(secondDone).toBe(false); // вторая ждет очереди ролика, а не переиспользует файл первой
  release();
  expect(await first).toEqual({ path: `video/${id}/music/бит-мощный.mp3`, created: true });
  await expect(second).rejects.toThrow('изменились');
  expect(JSON.parse(await readFile(cfgFile, 'utf8')).music).toBe('music/бит-мощный.mp3');
  expect(await readFile(path.join(dir, 'music/бит-мощный.mp3'), 'utf8')).toBe('beat');
  // вторая с актуальной базой: тот же файл переиспользуется
  const r = await importTrack(author, root, id, src, JSON.parse(await readFile(cfgFile, 'utf8')));
  expect(r.created).toBe(false);
  expect(await readdir(path.join(dir, 'music'))).toEqual(['бит-мощный.mp3']);
});

test('импорт: неудачная запись video.json удаляет только созданный этим вызовом файл', async () => {
  const author = createAuthoring(root), m = createMusic(lib);
  const id = await author.createVideo({ title: 'Откат', script: '' });
  const dir = path.join(root, 'video', id), cfgFile = path.join(dir, 'video.json');
  const base = JSON.parse(await readFile(cfgFile, 'utf8'));
  const src = await m.resolve('Опенгеймер.MP3');
  // внешняя правка video.json между проверкой базы и записью
  await expect(importTrack(author, root, id, src, base, { afterCopy: () => writeFile(cfgFile, JSON.stringify({ ...base, title: 'снаружи' })) })).rejects.toThrow('изменились');
  expect(await readdir(path.join(dir, 'music'))).toEqual([]);
  const cfg = JSON.parse(await readFile(cfgFile, 'utf8'));
  await importTrack(author, root, id, src, cfg);
  await expect(importTrack(author, root, id, src, base, { afterCopy: async () => {} })).rejects.toThrow('изменились');
  expect(await readdir(path.join(dir, 'music'))).toEqual(['Опенгеймер.mp3']);
});

test('setAudio: параллельные записи одного ролика идут по очереди, вторая со старой базой - 409', async () => {
  const author = createAuthoring(root);
  const id = await author.createVideo({ title: 'Очередь', script: '' });
  const cfgFile = path.join(root, 'video', id, 'video.json');
  const base = JSON.parse(await readFile(cfgFile, 'utf8'));
  const r = await Promise.allSettled([author.setAudio(id, { music: 'none', base: base }), author.setAudio(id, { music: 'none', base: base })]);
  expect(r.map(x => x.status)).toEqual(['fulfilled', 'fulfilled']); // одинаковая база и одинаковый результат: первая не меняет содержимое
  const r2 = await Promise.allSettled([author.setAudio(id, { music: 'none', base: { ...base, x: 1 } }), author.setAudio(id, { music: 'none', base })]);
  expect(r2[0].status).toBe('rejected');
  expect(r2[1].status).toBe('fulfilled');
});
