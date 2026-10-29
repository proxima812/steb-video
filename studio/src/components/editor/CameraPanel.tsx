// Камера сцены: ключи data-camk, выбор цели кликом, привязка к словам, пресеты и проверки.
import { createMemo, createSignal, For, Show } from 'solid-js';
import { toast } from '../../api';
import { layoutWidth } from '../../editor/bridge';
import { checkCam, DEFAULT_DUR, EASES, parseCam, PRESETS, preset, writeCam, type CamKey, type Preset } from '../../editor/camera';
import type { EditorCtx } from '../../editor/context';
import { attr, classList, setAttr, uniqueId } from '../../editor/source';
import { nearestWord, resolveTr, round2, trDur, wordsIn } from '../../editor/timing';

export default function CameraPanel(p: { ctx: EditorCtx }) {
  const s = p.ctx.store;
  const i = () => p.ctx.scene();
  const sec = () => s.doc().sections[i()];
  const info = () => s.scenes()[i()];
  const keys = createMemo(() => parseCam(sec() ? attr(sec()!, 'data-camk') : null));
  const raw = () => sec() ? attr(sec()!, 'data-camk') ?? '' : '';
  const write = (ks: CamKey[], label = 'Камера') => s.apply(d => { const n = d.sections[i()]; return n ? setAttr(d, n, 'data-camk', ks.length ? writeCam(ks) : null) : d.src; }, label);
  const upd = (k: number, patch: Partial<CamKey>) => write(keys().map((x, j) => j === k ? { ...x, ...patch } : x));
  const targets = createMemo(() => [...s.doc().byPath.values()].filter(n => n.section === i() && attr(n, 'id')).map(n => '#' + attr(n, 'id')));
  const trD = () => i() ? trDur(resolveTr(s.scenes(), i())) : 0;
  const issues = createMemo(() => {
    s.draft();
    const w = p.ctx.win(), x = info(); if (!x) return [];
    const byId = (tg: string) => [...s.doc().byPath.values()].find(n => n.section === i() && '#' + attr(n, 'id') === tg);
    return checkCam(keys(), {
      sceneStart: x.s, sceneEnd: x.e, trDur: trD(), exists: tg => !!byId(tg) || (!tg.startsWith('#')),
      width: tg => { const n = byId(tg); return w && n ? layoutWidth(w, n.path!) : null; },
    });
  });
  const [presetTargets, setPresetTargets] = createSignal<string[]>([]);

  /** цель кликом по превью: объекту без id добавляется уникальный id */
  function pickTarget(k: number | 'preset') {
    p.ctx.requestPick('Выберите цель камеры', path => {
      const n = s.node(path); if (!n) return;
      let id = attr(n, 'id');
      if (!id) {
        id = uniqueId(s.doc(), 'cam-' + (classList(n)[0] || n.tag));
        s.apply(d => setAttr(d, d.byPath.get(path)!, 'id', id!), 'id цели камеры');
      }
      if (k === 'preset') setPresetTargets(t => [...t, '#' + id].slice(-2));
      else upd(k, { target: '#' + id });
    });
  }
  function add() {
    const t = round2(Math.max(info().s + trD(), p.ctx.player.t()));
    write([...keys(), { t, target: s.selected() && attr(s.selected()!, 'id') ? '#' + attr(s.selected()!, 'id') : 'c', scale: 1.12, dur: .9, ease: null }], 'Ключ камеры');
  }
  function applyPreset(id: Preset) {
    const need = PRESETS.find(x => x.id === id)!.needs, tg = presetTargets();
    if (tg.length < need) { toast(`Выберите ${need === 1 ? 'цель' : 'две цели'} кнопкой «+ цель»`, true); return; }
    const start = round2(Math.max(info().s + trD(), p.ctx.player.t()));
    write(preset(id, start, info().e, tg), 'Пресет камеры');
  }
  const wordsHere = () => wordsIn(p.ctx.words(), info().s, info().e);

  return (
    <Show when={info()}>
      <div class="props">
        <div class="row"><b class="grow">Камера сцены {i() + 1}</b>
          <button class="btn" onClick={add}><span class="mi">add</span>Ключ сейчас</button>
        </div>
        <div class="muted small">data-camk: время цель масштаб [длительность] [кривая]. Наезд 1.08-1.2, движение 0.5-1.4 с, не раньше конца перехода ({(info().s + trD()).toFixed(2)} с). Масштаб ограничивает движок, чтобы цель помещалась в safe zone.</div>
        <For each={keys()}>{(k, j) =>
          <div class="cam-key">
            <div class="fields five">
              <label>Время<input type="number" step="0.01" value={k.t} onChange={e => upd(j(), { t: +e.currentTarget.value })} /></label>
              <label>Цель
                <select value={k.target} onChange={e => upd(j(), { target: e.currentTarget.value })}>
                  <option value="c">общий план (c)</option>
                  <For each={targets()}>{x => <option value={x}>{x}</option>}</For>
                  <Show when={k.target !== 'c' && !targets().includes(k.target)}><option value={k.target}>{k.target}</option></Show>
                </select>
              </label>
              <label>Масштаб<input type="number" step="0.01" value={k.scale} onChange={e => upd(j(), { scale: +e.currentTarget.value })} /></label>
              <label>Длит.<input type="number" step="0.05" value={k.dur ?? DEFAULT_DUR} onChange={e => upd(j(), { dur: +e.currentTarget.value })} /></label>
              <label>Кривая<select value={k.ease || ''} onChange={e => upd(j(), { ease: e.currentTarget.value || null })}><For each={EASES}>{x => <option value={x}>{x || 'cine'}</option>}</For></select></label>
            </div>
            <div class="row wrap">
              <button class="btn ghost icon" title="Цель кликом в превью" onClick={() => pickTarget(j())}><span class="mi">ads_click</span></button>
              <button class="btn ghost icon" title="Время = текущий кадр" onClick={() => upd(j(), { t: round2(p.ctx.player.t()) })}><span class="mi">schedule</span></button>
              <select class="grow" title="Время по слову" value="" onChange={e => { if (e.currentTarget.value) upd(j(), { t: +e.currentTarget.value }); }}>
                <option value="">к слову...</option>
                <For each={wordsHere()}>{({ w }) => <option value={round2(w[1])}>{round2(w[1])} · {w[0]}</option>}</For>
              </select>
              <button class="btn ghost icon" title="Перейти" onClick={() => p.ctx.focus(k.t + (k.dur ?? DEFAULT_DUR))}><span class="mi">play_arrow</span></button>
              <button class="btn ghost icon" title="Удалить ключ" onClick={() => write(keys().filter((_, x) => x !== j()), 'Удалить ключ камеры')}><span class="mi">delete</span></button>
            </div>
            <For each={issues().filter(x => x.key === j())}>{x => <div class={'small ' + x.level}>{x.msg}</div>}</For>
          </div>}
        </For>
        <Show when={!keys().length}><div class="muted">Ключей нет: камера стоит на общем плане.</div></Show>
        <div class="row wrap">
          <button class="btn ghost" onClick={() => { const n = nearestWord(p.ctx.words(), p.ctx.player.t()); if (n >= 0) p.ctx.player.seek(p.ctx.words()[n][1]); }}><span class="mi">record_voice_over</span>К ближайшему слову</button>
          <Show when={keys().length}><button class="btn ghost" onClick={() => p.ctx.player.setLoop([Math.max(info().s, keys()[0].t - .4), Math.min(info().e, keys().at(-1)!.t + (keys().at(-1)!.dur ?? DEFAULT_DUR) + .5)])}><span class="mi">repeat</span>Цикл камеры</button></Show>
        </div>

        <div class="group-h">Пресеты</div>
        <div class="row wrap">
          <span class="muted small">Цели: {presetTargets().join(' → ') || 'нет'}</span>
          <button class="btn ghost" onClick={() => pickTarget('preset')}><span class="mi">add</span>цель</button>
          <Show when={presetTargets().length}><button class="btn ghost" onClick={() => setPresetTargets([])}>сбросить</button></Show>
        </div>
        <div class="row wrap">
          <For each={PRESETS}>{x => <button class="btn" onClick={() => applyPreset(x.id)}>{x.title}</button>}</For>
        </div>
        <div class="muted small">Пресет заменяет ключи сцены, начиная с текущего времени. Отмена - ⌘Z.</div>
        <label class="fields-one">Строка data-camk<input value={raw()} onChange={e => s.apply(d => setAttr(d, d.sections[i()], 'data-camk', e.currentTarget.value || null), 'Камера')} /></label>
      </div>
    </Show>
  );
}
