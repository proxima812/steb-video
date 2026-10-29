// Построчное появление заголовков (с ролика 37) через split-type: текст делится по реальным строкам после загрузки шрифтов,
// каждая строка выезжает из своей маски вверх в момент, когда голос произносит ее первое слово.
// Подключение (после runtime/p5-ease.js, до runtime/engine.js): <script src="node_modules/split-type/umd/index.min.js"></script><script src="runtime/p5-lines.js"></script>
//   <div class="h" data-lines="t1,t2,t3,..."> - времена слов из words.json (как data-wd-times); строка берет время своего первого слова.
//   Не совмещать с data-wd на том же элементе. Иконки .mi внутри не поддерживаются.
// Появление «blur»: <body data-txt="blur"> (весь ролик) или data-txt="blur" у элемента, data-txt="mask" - прежний выезд из маски.
//   Каждое слово в свое время из списка поднимается на 3px (translateY 3px -> 0), размытие 4px -> 0, прозрачность 0 -> 1,
//   кривая cubic-bezier(.7,.1,.5,.9) (P5T.ease), без маски строки: текст не выезжает «из пола». То же для data-wd (runtime/preset-minimal.js, через P5T).
(()=>{
  const ease=()=>window.P5E?P5E.role.word:x=>x*x*x*(x*(6*x-15)+10);
  const dur=()=>window.P5E?P5E.D.word+.1:.6;
  const BLUR=4,RISE=3;
  window.P5T={
    blur:el=>el.closest('[data-txt]')?.dataset.txt==='blur',
    // кривая появления текста cubic-bezier(.7,.1,.5,.9): медленный старт без рывка в первом кадре, без перелета
    ease:window.P5E?P5E.bezier(.7,.1,.5,.9):x=>x*x*(3-2*x),
    // p - доля времени появления 0..1; в конце стили снимаются целиком (blur 0, без transform)
    set(n,p){if(p>=1){n.style.transform='';n.style.filter='';n.style.opacity='1';return}
      const e=P5T.ease(p);n.style.transform=`translateY(${(RISE*(1-e)).toFixed(3)}px)`;n.style.filter=`blur(${(BLUR*(1-e)).toFixed(3)}px)`;n.style.opacity=Math.min(1,e*1.6).toFixed(3)}};
  const ST=window.SplitType;if(!ST){console.warn('p5-lines: split-type не подключен');return}
  const $$=q=>[...document.querySelectorAll(q)];
  const els=$$('[data-lines]');let state='';
  const wordTime=(ts,i)=>ts[Math.min(i,ts.length-1)]+(i>=ts.length?.15*(i-ts.length+1):0);   // слов больше, чем таймингов - остальные следом
  function split(){
    for(const el of els){
      if(!el._src)el._src=el.innerHTML;else el.innerHTML=el._src;
      // секции скрыты (display:none) - на время разбивки показываем, иначе строк не видно
      const sec=el.closest('section'),d=sec&&sec.style.display;if(sec)sec.style.display='flex';
      const s=new ST(el,{types:'lines,words',tagName:'span'});
      const ts=el.dataset.lines.split(',').map(Number);let wi=0;
      el._blur=P5T.blur(el);el.classList.toggle('ln-blur',el._blur);
      if(el._blur)el._ln=s.words.map((w,i)=>({word:w,t:wordTime(ts,i)}));
      else el._ln=s.lines.map(line=>{const n=line.querySelectorAll('.word').length,t=wordTime(ts,wi);wi+=n;
        const inner=document.createElement('span');inner.className='ln-i';while(line.firstChild)inner.appendChild(line.firstChild);line.appendChild(inner);
        return {line,inner,t}});
      if(sec)sec.style.display=d}
    state=document.fonts.status+':'+document.fonts.size}
  const prev=window.hook;
  window.hook=t=>{
    if(state!==document.fonts.status+':'+document.fonts.size&&document.fonts.status==='loaded')split();
    const E=ease(),D=dur();
    for(const el of els)for(const l of el._ln||[]){const p=Math.max(0,Math.min(1,(t-l.t)/D)),e=E(p);
      if(l.word){P5T.set(l.word,p);continue}
      l.inner.style.transform=p<1?`translateY(${((1-e)*108).toFixed(2)}%)`:'';l.inner.style.opacity=Math.min(1,e*1.6).toFixed(3)}
    prev&&prev(t)};
  // в режиме blur строка без маски (overflow виден): размытие и сдвиг на 3px не обрезаются краем строки
  document.head.insertAdjacentHTML('beforeend','<style>[data-lines] .line{display:block;overflow:hidden;padding:0 .08em .14em;margin:0 -.08em -.14em}[data-lines] .ln-i{display:block;will-change:transform}[data-lines] .word{display:inline}'+
    '[data-lines].ln-blur .line{overflow:visible}[data-lines].ln-blur .word{display:inline-block}</style>');
  window.P5L={events:()=>els.flatMap(el=>(el._ln||[]).map(l=>[l.t,l.t+dur()])),times:()=>els.flatMap(el=>el.dataset.lines.split(',').map(Number))};
})();
