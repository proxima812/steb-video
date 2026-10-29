// Проверка новых переходов p5w (dissolve, defocus) и ухода data-exit на демонстрации examples/transitions-new.html:
// концы переходов, плавный старт (нет рывка в первом кадре), монотонность без перелета, отсутствие scale,
// совпадение прямого seek с последовательным проигрыванием. Запуск из engine/: node checks/transition-endpoints.mjs
import path from 'node:path';
import {openPage} from '../pipeline/video-tools.mjs';

const FPS = 30, file = path.resolve(process.env.PAGE || 'examples/transitions-new.html');
const {browser, page} = await openPage(file);
const fails = [], notes = [];
const ok = (cond, msg) => { (cond ? notes : fails).push(msg); };
try {
  await page.evaluate(() => document.fonts.ready);
  const st = t => page.evaluate(t => {
    render(t);
    const ss = [...document.querySelectorAll('section')].map(s => ({display: s.style.display, opacity: +(s.style.opacity || 1), filter: s.style.filter, transform: s.style.transform}));
    const el = id => { const e = document.getElementById(id); return {opacity: e.style.opacity === '' ? 1 : +e.style.opacity, translate: e.style.translate}; };
    return {ss, x1: el('x1'), x2: el('x2')};
  }, t);
  const blur = f => +(/blur\(([\d.]+)px\)/.exec(f || '')?.[1] || 0);
  const scaleOf = tf => [...(tf || '').matchAll(/scale\(([\d.]+)\)/g)].map(m => +m[1]);

  // dissolve: 3.0-3.9, сцена 1
  let a = await st(3), m = await st(3.45), b = await st(3.9 - 1e-4), c = await st(3.9);
  ok(a.ss[1].opacity < .001 && a.ss[0].display === 'flex', 'dissolve: в начале новая сцена прозрачна, старая видна');
  ok(Math.abs(m.ss[1].opacity - .5) < .02, `dissolve: середина ${m.ss[1].opacity.toFixed(3)} ≈ 0.5`);
  ok(b.ss[1].opacity > .999 && c.ss[1].opacity === 1 && c.ss[0].display === 'none', 'dissolve: в конце новая сцена непрозрачна, старая скрыта');
  // defocus: 6.0-7.1, сцена 2
  a = await st(6); m = await st(6.55); c = await st(7.1 + 1e-6);
  ok(a.ss[2].opacity < .001 && blur(a.ss[1].filter) < .01, 'defocus: старт без размытия старой сцены и с прозрачной новой');
  ok(blur(m.ss[1].filter) > 5 && blur(m.ss[2].filter) > 1, `defocus: середина - старая ${blur(m.ss[1].filter)}px, новая ${blur(m.ss[2].filter)}px`);
  ok(c.ss[2].opacity === 1 && !c.ss[2].filter && c.ss[1].display === 'none', 'defocus: в конце новая сцена резкая и непрозрачна');

  // покадрово: плавный старт, монотонность, без scale
  for (const [name, i, t0, d] of [['dissolve', 1, 3, .9], ['defocus', 2, 6, 1.1]]) {
    const vals = [];
    for (let f = 0; f <= Math.round(d * FPS); f++) { const s = await st(t0 + f / FPS); vals.push(s.ss[i].opacity); for (const k of [i - 1, i]) for (const sc of scaleOf(s.ss[k].transform)) if (Math.abs(sc - 1) > 1e-4) fails.push(`${name}: scale ${sc} в кадре ${f}`); }
    ok(vals[1] < .02, `${name}: первый кадр ${vals[1].toFixed(4)} (без рывка)`);
    ok(vals.every((v, k) => !k || v >= vals[k - 1] - 1e-9) && Math.max(...vals) <= 1, `${name}: прозрачность монотонна, без перелета`);
    const steps = vals.slice(1).map((v, k) => v - vals[k]);
    ok(Math.max(...steps) < .12, `${name}: максимальный шаг за кадр ${Math.max(...steps).toFixed(3)}`);
  }
  // data-exit
  a = await st(10.45); m = await st(10.8); b = await st(11.2); const x2a = await st(10.9), x2b = await st(11.6);
  ok(a.x1.opacity === 1 && !a.x1.translate, 'data-exit: до ухода объект на месте');
  ok(m.x1.opacity > .05 && m.x1.opacity < .95 && /-/.test(m.x1.translate), `data-exit: середина ${m.x1.opacity.toFixed(2)}, ${m.x1.translate}`);
  ok(b.x1.opacity === 0 && /-24/.test(b.x1.translate), 'data-exit: после ухода прозрачен, поднят на 24px');
  ok(x2a.x2.opacity === 1 && x2b.x2.opacity === 0, 'data-exit без data-in: 1 до ухода, 0 после');

  // seek = последовательное проигрывание
  const samples = [3.4, 6.5, 7.2, 10.8, 12.3];
  // inline-стили видимых элементов: объявления по алфавиту (порядок записи свойств не важен), скрытые сцены не сравниваются
  const snap = () => page.evaluate(() => [...document.body.querySelectorAll('*')].map(e => {
    const sec = e.closest('section'); if (sec && sec.style.display === 'none') return '-';
    return (e.style?.cssText || '').split(/;\s*/).filter(Boolean).sort().join(';').replace(/-?\d+\.\d+/g, x => (+x).toFixed(2));
  }).join('\n'));
  const seq = {};
  for (let f = 0; f <= Math.round(13 * FPS); f++) { const t = f / FPS; await page.evaluate(t => render(t), t); const hit = samples.find(s => Math.abs(s * FPS - f) < .5); if (hit != null) seq[hit] = await snap(); }
  for (const s of samples) { await page.evaluate(() => render(14)); await page.evaluate(t => render(t), Math.round(s * FPS) / FPS); ok((await snap()) === seq[s], `seek ${s} с совпадает с проигрыванием`); }
  const gaps = await page.evaluate(() => p5gaps(1));
  notes.push('p5gaps(1): ' + JSON.stringify(gaps));
} finally { await browser.close(); }
for (const n of notes) console.log('ok   ' + n);
for (const f of fails) console.log('FAIL ' + f);
console.log(fails.length ? `\n${fails.length} проверок не прошли` : `\nВсе ${notes.length - 1} проверок прошли`);
process.exit(fails.length ? 1 : 0);
