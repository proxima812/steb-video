// Перенос путей объектов (выбор, блокировка, скрытие, непримененая правка исходника) после любой смены текста черновика:
// правка, undo/redo, версия с диска. Изменение - один диапазон между общими началом и концом текста. Положение диапазона
// неоднозначно, когда вставлен или удален повтор соседнего текста (одинаковые соседи), поэтому берутся оба крайних
// варианта (сначала общее начало / сначала общий конец). Объект до или после диапазона сдвигается, объект, внутри
// которого правка, остается на месте. Путь переносится, только если оба варианта дают один и тот же объект. Иначе
// объект ищется по точному HTML (единственный до и после), иначе null: состояние сбрасывается, а не переходит на
// близнеца или соседа. Два прежних объекта никогда не получают один новый: такие переносы тоже сбрасываются.
import { outer, type Doc, type SrcNode } from './source';

type Range = { p: number; aEnd: number; bEnd: number };
/** suffixFirst - сначала общий конец, затем начало (другой крайний вариант неоднозначного диапазона) */
export function changedRange(a: string, b: string, suffixFirst = false): Range {
  const n = Math.min(a.length, b.length);
  const pre = (lim: number) => { let p = 0; while (p < lim && a.charCodeAt(p) === b.charCodeAt(p)) p++; return p; };
  const suf = (lim: number) => { let s = 0; while (s < lim && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++; return s; };
  if (suffixFirst) { const s = suf(n); const p = pre(n - s); return { p, aEnd: a.length - s, bEnd: b.length - s }; }
  const p = pre(n); const s = suf(n - p);
  return { p, aEnd: a.length - s, bEnd: b.length - s };
}

function candidate(n: SrcNode, starts: Map<number, SrcNode>, r: Range): SrcNode | null {
  let start: number | null = null;
  if (n.end <= r.p) start = n.start;
  else if (n.start >= r.aEnd) start = n.start + r.bEnd - r.aEnd;
  else if (n.start < r.p && n.end >= r.aEnd) start = n.start;
  const m = start == null ? null : starts.get(start);
  return m && m.tag === n.tag && m.path ? m : null;
}

export function remapPaths(from: Doc, to: Doc, paths: Iterable<string>): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (from.src === to.src) { for (const p of paths) out.set(p, from.byPath.has(p) ? p : null); return out; }
  const ranges = [changedRange(from.src, to.src), changedRange(from.src, to.src, true)];
  // как nodeAt: при общем начале - последний (самый вложенный) элемент
  const starts = new Map<number, SrcNode>();
  for (const n of to.byPath.values()) starts.set(n.start, n);
  const html = (d: Doc) => { const h = new Map<SrcNode, string>(), c = new Map<string, number>(); for (const n of d.byPath.values()) { const s = outer(d, n); h.set(n, s); c.set(s, (c.get(s) || 0) + 1); } return { h, c }; };
  const A = html(from), B = html(to);
  const byHtml = new Map<string, SrcNode>();
  for (const [n, s] of B.h) if (B.c.get(s) === 1) byHtml.set(s, n);
  // перенос считается для всех объектов, чтобы найти два прежних объекта с одной целью
  const target = new Map<SrcNode, SrcNode | null>(), claims = new Map<SrcNode, number>();
  for (const n of from.byPath.values()) {
    const [c0, c1] = ranges.map(r => candidate(n, starts, r));
    const h = A.h.get(n)!;
    const m = c0 && c0 === c1 ? c0 : A.c.get(h) === 1 ? byHtml.get(h) ?? null : null;
    target.set(n, m);
    if (m) claims.set(m, (claims.get(m) || 0) + 1);
  }
  for (const path of paths) {
    const n = from.byPath.get(path), m = n ? target.get(n) : null;
    out.set(path, m && claims.get(m) === 1 ? m.path : null);
  }
  return out;
}
