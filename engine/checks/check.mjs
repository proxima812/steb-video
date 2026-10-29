import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openPage, probe, readJSON, writeJSON} from '../pipeline/video-tools.mjs';

export async function checkVideo(file, options = {}) {
  const {browser, page, errors, dependencies, remote} = await openPage(file);
  try {
    const report = await page.evaluate(({duration, from = 0, to, step = .2}) => {
      if (typeof window.render !== 'function') throw new Error('Page must expose window.render(t)');
      const errors = [], warnings = [], seen = new Set();
      const add = (code, details) => {
        const key = `${code}:${details.element || details.message}`;
        if (!seen.has(key)) { seen.add(key); errors.push({code, ...details}); }
      };
      const sections = [...document.querySelectorAll('section[data-s][data-e]')];
      const scenes = sections.map((s, i) => ({index: i, start: Number(s.dataset.s), end: Number(s.dataset.e),
        title: s.dataset.t || '', outro: s.classList.contains('outro'),
        punches: (s.dataset.punch || '').split(',').filter(Boolean).map(p => Number(p.split(':')[0]))}));
      if (!scenes.length) add('scenes', {message: 'No timed sections found'});
      const end = to ?? duration ?? Math.max(...scenes.map(s => s.end));
      if (!Number.isFinite(end) || end <= from || !Number.isFinite(step) || step <= 0) throw new Error('Invalid check interval');
      const times = new Set([from, Math.max(from, end - 1 / 30)]);
      for (let t = from; t < end; t += step) times.add(+t.toFixed(6));
      let covered = from;
      for (const scene of [...scenes].sort((a, b) => a.start - b.start)) {
        if (!Number.isFinite(scene.start) || !Number.isFinite(scene.end) || scene.end <= scene.start) {
          add('scene-timing', {message: `Invalid scene ${scene.index}`, ...scene}); continue;
        }
        if (scene.end <= from || scene.start >= end) continue;
        if (scene.start - covered > 1 / 30 + .001) add('scene-gap', {message: `Gap ${covered.toFixed(3)}..${scene.start.toFixed(3)}`});
        covered = Math.max(covered, scene.end);
        for (const t of [scene.start - 1 / 30, scene.start, scene.start + 1 / 30, scene.start + .3, scene.end - 1 / 30]) {
          if (t >= from && t < end) times.add(t);
        }
      }
      if (end - covered > 1 / 30 + .001) add('scene-gap', {message: `Uncovered ending ${covered.toFixed(3)}..${end.toFixed(3)}`});
      for (const [i, el] of [...document.querySelectorAll('[data-wd-times]')].entries()) {
        const ts = el.dataset.wdTimes.split(',').map(Number), scene = el.closest('section');
        if (!ts.length || ts.some((t, j) => !Number.isFinite(t) || t < 0 || (j && t < ts[j - 1]) ||
          (scene && (t < Number(scene.dataset.s) - .1 || t >= Number(scene.dataset.e))))) {
          add('word-timing', {element: `words-${i}`, text: el.textContent.trim(), message: 'Invalid or unordered word timestamps'});
        }
        const words = el.querySelectorAll('.w8i').length;
        if (words && words !== ts.length) add('word-count', {element: `words-${i}`, message: `${words} displayed words, ${ts.length} timestamps`});
      }
      const style = getComputedStyle(document.documentElement), x = parseFloat(style.getPropertyValue('--sz-x')),
        top = parseFloat(style.getPropertyValue('--sz-t')), bottom = 1920 - parseFloat(style.getPropertyValue('--sz-b'));
      const textSelector = '.title,.head,.h,.h2,.h3,.num,.p,.sub,.caption,.aside,.outro-me,.outro-sub';
      const selector = '[data-safe],.card,.panel,.plane,.code,.code5,.pic,.meme,' + textSelector;
      const candidates = sections.map(s => {
        const found = [...s.querySelectorAll(selector)].filter(el => el.dataset.safe !== 'ignore' && !el.closest('[data-safe="ignore"]'));
        if (!found.length && s.textContent.trim() && Number(s.dataset.s) < end && Number(s.dataset.e) > from) warnings.push({code: 'coverage', message: `Scene ${sections.indexOf(s)}: add data-safe to content containers`});
        return found.filter(el => !found.some(parent => parent !== el && parent.contains(el)));
      });
      const visible = el => {
        let opacity = 1;
        for (let node = el; node instanceof Element; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          opacity *= Number(style.opacity);
          const f = /opacity\(([\d.]+)\)/.exec(style.filter); if (f) opacity *= Number(f[1]);   // приглушение фокус-наезда (p5w)
        }
        return opacity >= .35;
      };
      const boxes = el => {
        if (!el.matches(textSelector) || el.hasAttribute('data-safe')) return [el.getBoundingClientRect()];
        const rects = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const text = walker.currentNode;
          if (!text.textContent.trim() || !visible(text.parentElement)) continue;
          const range = document.createRange(); range.selectNodeContents(text);
          rects.push(...range.getClientRects());
        }
        for (const icon of el.querySelectorAll('.mi,img,svg')) if (visible(icon)) rects.push(icon.getBoundingClientRect());
        return rects;
      };
      let samples = 0, checkedElements = 0;
      for (const t of [...times].sort((a, b) => a - b)) {
        window.render(t); samples++;
        sections.forEach((s, i) => {
          if (t < scenes[i].start || t >= scenes[i].end) return;
          // мир p5w: в начале сцены идет переход (длительность - window.P5TR из runtime/preset-dynamic.js), сцена намеренно в движении за кадром
          if (document.body.classList.contains('p5w') && (i && t < scenes[i].start + (window.P5TR?.of(i) ?? .9) || window.p5camMoving?.(t))) return;
          candidates[i].forEach((el, j) => {
            if (!visible(el)) return;
            for (const r of boxes(el)) {
              if (r.width === 0 || r.height === 0) continue;
              checkedElements++;
              // Границы из CSS; текст ограничен по всем сторонам, графика - по бокам.
              const isText = el.matches(textSelector) && !el.hasAttribute('data-safe');
              if (r.left < x - 1 || r.right > 1080 - x + 1 || isText && (r.top < top - 1 || r.bottom > bottom + 1)) {
                add('safe-zone', {time: +t.toFixed(3), element: `${i}:${j}`, text: el.textContent.trim().slice(0, 100),
                  box: [r.left, r.top, r.right, r.bottom].map(x => +x.toFixed(1))});
              }
            }
          });
        });
      }
      if (typeof window.p5gaps === 'function') {
        for (const gap of window.p5gaps(1)) {
          if (gap[1] <= from || gap[0] >= end || scenes.some(s => s.outro && gap[0] >= s.start)) continue;
          warnings.push({code: 'rhythm-gap', interval: gap});
        }
      }
      const cues = typeof window.p5cues === 'function' ? window.p5cues() :
        typeof window.p4cues === 'function' ? window.p4cues() : [];
      return {errors, warnings, scenes, cues, samples, checkedElements, interval: [from, end],
        preset: typeof window.p5cues === 'function' ? 'p5' : typeof window.p4cues === 'function' ? 'p4' : 'base'};
    }, options);
    const direction = await page.evaluate(() => {
      const source=document.getElementById('scene-direction');
      if(!source)return null;
      const doc=JSON.parse(source.textContent);
      if(!window.P5Direction) return {doc,errors:[{code:'direction-runtime',message:'Scene IR requires P5Direction'}],warnings:[]};
      return {doc,...P5Direction.verify(doc)};
    });
    if(direction){
      report.direction={version:direction.doc.version,timing:direction.doc.timing};
      report.errors.push(...direction.errors); report.warnings.push(...direction.warnings);
      if(direction.doc.timing==='narration'){
        if(!options.words) report.errors.push({code:'direction-words',message:'Narrated Scene IR requires words.json'});
        else {const words=await readJSON(options.words,null);const checked=await page.evaluate(({doc,words})=>P5Direction.validate(doc,{words}),{doc:direction.doc,words});
          report.errors.push(...checked.errors.filter(e=>e.code==='word-sync'));}
      }
    }
    report.errors.push(...errors);
    report.browserVersion = await browser.version();
    report.dependencies = [...dependencies].sort();
    report.remote = remote.sort(([a], [b]) => a.localeCompare(b));
    if (options.words) {
      const words = await readJSON(options.words, null);
      let previous = -Infinity;
      if (!Array.isArray(words)) report.errors.push({code: 'words-file', message: 'words.json must be an array'});
      else for (const word of words) {
        if (!Array.isArray(word) || typeof word[0] !== 'string' || !Number.isFinite(word[1]) || !Number.isFinite(word[2]) ||
          word[1] < previous || word[1] < 0 || word[2] < word[1] || (options.duration && word[2] > options.duration + .1)) {
          report.errors.push({code: 'words-file', message: `Invalid word: ${JSON.stringify(word)}`}); break;
        }
        previous = word[1];
      }
    } else report.warnings.push({code: 'words-file', message: 'words.json not supplied; voice/text alignment was not checked'});
    report.ok = report.errors.length === 0;
    return report;
  } finally { await browser.close(); }
}

export async function checkMedia(file, {fps = 30, width = 1080, height = 1920, duration, audio = true} = {}) {
  const media = await probe(file), errors = [];
  const video = media.streams.find(s => s.codec_type === 'video'), sound = media.streams.find(s => s.codec_type === 'audio');
  if (!video || video.codec_name !== 'h264' || video.width !== width || video.height !== height ||
    video.r_frame_rate !== `${fps}/1` || !['yuv420p', 'yuvj420p'].includes(video.pix_fmt)) errors.push({code: 'video-format', message: 'Unexpected video format'});
  if (audio && sound?.codec_name !== 'aac') errors.push({code: 'audio-format', message: 'AAC audio stream missing'});
  if (duration && (Math.abs(Number(media.format.duration) - duration) > Math.max(.1, 1 / fps) ||
    Math.abs(Number(video?.nb_frames) - Math.round(duration * fps)) > 1)) errors.push({code: 'duration', message: 'Unexpected duration or frame count'});
  return {ok: !errors.length, errors, media};
}

// Standalone use remains compatible with PAGE/DUR environment variables.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const file = process.argv[2] || process.env.PAGE;
    if (!file) throw new Error('Usage: PAGE=../video/88-t3-orchestration/v.html DUR=60 node checks/check.mjs [page.html]');
    const report = await checkVideo(path.resolve(file), {duration: process.env.DUR ? +process.env.DUR : undefined,
      words: process.env.WORDS});
    if (process.env.MEDIA) report.media = await checkMedia(process.env.MEDIA, {duration: +process.env.DUR || undefined});
    if (process.env.OUT) await writeJSON(process.env.OUT, report);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok || report.media?.ok === false) process.exitCode = 1;
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
