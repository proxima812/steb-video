// Дерево объектов сцены по исходнику: вложенность, выбор, блокировка выбора и скрытие (только в редакторе).
import { For, Show } from 'solid-js';
import { KIND_ICON, KIND_LABEL, kindOf } from '../../editor/capabilities';
import type { EditorCtx } from '../../editor/context';
import { attr, classList, plainText, type SrcNode } from '../../editor/source';

const SKIP = new Set(['script', 'style', 'br']);
export const nodeLabel = (n: SrcNode) => {
  const id = attr(n, 'id'), cls = classList(n).filter(c => !c.startsWith('pal-') && !['s', 'white', 'black', 'wall'].includes(c)).slice(0, 2);
  const text = n.tag === 'img' ? (attr(n, 'src') || '').split('/').pop() : plainText(n).slice(0, 26);
  return { kind: KIND_LABEL[kindOf(n)], ref: (id ? '#' + id : '') + (cls.length ? '.' + cls.join('.') : ''), text };
};

export default function ObjectTree(p: { ctx: EditorCtx }) {
  const s = p.ctx.store;
  const section = () => s.doc().sections[p.ctx.scene()];
  const Row = (r: { n: SrcNode; depth: number }) => {
    // props реактивны: строка обновляется при смене сцены и правках
    const path = () => r.n.path!, l = () => nodeLabel(r.n);
    return (
      <>
        <div class="tree-row" classList={{ sel: s.sel() === path(), hover: s.hover() === path(), dimmed: s.hidden().has(path()) }}
          style={{ 'padding-left': `${6 + r.depth * 14}px` }}
          onMouseEnter={() => s.setHover(path())} onMouseLeave={() => s.setHover(null)}
          onClick={() => s.setSel(path())}>
          <span class="mi">{KIND_ICON[kindOf(r.n)]}</span>
          <span class="grow ell"><b>{l().kind}</b> <span class="muted">{l().ref}</span> {l().text}</span>
          <button class="tiny" classList={{ on: s.locked().has(path()) }} title="Не выбирать кликом в превью (только редактор)"
            onClick={e => { e.stopPropagation(); s.toggleLock(path()); }}><span class="mi">{s.locked().has(path()) ? 'lock' : 'lock_open'}</span></button>
          <button class="tiny" classList={{ on: s.hidden().has(path()) }} title="Скрыть в превью (в ролике остается)"
            onClick={e => { e.stopPropagation(); s.toggleHide(path()); }}><span class="mi">{s.hidden().has(path()) ? 'visibility_off' : 'visibility'}</span></button>
        </div>
        <Show when={r.depth < 8}>
          <For each={r.n.children.filter(c => !SKIP.has(c.tag) && c.path)}>{c => <Row n={c} depth={r.depth + 1} />}</For>
        </Show>
      </>
    );
  };
  return (
    <div class="tree">
      <Show when={section()} fallback={<div class="muted">Нет сцены</div>}>{sec => <Row n={sec()} depth={0} />}</Show>
      <Show when={s.hidden().size || s.locked().size}>
        <div class="muted small">Скрытие и блокировка действуют только в редакторе, сохранение их не учитывает.
          <button class="link" onClick={() => s.clearEditorState()}>Сбросить</button></div>
      </Show>
    </div>
  );
}
