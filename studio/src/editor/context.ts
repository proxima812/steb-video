// Общий контекст панелей редактора ролика.
import type { Assets, Palettes, VideoDetail } from '../api';
import type { PreviewWin } from './bridge';
import type { Player } from './player';
import type { DraftStore } from './store';
import type { Word } from './timing';

export type EditorCtx = {
  id: string;
  store: DraftStore;
  player: Player;
  detail: () => VideoDetail | undefined;
  palettes: () => Palettes | undefined;
  assets: () => Assets | undefined;
  words: () => Word[];
  win: () => PreviewWin | null;
  /** текущая сцена для панелей: выбранная в раскадровке */
  scene: () => number;
  pickScene: (i: number) => void;
  /** следующий клик по превью вернет объект в cb вместо выбора */
  requestPick: (label: string, cb: (path: string) => void) => void;
  /** перейти к времени и выбрать объект */
  focus: (t: number, path?: string | null) => void;
  /** дополнительные рамки поверх кадра (предпросмотр исправления) */
  setGhost: (r: { x0: number; y0: number; x1: number; y1: number } | null) => void;
};
