// Проигрывание демо: время кадра, скорость, цикл диапазона, синхронизация голоса и музыки.
// Кадр всегда рисуется через render(t) превью - то же, что делает рендер.
import { createSignal } from 'solid-js';

export const FPS = 30;
export const SPEEDS = [0.25, 0.5, 1];

export function createPlayer(o: { dur: () => number; draw: (t: number) => void; enabled: () => boolean }) {
  const [t, setT] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [speed, setSpeedSig] = createSignal(1);
  const [loop, setLoop] = createSignal<[number, number] | null>(null);
  const voice = new Audio(), music = new Audio();
  music.volume = 0.18;
  let raf = 0, startPerf = 0, startT = 0;

  const setSources = (v: string | null, m: string | null) => {
    if (v) voice.src = v; else voice.removeAttribute('src');
    if (m) music.src = m; else music.removeAttribute('src');
  };
  const rate = () => { for (const a of [voice, music]) { a.playbackRate = speed(); (a as any).preservesPitch = true; } };
  const syncAudio = (x: number, force = false) => {
    for (const a of [voice, music]) {
      if (!a.src || !isFinite(a.duration) && !force) continue;
      if (a.duration && x >= a.duration) { a.pause(); continue; }
      if (a.paused) { a.currentTime = x; a.play().catch(() => {}); }
      else if (force || Math.abs(a.currentTime - x) > 0.2) a.currentTime = x;
    }
  };
  const stopAudio = () => { voice.pause(); music.pause(); };

  const tick = () => {
    let x = startT + (performance.now() - startPerf) / 1000 * speed();
    const l = loop();
    if (l && x >= l[1]) { x = l[0]; startT = x; startPerf = performance.now(); syncAudio(x, true); }
    else if (x >= o.dur()) { x = o.dur(); pause(); }
    setT(x); o.draw(x); syncAudio(x);
    if (playing()) raf = requestAnimationFrame(tick);
  };
  function play() {
    if (!o.enabled()) return;
    const l = loop();
    startT = l && (t() < l[0] || t() >= l[1]) ? l[0] : t() >= o.dur() - 0.05 ? 0 : t();
    startPerf = performance.now(); rate();
    setPlaying(true); syncAudio(startT, true);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function pause() { setPlaying(false); cancelAnimationFrame(raf); stopAudio(); }
  function seek(x: number) {
    x = Math.max(0, Math.min(o.dur(), x));
    setT(x); o.draw(x);
    if (playing()) { startT = x; startPerf = performance.now(); syncAudio(x, true); }
  }
  /** шаг на n кадров, время округляется к сетке кадров */
  const step = (n: number) => { pause(); seek(Math.round(t() * FPS + n) / FPS); };
  const setSpeed = (s: number) => { const p = playing(); if (p) pause(); setSpeedSig(s); rate(); if (p) play(); };
  const toggle = () => playing() ? pause() : play();
  const dispose = () => { pause(); voice.removeAttribute('src'); music.removeAttribute('src'); };
  return { t, setT, playing, setPlaying, speed, setSpeed, loop, setLoop, play, pause, seek, step, toggle, setSources, dispose };
}
export type Player = ReturnType<typeof createPlayer>;
