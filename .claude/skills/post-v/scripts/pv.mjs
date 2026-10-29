// Управление окном PostV (Яндекс Браузер, порт 9222).
// node pv.mjs shot [file] | eval "<js>" | click "<текст>" [n] | upload <file> | type "<текст>" | key <Key>
import {createRequire} from 'module';
const require = createRequire(new URL('../../../../engine/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const b = await puppeteer.connect({browserURL: 'http://127.0.0.1:9222', defaultViewport: null});
const pages = await b.pages();
const p = pages.find(x => x.url().includes('instagram.com')) || pages[0];
const [cmd, a, c] = process.argv.slice(2);
try {
  if (cmd == 'shot') { await p.screenshot({path: a || '/tmp/postv/s.png'}); console.log(p.url()); }
  else if (cmd == 'eval') console.log(JSON.stringify(await p.evaluate(a), null, 1));
  else if (cmd == 'click') {
    // клик по видимому элементу с точным текстом (button, role=button, span, div), n-й при нескольких
    const r = await p.evaluate((t, n) => {
      const els = [...document.querySelectorAll('button,[role=button],[role=switch],[role=menuitem],[role=option],a,span,div,input')]
        .filter(e => (e.innerText || e.value || e.getAttribute('aria-label') || '').trim() == t && e.getClientRects().length);
      const e = els[n || 0]; if (!e) return null; const q = e.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2, els.length];
    }, a, +c || 0);
    if (!r) { console.log('нет элемента:', a); process.exit(2); }
    await p.mouse.click(r[0], r[1]); console.log('click', a, r);
  }
  else if (cmd == 'upload') {
    const inp = (await p.$$('input[type=file]')).at(c ? +c : -1);
    if (!inp) { console.log('нет input[type=file]'); process.exit(2); }
    await inp.uploadFile(a); console.log('upload', a);
  }
  else if (cmd == 'xy') { await p.mouse.click(+a, +c); console.log('xy', a, c); }
  else if (cmd == 'type') { await p.keyboard.type(a, {delay: 5}); console.log('typed', a.length); }
  else if (cmd == 'key') { await p.keyboard.press(a); console.log('key', a); }
  else if (cmd == 'goto') { await p.goto(a, {waitUntil: 'networkidle2'}); console.log(p.url()); }
} finally { b.disconnect(); }
