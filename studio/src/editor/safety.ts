// Safe zone Reels 1080x1920: чистая геометрия по прямоугольникам, собранным из превью (bridge.ts).
export type Rect = { x0: number; y0: number; x1: number; y1: number };
export const FRAME = { w: 1080, h: 1920 };
export const TEXT_ZONE: Rect = { x0: 65, y0: 250, x1: 1015, y1: 1670 };
export const COMP_ZONE: Rect = { x0: 65, y0: -Infinity, x1: 1015, y1: Infinity };
const TOL = 1;

/** text - строки текста; comp - компоненты (карточки, картинки, код); иные виды не проверяются */
export type Item = { id: string; kind: 'text' | 'comp'; rect: Rect; label: string; order: number; z: number; ancestors: string[] };
export type Issue = {
  t: number; id: string; level: 'error' | 'warn'; kind: 'text-zone' | 'comp-zone' | 'overlap';
  msg: string; rect: Rect; other?: string;
};

export const area = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
export const inter = (a: Rect, b: Rect): Rect => ({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
export const inside = (r: Rect, z: Rect) => r.x0 >= z.x0 - TOL && r.x1 <= z.x1 + TOL && r.y0 >= z.y0 - TOL && r.y1 <= z.y1 + TOL;
/** рамка вне кадра целиком - не видна, не нарушение */
const visible = (r: Rect) => r.x1 > 0 && r.y1 > 0 && r.x0 < FRAME.w && r.y0 < FRAME.h && area(r) > 4;

function overflow(r: Rect, z: Rect) {
  const p: string[] = [];
  if (r.x0 < z.x0 - TOL) p.push(`слева ${Math.round(z.x0 - r.x0)}px`);
  if (r.x1 > z.x1 + TOL) p.push(`справа ${Math.round(r.x1 - z.x1)}px`);
  if (r.y0 < z.y0 - TOL) p.push(`сверху ${Math.round(z.y0 - r.y0)}px`);
  if (r.y1 > z.y1 + TOL) p.push(`снизу ${Math.round(r.y1 - z.y1)}px`);
  return p.join(', ');
}

export function check(t: number, items: Item[]): Issue[] {
  const out: Issue[] = [];
  const vis = items.filter(i => visible(i.rect));
  for (const it of vis) {
    if (it.kind === 'text' && !inside(it.rect, TEXT_ZONE)) out.push({ t, id: it.id, level: 'error', kind: 'text-zone', rect: it.rect, msg: `текст «${it.label}» за safe zone: ${overflow(it.rect, TEXT_ZONE)}` });
    if (it.kind === 'comp' && !inside(it.rect, COMP_ZONE)) out.push({ t, id: it.id, level: 'error', kind: 'comp-zone', rect: it.rect, msg: `компонент ${it.label} за боковым отступом: ${overflow(it.rect, COMP_ZONE)}` });
  }
  // потенциальные пересечения: текст с чужим текстом или с компонентом, в котором он не лежит
  const texts = vis.filter(i => i.kind === 'text');
  for (const a of texts) for (const b of vis) {
    if (a === b || a.id === b.id) continue;
    if (b.kind === 'text' && b.order < a.order) continue; // пара текстов один раз
    if (a.ancestors.includes(b.id) || b.ancestors.includes(a.id)) continue; // текст в своей карточке
    const ov = area(inter(a.rect, b.rect));
    if (ov < Math.min(area(a.rect), area(b.rect)) * .04 || ov < 30) continue;
    const covers = b.z > a.z || (b.z === a.z && b.order > a.order);
    out.push({ t, id: a.id, other: b.id, level: 'warn', kind: 'overlap', rect: inter(a.rect, b.rect),
      msg: b.kind === 'text' ? `текст «${a.label}» пересекается с текстом «${b.label}»` : covers ? `текст «${a.label}» может быть перекрыт: ${b.label}` : `текст «${a.label}» поверх ${b.label}` });
  }
  return out;
}

/** одно нарушение на объект и вид: первое время и число кадров */
export function summarize(issues: Issue[]) {
  const m = new Map<string, Issue & { frames: number; last: number }>();
  for (const i of issues) {
    const k = `${i.kind}|${i.id}|${i.other || ''}`;
    const cur = m.get(k);
    if (cur) { cur.frames++; cur.last = i.t; } else m.set(k, { ...i, frames: 1, last: i.t });
  }
  return [...m.values()].sort((a, b) => a.t - b.t);
}

/** сдвиг и ширина, чтобы рамка вошла в зону; null - уже внутри */
export function fit(r: Rect, z: Rect): { dx: number; dy: number; width: number | null } | null {
  if (inside(r, z)) return null;
  const w = r.x1 - r.x0, zw = z.x1 - z.x0;
  const width = w > zw ? zw : null;
  const nw = width ?? w;
  let dx = 0, dy = 0;
  if (r.x0 < z.x0) dx = z.x0 - r.x0; else if (r.x0 + nw > z.x1) dx = z.x1 - (r.x0 + nw);
  // объект выше зоны прижимается к верху, ниже - к низу, но не выше верхней границы
  if (Number.isFinite(z.y0)) { if (r.y0 < z.y0) dy = z.y0 - r.y0; else if (r.y1 > z.y1) dy = Math.max(z.y0 - r.y0, z.y1 - r.y1); }
  return { dx: Math.round(dx), dy: Math.round(dy), width };
}

/** времена проверки сцены: шаг + ключевые моменты, без дублей ближе 1/60 */
export function scanTimes(a: number, b: number, step: number, keys: number[]): number[] {
  const ts: number[] = [];
  for (let t = a; t < b - 1e-6; t += step) ts.push(+t.toFixed(4));
  for (const k of keys) if (k >= a && k < b) ts.push(+k.toFixed(4));
  ts.push(+(b - 1 / 60).toFixed(4));
  return [...new Set(ts.sort((x, y) => x - y))].filter((t, i, l) => !i || t - l[i - 1] > 1 / 60);
}
