// Пресет default: сводит голос + звуки (+ музыка с ducking) в один wav для render.mjs. Как audio/p4-audio.mjs, но подсказки из window.p5cues().
// PAGE=../video/N-slug/v.html VOICE=../video/N/voice.mp3 [SFX=../video/N/sfx] [MUSIC=..mp3 MUSIC_VOL=0.22] DUR=сек OUT=mix.wav node audio/p5-audio.mjs
// Звуки ищутся: $SFX, затем ../sfx (общая папка в корне, имена через ALIAS), затем engine/sfx-p4. NOSFX=1 - без эффектов.
import puppeteer from 'puppeteer-core';
import {spawnSync} from 'child_process';
import fs from 'fs';
// псевдоним -> [файл в ../sfx, сдвиг до пика звука в секундах (чтобы пик совпал с событием)]
const ALIAS={
  // мягкие звуки пресета (ElevenLabs Sound Effects, engine/audio/sfx-gen.py), пики выровнены на -6 dBFS
  whoosh:['p5-whoosh',.22],pop:['p5-pop',0],tick:['p5-tick',0],chime:['p5-chime',0],thud:['p5-thud',0],
  type:['p5-type',.05],error:['p5-error',0],swish:['p5-swish',.14],
  // старые громкие звуки из sfx/ - только явно через data-sfx
  boom:['DSGNBoom-Accent_Hit_Deep_cine-Elevenlabs',.05],boomswoosh:['DSGNBoom-boom_swoosh_cinemati-Elevenlabs',.25],
  bass:['DSGNBass-Deep_bass_“doom”_or_-Elevenlabs',1.48],tension:['DSGNImpt-A_cinematic_tension_-Elevenlabs',1.3],
  click:['UIClick-Style_Clean,_tech-in-Elevenlabs',0],tap:['UIClick-Generate_a_single,_h-Elevenlabs',.02],
};
const E=process.env;
let cues;
if(E.CUES)cues=JSON.parse(fs.readFileSync(E.CUES,'utf8'));
else {
  const b=await puppeteer.launch({executablePath:E.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--allow-file-access-from-files']});
  try {const p=await b.newPage();await p.goto('file://'+process.cwd()+'/'+E.PAGE,{waitUntil:'networkidle0'});cues=await p.evaluate(()=>window.p5cues());}
  finally {await b.close();}
}
const find=n=>{for(const d of [E.SFX].filter(Boolean))if(fs.existsSync(`${d}/${n}.mp3`))return [`${d}/${n}.mp3`,0];
  if(ALIAS[n])return [`../sfx/${ALIAS[n][0]}.mp3`,ALIAS[n][1]];
  if(fs.existsSync(`sfx-p4/${n}.mp3`))return [`sfx-p4/${n}.mp3`,0]};
const ok=E.NOSFX?[]:cues.filter(([t,n])=>{const f=find(n);if(!f)console.log('нет звука:',n);return f});
const args=['-y','-i',E.VOICE];ok.forEach(([,n])=>args.push('-i',find(n)[0]));
let fc='',lab='';
ok.forEach(([t,n,v,dur],i)=>{const lead=find(n)[1],ms=Math.round((t-lead)*1000),cut=ms<0?`atrim=start=${-ms/1000},asetpts=PTS-STARTPTS,`:'';
  // 4-е поле подсказки - длительность: звук обрезается и затухает за 0.3 с
  const len=dur>0?`atrim=0:${dur},afade=t=out:st=${Math.max(0,dur-.3)}:d=${Math.min(.3,dur)},`:'';
  fc+=`[${i+1}:a]aformat=sample_rates=44100:channel_layouts=stereo,${cut}${len}volume=${v},adelay=${Math.max(0,ms)}|${Math.max(0,ms)}[s${i}];`;lab+=`[s${i}]`});
fc+=ok.length?`${lab}amix=inputs=${ok.length}:duration=longest:normalize=0,volume=${E.FX_VOL||0.45}[fx];`:`anullsrc=r=44100:cl=stereo,atrim=0:1[fx];`;
fc+=`[0:a]aformat=sample_rates=44100:channel_layouts=stereo,apad[v];`;
if(E.MUSIC){args.push('-stream_loop','-1','-i',E.MUSIC);const m=ok.length+1;
  fc+=`[v]asplit[v1][v2];[${m}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${E.MUSIC_VOL||0.22},afade=t=in:d=1,afade=t=out:st=${E.DUR-2}:d=2[m];[m][v2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[d];[v1][fx][d]amix=inputs=3:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`;}
else fc+=`[v][fx]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`;
args.push('-filter_complex',fc,'-map','[a]','-ar','44100','-t',String(E.DUR),E.OUT||'mix.wav');
const r=spawnSync('ffmpeg',args,{stdio:['ignore','ignore','pipe']});
if(r.error)throw r.error;
if(r.status){console.log(r.stderr.toString().slice(-1500));process.exit(1)}
console.log(ok.map(([t,n,v])=>`${t.toFixed(2)} ${n} ${v}`).join('\n'));
