// Проверки: safe zone по кадрам (выборочно, с отчетом о покрытии), правила исходника, детерминизм render(t), формулы.
import { createMemo, createSignal, For, Show } from 'solid-js';
import { api, toast } from '../../api';
import { collect, frameState } from '../../editor/bridge';
import { DEFAULT_DUR, parseCam } from '../../editor/camera';
import type { EditorCtx } from '../../editor/context';
import { diagnose } from '../../editor/diagnostics';
import { FPS } from '../../editor/player';
import { check, scanTimes, summarize, type Issue, type Rect } from '../../editor/safety';
import { attr } from '../../editor/source';
import { resolveTr, trDur } from '../../editor/timing';

type Scan = { label: string; times: number; step: number; withTr: boolean; issues: (Issue & { frames: number; last: number })[]; ms: number };
const nextFrame = () => new Promise(r => requestAnimationFrame(r));

export default function CheckPanel(p: { ctx: EditorCtx; onIssueRects: (r: { rect: Rect; level: string }[]) => void }) {
  const s = p.ctx.store;
  const [scan, setScan] = createSignal<Scan | null>(null);
  const [busy, setBusy] = createSignal('');
  const [step, setStep] = createSignal(0.2);
  const [withTr, setWithTr] = createSignal(false);
  const [det, setDet] = createSignal<{ t: number; diff: string[]; total: number } | null>(null);
  const [gaps, setGaps] = createSignal<[number, number][] | null>(null);
  const diags = createMemo(() => diagnose(s.doc()));

  /** ключевые моменты сцены: конец перехода, концы ключей камеры, концы входов и уходов */
  function keyTimes(i: number) {
    const x = s.scenes()[i], out: number[] = [];
    if (i) out.push(x.s + trDur(resolveTr(s.scenes(), i)));
    for (const k of parseCam(attr(s.doc().sections[i], 'data-camk'))) out.push(k.t + (k.dur ?? DEFAULT_DUR));
    for (const n of s.doc().byPath.values()) if (n.section === i) {
      const tin = attr(n, 'data-in'); if (tin != null) out.push(+tin + (+(attr(n, 'data-d') ?? .8) || .8));
      const ex = attr(n, 'data-exit'); if (ex) out.push(+ex.split(',')[0] + (+ex.split(',')[1] || .6));
    }
    return out.filter(Number.isFinite);
  }
  async function run(kind: 'frame' | 'scene' | 'all') {
    const w = p.ctx.win(); if (!w?.render) { toast('Превью еще не готово', true); return; }
    p.ctx.player.pause();
    const t0 = p.ctx.player.t(), started = performance.now();
    const list: number[] = [];
    if (kind === 'frame') list.push(t0);
    else for (const i of kind === 'scene' ? [p.ctx.scene()] : s.scenes().map((_, k) => k)) {
      const x = s.scenes()[i]; if (x.outro) continue;
      // кадры перехода (две сцены, зум старой) по умолчанию не меряем, как и check.mjs; конец перехода - ключевой момент
      const trEnd = i ? x.s + trDur(resolveTr(s.scenes(), i)) : x.s;
      list.push(...scanTimes(x.s, x.e, step(), keyTimes(i)).filter(t => withTr() || t >= trEnd - 1e-6));
    }
    const all: Issue[] = [];
    setBusy('Проверка 0/' + list.length);
    for (let k = 0; k < list.length; k++) {
      w.render(list[k]);
      all.push(...check(list[k], collect(w)));
      if (k % 8 === 7) { setBusy(`Проверка ${k + 1}/${list.length}`); await nextFrame(); }
    }
    p.ctx.player.seek(t0);
    const sum = summarize(all);
    setScan({ label: kind === 'frame' ? `кадр ${t0.toFixed(2)} с` : kind === 'scene' ? `сцена ${p.ctx.scene() + 1}` : 'весь ролик', times: list.length, step: kind === 'frame' ? 0 : step(), withTr: withTr(), issues: sum, ms: performance.now() - started });
    p.onIssueRects(kind === 'frame' ? sum.map(i => ({ rect: i.rect, level: i.level })) : []);
    setBusy('');
  }
  /** последовательное проигрывание к T (2 с по кадрам) против прямого render(T) после render(0) */
  async function determinism() {
    const w = p.ctx.win(); if (!w?.render) return;
    p.ctx.player.pause();
    const T = p.ctx.player.t(); setBusy('Детерминизм...');
    for (let f = Math.max(0, Math.round((T - 2) * FPS)); f <= Math.round(T * FPS); f++) w.render(Math.min(T, f / FPS));
    w.render(T); const seq = frameState(w);
    w.render(0); await nextFrame(); w.render(T); const jump = frameState(w);
    const diff: string[] = [];
    for (const [k, v] of seq) if (jump.get(k) !== v) diff.push(`${k}: ${v.slice(0, 80) || '-'} ≠ ${(jump.get(k) || '-').slice(0, 80)}`);
    setDet({ t: T, diff, total: seq.size }); setBusy(''); p.ctx.player.seek(T);
  }
  async function tex() {
    if (!/<!--tex /.test(s.draft())) { toast('В черновике нет формул <!--tex ...-->'); return; }
    setBusy('tex2svg...');
    try { const r = await api.tex(s.draft()); s.commit(r.html, 'Сверстать формулы'); toast(r.log || 'Формулы сверстаны'); }
    catch (e: any) { toast(e.message, true); } finally { setBusy(''); }
  }

  return (
    <div class="props">
      <div class="group-h">Safe zone · текст x 65-1015, y 250-1670 · компоненты x 65-1015</div>
      <div class="row wrap">
        <button class="btn" disabled={!!busy()} onClick={() => run('frame')}>Текущий кадр</button>
        <button class="btn" disabled={!!busy()} onClick={() => run('scene')}>Сцена</button>
        <button class="btn" disabled={!!busy()} onClick={() => run('all')}>Весь ролик</button>
        <select value={step()} onChange={e => setStep(+e.currentTarget.value)} title="Шаг проверки">
          <option value={1 / FPS}>каждый кадр</option><option value={0.1}>0.1 с</option><option value={0.2}>0.2 с</option><option value={0.5}>0.5 с</option>
        </select>
        <Show when={busy()}><span class="muted small">{busy()}</span></Show>
      </div>
      <label class="check"><input type="checkbox" checked={withTr()} onChange={e => setWithTr(e.currentTarget.checked)} /> включая кадры переходов (зум и наложение сцен дают шум)</label>
      <Show when={scan()}>{r =>
        <>
          <div class="muted small">
            {r().label}: проверено {r().times} кадров{r().step ? `, шаг ${r().step < .05 ? '1/30' : r().step} с + конец переходов, ключей камеры и входов${r().withTr ? ', с кадрами переходов' : ', без кадров переходов'}` : ''} за {Math.round(r().ms)} мс. Камера учтена.
            Выборочная проверка: между кадрами нарушения возможны. Аватары, обои и декор - исключения.
          </div>
          <Show when={r().issues.length} fallback={<div class="ok">Нарушений в проверенных кадрах нет</div>}>
            <For each={r().issues}>{i =>
              <button class={'issue ' + i.level} onClick={() => p.ctx.focus(i.t, i.id)}>
                <span class="mi">{i.kind === 'overlap' ? 'layers' : 'crop_free'}</span>
                <span class="grow">{i.msg}{i.kind === 'overlap' ? ' (потенциально)' : ''}</span>
                <span class="muted small">{i.t.toFixed(2)} с{i.frames > 1 ? ` · ${i.frames} кадров до ${i.last.toFixed(2)}` : ''}</span>
              </button>}
            </For>
          </Show>
        </>}
      </Show>

      <div class="group-h">Правила исходника · {diags().length}</div>
      <Show when={diags().length} fallback={<div class="ok">Замечаний нет</div>}>
        <For each={diags()}>{d =>
          <button class={'issue ' + d.level} onClick={() => { if (d.scene >= 0) p.ctx.pickScene(d.scene); if (d.t != null || d.path) p.ctx.focus(d.t ?? s.scenes()[d.scene]?.s ?? p.ctx.player.t(), d.path); }}>
            <span class="chip">{d.area}</span><span class="grow">{d.msg}</span><Show when={d.scene >= 0}><span class="muted small">сцена {d.scene + 1}</span></Show>
          </button>}
        </For>
      </Show>

      <div class="group-h">Ритм и детерминизм</div>
      <div class="row wrap">
        <button class="btn ghost" disabled={!!busy()} onClick={() => { const w = p.ctx.win(); setGaps(w?.p5gaps ? w.p5gaps(1) : null); }}>Паузы без движения (p5gaps)</button>
        <button class="btn ghost" disabled={!!busy()} onClick={determinism}>Seek = проигрывание в текущем кадре</button>
      </div>
      <Show when={gaps()}>{g => g().length
        ? <For each={g()}>{([a, b]) => <button class="issue warn" onClick={() => p.ctx.focus(a)}><span class="grow">{a}-{b} с: больше 1 с без изменений</span></button>}</For>
        : <div class="ok">Промежутков больше 1 с нет</div>}</Show>
      <Show when={det()}>{d => d().diff.length
        ? <div class="warnbox col"><b>{d().t.toFixed(2)} с: {d().diff.length} из {d().total} элементов отличаются</b><For each={d().diff.slice(0, 8)}>{x => <div class="small mono">{x}</div>}</For><div class="small">Вероятна анимация с накопленным состоянием, таймером или своим requestAnimationFrame.</div></div>
        : <div class="ok">{d().t.toFixed(2)} с: прямой seek совпал с последовательным проигрыванием ({d().total} элементов, inline-стили)</div>}</Show>

      <div class="group-h">Формулы</div>
      <button class="btn ghost" disabled={!!busy()} onClick={tex}><span class="mi">function</span>Сверстать формулы (tex2svg.mjs) в черновике</button>
    </div>
  );
}
