// Anime.js v4 в мире p5w (с ролика 37): морфинг SVG и движение по кривой, покадрово от t.
// Подключение (после runtime/p5-ease.js, до runtime/engine.js):
//   <script src="node_modules/animejs/dist/bundles/anime.umd.min.js"></script><script src="runtime/p5-anime.js"></script>
// Анимации Anime.js создаются на паузе (autoplay:false), каждый кадр движок перематывает их к t через seek():
// без таймеров и requestAnimationFrame, поэтому кадр t всегда одинаковый.
// Атрибуты:
//   <path data-morph="t0,d,#цель[,кривая]; t1,d,#цель2"> - контур перетекает в форму пути #цель (обычно скрытого в <defs>)
//   data-mpath="t0,d,#путь[,кривая]"                     - элемент едет по SVG-пути (только сдвиг, без поворота)
// JS: P5A.tl(t0) - своя пауза-таймлайн Anime.js, время в нем от t0 в секундах (длительности в мс, как в Anime.js).
// Кривые - из runtime/p5-ease.js (по умолчанию cine), отскоки и эластичные кривые Anime.js не используем.
(()=>{
  const A=window.anime;if(!A){console.warn('p5-anime: Anime.js не подключен');return}
  const $$=q=>[...document.querySelectorAll(q)];
  const ease=n=>window.P5E?P5E.get(n,P5E.role.draw):A.eases.inOutCubic;
  const list=[];   // [таймлайн, t0]
  const tl=(t0=0)=>{const x=A.createTimeline({autoplay:false,defaults:{ease:ease()}});list.push([x,t0]);return x};
  const steps=s=>s.split(';').map(k=>k.trim()).filter(Boolean).map(k=>{const [t,d,tg,e]=k.split(',').map(x=>x.trim());return {t:+t,d:+d,tg,e}});
  let built=false;
  function build(){built=true;
    for(const el of $$('[data-morph]')){const ks=steps(el.dataset.morph),x=tl(0);
      for(const k of ks)x.add(el,{d:A.svg.morphTo(document.querySelector(k.tg)),duration:k.d*1000,ease:ease(k.e)},k.t*1000)}
    for(const el of $$('[data-mpath]')){const [k]=steps(el.dataset.mpath),p=A.svg.createMotionPath(document.querySelector(k.tg)),x=tl(0);
      x.add(el,{translateX:p.translateX,translateY:p.translateY,duration:k.d*1000,ease:ease(k.e)},k.t*1000)}}
  const prev=window.hook;
  window.hook=t=>{built||build();for(const [x,t0] of list)x.seek(Math.max(0,(t-t0)*1000));prev&&prev(t)};
  // для проверки ритма p5gaps: [начало, конец] каждого шага
  window.P5A={tl,anime:A,events:()=>[...$$('[data-morph]').flatMap(el=>steps(el.dataset.morph)),...$$('[data-mpath]').flatMap(el=>steps(el.dataset.mpath))].map(k=>[k.t,k.t+k.d])};
})();
