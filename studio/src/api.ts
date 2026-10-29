export type Asset = { name: string; path: string; size: number; source?: string; usedIn: string[] };
export type Assets = Record<'wallpapers' | 'avatars' | 'images' | 'sfx' | 'music' | 'voices', Asset[]>;
export type Section = {
  index: number; html: string; attrs: Record<string, string>; text: string;
  s: number; e: number; bg: string; pal: string; outro: boolean; tr: string; wall: string | null;
};
export type VideoSummary = {
  id: string; num: string; slug: string; duration: number; scenes: number;
  cover: string | null; hasFinal: boolean; posted: boolean; mtime: number;
};
export type VideoDetail = VideoSummary & {
  page: string; config: any; sections: Section[]; words: [string, number, number][];
  voice: string | null; music: string | null; outputs: { label: string; path: string }[];
  assets: string[]; review: string | null; plan: string | null; notes: Record<string, string>;
};
export type Job = {
  id: string; video: string; mode: string; args: string[]; status: 'running' | 'done' | 'error' | 'stopped';
  code: number | null; started: number; ended?: number; total: number; lines: string[];
};
export type Palettes = Record<string, { fg: string; bg: string }>;
export type Track = { path: string; name: string; dir: string; size: number; mtime: number };
export type MusicCatalog = { root: string; available: boolean; error?: string; tracks: Track[]; skipped: number; truncated: boolean };
export type UserPreset = { name: string; html: string; kind: string; created: string };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch('/api' + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data as T;
}

const vid = (id: string) => '/videos/' + encodeURIComponent(id);
export const api = {
  createVideo: (title: string, script: string) => call<VideoSummary>('POST', '/videos', { title, script }),
  setAudio: (id: string, voice: string | undefined, music: string, base: unknown) => call<VideoDetail>('PUT', vid(id) + '/audio', { voice, music, base }),
  upload: async (file: File, kind: string, video: string) => {
    const body = new FormData();
    body.set('file', file); body.set('kind', kind); body.set('video', video);
    const r = await fetch('/api/assets', { method: 'POST', body });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Ошибка загрузки (${r.status})`);
    return data as { name: string; path: string; size: number };
  },
  assets: () => call<Assets>('GET', '/assets'),
  palettes: () => call<Palettes>('GET', '/palettes'),
  videos: () => call<VideoSummary[]>('GET', '/videos'),
  video: (id: string) => call<VideoDetail>('GET', vid(id)),
  mtime: (id: string) => call<{ mtime: number }>('GET', vid(id) + '/mtime'),
  source: (id: string) => call<{ html: string }>('GET', vid(id) + '/source'),
  saveSource: (id: string, html: string, base: string) => call<VideoDetail & { backup: string | null }>('PUT', vid(id) + '/source', { html, base }),
  draft: (id: string, html: string) => call<{ key: string }>('POST', vid(id) + '/draft', { html }),
  presets: (id: string) => call<UserPreset[]>('GET', vid(id) + '/presets'),
  savePresets: (id: string, list: UserPreset[]) => call<UserPreset[]>('PUT', vid(id) + '/presets', list),
  tex: (html: string) => call<{ html: string; log: string }>('POST', '/tex', { html }),
  music: () => call<MusicCatalog>('GET', '/music'),
  useTrack: (id: string, path: string, base: unknown) => call<VideoDetail & { imported: { path: string; created: boolean } }>('POST', vid(id) + '/music', { path, base }),
  saveSection: (id: string, index: number, html: string, base: string) => call<VideoDetail>('PUT', `${vid(id)}/section/${index}`, { html, base }),
  saveNotes: (id: string, notes: Record<string, string>) => call('PUT', vid(id) + '/notes', notes),
  render: (id: string, opts: { mode: string; from?: number; to?: number }) => call<Job>('POST', vid(id) + '/render', opts),
  jobs: () => call<Job[]>('GET', '/jobs'),
  job: (id: string, since = 0) => call<Job>('GET', `/jobs/${id}?since=${since}`),
  stopJob: (id: string) => call<Job>('POST', `/jobs/${id}/stop`),
};

export const trackUrl = (p: string) => '/api/music/file?path=' + encodeURIComponent(p);
export const draftUrl = (id: string, key: string) => '/' + ['video', ...id.split('/')].map(encodeURIComponent).join('/') + '/__studio-draft.html?k=' + encodeURIComponent(key);
// путь от корня проекта -> URL на сервере
export const fileUrl = (p: string) => '/' + p.split('/').map(encodeURIComponent).join('/');
export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};
export const fmtSize = (b: number) => b > 1e6 ? (b / 1e6).toFixed(1) + ' МБ' : Math.round(b / 1e3) + ' КБ';

export async function copy(text: string) {
  await navigator.clipboard.writeText(text);
  toast('Скопировано');
}

// простой тост без зависимостей
let toastTimer: number | undefined;
export function toast(msg: string, error = false) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el); }
  el.textContent = msg;
  el.className = 'show' + (error ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.className = '', 1800);
}

// сниппет для вставки в v.html (пути считаются от engine/)
export function snippet(kind: string, a: Asset) {
  const p = '../' + a.path;
  if (kind === 'wallpapers') return `class="s black wall pal-*" style="--wall:url(../${p})"`;
  if (kind === 'avatars') return `<img class="ava bl" src="${p}" data-a="rise">`;
  if (kind === 'images') return `<img class="pic" src="${p}" data-a="zoom">`;
  return a.path;
}
