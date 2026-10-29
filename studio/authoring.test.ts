import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAuthoring } from './authoring';

let root: string;
let author: ReturnType<typeof createAuthoring>;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'studio-test-'));
  await mkdir(path.join(root, 'video/120-existing'), { recursive: true });
  await mkdir(path.join(root, 'engine/templates'), { recursive: true });
  await writeFile(path.join(root, 'engine/templates/template.html'), await readFile(new URL('../engine/templates/template.html', import.meta.url)));
  author = createAuthoring(root);
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

test('creation reserves unique numbers including unfinished folders and escapes title', async () => {
  const ids = await Promise.all([1, 2].map(() => author.createVideo({ title: 'Тест <script> & "текст"', script: 'Мой сценарий' })));
  expect(new Set(ids).size).toBe(2);
  expect(ids.map(id => Number(id.split('-')[0])).sort()).toEqual([121, 122]);
  for (const id of ids) {
    const dir = path.join(root, 'video', id);
    const html = await readFile(path.join(dir, 'v.html'), 'utf8');
    expect(html).toContain('<base href="../../engine/">');
    expect(html).toContain('&lt;script&gt; &amp; &quot;текст&quot;');
    expect(html).not.toContain('Заголовок <span');
    expect(html).toContain('outro');
    expect(JSON.parse(await readFile(path.join(dir, 'video.json'), 'utf8'))).toMatchObject({ noSfx: true, duration: 7.5, music: 'none' });
    expect(await readFile(path.join(dir, 'субтитры.txt'), 'utf8')).toBe('Мой сценарий\n');
  }
});

test('upload never overwrites files and rejects executable and empty inputs', async () => {
  const upload = () => author.upload(new File(['image bytes'], 'photo.png'), 'images', '');
  const results = await Promise.all([upload(), upload()]);
  expect(new Set(results.map(r => r.path)).size).toBe(2);
  expect(await readFile(path.join(root, results[0].path), 'utf8')).toBe('image bytes');
  await expect(author.upload(new File(['<script/>'], 'x.svg'), 'images', '')).rejects.toThrow();
  await expect(author.upload(new File([], 'x.png'), 'images', '')).rejects.toThrow();
  await expect(author.upload(new File(['x'], '../x.png'), 'images', '')).rejects.toThrow();
});

test('destination cannot escape through traversal or symlinks', async () => {
  await expect(author.upload(new File(['x'], 'a.png'), 'images', '../elsewhere')).rejects.toThrow();
  const outside = await mkdtemp(path.join(tmpdir(), 'studio-outside-'));
  try {
    await mkdir(path.join(root, 'video/assets'), { recursive: true });
    await symlink(outside, path.join(root, 'video/assets/images'));
    await expect(author.upload(new File(['x'], 'a.png'), 'images', '')).rejects.toThrow();
    expect(await readdir(outside)).toEqual([]);
  } finally { await rm(outside, { recursive: true, force: true }); }
});

test('audio selection preserves config and rejects stale edits or outside paths', async () => {
  const id = await author.createVideo({ title: 'Тест', script: '' });
  const a = await author.upload(new File(['audio'], 'speech.mp3'), 'voices', id);
  const configFile = path.join(root, 'video', id, 'video.json');
  const base = JSON.parse(await readFile(configFile, 'utf8'));
  await author.setAudio(id, { voice: a.path, music: 'none', base });
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  expect(config.voice).toBe('voice-speech.mp3');
  expect(config.duration).toBe(7.5);
  expect(config.noSfx).toBe(true);
  await expect(author.setAudio(id, { voice: a.path, music: 'none', base })).rejects.toThrow();
  await expect(author.setAudio(id, { voice: '../secret.mp3', music: 'none', base: config })).rejects.toThrow();
});

test('numbering skips reserved series and invalid drafts do not create folders', async () => {
  await rm(path.join(root, 'video/120-existing'), { recursive: true });
  await mkdir(path.join(root, 'video/99-existing'));
  await expect(author.createVideo({ title: '', script: '' })).rejects.toThrow();
  expect(await readdir(path.join(root, 'video'))).toEqual(['99-existing']);
  expect(await author.createVideo({ title: 'Следующий', script: '' })).toStartWith('110-');
});

test('shared music is selected using a relative path and original config is backed up', async () => {
  const id = await author.createVideo({ title: 'Музыка', script: '' });
  const music = await author.upload(new File(['track'], 'my track.ogg'), 'music', '');
  const configFile = path.join(root, 'video', id, 'video.json');
  const original = await readFile(configFile, 'utf8');
  await author.setAudio(id, { music: music.path, base: JSON.parse(original) });
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  expect(config.music).toBe('../music/my-track.ogg');
  const backups = path.join(root, 'video', id, 'work/studio-backups');
  expect(await readFile(path.join(backups, (await readdir(backups))[0]), 'utf8')).toBe(original);
  await expect(author.upload(new File(['x'], 'wall.png'), 'wallpapers', id)).rejects.toThrow();
});
