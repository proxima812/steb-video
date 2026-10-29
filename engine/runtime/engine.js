const clamp = x => Math.max(0, Math.min(1, x));
const out3 = x => 1 - Math.pow(1 - x, 3);
const back = x => { const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2) };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function spark(svg) { let s = ''; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + (i % 2 ? .12 : 0); const L = i % 3 == 0 ? 46 : i % 2 ? 36 : 42; s += `<line x1="0" y1="0" x2="${(Math.cos(a) * L).toFixed(1)}" y2="${(Math.sin(a) * L).toFixed(1)}" stroke="#D97757" stroke-width="${i % 2 ? 7 : 9}" stroke-linecap="round"/>` } svg.innerHTML = s }
// плашка: иконка Instagram + ник, иконка подписки + "Не подписывайся."
const IG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none"/></svg>';
const SUB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="7.5" r="4"/><path d="M2 21v-1.5A4.5 4.5 0 0 1 6.5 15h5A4.5 4.5 0 0 1 16 19.5V21"/><path d="M19.5 8v6M16.5 11h6"/></svg>';
document.head.insertAdjacentHTML('beforeend', '<style>.handle span{display:inline-flex;align-items:center;gap:.4em}.handle svg{width:1.15em;height:1.15em;flex:none}</style>');
// window.HANDLE (задать до runtime/engine.js) - своя плашка, напр. для коллабораций
document.body.insertAdjacentHTML('afterbegin', `<div class="handle">${window.HANDLE || `<span>${IG}const_proxima</span><span>${SUB}Не подписывайся.</span>`}</div>`);
// Wallpaper - отдельный фоновый слой: blur не затрагивает контент и аватар.
document.querySelectorAll('section.wall').forEach(s => {
  if (!s.querySelector(':scope > .wall-bg')) s.insertAdjacentHTML('afterbegin', '<div class="bg wall-bg" aria-hidden="true" data-safe="ignore"></div>');
});
// Концовка по референсу: две строки с иконками и большой аватар от нижнего края.
document.querySelectorAll('section.outro').forEach(s => { if (s.querySelector('.outro-me') || [...s.children].some(el => !el.classList.contains('wall-bg'))) return; const t0 = +s.dataset.s;
  s.insertAdjacentHTML('beforeend', `<div class="outro-me" data-in="${t0 + .35}" data-a="rise">${IG}<span>const_proxima</span></div>` +
    `<div class="outro-sub" data-in="${t0 + .9}" data-a="rise">${SUB}<span>НЕ ПОДПИСЫВАЙСЯ</span></div>`);
  const av = s.dataset.ava || 'bl';
  const file = {bl:'bl', br:'br', low:'ring', mid:'mid'}[av];
  if (file) s.insertAdjacentHTML('beforeend', `<img class="ava outro-ava" src="../video/avatar/${file}.png" alt="" data-in="${t0 + .65}" data-a="rise">`);
});
let scenes, els, types, cnts, ws, strikes, spins;
function init() {
  document.querySelectorAll('svg.spark').forEach(spark);
  scenes = [...document.querySelectorAll('section')]; els = [...document.querySelectorAll('[data-in]')]; types = [...document.querySelectorAll('[data-type]')];
  cnts = [...document.querySelectorAll('[data-cnt]')]; ws = [...document.querySelectorAll('[data-w]')]; strikes = [...document.querySelectorAll('[data-strike]')]; spins = [...document.querySelectorAll('[data-spin]')];
}
function apply(el, t) {
  const a = el.dataset.a || 'up', d = +(el.dataset.d || (a == 'pop' ? .4 : .3)); const p = clamp((t - +el.dataset.in) / d); const r = +(el.dataset.r || 0);
  el.style.opacity = a == 'pop' ? clamp(p * 3) : p;
  if (a == 'up' && document.body.classList.contains('p5w')) { const P = window.P5E, q = clamp((t - +el.dataset.in) / (P ? P.D.enter : .6)), e = P ? P.get(el.dataset.ease, P.role.enter)(q) : q * q * q * (q * (6 * q - 15) + 10); el.style.opacity = e; el.style.transform = `translateY(${(1 - e) * 30}px)` }
  else if (a == 'up') el.style.transform = `translateY(${(1 - out3(p)) * 60}px)`;
  else if (a == 'pop') el.style.transform = `scale(${p <= 0 ? .5 : .5 + .5 * back(p)}) rotate(${r}deg)`;
  else el.style.transform = r ? `rotate(${r}deg)` : '';
}
// data-cnt="t0,t1,from,to" ; data-w="t0,t1,from%,to%" ; data-strike="t" ; data-spin="deg/s"
function render(t) {
  const ez = document.body.classList.contains('p5w') ? (window.P5E ? P5E.role.draw : (x => x * x * x * (x * (6 * x - 15) + 10))) : out3;
  for (const s of scenes) {
    const on = t >= +s.dataset.s && t < +s.dataset.e; s.style.display = on ? 'flex' : 'none';
    if (on) { const k = clamp((t - +s.dataset.s) / .35); s.style.transform = `scale(${1.035 - .035 * out3(k)})` }
  }
  for (const el of els) { apply(el, t); if (el.dataset.out && t >= +el.dataset.out) el.style.opacity = 0 }
  for (const el of types) { const n = Math.floor(Math.max(0, t - +el.dataset.t0) * +el.dataset.cps); const f = el.dataset.type; el.textContent = f.slice(0, n) + (n < f.length && (document.body.classList.contains('p5w') || Math.floor(t * 3) % 2) ? '▍' : '') }
  for (const el of cnts) { const [a, b, f, to] = el.dataset.cnt.split(',').map(Number); const v = Math.round(f + (to - f) * ez(clamp((t - a) / (b - a)))); el.textContent = (el.dataset.raw != null ? String(v) : v.toLocaleString('ru-RU')) + (el.dataset.suf || '') }
  for (const el of ws) { const [a, b, f, to] = el.dataset.w.split(',').map(Number); el.style.width = (f + (to - f) * ez(clamp((t - a) / (b - a)))) + '%' }
  for (const el of strikes) el.style.setProperty('--k', out3(clamp((t - +el.dataset.strike) / .3)));
  for (const el of spins) el.style.rotate = (t * +el.dataset.spin) + 'deg';
  window.hook && hook(t);
}
window.render = render;
