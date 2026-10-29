// Протокол превью и редактора. iframe с того же origin: редактор вызывает render(t) и только читает DOM.
// Связь с исходником - атрибут data-studio-id (размеченная копия черновика, source.annotate).
import { STUDIO_ID } from './source';
import type { Item, Rect } from './safety';

export type PreviewWin = Window & { render?: (t: number) => void; p5gaps?: (min?: number) => [number, number][]; VIDEO_READY?: Promise<unknown> };

const IGNORE = '.ava,.wall-bg,.p5-deco,.bg,[data-safe="ignore"],.outro,.handle';
const COMP = 'img,canvas,svg,table,.card,.box,.code5,.chip,.tbl,.glass,.pic,.stampx,.tex,[data-safe]';

const toRect = (r: DOMRect): Rect => ({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
const idOf = (el: Element | null) => el?.closest(`[${STUDIO_ID}]`)?.getAttribute(STUDIO_ID) ?? '';

/** элемент виден: секция показана, нет display:none/visibility:hidden, итоговая прозрачность выше порога */
export function opacityOf(win: Window, el: Element) {
  let op = 1;
  for (let n: Element | null = el; n && n !== win.document.documentElement; n = n.parentElement) {
    const c = win.getComputedStyle(n);
    if (c.display === 'none' || c.visibility === 'hidden') return 0;
    op *= +c.opacity;
    const m = /opacity\(([\d.]+)\)/.exec(c.filter); if (m) op *= +m[1];
  }
  return op;
}
export const visibleSections = (win: Window) => [...win.document.querySelectorAll('section')].filter(s => win.getComputedStyle(s).display !== 'none');

export function rectOf(win: Window, id: string): Rect | null {
  const el = win.document.querySelector(`[${STUDIO_ID}="${CSS.escape(id)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? toRect(r) : null;
}
export const elementOf = (win: Window, id: string) => win.document.querySelector(`[${STUDIO_ID}="${CSS.escape(id)}"]`) as HTMLElement | null;

/** геометрический поиск объекта под точкой кадра: работает и для pointer-events:none (аватары) */
export function hitTest(win: Window, x: number, y: number, skip: Set<string>): string | null {
  let best: { id: string; a: number; k: number } | null = null;
  let k = 0;
  for (const s of visibleSections(win)) {
    for (const el of [s, ...s.querySelectorAll(`[${STUDIO_ID}]`)]) {
      k++;
      const id = el.getAttribute(STUDIO_ID)!;
      if (skip.has(id)) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom || !r.width || !r.height) continue;
      if (el !== s && opacityOf(win, el) < .05) continue;
      const a = el === s ? Infinity : r.width * r.height;
      if (!best || a < best.a || (a === best.a && k > best.k)) best = { id, a, k };
    }
  }
  return best?.id ?? null;
}

/** прямоугольники для проверки safe zone в текущем кадре (после render(t) - с камерой) */
export function collect(win: Window): Item[] {
  const doc = win.document, items: Item[] = [];
  const order = new Map<Element, number>();
  [...doc.querySelectorAll(`[${STUDIO_ID}]`)].forEach((el, i) => order.set(el, i));
  const owner = (el: Element) => el.closest(`[${STUDIO_ID}]`);
  const ancestors = (el: Element | null) => { const out: string[] = []; for (let n = el; n; n = n.parentElement?.closest(`[${STUDIO_ID}]`) ?? null) out.push(n.getAttribute(STUDIO_ID)!); return out; };
  const zOf = (el: Element) => { for (let n: Element | null = el; n && n.tagName !== 'SECTION'; n = n.parentElement) { const z = win.getComputedStyle(n).zIndex; if (z !== 'auto' && n.parentElement?.tagName === 'SECTION') return +z || 0; } return 0; };
  for (const s of visibleSections(win)) {
    if (s.matches('.outro')) continue;
    // текст: строки каждого текстового узла, объединенные по узлу
    const w = doc.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode as Text, p = n.parentElement;
      if (!p || !n.textContent!.trim() || p.closest(IGNORE) || p.closest('script,style,svg')) continue;
      if (opacityOf(win, p) < .1) continue;
      const range = doc.createRange(); range.selectNodeContents(n);
      const rs = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1);
      if (!rs.length) continue;
      const u = rs.reduce((m, r) => ({ x0: Math.min(m.x0, r.left), y0: Math.min(m.y0, r.top), x1: Math.max(m.x1, r.right), y1: Math.max(m.y1, r.bottom) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
      const o = owner(p);
      items.push({ id: idOf(p), kind: 'text', rect: u, label: n.textContent!.trim().slice(0, 28), order: o ? order.get(o) ?? 0 : 0, z: zOf(p), ancestors: ancestors(o).slice(1) });
    }
    // компоненты: только внешние (вложенные в другой компонент не дублируем)
    for (const el of s.querySelectorAll(COMP)) {
      if (el.closest(IGNORE) || (el.tagName.toLowerCase() === 'svg' && el.closest('.mi,.tex,.handle'))) continue;
      if (el.parentElement?.closest(COMP) && s.contains(el.parentElement.closest(COMP))) continue;
      if (opacityOf(win, el) < .1) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const o = owner(el);
      items.push({ id: idOf(el), kind: 'comp', rect: toRect(r), label: describe(el), order: o ? order.get(o) ?? 0 : 0, z: zOf(el), ancestors: ancestors(o?.parentElement?.closest(`[${STUDIO_ID}]`) ?? null) });
    }
  }
  return items;
}
function describe(el: Element) {
  const id = el.id ? '#' + el.id : '';
  const cls = [...el.classList].filter(c => !c.startsWith('cam-')).slice(0, 2).map(c => '.' + c).join('');
  return `${el.tagName.toLowerCase()}${id || cls}`;
}

/** состояние кадра для сравнения прямого seek и последовательного проигрывания: inline-стили движка и canvas */
export function frameState(win: Window): Map<string, string> {
  const m = new Map<string, string>();
  const doc = win.document;
  [...doc.body.querySelectorAll('*')].forEach((el, i) => {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    // скрытая сцена не видна в кадре: ее остаточные переменные не сравниваем
    const sec = el.closest('section'); if (sec && (sec as HTMLElement).style.display === 'none') return;
    const st = ((el as HTMLElement).style?.cssText || '').split(/;\s*/).filter(Boolean).sort().join(';');
    const key = el.getAttribute(STUDIO_ID) || `${el.tagName.toLowerCase()}#${i}`;
    m.set(key, st.replace(/-?\d+\.\d+/g, x => (+x).toFixed(2)));
  });
  return m;
}

/** скрытие только в превью; исходник не меняется */
export function editorHide(win: Window, hidden: Set<string>) {
  const doc = win.document;
  if (!doc.getElementById('studio-hide-style')) doc.head.insertAdjacentHTML('beforeend', '<style id="studio-hide-style">[data-studio-hidden]{visibility:hidden!important}</style>');
  for (const el of doc.querySelectorAll('[data-studio-hidden]')) if (!hidden.has(el.getAttribute(STUDIO_ID)!)) el.removeAttribute('data-studio-hidden');
  for (const id of hidden) elementOf(win, id)?.setAttribute('data-studio-hidden', '');
}

export const isAbsolute = (win: Window, id: string) => { const el = elementOf(win, id); return !!el && ['absolute', 'fixed'].includes(win.getComputedStyle(el).position); };
export const layoutWidth = (win: Window, id: string) => elementOf(win, id)?.offsetWidth ?? null;
