// Таймлайн: сцены черновика, слова words.json, ключи камеры, вход/уход выбранного объекта, цикл.
import { createMemo, For, Show } from 'solid-js';
import { DEFAULT_DUR, parseCam } from '../../editor/camera';
import type { EditorCtx } from '../../editor/context';
import { attr } from '../../editor/source';

export default function Timeline(p: { ctx: EditorCtx; dur: number; pal: (n: string) => { fg: string; bg: string } | undefined }) {
  let tl!: HTMLDivElement;
  const s = p.ctx.store, pl = p.ctx.player;
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / p.dur) * 100))}%`;
  const seek = (e: PointerEvent) => { const r = tl.getBoundingClientRect(); pl.seek(((e.clientX - r.left) / r.width) * p.dur); };
  const cams = createMemo(() => s.doc().sections.flatMap((n, i) => parseCam(attr(n, 'data-camk')).map(k => ({ ...k, scene: i }))));
  const marks = createMemo(() => {
    const n = s.selected(); if (!n || n.tag === 'section') return [];
    const out: { t: number; kind: string }[] = [];
    const tin = attr(n, 'data-in'); if (tin != null) out.push({ t: +tin, kind: 'in' });
    const ex = attr(n, 'data-exit'); if (ex) out.push({ t: +ex.split(',')[0], kind: 'out' });
    for (const t of (attr(n, 'data-lines') || '').split(',').filter(Boolean)) out.push({ t: +t, kind: 'word' });
    return out.filter(m => Number.isFinite(m.t));
  });
  return (
    <div class="tl" ref={tl}
      onPointerDown={e => { if ((e.target as HTMLElement).closest('.tl-mark')) return; tl.setPointerCapture(e.pointerId); seek(e); }}
      onPointerMove={e => { if (e.buttons && tl.hasPointerCapture(e.pointerId)) seek(e); }}>
      <For each={s.scenes()}>{x =>
        <div class="seg-s" classList={{ black: x.bg === 'black', sel: p.ctx.scene() === x.index }}
          style={{ left: pct(x.s), width: `${((x.e - x.s) / p.dur) * 100}%`, 'border-top-color': p.pal(x.pal)?.fg || '#444' }}
          title={`Сцена ${x.index + 1}${x.tr ? ' · ' + x.tr : ''}`} />}
      </For>
      <Show when={pl.loop()}>{l => <div class="tl-loop" style={{ left: pct(l()[0]), width: `${((l()[1] - l()[0]) / p.dur) * 100}%` }} />}</Show>
      <For each={p.ctx.words()}>{w => <div class="tick" style={{ left: pct(w[1]) }} />}</For>
      <For each={cams()}>{k =>
        <button class="tl-mark cam" style={{ left: pct(k.t), width: `${((k.dur ?? DEFAULT_DUR) / p.dur) * 100}%` }}
          title={`Камера ${k.t} ${k.target} x${k.scale}`} onClick={() => { p.ctx.pickScene(k.scene); pl.seek(k.t + (k.dur ?? DEFAULT_DUR)); }} />}
      </For>
      <For each={marks()}>{m => <button class={'tl-mark ' + m.kind} style={{ left: pct(m.t) }} title={m.kind === 'in' ? 'вход' : m.kind === 'out' ? 'уход' : 'слово строки'} onClick={() => pl.seek(m.t)} />}</For>
      <div class="head" style={{ left: pct(pl.t()) }} />
    </div>
  );
}
