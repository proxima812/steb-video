// Фильтр каталога музыки. Папка: ALL_DIRS - все, иначе точное значение dir трека ('' - корень).
import type { Track } from './api';

export const ALL_DIRS = null;
export function filterTracks(tracks: Track[], dir: string | null, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return tracks.filter(t => (dir === ALL_DIRS || t.dir === dir) && words.every(w => t.path.toLowerCase().includes(w)));
}
/** значение <option>: у «Все папки» пустое, у папки - префикс, поэтому корень ('') не совпадает со «все» */
export const dirOption = (dir: string | null) => dir === ALL_DIRS ? '' : 'd:' + dir;
export const dirFromOption = (v: string) => v === '' ? ALL_DIRS : v.slice(2);
