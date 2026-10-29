// Анимация UI-компонентов (styles/p5-ui.css) от времени кадра, без таймеров и состояния.
// data-press="t[,t2...]" - наведение (--lift) и нажатие (--press) в момент t. Подключать до или после runtime: цепляется в window.hook.
(() => {
  const clamp = x => Math.max(0, Math.min(1, x)), S = x => (x = clamp(x), x * x * x * (x * (6 * x - 15) + 10));
  let els = null;
  function frame(t) {
    els = els || [...document.querySelectorAll('[data-press]')];
    for (const el of els) {
      let lift = 0, press = 0;
      for (const a of el.dataset.press.split(',').map(Number)) {
        if (!Number.isFinite(a)) continue;
        lift = Math.max(lift, S((t - a) / .35) * (1 - S((t - a - 1.2) / .5)));
        press = Math.max(press, S((t - a - .35) / .15) * (1 - S((t - a - .6) / .3)));
      }
      el.style.setProperty('--lift', lift.toFixed(4));
      el.style.setProperty('--press', press.toFixed(4));
    }
  }
  const prev = window.hook;
  window.hook = t => { prev && prev(t); frame(t); };
})();
