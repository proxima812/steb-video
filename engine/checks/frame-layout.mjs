// Анализ планировки кадра: для каждой сцены в момент полного заполнения (85% длительности) меряет,
// какую часть safe zone занимает контент, где центр тяжести, какой самый крупный объект и сколько пустоты.
// Запуск из корня: PAGE=video/88-t3-orchestration/v.html node engine/checks/frame-layout.mjs   (печатает таблицу, JSON - в OUT, если задан)
import fs from 'node:fs/promises';
import path from 'node:path';
import {cameraSamples,contrast,inspectSurfaces} from './visual-metrics.mjs';
import {openPage} from '../pipeline/video-tools.mjs';

const E = process.env, {browser, page} = await openPage(path.resolve(E.PAGE || 'examples/index.html'));
try {
  const scenes = await page.evaluate(() => [...document.querySelectorAll('section')].map(s => [+s.dataset.s, +s.dataset.e]));
  const zone = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement), x = parseFloat(css.getPropertyValue('--sz-x'));
    return {x0:x, x1:1080-x, y0:parseFloat(css.getPropertyValue('--sz-t')), y1:1920-parseFloat(css.getPropertyValue('--sz-b'))};
  });
  const rows = [];
  for (const [i, [a, b]] of scenes.entries()) {
    const t = a + (b - a) * .85;
    rows.push(await page.evaluate((t, i, Z) => {
      window.render(t);
      const s = document.querySelectorAll('section')[i];
      s.style.transform = 'none';   // планировка без камеры; кадрирование камерой проверяется ниже
      const vis = el => { for (let n = el; n instanceof Element; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < .1) return false; } return true; };
      const boxes = [];
      const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) { const n = walker.currentNode; if (!n.textContent.trim() || !vis(n.parentElement) || n.parentElement.closest('[data-safe="ignore"]')) continue;   // слои связей и курсор (data-safe="ignore") не контент
        const r = document.createRange(); r.selectNodeContents(n); for (const q of r.getClientRects()) boxes.push({r: q, k: 'text', fs: parseFloat(getComputedStyle(n.parentElement).fontSize)}); }
      for (const el of s.querySelectorAll('img,canvas,svg,.box,.card,.code5,.srch,.tbl,.chip,.win,.tile,.toast,.field,.seg,.btn,.kpi,.list')) if (vis(el) && !el.closest('[data-safe="ignore"]')) boxes.push({r: el.getBoundingClientRect(), k: el.tagName.toLowerCase()});
      const B = boxes.filter(b => b.r.width > 2 && b.r.height > 2);
      if (!B.length) return {i, t, empty: true};
      const u = B.reduce((m, b) => ({x0: Math.min(m.x0, b.r.left), y0: Math.min(m.y0, b.r.top), x1: Math.max(m.x1, b.r.right), y1: Math.max(m.y1, b.r.bottom)}), {x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9});
      // центр тяжести по площади, заполненность по сетке 20x20 safe zone
      let cx = 0, cy = 0, A = 0; const grid = new Set();
      for (const b of B) { const ar = b.r.width * b.r.height; cx += (b.r.left + b.r.width / 2) * ar; cy += (b.r.top + b.r.height / 2) * ar; A += ar;
        for (let gx = 0; gx < 20; gx++) for (let gy = 0; gy < 20; gy++) { const x = Z.x0 + (gx + .5) * (Z.x1-Z.x0)/20, y = Z.y0 + (gy + .5) * (Z.y1-Z.y0)/20;
          if (x >= b.r.left && x <= b.r.right && y >= b.r.top && y <= b.r.bottom) grid.add(gx + ',' + gy); } }
      const big = B.reduce((m, b) => b.r.width * b.r.height > m.r.width * m.r.height ? b : m);
      const maxFont = Math.max(0, ...B.filter(b => b.k === 'text').map(b => b.fs));
      return {i, t: +t.toFixed(2), theme: s.className.replace('s ', ''), top: Math.round(u.y0), bottom: Math.round(u.y1), emptyBottom: Math.round(Z.y1 - u.y1),
        fill: Math.round(grid.size / 4), cx: Math.round(cx / A), cy: Math.round(cy / A), focal: big.k + ' ' + Math.round(big.r.width) + 'x' + Math.round(big.r.height), maxFont, items: B.length};
    }, t, i, zone));
  }
  console.log('# | t | тема | верх-низ | пусто снизу | заполнено % | центр тяжести | главный объект | макс. шрифт');
  for (const r of rows) console.log(r.empty ? `${r.i} пусто` : `${r.i} | ${r.t} | ${r.theme} | ${r.top}-${r.bottom} | ${r.emptyBottom} | ${r.fill} | ${r.cx},${r.cy} | ${r.focal} | ${r.maxFont}`);
  // камера: в конце каждого наезда цель (элемент data-camk) должна остаться внутри safe zone
  const cams = await page.evaluate(Z => {
    const out = [];
    for (const s of document.querySelectorAll('section[data-camk]')) for (const k of s.dataset.camk.split(';').map(x => x.trim()).filter(Boolean)) {
      const [t, tg, sc, d] = k.split(/\s+/); if (!tg.startsWith('#') || +sc <= 1) continue;
      const T = Math.min(+t + +(d || 1.2), +s.dataset.e - .05); window.render(T);
      const el = s.querySelector(tg); if (!el) { out.push({t: +t, tg, err: 'нет цели'}); continue; }
      const r = el.getBoundingClientRect(), ok = r.left >= Z.x0-5 && r.right <= Z.x1+5 && r.top >= Z.y0-5 && r.bottom <= Z.y1+5;
      out.push({t: +t, tg, sc: +sc, box: [r.left, r.top, r.right, r.bottom].map(Math.round), ok});
    }
    return out;
  }, zone);
  // При наезде видимый текст остается внутри safe zone из CSS.
  const spill = await page.evaluate(Z => {
    const out = [];
    for (const s of document.querySelectorAll('section[data-camk]')) for (const k of s.dataset.camk.split(';').map(x => x.trim()).filter(Boolean)) {
      const [t, tg, sc, d] = k.split(/\s+/); if (+sc <= 1) continue;
      const T = Math.min(+t + +(d || 1.2), +s.dataset.e - .05); window.render(T);
      const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; let v = true;
        let op = 1; for (let e = n.parentElement; e instanceof Element; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none') { v = false; break; } op *= +c.opacity; const m = /opacity\(([\d.]+)\)/.exec(c.filter); if (m) op *= +m[1]; } if (op < .35) v = false;
        if (!v) continue; const r = document.createRange(); r.selectNodeContents(n);
        for (const q of r.getClientRects()) if (q.width > 2 && (q.top < Z.y0-1 || q.left < Z.x0-1 || q.right > Z.x1+1 || q.bottom > Z.y1+1)) { out.push(`${T.toFixed(2)} ${tg}: «${n.textContent.trim().slice(0, 30)}» ${[q.left, q.top, q.right, q.bottom].map(Math.round)}`); break; } }
    }
    return [...new Set(out)];
  }, zone);
  console.log('\nкамера: текст за safe zone во время наезда: ' + (spill.length ? '' : 'нет'));
  for (const x of spill) console.log('  ' + x);
  console.log('\nкамера: цель в safe zone после наезда');
  for (const c of cams) console.log(`${c.ok ? 'ok ' : 'ВНЕ'} ${c.t} ${c.tg} x${c.sc} ${c.box || c.err}`);
  const quality = {camera:[],contrast:[],contrastUnknown:[],smallText:[],overflow:[]};
  const shots = await page.evaluate(() => [...document.querySelectorAll('section[data-camk]')].map(s=>({
    index:[...document.querySelectorAll('section')].indexOf(s),start:+s.dataset.s,end:+s.dataset.e,
    transition:window.P5TR?.of([...document.querySelectorAll('section')].indexOf(s))??0,
    keys:s.dataset.camk.split(';').map(k=>k.trim()).filter(Boolean).map(k=>{const [t,target,scale,d]=k.split(/\s+/);return {time:+t,target,scale:+scale,duration:+(d||1.2)}})
  })));
  const checks = new Set();
  for(const shot of shots) for(const key of shot.keys) {
    const times=cameraSamples(shot.start,shot.end,key,shot.index?shot.transition:0);
    for(const time of times){
      const failures=await page.evaluate(({index,key,time,Z})=>{
        render(time);const s=document.querySelectorAll('section')[index],out=[];
        const targets=[...s.querySelectorAll('[data-camera-keep]')];
        if(key.target.startsWith('#')){const el=s.querySelector(key.target);if(el)targets.push(el);else out.push({code:'missing-target',target:key.target})}
        for(const el of new Set(targets)){
          const r=el.getBoundingClientRect();let op=1;
          for(let p=el;p&&p!==s.parentElement;p=p.parentElement){const c=getComputedStyle(p);op*=+c.opacity;if(c.display==='none'||c.visibility==='hidden')op=0;const m=/opacity\(([\d.]+)\)/.exec(c.filter);if(m)op*=+m[1]}
          if(op<.35)out.push({code:'hidden-target',target:el.id,opacity:op});
          if(r.left<Z.x0-2||r.right>Z.x1+2||r.top<Z.y0-2||r.bottom>Z.y1+2)out.push({code:'camera-framing',target:el.id,box:[r.left,r.top,r.right,r.bottom].map(Math.round)});
        }
        return out;
      },{index:shot.index,key,time,Z:zone});
      for(const f of failures){const token=shot.index+':'+f.code+':'+f.target;if(!checks.has(token)){checks.add(token);quality.camera.push({...f,scene:shot.index,time:+time.toFixed(3)})}}
    }
  }
  for(const [i,[a,b]] of scenes.entries()){
    // Contrast at a settled, untransformed composition; camera dimming is a separate review concern.
    await page.evaluate(({t,i})=>{render(t);const s=document.querySelectorAll('section')[i];s.style.transform='none';s.querySelectorAll('.cam-on,.cam-path,.cam-old').forEach(e=>e.classList.remove('cam-on','cam-path','cam-old'));s.classList.remove('cam-path')},{t:a+(b-a)*.85,i});
    const surface=await page.evaluate(inspectSurfaces);
    for(const sample of surface.samples){const ratio=contrast(sample.fg,sample.bg);if(ratio<sample.minimum)quality.contrast.push({scene:i,...sample,ratio:+ratio.toFixed(2)})}
    quality.contrastUnknown.push(...surface.unknown.map(s=>({scene:i,...s})));
    quality.smallText.push(...surface.small.map(s=>({scene:i,...s})));
    quality.overflow.push(...surface.overflow.map(s=>({scene:i,...s})));
  }
  console.log('quality: '+JSON.stringify({camera:quality.camera.length,contrast:quality.contrast.length,contrastUnknown:quality.contrastUnknown.length,smallText:quality.smallText.length,overflow:quality.overflow.length}));
  if (E.OUT) await fs.writeFile(E.OUT, JSON.stringify({rows, cams, spill,quality}, null, 2));
} finally { await browser.close(); }
