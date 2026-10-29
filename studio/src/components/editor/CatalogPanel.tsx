// Каталог компонентов: превью на стилях движка, варианты и поля, вставка в черновик; пресеты ролика.
import { createResource, createSignal, For, Show } from 'solid-js';
import { api, toast, type UserPreset } from '../../api';
import { CATALOG as BASE, defaults, type CatalogItem } from '../../editor/catalog';
import { UI_CATALOG, UI_NEEDS, withNeeds } from '../../editor/catalog-ui';
import { KIT_CATALOG } from '../../editor/catalog-kit';

const CATALOG = [...BASE, ...KIT_CATALOG, ...UI_CATALOG];
import type { EditorCtx } from '../../editor/context';
import { insertHTML, parse, uniqueId, type Doc } from '../../editor/source';

const STYLES = ['fonts-p5', 'base', 'preset-minimal', 'preset-dynamic', 'p5-world', 'p5-ui'].map(x => `<link rel="stylesheet" href="styles/${x}.css">`).join('');
/** статичный кадр на настоящих стилях движка, без runtime: все входы показаны в конечном состоянии */
export const previewDoc = (html: string, bg = 'white', pal = 'sky') =>
  `<!doctype html><html><head><meta charset="utf-8"><base href="/engine/">${STYLES}<style>html,body{overflow:hidden}.s{display:flex!important}</style></head>` +
  `<body class="p5w"><section class="s ${bg} pal-${pal}">${html}</section></body></html>`;

/** id из вставляемого HTML не должны совпадать с уже существующими */
export function dedupeIds(html: string, d: Doc) {
  let doc = d;
  return html.replace(/(\sid=")([^"]+)"/g, (_m, pre, id) => {
    const u = uniqueId(doc, id);
    doc = parse(doc.src + `<i id="${u}"></i>`);
    return `${pre}${u}"`;
  });
}

export default function CatalogPanel(p: { ctx: EditorCtx; presetsVersion: number }) {
  const s = p.ctx.store;
  const [open, setOpen] = createSignal<string | null>(null);
  const [vals, setVals] = createSignal<Record<string, Record<string, string>>>({});
  const [variant, setVariant] = createSignal<Record<string, string>>({});
  const [where, setWhere] = createSignal<'append' | 'after'>('append');
  const [presets, { refetch, mutate }] = createResource(() => [p.ctx.id, p.presetsVersion] as const, ([id]) => api.presets(id));
  const v = (it: CatalogItem) => vals()[it.id] || defaults(it);
  const varOf = (it: CatalogItem) => variant()[it.id] || it.variants[0].id;
  const info = () => s.scenes()[p.ctx.scene()];

  const build = (it: CatalogItem) => it.build(v(it), varOf(it), {
    t: Math.max(info()?.s ?? 0, Math.round(p.ctx.player.t() * 100) / 100),
    id: base => uniqueId(s.doc(), base),
  });

  function insert(html: string, label: string, needs?: string[]) {
    const sel = s.selected(), sec = s.doc().sections[p.ctx.scene()];
    if (!sec) return;
    if (info()?.outro) { toast('Концовку заполняет движок: вставка в нее не нужна', true); return; }
    const target = where() === 'after' && sel && sel.section === p.ctx.scene() && sel.tag !== 'section' ? sel : sec;
    const mode = target === sec ? 'append' : 'after';
    s.apply(d => {
      const r = insertHTML(d, d.byPath.get(target.path!)!, dedupeIds(html, d), mode);
      return { ...r, ...withNeeds(r.src, r.at, needs ?? (/\bui-/.test(html) ? [UI_NEEDS.css, UI_NEEDS.js] : [])) };
    }, label, { select: true });
  }
  async function removePreset(k: number) {
    const list = (presets() || []).filter((_, i) => i !== k);
    try { mutate(await api.savePresets(p.ctx.id, list)); } catch (e: any) { toast(e.message, true); }
  }

  return (
    <div class="props">
      <div class="row">
        <span class="muted small grow">Вставка в черновик сцены {p.ctx.scene() + 1}, время входа - текущий кадр.</span>
        <div class="seg small">
          <button classList={{ on: where() === 'append' }} onClick={() => setWhere('append')}>в конец сцены</button>
          <button classList={{ on: where() === 'after' }} onClick={() => setWhere('after')}>после выбранного</button>
        </div>
      </div>
      <div class="cat-grid">
        <For each={CATALOG}>{it =>
          <div class="cat-item" classList={{ open: open() === it.id }}>
            <button class="cat-head" onClick={() => setOpen(open() === it.id ? null : it.id)}>
              <span class="mi">{it.icon}</span><b class="grow">{it.title}</b><span class="mi">{open() === it.id ? 'expand_less' : 'expand_more'}</span>
            </button>
            <Show when={open() === it.id}>
              <div class="muted small">{it.desc}</div>
              <div class="cat-preview"><iframe title={it.title} srcdoc={previewDoc(build(it), info()?.bg || 'white', info()?.pal || 'sky')} width="1080" height="1920" /></div>
              <Show when={it.variants.length > 1}>
                <div class="seg small">
                  <For each={it.variants}>{x => <button classList={{ on: varOf(it) === x.id }} onClick={() => setVariant({ ...variant(), [it.id]: x.id })}>{x.title}</button>}</For>
                </div>
              </Show>
              <div class="fields">
                <For each={it.fields}>{f =>
                  <label classList={{ wide: f.type === 'textarea' || f.type === 'asset' }}>{f.label}
                    {f.type === 'textarea'
                      ? <textarea rows={3} value={v(it)[f.key]} onChange={e => setVals({ ...vals(), [it.id]: { ...v(it), [f.key]: e.currentTarget.value } })} />
                      : f.type === 'select'
                        ? <select value={v(it)[f.key]} onChange={e => setVals({ ...vals(), [it.id]: { ...v(it), [f.key]: e.currentTarget.value } })}><For each={f.options}>{o => <option value={o.id}>{o.title}</option>}</For></select>
                        : f.type === 'asset'
                          ? <select value={v(it)[f.key]} onChange={e => setVals({ ...vals(), [it.id]: { ...v(it), [f.key]: e.currentTarget.value } })}>
                              <option value="">Выберите файл</option>
                              <For each={p.ctx.assets()?.[f.asset!] || []}>{a => <option value={a.path}>{(a.source ? a.source + ' / ' : '') + a.name}</option>}</For>
                            </select>
                          : <input type={f.type === 'number' ? 'number' : 'text'} value={v(it)[f.key]} onChange={e => setVals({ ...vals(), [it.id]: { ...v(it), [f.key]: e.currentTarget.value } })} />}
                  </label>}
                </For>
              </div>
              <Show when={it.after}><div class="muted small">{it.after}</div></Show>
              <button class="btn primary" disabled={it.fields.some(f => f.type === 'asset' && !v(it)[f.key])} onClick={() => insert(build(it), 'Вставить: ' + it.title, it.needs)}><span class="mi">add</span>Вставить в черновик</button>
            </Show>
          </div>}
        </For>
      </div>
      <div class="group-h">Пресеты ролика · work/studio-presets.json</div>
      <Show when={(presets() || []).length} fallback={<div class="muted small">Сохраните выбранный объект кнопкой <span class="mi">bookmark_add</span> в панели «Объект».</div>}>
        <For each={presets()}>{(x: UserPreset, k) =>
          <div class="row preset-row">
            <span class="grow ell">{x.name} <span class="muted small">{x.kind}</span></span>
            <button class="btn ghost" onClick={() => insert(x.html, 'Пресет: ' + x.name)}>Вставить</button>
            <button class="btn ghost icon" title="Удалить пресет" onClick={() => removePreset(k())}><span class="mi">delete</span></button>
          </div>}
        </For>
      </Show>
      <button class="btn ghost" onClick={() => refetch()}><span class="mi">refresh</span>Обновить пресеты</button>
      <div class="muted small">Картинки - из video/assets/images и img/ ролика. SVG формул делает tex2svg.mjs: кнопка «Сверстать формулы» во вкладке «Проверка».</div>
    </div>
  );
}
