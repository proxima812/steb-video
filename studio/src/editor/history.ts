// История черновика: снимки полного текста v.html. Набор в одном поле сливается в один шаг.
export type Entry = { src: string; label: string; key?: string; at: number };
export type History = { past: Entry[]; present: Entry; future: Entry[] };

export const LIMIT = 200, MERGE_MS = 800;

export const start = (src: string): History => ({ past: [], present: { src, label: 'Открыто', at: 0 }, future: [] });

/** новый шаг; key - поле правки: подряд идущие правки одного поля быстрее MERGE_MS сливаются */
export function push(h: History, src: string, label: string, key?: string, now = Date.now()): History {
  if (src === h.present.src) return h;
  const merge = key && h.present.key === key && now - h.present.at < MERGE_MS && h.past.length;
  if (merge) return { past: h.past, present: { src, label, key, at: now }, future: [] };
  const past = [...h.past, h.present];
  if (past.length > LIMIT) past.splice(0, past.length - LIMIT);
  return { past, present: { src, label, key, at: now }, future: [] };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: { ...prev, key: undefined }, future: [h.present, ...h.future] };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: { ...next, key: undefined }, future: rest };
}
/** замена базы (после сохранения или загрузки с диска): история сохраняется, слияние прерывается */
export const reset = (h: History, src: string, label: string): History => push({ ...h, present: { ...h.present, key: undefined } }, src, label);
