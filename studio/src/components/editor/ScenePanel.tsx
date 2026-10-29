// Сцена: время, фон, палитра, обои, переход (галерея и предпросмотр стыка), правка для агента.
import { createMemo, For, Show } from 'solid-js';
import { copy, fileUrl } from '../../api';
import type { EditorCtx } from '../../editor/context';
import { attr, setAttr, setClasses, setWall, type Doc } from '../../editor/source';
import { checkScenes, resolveTr, TRANSITIONS, trDur } from '../../editor/timing';
import { Field } from './fields';

export default function ScenePanel(p: { ctx: EditorCtx; notes: Record<string, string>; onNotes: (n: Record<string, string>) => void; onRenderScene: () => void }) {
  const s = p.ctx.store;
  const i = () => p.ctx.scene();
  const info = () => s.scenes()[i()];
  const sec = () => s.doc().sections[i()];
  const onSec = (label: string, fn: (d: Doc, path: string) => ReturnType<typeof setAttr> | string) =>
    s.apply(d => { const n = d.sections[i()]; return n ? fn(d, n.path!) : d.src; }, label);
  const set = (name: string, v: string, label = name) => onSec(label, (d, path) => setAttr(d, d.byPath.get(path)!, name, v || null));
  const tr = createMemo(() => resolveTr(s.scenes(), i()));
  const issues = createMemo(() => checkScenes(s.scenes(), () => true).filter(x => x.scene === i()));
  const hasMeme = createMemo(() => { const prev = s.doc().sections[i() - 1]; return prev ? [...s.doc().byPath.values()].filter(n => n.section === i() - 1 && n.tag === 'img' && attr(n, 'id') && !(attr(n, 'class') || '').includes('ava')).map(n => '#' + attr(n, 'id')) : []; });
  /** стык: цикл от конца прошлой сцены через переход, 0.25x по желанию */
  const previewSeam = () => { const x = info(); if (!x || !i()) return; const d = trDur(tr()); p.ctx.player.setLoop([Math.max(0, x.s - .6), x.s + d + .6]); p.ctx.player.seek(Math.max(0, x.s - .6)); p.ctx.player.play(); };
  const agentTask = () => { const x = info(); return `Ролик video/${p.ctx.id}/v.html, сцена ${i() + 1} (data-s=${x.s}, data-e=${x.e}).\nПравка: ${p.notes[i()]}\n\nТекущий HTML сцены:\n${s.draft().slice(sec()!.start, sec()!.end)}`; };

  return (
    <Show when={info() && sec()}>
      <div class="props">
        <div class="row">
          <b class="grow">{info().outro ? 'Концовка' : `Сцена ${i() + 1}`}</b>
          <button class="btn ghost" onClick={() => { p.ctx.player.setLoop(null); p.ctx.player.seek(info().s); }}><span class="mi">replay</span>С начала</button>
          <button class="btn ghost" onClick={p.onRenderScene}><span class="mi">movie</span>Превью сцены</button>
        </div>
        <Show when={issues().length}><div class="warnbox col"><For each={issues()}>{x => <div class={x.level}>{x.msg}</div>}</For></div></Show>
        <div class="fields">
          <Field label="Начало, с" value={attr(sec()!, 'data-s') ?? ''} onChange={v => set('data-s', v, 'Начало сцены')} />
          <Field label="Конец, с" value={attr(sec()!, 'data-e') ?? ''} onChange={v => set('data-e', v, 'Конец сцены')} />
          <label>Фон
            <select value={info().bg} onChange={e => { const v = e.currentTarget.value; onSec('Фон', (d, path) => setClasses(d, d.byPath.get(path)!, c => [...c.filter(x => x !== 'white' && x !== 'black'), v])); }}>
              <option value="white">white</option><option value="black">black</option>
            </select>
          </label>
          <Field label="Приглушение камеры (data-camdim)" value={attr(sec()!, 'data-camdim') ?? ''} placeholder=".06" title="0 - не приглушать, .06-1 - яркость остального при наезде" onChange={v => set('data-camdim', v, 'Приглушение')} />
          <label class="wide">Палитра
            <div class="pals">
              <For each={Object.entries(p.ctx.palettes() || {})}>{([n, c]) =>
                <button title={n} classList={{ on: info().pal === n }} style={{ background: c.bg, color: c.fg }}
                  onClick={() => onSec('Палитра сцены', (d, path) => setClasses(d, d.byPath.get(path)!, cl => [...cl.filter(x => !x.startsWith('pal-')), 'pal-' + n]))}>●</button>}
              </For>
            </div>
          </label>
          <Show when={info().bg === 'black'}>
            <label class="wide">Обои
              <div class="walls">
                <button classList={{ on: !info().wall }} onClick={() => onSec('Обои', (d, path) => setWall(d, d.byPath.get(path)!, null))}>нет</button>
                <For each={p.ctx.assets()?.wallpapers || []}>{w =>
                  <button classList={{ on: info().wall === w.path }} style={{ 'background-image': `url(${fileUrl(w.path)})` }}
                    title={w.name + (w.usedIn.length ? ` · в ${w.usedIn.length} роликах` : '')}
                    onClick={() => onSec('Обои', (d, path) => setWall(d, d.byPath.get(path)!, w.path))} />}
                </For>
              </div>
            </label>
          </Show>
        </div>

        <Show when={i() > 0}>
          <div class="group-h">Переход в сцену · сейчас <b>{tr() || '-'}</b> · {trDur(tr())} с{!info().tr ? ' (выбран движком)' : ''}</div>
          <div class="tr-grid">
            <button class="tr-card" classList={{ on: !info().tr }} onClick={() => set('data-tr', '', 'Переход')}><b>авто</b><span>тот же фон - down, другой - dots</span></button>
            <For each={TRANSITIONS}>{x =>
              <button class="tr-card" classList={{ on: info().tr === x.id, new: x.isNew }} onClick={() => set('data-tr', x.id, 'Переход')} title={x.note}>
                <b>{x.title}</b><span>{x.id} · {x.dur} с · {x.bg === 'same' ? 'тот же фон' : x.bg === 'change' ? 'смена фона' : 'любой фон'}</span>
              </button>}
            </For>
          </div>
          <Show when={tr() === 'meme'}>
            <label class="fields-one">Картинка для зума (data-wipe)
              <select value={info().wipe} onChange={e => set('data-wipe', e.currentTarget.value, 'data-wipe')}>
                <option value="">-</option>
                <For each={hasMeme()}>{id => <option value={id}>{id}</option>}</For>
              </select>
            </label>
          </Show>
          <Show when={tr() === 'radial'}><Field label='Центр круга data-wipe="x,y"' value={info().wipe} placeholder="540,960" onChange={v => set('data-wipe', v, 'data-wipe')} /></Show>
          <div class="row wrap">
            <button class="btn" onClick={previewSeam}><span class="mi">repeat</span>Предпросмотр стыка</button>
            <button class="btn ghost" onClick={() => { p.ctx.player.setSpeed(.25); previewSeam(); }}>0.25x</button>
            <Show when={p.ctx.player.loop()}><button class="btn ghost" onClick={() => p.ctx.player.setLoop(null)}>Без цикла</button></Show>
          </div>
          <div class="muted small">Совпадающие объекты между сценами (match move) не поддерживаются: нет надежной связи объектов.</div>
        </Show>

        <div class="note-box">
          <div class="row"><b class="grow">Правка для агента</b>
            <button class="btn ghost" disabled={!p.notes[i()]?.trim()} onClick={() => copy(agentTask())}><span class="mi">content_copy</span>Скопировать задачу</button>
          </div>
          <textarea placeholder="Что поменять в этой сцене: агенту уйдет текст правки вместе с HTML сцены"
            value={p.notes[i()] || ''} onChange={e => p.onNotes({ ...p.notes, [i()]: e.currentTarget.value })} />
        </div>
      </div>
    </Show>
  );
}
