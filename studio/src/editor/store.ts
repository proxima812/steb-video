// Черновик ролика: полный текст v.html + база с диска, история, выбор и состояние редактора (блокировка/скрытие).
// Пути выбора, блокировки, скрытия и непримененой правки исходника переносятся при каждой смене текста (editor/remap.ts).
import { batch, createMemo, createSignal, untrack } from 'solid-js';
import * as H from './history';
import { remapPaths } from './remap';
import { nodeAt, parse, pathAfter, scenes as sceneInfo, type Doc, type Patch, type SrcNode } from './source';

export type DraftStore = ReturnType<typeof createDraftStore>;
/** непримененая правка исходника объекта: path - объект, orig - его HTML в начале правки */
export type PendingSrc = { path: string | null; orig: string; text: string };

export function createDraftStore(opts: { onDropped?: (n: number) => void } = {}) {
  const [hist, setHist] = createSignal<H.History>(H.start(''));
  const [base, setBase] = createSignal<string | null>(null);
  /** текст с диска, если он изменился, пока черновик грязный */
  const [conflict, setConflict] = createSignal<string | null>(null);
  const [sel, setSel] = createSignal<string | null>(null);
  const [hover, setHover] = createSignal<string | null>(null);
  const [locked, setLocked] = createSignal<Set<string>>(new Set());
  const [hidden, setHidden] = createSignal<Set<string>>(new Set());
  const [pendingSrc, setPendingSrc] = createSignal<PendingSrc | null>(null);

  const draft = () => hist().present.src;
  const doc = createMemo(() => parse(draft()));
  const scenes = createMemo(() => sceneInfo(doc()));
  const dirty = () => base() != null && draft() !== base();
  const node = (path: string | null | undefined): SrcNode | null => path ? doc().byPath.get(path) ?? null : null;
  const selected = () => node(sel());

  /** смена текста черновика с переносом путей состояния редактора */
  function change(fn: (h: H.History) => H.History) {
    const before = untrack(doc);
    batch(() => {
      setHist(fn);
      const after = untrack(doc);
      if (after.src === before.src) return;
      const lk = untrack(locked), hd = untrack(hidden), s = untrack(sel), pend = untrack(pendingSrc);
      const m = remapPaths(before, after, [...lk, ...hd, ...(s ? [s] : []), ...(pend?.path ? [pend.path] : [])]);
      let dropped = 0;
      const move = (set: Set<string>) => { const n = new Set<string>(); for (const x of set) { const y = m.get(x); y ? n.add(y) : dropped++; } return n; };
      if (lk.size) setLocked(move(lk));
      if (hd.size) setHidden(move(hd));
      if (s) setSel(m.get(s) ?? null);
      if (pend?.path) setPendingSrc({ ...pend, path: m.get(pend.path) ?? null });
      setHover(null);
      if (dropped) opts.onDropped?.(dropped);
    });
  }

  /** открыть другой ролик (или null - пока грузится): история, база, выбор и состояние редактора с нуля */
  function open(html: string | null) {
    batch(() => {
      setHist(H.start(html ?? '')); setBase(html); setConflict(null);
      setSel(null); setHover(null); setLocked(new Set<string>()); setHidden(new Set<string>()); setPendingSrc(null);
    });
  }
  /** версия того же ролика с диска: черновик и база совпадают, прежние шаги остаются в undo */
  function load(html: string) {
    batch(() => { setBase(html); setConflict(null); change(h => H.reset(h, html, 'Версия с диска')); });
  }
  /** текст html записан на диск: обновляется только база, черновик и история не трогаются (правки во время записи остаются) */
  function markSaved(html: string) {
    batch(() => { setBase(html); setConflict(null); });
  }
  const commit = (src: string, label: string, key?: string) => change(h => H.push(h, src, label, key));
  /** патч объекта; select - выбрать элемент, который после патча начинается в позиции патча */
  function apply(fn: (d: Doc) => Patch | string, label: string, opts: { key?: string; select?: boolean } = {}) {
    const r = fn(doc());
    const p = typeof r === 'string' ? { src: r, at: -1 } : r;
    if (p.src === draft()) return;
    commit(p.src, label, opts.key);
    if (opts.select && p.at >= 0) setSel(pathAfter(p.src, p.at));
  }
  /** путь элемента, начинающегося в offset (после структурных правок) */
  const pathAt = (offset: number) => nodeAt(doc(), offset)?.path ?? null;
  const undo = () => change(H.undo);
  const redo = () => change(H.redo);
  const canUndo = () => hist().past.length > 0;
  const canRedo = () => hist().future.length > 0;
  const toggleIn = (set: typeof setLocked, id: string) => set(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return {
    hist, draft, doc, scenes, base, dirty, conflict, setConflict, open, load, markSaved, commit, apply, undo, redo, canUndo, canRedo,
    sel, setSel, hover, setHover, selected, node, pathAt, pendingSrc, setPendingSrc,
    locked, hidden, toggleLock: (id: string) => toggleIn(setLocked, id), toggleHide: (id: string) => toggleIn(setHidden, id),
    clearEditorState: () => { setLocked(new Set<string>()); setHidden(new Set<string>()); },
  };
}
