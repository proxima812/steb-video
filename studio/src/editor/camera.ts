// Ключи камеры data-camk="время цель масштаб [длительность] [кривая]; ...": разбор, запись, пресеты и проверки.
export type CamKey = { t: number; target: string; scale: number; dur: number | null; ease: string | null };
export const EASES = ['', 'cine', 'soft', 'glide', 'quint', 'expo'];
export const DEFAULT_DUR = 1.2;

const num = (x: number) => +x.toFixed(3);
export function parseCam(v: string | null): CamKey[] {
  return (v || '').split(';').map(k => k.trim()).filter(Boolean).map(k => {
    const [t, target = 'c', scale = '1', dur, ease] = k.split(/\s+/);
    return { t: +t, target, scale: +scale || 1, dur: dur != null ? +dur : null, ease: ease || null };
  });
}
const fmt = (x: number) => String(num(x)).replace(/^0\./, '.');
export function writeCam(keys: CamKey[]): string {
  return [...keys].sort((a, b) => a.t - b.t).map(k => {
    const parts = [String(num(k.t)), k.target || 'c', String(num(k.scale))];
    if (k.dur != null || k.ease) parts.push(fmt(k.dur ?? DEFAULT_DUR));
    if (k.ease) parts.push(k.ease);
    return parts.join(' ');
  }).join('; ');
}

/** длительности переходов движка (preset-dynamic.js) */
export const TR_DUR: Record<string, number> = { dots: .9, down: 1.2, up: 1.2, meme: 1.2, radial: 1, grow: 1, shrink: 1, dissolve: .9, defocus: 1.1, whip: .6 };

export type Preset = 'detail-result' | 'move' | 'pullback';
export const PRESETS: { id: Preset; title: string; needs: number }[] = [
  { id: 'detail-result', title: 'Общий - деталь - результат', needs: 2 },
  { id: 'move', title: 'Перевод между объектами', needs: 2 },
  { id: 'pullback', title: 'Отъезд', needs: 1 },
];
/** ключи пресета от времени start; targets - #id объектов */
export function preset(id: Preset, start: number, end: number, targets: string[], scale = 1.12): CamKey[] {
  const [a, b = a] = targets;
  const span = Math.max(1.5, end - start);
  if (id === 'pullback') return [{ t: start, target: a, scale, dur: .8, ease: null }, { t: start + Math.min(1.6, span * .5), target: 'c', scale: 1, dur: 1, ease: null }];
  if (id === 'move') return [{ t: start, target: a, scale, dur: .9, ease: null }, { t: start + Math.min(1.6, span * .45), target: b, scale, dur: 1.1, ease: null }];
  const step = Math.min(1.5, span / 3);
  return [
    { t: start, target: a, scale, dur: .9, ease: null },
    { t: start + step, target: b, scale, dur: 1, ease: null },
    { t: start + step * 2, target: 'c', scale: 1, dur: 1, ease: null },
  ];
}

export type CamIssue = { key: number; level: 'warn' | 'error'; msg: string };
/** sceneStart, trDur - начало сцены и длительность входного перехода; exists - есть ли цель; width - ширина цели в px */
export function checkCam(keys: CamKey[], o: { sceneStart: number; sceneEnd: number; trDur: number; exists: (tg: string) => boolean; width?: (tg: string) => number | null }): CamIssue[] {
  const out: CamIssue[] = [];
  keys.forEach((k, i) => {
    const d = k.dur ?? DEFAULT_DUR;
    if (!Number.isFinite(k.t)) out.push({ key: i, level: 'error', msg: 'время не число' });
    if (k.t < o.sceneStart || k.t >= o.sceneEnd) out.push({ key: i, level: 'error', msg: 'ключ вне сцены' });
    else if (o.trDur && k.t < o.sceneStart + o.trDur) out.push({ key: i, level: 'warn', msg: `старт во время перехода: движок отложит до ${(o.sceneStart + o.trDur).toFixed(2)}` });
    if (k.scale > 1 && (k.scale < 1.08 || k.scale > 1.2)) out.push({ key: i, level: 'warn', msg: 'наезд вне 1.08-1.2' });
    if (k.scale < 1) out.push({ key: i, level: 'warn', msg: 'масштаб меньше 1' });
    if (d < .5 || d > 1.4) out.push({ key: i, level: 'warn', msg: 'длительность вне 0.5-1.4 с' });
    if (k.t + d > o.sceneEnd + .01) out.push({ key: i, level: 'warn', msg: 'движение не успевает до конца сцены' });
    if (k.target !== 'c' && !/^[\d.]+,[\d.]+$/.test(k.target)) {
      if (!o.exists(k.target)) out.push({ key: i, level: 'error', msg: `нет цели ${k.target}` });
      else { const w = o.width?.(k.target); if (w && w > 800 && k.scale > 1) out.push({ key: i, level: 'warn', msg: `цель шире 800px (${Math.round(w)})` }); }
    }
  });
  return out;
}
