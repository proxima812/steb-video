// Кадр 1080x1920: два iframe (новый черновик грузится скрыто и показывается после готовности), рамки поверх кадра.
import { createEffect, createSignal, For, on, Show } from 'solid-js';
import type { PreviewWin } from '../../editor/bridge';
import type { Rect } from '../../editor/safety';
import { COMP_ZONE, TEXT_ZONE } from '../../editor/safety';

export const W = 1080, H = 1920;
export type Box = { rect: Rect; kind: 'hover' | 'sel' | 'issue' | 'warn' | 'ghost' | 'cam'; label?: string };

export default function Stage(p: {
  url: string | null; scale: number; select: boolean; safe: boolean; boxes: Box[];
  onReady: (win: PreviewWin) => void; onPick: (x: number, y: number) => void; onHover: (x: number, y: number) => void;
  onLeave: () => void; onToggle: () => void; onError: (msg: string) => void;
}) {
  const [src, setSrc] = createSignal<[string, string]>(['', '']);
  const [active, setActive] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const frames: (HTMLIFrameElement | undefined)[] = [];
  let want = '';

  createEffect(on(() => p.url, url => {
    if (!url) return;
    want = url;
    const slot = src()[active()] ? 1 - active() : active();
    setSrc(s => { const n = [...s] as [string, string]; n[slot] = url; return n; });
  }));

  async function loaded(i: number) {
    const url = src()[i], w = frames[i]?.contentWindow as PreviewWin | null;
    if (!w || !url) return;
    for (let k = 0; k < 100 && !w.render; k++) await new Promise(r => setTimeout(r, 50));
    if (!w.render) { p.onError('Превью не отдало render(t): проверьте ошибки скриптов v.html'); setLoading(false); return; }
    await (w.document as any)?.fonts?.ready;
    if (w.VIDEO_READY) await Promise.resolve(w.VIDEO_READY).catch(() => {});
    if (url !== want) return; // пришел более новый черновик
    p.onReady(w);
    setActive(i); setLoading(false);
  }

  const point = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [(e.clientX - r.left) / p.scale, (e.clientY - r.top) / p.scale] as const;
  };
  let hoverRaf = 0;

  return (
    <div class="stage-frame" style={{ width: `${W * p.scale}px`, height: `${H * p.scale}px` }}>
      <div class="stage" style={{ transform: `scale(${p.scale})` }}>
        <For each={[0, 1]}>{i =>
          <iframe ref={el => frames[i] = el} src={src()[i] || 'about:blank'} width={W} height={H}
            classList={{ hidden: active() !== i }} onLoad={() => loaded(i)} title="Демо ролика" />}
        </For>
        <Show when={p.safe}>
          <div class="zone text" style={{ left: `${TEXT_ZONE.x0}px`, top: `${TEXT_ZONE.y0}px`, width: `${TEXT_ZONE.x1 - TEXT_ZONE.x0}px`, height: `${TEXT_ZONE.y1 - TEXT_ZONE.y0}px` }}><span>текст</span></div>
          <div class="zone comp" style={{ left: `${COMP_ZONE.x0}px`, top: '0px', width: `${COMP_ZONE.x1 - COMP_ZONE.x0}px`, height: `${H}px` }}><span>компоненты</span></div>
        </Show>
        <For each={p.boxes}>{b =>
          <div class={'box-ov ' + b.kind} style={{ left: `${b.rect.x0}px`, top: `${b.rect.y0}px`, width: `${Math.max(2, b.rect.x1 - b.rect.x0)}px`, height: `${Math.max(2, b.rect.y1 - b.rect.y0)}px` }}>
            <Show when={b.label}><span>{b.label}</span></Show>
          </div>}
        </For>
      </div>
      <div class="stage-hit" classList={{ select: p.select }}
        onClick={e => { if (p.select) { const [x, y] = point(e); p.onPick(x, y); } else p.onToggle(); }}
        onMouseMove={e => { if (!p.select) return; const [x, y] = point(e); cancelAnimationFrame(hoverRaf); hoverRaf = requestAnimationFrame(() => p.onHover(x, y)); }}
        onMouseLeave={() => p.onLeave()} />
      <Show when={loading()}><div class="stage-loading">Загрузка сцены...</div></Show>
    </div>
  );
}
