// Тайминги: слова из words.json, переходы сцен (как их выбирает движок), повторы.
import type { SceneInfo } from './source';
import { TR_DUR } from './camera';

export type Word = [string, number, number];

export type TransitionDef = { id: string; title: string; dur: number; bg: 'same' | 'change' | 'any'; note: string; isNew?: boolean };
export const TRANSITIONS: TransitionDef[] = [
  { id: 'down', title: 'Вниз по полотну', dur: 1.2, bg: 'same', note: 'Камера едет вниз, новая сцена снизу' },
  { id: 'up', title: 'Вверх по полотну', dur: 1.2, bg: 'same', note: 'Камера едет вверх' },
  { id: 'dots', title: 'Частицы', dur: .9, bg: 'change', note: 'Основной переход при смене фона' },
  { id: 'radial', title: 'Круг', dur: 1, bg: 'change', note: 'Круг из точки data-wipe="x,y"' },
  { id: 'grow', title: 'Карточка растет', dur: 1, bg: 'change', note: 'Новая сцена вырастает из центра' },
  { id: 'shrink', title: 'Карточка уменьшается', dur: 1, bg: 'change', note: 'Старая сцена уходит карточкой' },
  { id: 'meme', title: 'Зум в мем', dur: 1.2, bg: 'any', note: 'Только после сцены с мем-картинкой, data-wipe="#id"' },
  { id: 'dissolve', title: 'Растворение', dur: .9, bg: 'same', note: 'Новая сцена проявляется поверх старой. При разных фонах смешивает цвета', isNew: true },
  { id: 'defocus', title: 'Расфокусировка', dur: 1.1, bg: 'any', note: 'Старая уходит в размытие, новая проявляется из размытия', isNew: true },
];
export const TR_IDS = TRANSITIONS.map(x => x.id);

/** переход, который реально выберет движок p5w (preset-dynamic.js) */
export function resolveTr(scenes: SceneInfo[], i: number): string {
  if (!i) return '';
  const x = scenes[i], p = scenes[i - 1];
  if (x.tr === 'cut') return 'cut';
  if (TR_IDS.includes(x.tr)) return x.tr;
  const sameBg = (x.bg || 'black') === (p.bg || 'black') && x.classes.includes('wall') === p.classes.includes('wall');
  return sameBg ? 'down' : 'dots';
}
export const trDur = (tr: string) => TR_DUR[tr] ?? .9;

export type TimingIssue = { scene: number; level: 'warn' | 'error'; msg: string };
export function checkScenes(scenes: SceneInfo[], hasImg: (scene: number, sel: string) => boolean): TimingIssue[] {
  const out: TimingIssue[] = [];
  let run = 0, bgRun = 1;
  scenes.forEach((x, i) => {
    if (!(x.e > x.s)) out.push({ scene: i, level: 'error', msg: 'конец сцены не позже начала' });
    if (i && Math.abs(scenes[i - 1].e - x.s) > .01) out.push({ scene: i, level: 'warn', msg: `разрыв или наложение со сценой ${i}: ${scenes[i - 1].e} / ${x.s}` });
    if (!i) return;
    const tr = resolveTr(scenes, i), prev = resolveTr(scenes, i - 1);
    run = tr === prev ? run + 1 : 1;
    if (run > 2) out.push({ scene: i, level: 'warn', msg: `переход ${tr} ${run} раза подряд` });
    if (x.tr && !TR_IDS.includes(x.tr) && x.tr !== 'cut') out.push({ scene: i, level: 'warn', msg: `переход «${x.tr}» движок заменит на ${tr}` });
    const p = scenes[i - 1];
    if (tr === 'meme') {
      const w = x.wipe;
      if (!w || !w.startsWith('#') || !hasImg(i - 1, w)) out.push({ scene: i, level: 'warn', msg: 'meme: нужна картинка предыдущей сцены в data-wipe="#id"' });
    }
    if (tr === 'dissolve' && p.bg !== x.bg) out.push({ scene: i, level: 'warn', msg: 'dissolve между разными фонами смешивает цвета' });
    if ((tr === 'down' || tr === 'up') && p.bg !== x.bg) out.push({ scene: i, level: 'warn', msg: `${tr} при смене фона: лучше dots` });
    bgRun = p.bg === x.bg && !x.outro ? bgRun + 1 : 1;
    if (bgRun > 3) out.push({ scene: i, level: 'warn', msg: `${bgRun} сцены подряд на фоне ${x.bg}` });
    if (x.pal && x.pal === p.pal && !x.outro) out.push({ scene: i, level: 'warn', msg: `палитра ${x.pal} как в соседней сцене` });
  });
  const last = scenes[scenes.length - 1];
  if (scenes.length && !last.outro) out.push({ scene: scenes.length - 1, level: 'warn', msg: 'последняя сцена не концовка (.outro)' });
  return out;
}

/** слово, ближайшее к t (по началу) */
export function nearestWord(words: Word[], t: number): number {
  let best = -1, d = Infinity;
  words.forEach((w, i) => { const x = Math.abs(w[1] - t); if (x < d) { d = x; best = i; } });
  return best;
}
export const wordsIn = (words: Word[], a: number, b: number) => words.map((w, i) => ({ w, i })).filter(({ w }) => w[1] >= a - .01 && w[1] < b);
export const round2 = (x: number) => Math.round(x * 100) / 100;
