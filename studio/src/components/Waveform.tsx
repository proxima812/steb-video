import { createEffect, createSignal, onCleanup, onMount } from 'solid-js';

// Волна звука: декодируется, только когда карточка видна на экране.
const cache = new Map<string, Promise<{ peaks: number[]; duration: number }>>();
let ctx: AudioContext | undefined;

function analyze(url: string, bars: number) {
  if (!cache.has(url)) cache.set(url, (async () => {
    ctx ??= new AudioContext();
    const buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const data = buf.getChannelData(0), step = Math.max(1, Math.floor(data.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 16) max = Math.max(max, Math.abs(data[j]));
      peaks.push(max);
    }
    const top = Math.max(...peaks, 1e-6);
    return { peaks: peaks.map(p => p / top), duration: buf.duration };
  })());
  return cache.get(url)!;
}

export default function Waveform(p: { url: string; progress?: number; onDuration?: (d: number) => void; onSeek?: (k: number) => void }) {
  let canvas!: HTMLCanvasElement;
  const [peaks, setPeaks] = createSignal<number[] | null>(null);

  const draw = () => {
    const pk = peaks(); p.progress; if (!pk || !canvas) return;
    const dpr = devicePixelRatio, w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const g = canvas.getContext('2d')!; g.scale(dpr, dpr);
    const bw = w / pk.length, prog = p.progress ?? 0;
    pk.forEach((v, i) => {
      const bh = Math.max(1.5, v * h * 0.9);
      g.fillStyle = i / pk.length < prog ? '#f2f2f2' : '#5c5c5c';
      g.fillRect(i * bw + bw * 0.2, (h - bh) / 2, Math.max(1, bw * 0.6), bh);
    });
  };

  onMount(() => {
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      try {
        const r = await analyze(p.url, 90);
        setPeaks(r.peaks); p.onDuration?.(r.duration);
      } catch { /* не декодируется - оставляем пустую линию */ }
    });
    io.observe(canvas);
    onCleanup(() => io.disconnect());
  });

  // перерисовка при изменении прогресса
  createEffect(() => { p.progress; draw(); });
  return (
    <canvas
      class="wave" ref={canvas}
      onClick={e => { const r = canvas.getBoundingClientRect(); p.onSeek?.((e.clientX - r.left) / r.width); }}
    />
  );
}
