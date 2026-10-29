/** Absolute seconds on the video timeline; all references are simple HTML ids. */
export type Composition = 'hero'|'editorial'|'product'|'diagram'|'data'|'code'|'interface'|'comparison'|'cinematic'|'spatial'|'process'|'metaphor';
export type Motion = {target:string; purpose:string; startsAt:number; duration:number; wordIndex?:number} &
  ({pattern:'reveal'|'masked-reveal'|'draw'|'exit'} | {pattern:'number'|'width'; from:number; to:number});
export interface SceneDirection {
  id:string; start:number; end:number; concept:string; visualMetaphor:string; composition:Composition; focalPoint:string;
  motion:Motion[];
  camera:{target:string; purpose:string; shot:'wide'|'medium'|'closeup'|'detail'; startsAt:number; duration:number; scale:number}[];
  cameraFit?:'legacy'|'safe'; camdim?:number;
  transition:{type:'cut'|'down'|'up'|'dots'|'radial'|'grow'|'shrink'|'meme'|'dissolve'|'defocus'|'whip'; reason:string};
}
export interface DirectionDocument {version:1; timing:'demo'|'narration'; scenes:SceneDirection[]}
export interface Finding {code:string; path:string; message:string}
export interface DirectionReport {ok:boolean; errors:Finding[]; warnings:Finding[]}
declare global {
  const P5Direction: {
    validate(doc:unknown,options?:{words?:[string,number,number][]}):DirectionReport;
    apply(doc:DirectionDocument,root?:Document):DirectionDocument;
    verify(doc:DirectionDocument,root?:Document):DirectionReport;
    compositions:readonly Composition[]; patterns:readonly Motion['pattern'][];
  };
}
