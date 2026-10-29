// Панель свойств выбранного объекта. Каждая правка - локальный патч исходника (editor/source.ts).
import { createMemo, createSignal, For, Index, Show } from 'solid-js';
import { copy, fileUrl, toast } from '../../api';
import { AVATAR_POS, can, EASES, ENTER_ANIMS, kindOf, KIND_LABEL } from '../../editor/capabilities';
import { clean } from '../../editor/catalog';
import type { EditorCtx } from '../../editor/context';
import { fit, TEXT_ZONE, COMP_ZONE } from '../../editor/safety';
import { isAbsolute, rectOf } from '../../editor/bridge';
import { attr, classList, decode, editableRuns, insertHTML, outer, parse, removeNode, replaceNode, setAttr, setClasses, setStyle, setText, styleOf, toggleClass, uniqueId, type SrcNode } from '../../editor/source';
import { nearestWord, round2, wordsIn } from '../../editor/timing';
import { Field, Group, LiveArea, Pick, px, Seg, unpx } from './fields';
import { nodeLabel } from './ObjectTree';

const WEIGHTS = ['', '400', '500', '600', '700', '800'].map(x => ({ id: x, title: x || 'класс' }));
const BAD_TEXT = /[ёЁ—–]/;

export default function ObjectPanel(p: { ctx: EditorCtx; onSavePreset: (n: SrcNode) => void }) {
  const s = p.ctx.store;
  const n = () => s.selected();
  const path = () => s.sel()!;
  // каждый патч ищет объект заново по пути: после прошлой правки позиции в тексте другие
  const apply = (label: string, fn: (d: ReturnType<typeof s.doc>, x: SrcNode) => ReturnType<typeof setAttr> | string, key?: string) =>
    s.apply(d => { const x = d.byPath.get(path()); return x ? fn(d, x) : d.src; }, label, { key });
  const style = (props: Record<string, string | null>, label = 'Стиль') => apply(label, (d, x) => setStyle(d, x, props));
  const set = (name: string, v: string | null, label = name) => apply(label, (d, x) => setAttr(d, x, name, v === '' ? null : v));
  const st = (prop: string) => { const x = n(); return x ? unpx(styleOf(x, prop)) : ''; };
  const a = (name: string) => n() ? attr(n()!, name) ?? '' : '';
  const cls = () => n() ? classList(n()!) : [];
  const [showSrc, setShowSrc] = createSignal(false);
  // непримененая правка исходника живет в store: привязана к объекту (путь переносится при правках) и к его HTML на начало правки
  const pend = () => s.pendingSrc();
  const mine = () => !!pend() && pend()!.path === s.sel();
  const pendLabel = () => { const x = s.node(pend()?.path); return x ? `${nodeLabel(x).kind} ${nodeLabel(x).ref} (путь ${x.path})` : 'объект удален из черновика'; };
  function editSrc(text: string) {
    const x = n(); if (!x) return;
    const cur = pend();
    if (cur && cur.path !== x.path) return;
    s.setPendingSrc({ path: x.path, orig: cur?.orig ?? outer(s.doc(), x), text });
  }
  function applySrc() {
    const e = pend(); if (!e) return;
    const x = s.node(e.path);
    if (!x) { toast('Объект правки удален из черновика. Текст правки сохранен: скопируйте его или отбросьте.', true); return; }
    if (outer(s.doc(), x) !== e.orig) { toast('Объект изменился после начала правки исходника (отмена, панель или диск). Текст сохранен: скопируйте или отбросьте.', true); return; }
    s.setSel(e.path);
    s.apply(d => replaceNode(d, d.byPath.get(e.path!)!, e.text), 'Исходник объекта', { select: true });
    s.setPendingSrc(null);
  }

  const abs = createMemo(() => { s.draft(); const w = p.ctx.win(); return !!(w && s.sel() && isAbsolute(w, s.sel()!)); });

  function remove() {
    const x = n(); if (!x || x.tag === 'section') return;
    const parent = x.parent?.path ?? null;
    s.apply(d => removeNode(d, d.byPath.get(path())!), 'Удалить объект');
    s.setSel(parent);
  }
  function duplicate() {
    const x = n(); if (!x || x.tag === 'section') return;
    let html = outer(s.doc(), x);
    // id в копии должны быть уникальными
    const used = new Set<string>();
    html = html.replace(/\sid="([^"]+)"/g, (_m, id) => { const d = parse(s.draft()); let u = uniqueId(d, id + '-copy'); while (used.has(u)) u += 'x'; used.add(u); return ` id="${u}"`; });
    s.apply(d => insertHTML(d, d.byPath.get(path())!, html, 'after'), 'Дублировать', { select: true });
  }
  function ensureId(): string {
    const x = n()!; const id = attr(x, 'id');
    if (id) return id;
    const u = uniqueId(s.doc(), (classList(x)[0] || x.tag) + '-' + (x.path || '').replace(/\W/g, ''));
    set('id', u, 'Добавить id');
    return u;
  }
  const words = () => p.ctx.words();
  const sceneOf = () => s.scenes()[n()?.section ?? 0];
  /** выравнивание абсолютного объекта по safe zone: left/top в px кадра без камеры */
  function alignAbs(where: 'left' | 'center' | 'right' | 'top' | 'bottom') {
    const w = p.ctx.win(); if (!w) return;
    const el = w.document.querySelector(`[data-studio-id="${CSS.escape(path())}"]`) as HTMLElement | null; if (!el) return;
    const ww = el.offsetWidth, hh = el.offsetHeight, z = TEXT_ZONE;
    if (where === 'left') style({ left: px(String(z.x0)), right: null, translate: null }, 'Выровнять');
    if (where === 'right') style({ left: null, right: px(String(1080 - z.x1)), translate: null }, 'Выровнять');
    if (where === 'center') style({ left: px(String(Math.round(540 - ww / 2))), right: null, translate: null }, 'Выровнять');
    if (where === 'top') style({ top: px(String(z.y0)), bottom: null }, 'Выровнять');
    if (where === 'bottom') style({ top: px(String(Math.round(z.y1 - hh))), bottom: null }, 'Выровнять');
  }
  /** «Вместить»: предпросмотр рамки и применение сдвига или ширины */
  const fitPlan = createMemo(() => {
    s.draft(); p.ctx.player.t();
    const w = p.ctx.win(), x = n(); if (!w || !x || x.tag === 'section') return null;
    const r = rectOf(w, path()); if (!r) return null;
    const textual = ['heading', 'text', 'number', 'inline'].includes(kindOf(x));
    const f = fit(r, textual ? TEXT_ZONE : COMP_ZONE); if (!f) return null;
    const nw = f.width ?? r.x1 - r.x0;
    return { f, ghost: { x0: r.x0 + f.dx, y0: r.y0 + f.dy, x1: r.x0 + f.dx + nw, y1: r.y1 + f.dy } };
  });
  function applyFit() {
    const plan = fitPlan(), w = p.ctx.win(); if (!plan || !w) return;
    const el = w.document.querySelector(`[data-studio-id="${CSS.escape(path())}"]`) as HTMLElement;
    const cs = w.getComputedStyle(el), props: Record<string, string | null> = {};
    if (plan.f.width) props['max-width'] = px(String(Math.floor(plan.f.width)));
    if (abs()) {
      if (plan.f.dx) props.left = px(String(Math.round(el.offsetLeft + plan.f.dx)));
      if (plan.f.dy) props.top = px(String(Math.round(el.offsetTop + plan.f.dy)));
      if (plan.f.dx) props.right = null;
      if (plan.f.dy) props.bottom = null;
    } else if (plan.f.dx || plan.f.dy) {
      props['margin-left'] = plan.f.dx ? px(String(Math.round((parseFloat(cs.marginLeft) || 0) + plan.f.dx))) : st('margin-left') ? px(st('margin-left')) : null;
      props['margin-top'] = plan.f.dy ? px(String(Math.round((parseFloat(cs.marginTop) || 0) + plan.f.dy))) : st('margin-top') ? px(st('margin-top')) : null;
    }
    style(props, 'Вместить в safe zone'); p.ctx.setGhost(null);
  }
  /** data-lines по словам озвучки: слова сцены начиная с ближайшего к времени первого слова */
  function linesFromWords() {
    const x = n()!, cur = a('data-lines').split(',').map(Number).filter(Number.isFinite);
    const count = editableRuns(x).map(r => decode(r.raw).trim()).join(' ').split(/\s+/).filter(Boolean).length;
    const sc = sceneOf(); const list = wordsIn(words(), sc.s, sc.e);
    const k0 = list.findIndex(({ i }) => i === nearestWord(words(), cur[0] ?? p.ctx.player.t()));
    const take = list.slice(Math.max(0, k0), Math.max(0, k0) + count).map(({ w }) => round2(w[1]));
    if (!take.length) { toast('В сцене нет слов words.json', true); return; }
    set('data-lines', take.join(','), 'Строки по словам');
  }

  const PendingBox = () => (
    <Show when={pend() && !mine()}>
      <div class="warnbox">
        <div class="grow">Не применена правка исходника: {pendLabel()}. Пока она не применена или не отброшена, другой объект через исходник не правится.</div>
        <Show when={s.node(pend()!.path)}><button class="btn ghost" onClick={() => s.setSel(pend()!.path)}>Перейти</button></Show>
        <button class="btn ghost" onClick={() => copy(pend()!.text)}>Скопировать</button>
        <button class="btn ghost" onClick={() => s.setPendingSrc(null)}>Отбросить</button>
      </div>
    </Show>);

  return (
    <Show when={n()} fallback={<><div class="muted">Выберите объект кликом по кадру (режим «Выбор») или в дереве.</div><PendingBox /></>}>{x => {
      const k = () => kindOf(x());
      return (
        <div class="props">
          <div class="row">
            <b class="grow">{KIND_LABEL[k()]} <span class="muted">{nodeLabel(x()).ref}</span></b>
            <Show when={x().parent?.path}><button class="btn ghost icon" title="Выбрать родителя" onClick={() => s.setSel(x().parent!.path)}><span class="mi">north_west</span></button></Show>
            <Show when={k() !== 'section'}>
              <button class="btn ghost icon" title="Дублировать" onClick={duplicate}><span class="mi">content_copy</span></button>
              <button class="btn ghost icon" title="Сохранить как пресет ролика" onClick={() => p.onSavePreset(x())}><span class="mi">bookmark_add</span></button>
              <button class="btn ghost icon" title="Удалить из черновика" onClick={remove}><span class="mi">delete</span></button>
            </Show>
          </div>
          <div class="muted small">путь {x().path} · {'<' + x().tag + '>'}{k() === 'other' ? ' · нестандартный элемент: правьте через исходник ниже' : ''}</div>

          <Show when={fitPlan()}>{plan =>
            <div class="warnbox">
              <div class="grow">За safe zone в этом кадре{plan().f.width ? `, ширина больше ${Math.round(plan().f.width!)}px` : ''}</div>
              <button class="btn ghost" onMouseEnter={() => p.ctx.setGhost(plan().ghost)} onMouseLeave={() => p.ctx.setGhost(null)} onClick={applyFit}>Вместить</button>
            </div>}
          </Show>

          <Show when={can(x(), 'text') && editableRuns(x()).length}>
            <Group title="Текст">
              <Index each={editableRuns(x())}>{(r, idx) => {
                const i = () => idx, val = () => decode(r().raw).trim();
                return (
                  <div class="text-run">
                    <LiveArea rows={Math.min(4, Math.ceil(val().length / 34) || 1)} value={val()}
                      onInput={v => { const idx = i(); s.apply(d => { const node = d.byPath.get(path()); const run = node && editableRuns(node)[idx]; return run ? setText(d, run, v) : d.src; }, 'Текст', { key: `text:${path()}:${idx}` }); }} />
                    <Show when={BAD_TEXT.test(val())}>
                      <div class="warn small">ё или длинное тире: в роликах пишем «е» и «-». <button class="link" onClick={() => { const idx = i(); s.apply(d => { const run = editableRuns(d.byPath.get(path())!)[idx]; return setText(d, run, clean(decode(run.raw).trim())); }, 'Исправить текст'); }}>Исправить</button></div>
                    </Show>
                  </div>);
              }}</Index>
              <Show when={editableRuns(x()).length > 1}><div class="muted small">Фрагменты правятся по отдельности: вложенная разметка (акцент, иконки) сохраняется.</div></Show>
            </Group>
          </Show>

          <Show when={can(x(), 'font')}>
            <Group title="Шрифт">
              <div class="fields three">
                <Field label="Размер, px" value={st('font-size')} placeholder="класс" onChange={v => style({ 'font-size': v ? px(v) : null }, 'Размер шрифта')} />
                <Pick label="Вес" value={st('font-weight')} options={WEIGHTS} onChange={v => style({ 'font-weight': v || null }, 'Вес')} />
                <Field label="Межстрочный" value={st('line-height')} placeholder="класс" onChange={v => style({ 'line-height': v || null }, 'Межстрочный')} />
                <Field label="Трекинг (≤ 0)" value={st('letter-spacing')} placeholder="класс" onChange={v => {
                  if (v && parseFloat(v) > 0) { toast('Положительный трекинг запрещен правилами', true); return; }
                  style({ 'letter-spacing': v ? px(v) : null }, 'Трекинг');
                }} />
              </div>
            </Group>
          </Show>

          <Show when={can(x(), 'align')}>
            <Group title="Выравнивание">
              <div class="row wrap">
                <Seg value={st('text-align')} options={[{ id: 'left', title: 'Текст влево', icon: 'format_align_left' }, { id: 'center', title: 'По центру', icon: 'format_align_center' }, { id: 'right', title: 'Вправо', icon: 'format_align_right' }]}
                  onChange={v => style({ 'text-align': v || null }, 'Выравнивание текста')} />
                <Seg value={st('align-self')} options={[{ id: 'flex-start', title: 'Блок влево', icon: 'align_horizontal_left' }, { id: 'center', title: 'Блок по центру', icon: 'align_horizontal_center' }, { id: 'flex-end', title: 'Блок вправо', icon: 'align_horizontal_right' }, { id: 'stretch', title: 'Во всю ширину', icon: 'width_full' }]}
                  onChange={v => style({ 'align-self': v || null }, 'Выравнивание блока')} />
              </div>
            </Group>
          </Show>

          <Show when={can(x(), 'size') || can(x(), 'spacing')}>
            <Group title="Размеры и отступы">
              <div class="fields three">
                <Show when={can(x(), 'size')}>
                  <Field label="Ширина" value={st('width')} placeholder="авто" onChange={v => style({ width: v ? px(v) : null }, 'Ширина')} />
                  <Field label="Высота" value={st('height')} placeholder="авто" onChange={v => style({ height: v ? px(v) : null }, 'Высота')} />
                  <Field label="Макс. ширина" value={st('max-width')} placeholder="нет" onChange={v => style({ 'max-width': v ? px(v) : null }, 'Макс. ширина')} />
                </Show>
                <Show when={can(x(), 'spacing')}>
                  <Field label="Внутр. отступ" value={st('padding')} placeholder="класс" title="padding: 40px 50px" onChange={v => style({ padding: v ? v.split(/\s+/).map(px).join(' ') : null }, 'Отступ')} />
                  <Field label="Внешн. отступ" value={st('margin')} placeholder="нет" title="margin" onChange={v => style({ margin: v ? v.split(/\s+/).map(px).join(' ') : null }, 'Внешний отступ')} />
                  <Field label="Зазор (gap)" value={st('gap')} placeholder="нет" onChange={v => style({ gap: v ? px(v) : null }, 'Зазор')} />
                </Show>
              </div>
            </Group>
          </Show>

          <Show when={can(x(), 'position') && abs()}>
            <Group title="Положение (absolute)">
              <div class="fields four">
                <Field label="left" value={st('left')} onChange={v => style({ left: v ? px(v) : null }, 'Положение')} />
                <Field label="top" value={st('top')} onChange={v => style({ top: v ? px(v) : null }, 'Положение')} />
                <Field label="right" value={st('right')} onChange={v => style({ right: v ? px(v) : null }, 'Положение')} />
                <Field label="bottom" value={st('bottom')} onChange={v => style({ bottom: v ? px(v) : null }, 'Положение')} />
              </div>
              <div class="row wrap">
                <span class="muted small">По safe zone:</span>
                <For each={[['left', 'align_horizontal_left'], ['center', 'align_horizontal_center'], ['right', 'align_horizontal_right'], ['top', 'align_vertical_top'], ['bottom', 'align_vertical_bottom']] as const}>{([w, ic]) =>
                  <button class="btn ghost icon" title={`Прижать: ${w}`} onClick={() => alignAbs(w)}><span class="mi">{ic}</span></button>}
                </For>
              </div>
            </Group>
          </Show>

          <Show when={can(x(), 'palette') || can(x(), 'glass') || can(x(), 'mark')}>
            <Group title="Цвет и поверхность">
              <Show when={can(x(), 'palette')}>
                <div class="pals">
                  <button title="без палитры" classList={{ on: !cls().some(c => c.startsWith('pal-')) }} onClick={() => apply('Палитра', (d, y) => setClasses(d, y, c => c.filter(z => !z.startsWith('pal-'))))}>∅</button>
                  <For each={Object.entries(p.ctx.palettes() || {})}>{([name, c]) =>
                    <button title={name} classList={{ on: cls().includes('pal-' + name) }} style={{ background: c.bg, color: c.fg }}
                      onClick={() => apply('Палитра', (d, y) => setClasses(d, y, l => [...l.filter(z => !z.startsWith('pal-')), 'pal-' + name]))}>●</button>}
                  </For>
                </div>
                <label class="check"><input type="checkbox" checked={cls().includes('acc')} onChange={e => apply('Акцент', (d, y) => toggleClass(d, y, 'acc', e.currentTarget.checked))} /> цвет акцента (.acc)</label>
              </Show>
              <Show when={can(x(), 'mark')}><label class="check"><input type="checkbox" checked={cls().includes('mark')} onChange={e => apply('Подсветка', (d, y) => toggleClass(d, y, 'mark', e.currentTarget.checked))} /> подсветка (.mark)</label></Show>
              <Show when={can(x(), 'glass')}><label class="check"><input type="checkbox" checked={cls().includes('glass')} onChange={e => apply('Glass', (d, y) => toggleClass(d, y, 'glass', e.currentTarget.checked))} /> стекло (.glass) - только смысловой акцент</label></Show>
            </Group>
          </Show>

          <Show when={can(x(), 'avatar')}>
            <Group title="Аватар">
              <div class="fields">
                <Pick label="Положение" value={cls().find(c => AVATAR_POS.some(p => p.id === c)) || ''} options={[{ id: '', title: '-' }, ...AVATAR_POS]}
                  onChange={v => apply('Положение аватара', (d, y) => setClasses(d, y, l => [...l.filter(c => !AVATAR_POS.some(p => p.id === c)), v].filter(Boolean)))} />
                <Field label="Высота --ava-h (480-720)" value={st('--ava-h')} placeholder="660" onChange={v => {
                  if (v && (+v < 480 || +v > 720)) toast('Высота аватара по правилам 480-720px', true);
                  style({ '--ava-h': v ? px(v) : null }, 'Высота аватара');
                }} />
              </div>
              <label class="check"><input type="checkbox" checked={cls().includes('ring')} onChange={e => apply('Обводка', (d, y) => toggleClass(d, y, 'ring', e.currentTarget.checked))} /> белая обводка (.ring)</label>
            </Group>
          </Show>

          <Show when={can(x(), 'src')}>
            <Group title="Файл">
              <select value={a('src')} onChange={e => set('src', e.currentTarget.value, 'Файл картинки')}>
                <option value={a('src')}>{a('src').split('/').pop() || '-'}</option>
                <For each={k() === 'avatar' ? p.ctx.assets()?.avatars : p.ctx.assets()?.images}>{f => <option value={'../' + f.path.split('/').map(encodeURIComponent).join('/')}>{(f.source ? f.source + ' / ' : '') + f.name}</option>}</For>
              </select>
              <Show when={a('src')}><img class="thumb-sm" src={fileUrl(decodeURIComponent(a('src').replace(/^(\.\.\/)+/, '')))} alt="" /></Show>
            </Group>
          </Show>

          <Show when={can(x(), 'motion')}>
            <Group title="Появление и уход" right={<span class="muted small">все от render(t)</span>}>
              <div class="fields three">
                <Field label="Вход, с (data-in)" value={a('data-in')} placeholder="нет" onChange={v => set('data-in', v, 'Время входа')} />
                <Pick label="Как" value={a('data-a')} options={[{ id: '', title: 'проявление' }, ...ENTER_ANIMS]} onChange={v => set('data-a', v, 'Вход')} />
                <Field label="Длительность" value={a('data-d')} placeholder="0.8" onChange={v => set('data-d', v, 'Длительность входа')} />
                <Pick label="Кривая" value={a('data-ease')} options={EASES} onChange={v => set('data-ease', v, 'Кривая')} />
                <Field label="Уход, с (data-exit)" value={a('data-exit').split(',')[0] || ''} placeholder="нет" onChange={v => set('data-exit', v ? [v, a('data-exit').split(',')[1]].filter(Boolean).join(',') : '', 'Уход')} />
                <Field label="Длит. ухода" value={a('data-exit').split(',')[1] || ''} placeholder="0.6" onChange={v => { const t0 = a('data-exit').split(',')[0]; if (t0) set('data-exit', v ? `${t0},${v}` : t0, 'Уход'); }} />
              </div>
              <div class="row wrap">
                <button class="btn ghost" onClick={() => set('data-in', String(round2(p.ctx.player.t())), 'Вход сейчас')}><span class="mi">schedule</span>Вход сейчас</button>
                <button class="btn ghost" onClick={() => { const i = nearestWord(words(), p.ctx.player.t()); if (i >= 0) set('data-in', String(round2(words()[i][1])), 'Вход по слову'); }}><span class="mi">record_voice_over</span>К слову</button>
                <button class="btn ghost" onClick={() => set('data-exit', String(round2(p.ctx.player.t())), 'Уход сейчас')}><span class="mi">logout</span>Уход сейчас</button>
                <Show when={a('data-in')}><button class="btn ghost" onClick={() => p.ctx.player.setLoop([Math.max(0, +a('data-in') - .4), +a('data-in') + (+a('data-d') || .8) + .6])}><span class="mi">repeat</span>Цикл входа</button></Show>
              </div>
              <Show when={a('data-a') && !ENTER_ANIMS.some(e => e.id === a('data-a'))}><div class="warn small">Вход «{a('data-a')}» в мире p5w заменяется сдвигом; scale и вращения не используем.</div></Show>
              <Show when={a('data-lines')}>
                <Field wide label="Строки по словам (data-lines)" value={a('data-lines')} onChange={v => set('data-lines', v, 'data-lines')} />
                <button class="btn ghost" onClick={linesFromWords}><span class="mi">subtitles</span>Взять времена из words.json</button>
              </Show>
              <Show when={a('data-wd-times')}><Field wide label="Слова (data-wd-times)" value={a('data-wd-times')} onChange={v => set('data-wd-times', v, 'data-wd-times')} /></Show>
            </Group>
          </Show>

          <Show when={can(x(), 'id')}>
            <div class="fields">
              <Field label="id (цель камеры, meme)" value={a('id')} placeholder="нет" onChange={v => {
                if (v && v !== a('id') && [...s.doc().byPath.values()].some(y => attr(y, 'id') === v)) { toast('Такой id уже есть', true); return; }
                set('id', v, 'id');
              }} />
              <label>&nbsp;<button class="btn ghost" disabled={!!a('id')} onClick={ensureId}>Создать id</button></label>
            </div>
          </Show>

          <Group title="Исходник объекта" right={<button class="btn ghost icon" onClick={() => setShowSrc(!showSrc())}><span class="mi">{showSrc() || mine() ? 'expand_less' : 'expand_more'}</span></button>}>
            <PendingBox />
            <Show when={showSrc() || mine()}>
              <textarea class="code" spellcheck={false} readOnly={!!pend() && !mine()} value={mine() ? pend()!.text : outer(s.doc(), x())} onInput={e => editSrc(e.currentTarget.value)} />
              <div class="row">
                <button class="btn" disabled={!mine()} onClick={applySrc}>Применить к черновику</button>
                <button class="btn ghost" disabled={!mine()} onClick={() => s.setPendingSrc(null)}>Отменить</button>
              </div>
              <div class="muted small">Произвольный HTML объекта. Применяется только этот фрагмент, остальной файл не меняется.</div>
            </Show>
          </Group>
        </div>
      );
    }}</Show>
  );
}
