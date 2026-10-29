// Поля панели свойств: значение пишется в исходник по change (Enter или уход с поля).
import { createEffect, For, type JSX } from 'solid-js';

export const px = (v: string) => /^-?\d+(\.\d+)?$/.test(v.trim()) ? v.trim() + 'px' : v.trim();
export const unpx = (v: string | null) => v == null ? '' : v.replace(/^(-?\d+(?:\.\d+)?)px$/, '$1');

export function Field(p: { label: string; value: string; placeholder?: string; wide?: boolean; title?: string; onChange: (v: string) => void; type?: string; step?: string }) {
  return (
    <label classList={{ wide: p.wide }} title={p.title}>{p.label}
      <input type={p.type || 'text'} step={p.step} value={p.value} placeholder={p.placeholder}
        onChange={e => p.onChange(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
    </label>
  );
}
export function Pick(p: { label: string; value: string; options: { id: string; title: string }[]; wide?: boolean; onChange: (v: string) => void }) {
  return (
    <label classList={{ wide: p.wide }}>{p.label}
      <select value={p.value} onChange={e => p.onChange(e.currentTarget.value)}>
        <For each={p.options}>{o => <option value={o.id}>{o.title}</option>}</For>
      </select>
    </label>
  );
}
export function Group(p: { title: string; children: JSX.Element; right?: JSX.Element }) {
  return (
    <div class="prop-group">
      <div class="row"><div class="group-h grow">{p.title}</div>{p.right}</div>
      {p.children}
    </div>
  );
}
export function Seg(p: { value: string; options: { id: string; title: string; icon?: string }[]; onChange: (v: string) => void }) {
  return (
    <div class="seg small">
      <For each={p.options}>{o =>
        <button classList={{ on: p.value === o.id }} title={o.title} onClick={() => p.onChange(p.value === o.id ? '' : o.id)}>
          {o.icon ? <span class="mi">{o.icon}</span> : o.title}
        </button>}
      </For>
    </div>
  );
}

/** поле набора текста: значение из исходника подставляется, только когда поле не в фокусе (курсор и пробелы не сбиваются) */
export function LiveArea(p: { value: string; rows?: number; onInput: (v: string) => void; class?: string }) {
  let el!: HTMLTextAreaElement;
  createEffect(() => { const v = p.value; if (el && document.activeElement !== el && el.value !== v) el.value = v; });
  return <textarea ref={el} class={p.class} rows={p.rows} onInput={e => p.onInput(e.currentTarget.value)} onBlur={() => { if (el.value !== p.value) el.value = p.value; }} />;
}
