// Пресет default. Порядок: runtime/engine.js -> runtime/preset-dynamic.js -> runtime/preset-minimal.js -> init().
// Все из пресета 4 работает (data-wd, data-p4-*, data-draw, data-tilt), из движка - data-in/data-cnt/data-type/data-strike/data-spin/data-w.
// Все считается от t, без таймеров. Свою анимацию ролика писать в window.p5hook=t=>{...}.
// Движение постоянное, но спокойное: плавные кривые без отскоков и вращений, сдвиги в пределах 60-120px,
// ничего не улетает за экран, камера дышит на 1-2%.
//
// Сцены <section class="s white|black pal-*">:
//   мир p5w: data-tr="down|up|dots|radial|grow|shrink|meme|cut" - тот же фон: камера едет вниз/вверх со смазом по скорости (1.2 с), смена фона: частицы (0.9 с),
//     radial - круг из data-wipe="x,y"; grow - новая сцена вырастает карточкой с 60%; shrink - старая уменьшается карточкой и тает (1 с), под ними старая/новая в легком размытии;
//     meme - сильный зум в мем-картинку старой сцены (data-wipe="#id"), размытие, новый кадр из размытия (1.2 с). Без data-tr выбирается само.
//     dissolve - новая сцена проявляется поверх старой (0.9 с, лучше на том же фоне); defocus - старая уходит в размытие,
//     новая проявляется из размытия (1.1 с). Длительности - таблица TRD ниже (window.P5TR). Оба без scale и сдвигов, по smootherstep.
//     whip - быстрый пан вбок со смазом по скорости (0.6 с), data-wipe="left|right" - направление; не чаще раза за ролик, на смене темы мысли.
//     dots: data-dots-dir="right|up|left|down" - направление волны; без атрибута сохраняется прежняя диагональ.
//   Старые роли: data-tr="rise|wipe|slide|split|zoom|cover|fade|cut" - вход сцены (по умолчанию по кругу rise, wipe, slide, split, zoom),
//     data-wipe="x,y" - центр круга для wipe. fade смешивает цвета тем - только между сценами одной темы;
//   data-cam="in|out|still" - фоновая камера (медленный наезд 1.5%), data-punch="t[:сила][:звук],.." - мягкий акцент камеры (сила до .03);
//   data-deco="none" - без угловых меток.
// Элементы:
//   data-a="rise|left|right|drop|zoom|flip|soft|stamp|zdrop|pop|blur" (+ up движка) - плавный вход (blur - из размытия 8px со сдвигом 24px); data-float="амплитуда[,скорость]" - покачивание;
//   data-shake="t[,амплитуда]" - короткая тряска (ошибка); data-mk="t" у .mk - маркер; data-chars="t0,шаг" - буквы по одной;
//   data-rot3d="rx,ry,амплитуда,скорость" - объект качается в 3D; data-turn="rx,rz,амплитуда,скорость" - стопка на «вертушке» (амплитуда 0 - вращение град/с);
//   data-a="zdrop" - слой опускается по оси Z (внутри .stack3d); .marq[data-marq="px/с"] - бегущая строка; .shim - блик.
//   data-exit="t[,d]" (мир p5w) - мягкий уход: прозрачность до 0 и подъем на 24px по smootherstep (d по умолчанию .6),
//     через свойство translate (не совмещать с data-float/data-shake); вход data-in при этом работает как обычно.
//   <i class="mi">имя</i> - иконка Material Symbols; в data-wd проявляется вместе со своим словом.
// window.p5gaps() - промежутки без событий (проверка «движение каждую секунду»), window.p5cues() - звуки для p5-audio.mjs.
(()=>{
  const num=s=>String(s).split(',').map(Number);
  const $$=(q,r=document)=>[...r.querySelectorAll(q)];
  const S=x=>x*x*x*(x*(6*x-15)+10);            // плавный разгон и торможение
  const O=x=>W?S(x):1-Math.pow(1-x,4);           // мягкое торможение; в мире p5w - плавный и старт, и финиш (без рывка в первом кадре)
  // иконки: лигатуру переносим в data-i, чтобы разбивка по словам (data-wd) их не трогала
  $$('.mi').forEach(i=>{if(!i.dataset.i){i.dataset.i=i.textContent.trim();i.textContent=''}});
  $$('[data-chars]').forEach(el=>{el.innerHTML=[...el.textContent].map(c=>`<span class="ch">${c}</span>`).join('')});
  $$('.marq').forEach(m=>{const d=m.firstElementChild;d.innerHTML+=d.innerHTML});
  // декор: только угловые метки safe zone, как на чертеже. Фоны чистые, без градиентов и свечений
  const THEMES=['white','black'];
  const themeOf=s=>THEMES.find(k=>s.classList.contains(k))||'black';
  const marks=[[41,246,0],[1005,246,90],[1005,1272,180],[41,1272,270]].map(([x,y,r])=>`<i class="cm" style="left:${x-17}px;top:${y-17}px;rotate:${r}deg"></i>`).join('');
  $$('section').forEach(s=>{if(s.dataset.deco!=='none')s.insertAdjacentHTML('afterbegin',`<div class="p5-deco">${marks}</div>`)});
  const W=document.body.classList.contains('p5w');   // режим default (styles/p5-world.css): движение без scale
  // кривые мира (runtime/p5-ease.js, с ролика 37): входы - glide, камера и переходы - cine; data-ease у элемента или 5-е поле ключа камеры
  const PE=W&&window.P5E,EN=PE?PE.role.enter:x=>O(x),TRE=PE?PE.role.tr:S,CAME=PE?PE.role.cam:S,DEN=PE?PE.D.enter:.6;
  const EZ=(n,def)=>PE&&n?PE.get(n,def):def;
  const TRW=['down','up','dots','radial','grow','shrink','meme','dissolve','defocus','whip'];
  // длительности переходов мира p5w, с; таблицу читают checks/check.mjs и студия (window.P5TR)
  const TRD={down:1.2,up:1.2,dots:.9,radial:1,grow:1,shrink:1,meme:1.2,dissolve:.9,defocus:1.1,whip:.6};
  window.P5TR={dur:TRD,of:i=>{ready||setup();return SC[i]?SC[i].d:0}};
  const TR=['rise','wipe','slide','split','zoom'];
  const DIMQ='.cam-path>*:not(.cam-path):not(.cam-on):not(.p5-deco):not(.wall-bg)';   // кого гасит фокус-наезд (styles/p5-world.css)
  const EX=['rise','left','right','drop','zoom','flip','soft','spin','stamp','zdrop','pop','blur'];

  let ready=false,SC,icons,ev,END,exEls,turns,floats,shakes,mks,chars,rots,marqs,exits;
  const avatarOpacity=new WeakMap();
  const wdTimes=el=>{const [a,st]=num(el.dataset.wd),ws=[...el.querySelectorAll('.w8i')];
    let ts=el.dataset.wdTimes?num(el.dataset.wdTimes):ws.map((_,i)=>a+i*st);
    return [ws,ws.map((_,i)=>ts[i]??ts[ts.length-1]+.15*(i-ts.length+1))]};
  function setup(){
    ready=true;
    $$('.ava').forEach(el=>avatarOpacity.set(el,el.style.opacity));
    // элементы ищем здесь, а не при загрузке: data-wd пресета 4 пересоздает разметку строк
    exEls=$$('[data-a]').filter(el=>EX.includes(el.dataset.a));
    exits=W?$$('[data-exit]'):[];turns=$$('[data-turn]');floats=$$('[data-float]');shakes=$$('[data-shake]');mks=$$('[data-mk]');chars=$$('[data-chars]');rots=$$('[data-rot3d]');marqs=$$('.marq[data-marq]');
    SC=$$('section').map((s,i)=>({s,i,a:+s.dataset.s,b:+s.dataset.e,tr:s.dataset.tr||(i?TR[(i-1)%TR.length]:'cut'),cam:s.dataset.cam||(W?'still':'in'),
      punch:(s.dataset.punch||'').split(',').filter(Boolean).map(x=>{const [t,a,snd]=x.split(':');return {t:+t,a:Math.min(.03,+(a||.02)),snd}}),
      // камера по ключам (мир p5w): data-camk="время цель масштаб [длительность]; ..." цель: c (центр), #id/.класс, или x,y в px кадра
      d:.9,keys:(s.dataset.camk||'').split(';').map(k=>k.trim()).filter(Boolean).map(k=>{const [t,tg,sc,d,e]=k.split(/\s+/);return {t:+t,tg,s:+(sc||1),d:+(d||1.2),e:EZ(e,CAME)}}),fc:{}}));
    // мир p5w: шторок нет. Тот же фон - камера плавно едет вниз (down) или вверх (up), смена фона - частицы (dots).
    // Старые имена шторок (rise, wipe, split, diag, slide, zoom*, push*) и сцены без data-tr выбираются сами
    if(W)SC.forEach((x,i)=>{if(!i||x.tr=='cut')return;
      if(!TRW.includes(x.tr))x.tr=themeOf(x.s)==themeOf(SC[i-1].s)&&x.s.classList.contains('wall')==SC[i-1].s.classList.contains('wall')?'down':'dots';
      x.d=TRD[x.tr]||TRD.radial});
    END=Math.max(...SC.map(x=>x.b));
    // иконки внутри data-wd получают время своего слова
    icons=[];
    for(const el of $$('[data-wd]')){const [ws,ts]=wdTimes(el);
      for(const ic of $$('.mi',el)){const box=ic.parentElement.classList.contains('ib')?ic.parentElement:ic;
        // [слово + иконка] (иконка последняя в .iw) - со словом перед ней, иначе со словом после
        const nx=ws.findIndex(w=>box.compareDocumentPosition(w)&Node.DOCUMENT_POSITION_FOLLOWING),iw=box.closest('.iw');
        const after=iw&&iw.lastElementChild===box&&!(box.nextSibling&&box.nextSibling.textContent.trim());
        icons.push({el:box,t:nx<0?ts[ts.length-1]:after&&nx>0?ts[nx-1]:ts[nx]})}}
    // события для проверки ритма: [начало, конец]
    ev=[];const P=(a,b=a+.3)=>ev.push([a,b]);
    SC.forEach(x=>{P(x.a,x.a+.5);x.punch.forEach(p=>P(p.t));x.keys.forEach(k=>P(k.t,k.t+k.d))});
    $$('[data-in]').forEach(el=>P(+el.dataset.in,+el.dataset.in+(W?+(el.dataset.d||DEN):.3)));
    exits.forEach(el=>{const [a,d=.6]=num(el.dataset.exit);P(a,a+d)});
    $$('[data-wd]').forEach(el=>wdTimes(el)[1].forEach(t=>P(t)));
    icons.forEach(i=>P(i.t));
    $$('[data-p4-swap]').forEach(el=>P(num(el.dataset.p4Swap)[0]));
    $$('[data-draw]').forEach(el=>{const [a,b]=num(el.dataset.draw);P(a,b)});
    $$('[data-p4-build]').forEach(el=>{const [a,d,st]=num(el.dataset.p4Build);P(a,a+d+st*el.children.length)});
    $$('[data-p4-view]').forEach(el=>{const [a,d]=num(el.dataset.p4View);P(a,a+d)});
    $$('[data-tilt]').forEach(el=>P(num(el.dataset.tilt)[0],num(el.dataset.tilt)[0]+.8));
    $$('[data-cnt]').forEach(el=>{const [a,b]=num(el.dataset.cnt);P(a,b)});
    $$('[data-w]').forEach(el=>{const [a,b]=num(el.dataset.w);P(a,b)});
    $$('[data-three]').forEach(el=>{const a=+el.dataset.threeAt;P(a,a+ +el.dataset.threeDuration)});
    $$('[data-strike]').forEach(el=>P(+el.dataset.strike));
    $$('[data-type]').forEach(el=>P(+el.dataset.t0,+el.dataset.t0+el.dataset.type.length/+el.dataset.cps));
    $$('[data-mk]').forEach(el=>P(+el.dataset.mk,+el.dataset.mk+.5));
    $$('[data-shake]').forEach(el=>P(num(el.dataset.shake)[0]));
    $$('[data-chars]').forEach(el=>{const [a,st]=num(el.dataset.chars);P(a,a+st*el.children.length+.5)});
    // Anime.js (runtime/p5-anime.js), роллер и курсор (runtime/p5-motion.js), строки split-type (runtime/p5-lines.js)
    window.P5A&&P5A.events().forEach(([a,b])=>P(a,b));window.P5M&&P5M.events().forEach(([a,b])=>P(a,b));window.P5L&&P5L.times().forEach(t=>P(t));
    ev.sort((x,y)=>x[0]-y[0]);
  }
  function gaps(min=1){const g=[];let cur=0;
    for(const [a,b] of ev){if(a-cur>min)g.push([+cur.toFixed(2),+a.toFixed(2)]);cur=Math.max(cur,b)}
    if(END-cur>min)g.push([+cur.toFixed(2),END]);return g}
  window.p5gaps=(min=1)=>{ready||setup();return gaps(min)};
  // камера в движении (наезд, панорама, отъезд) в момент t - валидатор не меряет такие кадры, финальное кадрирование проверяет checks/frame-layout.mjs
  window.p5camMoving=t=>{ready||setup();return SC.some(x=>t>=x.a&&t<x.b&&(x.keys.some(k=>t>=k.t&&t<k.t+k.d)||x.punch.some(p=>t>=p.t&&t<p.t+1.8)))};

  // камера сцены: медленный наезд 1.5% + мягкие акценты
  // точка фокуса цели в координатах кадра без трансформаций сцены (меряется один раз, когда сцена видна)
  const zoneStyle=getComputedStyle(document.documentElement),zoneX=parseFloat(zoneStyle.getPropertyValue('--sz-x')),
    zoneTop=parseFloat(zoneStyle.getPropertyValue('--sz-t')),zoneBottom=parseFloat(zoneStyle.getPropertyValue('--sz-b')),
    zoneWidth=1080-2*zoneX,zoneHeight=1920-zoneTop-zoneBottom,zoneCenterY=zoneTop+zoneHeight/2;
  function focus(x,tg){if(tg=='c')return [540,zoneCenterY];if(/^[\d.]+,[\d.]+$/.test(tg))return num(tg);
    if(x.fc[tg])return x.fc[tg];const el=x.s.querySelector(tg)||document.querySelector(tg);if(!el)return [540,zoneCenterY];
    // позиция без трансформаций (входная анимация цели не сбивает прицел): цепочка offset до сцены, для SVG - прямоугольник
    let r;if(el instanceof HTMLElement){let X=0,Y=0;for(let n=el;n&&n!==x.s;n=n.offsetParent){X+=n.offsetLeft;Y+=n.offsetTop}r={left:X,top:Y,width:el.offsetWidth,height:el.offsetHeight}}
    else{const tr=x.s.style.transform;x.s.style.transform='none';r=el.getBoundingClientRect();x.s.style.transform=tr}
    return x.fc[tg]=[r.left+r.width/2,r.top+r.height/2,Math.min(zoneWidth/r.width,zoneHeight/r.height),r.width,r.height]}   // третье - наибольший масштаб, при котором цель помещается в safe zone
  // камера мира p5w: фокус (fx,fy) в центре safe zone, масштаб sc; ключи сменяют друг друга по smootherstep; край кадра не открывается
  // при отъезде (цель c) приглушение держится, пока камера не вернулась
  function camW(x,t){let f=[540,zoneCenterY],sc=1;
    x.cur=null;let old=null,op=1;for(const k of x.keys){const td=W?x.d:D,kt=x.i&&k.t>=x.a&&k.t<x.a+td?x.a+td:k.t;   // наезд не начинается во время перехода
      if(t<kt)break;const p=k.e(clamp((t-kt)/k.d)),g=focus(x,k.tg),el=k.tg[0]=='#'&&k.s>1?x.s.querySelector(k.tg):null;
      if(p<1&&x.cur&&el&&x.cur!==el){old=x.cur;op=p}else old=null;if(el)x.cur=el;else if(p>=1)x.cur=null;f=[lerp(f[0],g[0],p),lerp(f[1],g[1],p)];sc=lerp(sc,Math.min(k.s,g[2]||9),p)}
    const sk=sc;   // масштаб ключей без акцентов: приглушение считается от него, иначе хвост data-punch гасит соседей скачком в первом кадре наезда
    for(const k of x.punch){const d=t-k.t;if(d>=0&&d<1.8)sc*=1+Math.min(k.a,.02)*(d<.5?S(d/.5):1-S(clamp((d-.5)/1.3)))}
    // Solve endpoint poses, then interpolate them. Per-frame clamping creates velocity kinks.
    let fit=null;
    if(x.s.dataset.camfit==='safe'&&window.P5Camera){
      const targets=[...new Set([...x.keys.map(k=>k.tg).filter(tg=>tg[0]==='#'),...$$('[data-camera-keep][id]',x.s).map(el=>'#'+el.id)])];
      const rects=targets.map(tg=>focus(x,tg)).filter(g=>g[3]>0&&g[4]>0).map(g=>({left:g[0]-g[3]/2,right:g[0]+g[3]/2,top:g[1]-g[4]/2,bottom:g[1]+g[4]/2}));
      if(rects.length){
        // Optical reserve only where the original layout has room. Wide pose stays identity.
        const z={left:Math.max(zoneX,Math.min(zoneX+20,...rects.map(r=>r.left))),right:Math.min(1080-zoneX,Math.max(1080-zoneX-20,...rects.map(r=>r.right))),
          top:Math.max(zoneTop,Math.min(zoneTop+24,...rects.map(r=>r.top))),bottom:Math.min(1920-zoneBottom,Math.max(1920-zoneBottom-24,...rects.map(r=>r.bottom)))};
        fit=P5Camera.track({rects,zone:z,time:t,punch:x.punch,keys:x.keys.map(k=>({time:x.i&&k.t>=x.a&&k.t<x.a+x.d?x.a+x.d:k.t,duration:k.d,scale:k.s,focus:focus(x,k.tg),ease:k.e}))});
        sc=fit.scale;
      }
    }
    // цель приближается почти на своем месте (подтягивается к центру на 30%), соседний контент раздвигается, а не уезжает под плашку
    const zk=clamp((sc-1)/.08),zd=clamp((sk-1)/.08);   // доля наезда: 0 - общий план, 1 - наезд от 8%
    const px=f[0]+(540-f[0])*zk,py=f[1]+(zoneCenterY-f[1])*.3*zk;
    // фокус-наезд: все, кроме блока с целью, приглушается (filter, не трогает opacity входов)
    // data-camdim у сцены или <body>: 0 - не приглушать, число 0.06-1 - до какой яркости гасить (по умолчанию .06)
    const cd=x.s.dataset.camdim??document.body.dataset.camdim,lo=cd==null?.06:cd==='0'?1:+cd;
    const dv=1-(1-lo)*clamp(zd*2.5);x.s.style.setProperty('--dim',dv.toFixed(3));
    // переезд с цели на цель: фон остается приглушенным, старая цель плавно гаснет, новая загорается
    x.s.style.setProperty('--cnew',(old?lerp(dv,1,op):1).toFixed(3));x.s.style.setProperty('--cold',(old?lerp(1,dv,op):1).toFixed(3));
    if(x.on!==x.cur){x.s.querySelectorAll('.cam-on,.cam-path').forEach(e=>e.classList.remove('cam-on','cam-path'));x.s.classList.remove('cam-path');
      if(x.cur){x.cur.classList.add('cam-on');for(let e=x.cur.parentElement;e&&e!==x.s.parentElement;e=e.parentElement)e.classList.add('cam-path')}x.on=x.cur}
    // старая цель гаснет вместе со своим блоком: класс на самом верхнем предке под путем новой цели,
    // иначе блок вокруг старой цели приглушается за один кадр (рывок яркости)
    if(x.old!==old){x.oldEl&&x.oldEl.classList.remove('cam-old');x.oldEl=null;
      if(old){let e=old;while(e.parentElement&&e.parentElement!==x.s&&!e.parentElement.classList.contains('cam-path'))e=e.parentElement;e.classList.add('cam-old');x.oldEl=e}x.old=old}
    let X=px-f[0]*sc,Y=py-f[1]*sc;
    if(fit){X=fit.x;Y=fit.y;}
    // Background compensation follows the same solved transform.
    // обои стоят на месте: обратная камера на .wall-bg (origin - точка 0,0 сцены), переходы сцены двигают их как раньше
    if(x.wb===undefined)x.wb=x.s.querySelector(':scope>.wall-bg');
    // во время наезда сцена не обрезает обои по своей рамке, иначе у края кадра открывается полоса фона сцены
    if(x.wb){const still=sc===1&&!X&&!Y;x.wb.style.transformOrigin='72px 72px';x.s.style.overflow=still?'':'visible';
      x.wb.style.transform=still?'':`scale(${(1/sc).toFixed(5)}) translate(${(-X).toFixed(2)}px,${(-Y).toFixed(2)}px)`}
    return `translate(${X.toFixed(2)}px,${Y.toFixed(2)}px) scale(${sc.toFixed(5)})`}
  const lerp=(a,b,k)=>a+(b-a)*k;
  function cam(x,t){if(W)return camW(x,t);const p=clamp((t-x.a)/Math.max(.1,x.b-x.a));let sc=1;const ty=W?0:Math.sin(t*.7+x.i)*2;
    if(x.cam=='in')sc+=.015*S(p);else if(x.cam=='out')sc+=.015*(1-S(p));
    for(const k of x.punch){const d=t-k.t;if(W){if(d>=0&&d<1.8)sc+=Math.min(k.a,.012)*(d<.5?S(d/.5):1-S((d-.5)/1.3))}else if(d>=0&&d<.9)sc+=k.a*(d<.25?S(d/.25):1-S((d-.25)/.65))}
    return `translateY(${ty}px) scale(${sc})`}
  const D=W?.9:.55;
  // whip: направление data-wipe="left" (по умолчанию, новая сцена приходит справа) или "right"; смаз - горизонтальный feGaussianBlur,
  // сигма пропорциональна скорости пана (px за кадр), общий фильтр для обеих сцен
  const whipK=x=>x.s.dataset.wipe==='right'?-1:1;
  // скорость перехода в px за кадр при пути len: производная кривой TRE численно
  const trV=(e,x,len)=>{const h=.01,a=Math.max(0,e-h),b=Math.min(1,e+h);return Math.abs(TRE(b)-TRE(a))/(b-a)*len/x.d/30};
  // фильтры смаза создаются один раз при первой отрисовке (разметка одинакова при seek и проигрывании подряд)
  let wf=null,vf=null;function blurDefs(){if(wf)return;document.body.insertAdjacentHTML('beforeend','<svg width="0" height="0" style="position:absolute">'+
    '<filter id="p5whip" x="-20%" y="0" width="140%" height="100%"><feGaussianBlur stdDeviation="0 0"/></filter>'+
    '<filter id="p5vblur" x="0" y="-10%" width="100%" height="120%"><feGaussianBlur stdDeviation="0 0"/></filter></svg>');
    wf=document.querySelector('#p5whip feGaussianBlur');vf=document.querySelector('#p5vblur feGaussianBlur')}
  function whipV(e,x){const sg=Math.min(60,trV(e,x,1080)*.35);blurDefs();wf.setAttribute('stdDeviation',`${sg.toFixed(2)} 0`);return sg}
  // down/up: легкий вертикальный смаз по скорости (как выдержка камеры), до 10px на пике; на старте и в конце смаза нет
  function vertV(e,x){const sg=Math.min(10,trV(e,x,1920)*.1);blurDefs();vf.setAttribute('stdDeviation',`0 ${sg.toFixed(2)}`);return sg>.6?'url(#p5vblur)':''}
  // вход сцены: [transform, opacity, clip-path]. Новый фон открывается шторкой или кругом (цвета тем не смешиваются),
  // контент внутри подъезжает на 60-120px. Ничего не улетает за экран
  function enter(x,e){const E=W?TRE(e):S(e),O2=O(e);
    if(W)switch(x.tr){   // сцены одного полотна: новая подъезжает снизу (down) или сверху (up) вместе со старой
      case 'down':return [`translateY(${(1-E)*1920}px)`,1,'',vertV(e,x)];
      case 'up':return [`translateY(${-(1-E)*1920}px)`,1,'',vertV(e,x)];
      case 'dots':return ['',e<.5?0:1,''];   // частицы закрывают экран цветом новой сцены, на середине сцены меняются
      case 'radial':{const [cx,cy]=num(x.s.dataset.wipe||'540,960'),R=Math.hypot(Math.max(cx,1080-cx),Math.max(cy,1920-cy))+4;return ['',1,`circle(${(E*R).toFixed(1)}px at ${cx}px ${cy}px)`]}
      case 'grow':{const k=.6+.4*E;return [zc(k),S(clamp(e/.4)),`inset(0 round ${((1-E)*48/k).toFixed(1)}px)`]}   // новая сцена вырастает карточкой из центра: с 60% размера, проявляясь
      case 'shrink':{const q=1-S(clamp(e/.8));return ['',1,'',q>.01?`blur(${(10*q).toFixed(1)}px)`:'']}   // под уходящей карточкой новая сцена выходит из легкого размытия
      case 'meme':{const p=S(clamp((e-.4)/.6));return [zc(1.06-.06*p),S(clamp((e-.4)/.35)),'',`blur(${(28*(1-p)).toFixed(1)}px)`]}   // новый кадр проявляется из размытия
      case 'dissolve':return ['',E,''];   // растворение: новая сцена поверх старой, старая стоит на месте
      case 'defocus':{const q=S(clamp((e-.3)/.7));return ['',q,'',q<1?`blur(${(18*(1-q)).toFixed(1)}px)`:'']}   // новая проявляется из размытия
      case 'whip':{const k=whipK(x),v=whipV(e,x);return [`translateX(${((1-E)*1080*k).toFixed(2)}px)`,1,'',v>.3?'url(#p5whip)':'']}   // быстрый пан вбок со смазом по скорости
      default:return ['',1,'']}
    switch(x.tr){
    case 'rise':return [`translateY(${(1-O2)*120}px)`,1,`inset(${(1-E)*100}% 0 0 0)`];
    case 'slide':return [`translateX(${(1-O2)*120}px)`,1,`inset(0 0 0 ${(1-E)*100}%)`];
    case 'split':return [`scale(${1.04-.04*O2})`,1,`inset(${(1-E)*50}% 0 ${(1-E)*50}% 0)`];
    case 'zoom':return [`scale(${1.05-.05*O2})`,1,`circle(${E*2300}px at 540px 760px)`];
    case 'cover':return [`translateY(${(1-E)*1920}px)`,1,''];
    case 'wipe':{const [cx,cy]=num(x.s.dataset.wipe||'540,760');return [`translateY(${(1-O2)*60}px)`,1,`circle(${E*2300}px at ${cx}px ${cy}px)`]}
    case 'fade':return ['',E,''];
    default:return ['',1,'']}}
  // выход: старая сцена остается на месте и чуть отступает, новая проявляется поверх
  // масштаб сцены вокруг центра кадра (transform-origin у сцен 0 0)
  const zc=k=>`translate(${(540*(1-k)).toFixed(2)}px,${(960*(1-k)).toFixed(2)}px) scale(${k.toFixed(5)})`;
  const PE2=x=>x*x*x;   // мем-зум: медленный старт и сильное ускорение внутрь картинки
  // точка мем-зума: data-wipe="#id" (картинка в старой сцене) или "x,y"; по доле от рамки сцены, поэтому не зависит от текущего transform
  function memeAt(nx,old){const w=nx.s.dataset.wipe||'540,960';if(w[0]!='#')return num(w);
    const el=old.querySelector(w);if(!el)return [540,960];const a=el.getBoundingClientRect(),b=old.getBoundingClientRect();
    return [(a.left+a.width/2-b.left)/b.width*1080,(a.top+a.height/2-b.top)/b.height*1920]}
  function leave(nx,e,x0){const E=W?TRE(e):S(e);
    if(W){if(nx.tr=='shrink'){const k=1-.35*E;return [zc(k),`inset(0 round ${(E*48/k).toFixed(1)}px)`,'',1-S(clamp((e-.4)/.6))]}   // старая сцена уменьшается карточкой до 65% и тает
      if(nx.tr=='grow'||nx.tr=='radial'){const q=E*8;return ['','',q>.05?`blur(${q.toFixed(1)}px)`:'']}   // старая сцена уходит в легкую глубину под новой
      if(nx.tr=='meme'){const [cx,cy]=memeAt(nx,x0),k=1+5*PE2(clamp(e/.6));return [`translate(${(cx*(1-k)).toFixed(2)}px,${(cy*(1-k)).toFixed(2)}px) scale(${k.toFixed(4)})`,'',`blur(${(28*S(clamp((e-.25)/.45))).toFixed(1)}px)`]}
      if(nx.tr=='whip'){const k=whipK(nx),v=whipV(e,nx);return [`translateX(${(-E*1080*k).toFixed(2)}px)`,'',v>.3?'url(#p5whip)':'']}
      if(nx.tr=='defocus'){const q=S(clamp(e/.65));return ['','',q>0?`blur(${(18*q).toFixed(1)}px)`:'']}   // старая сцена уходит в размытие под новой
      if(nx.tr=='down')return [`translateY(${-E*1920}px)`,'',vertV(e,nx)];if(nx.tr=='up')return [`translateY(${E*1920}px)`,'',vertV(e,nx)];return ['']}
    switch(nx.tr){
    case 'rise':return `translateY(${-E*50}px)`;
    case 'slide':return `translateX(${-E*60}px)`;
    default:return `scale(${1-.02*E})`}}

  // частицы (мир p5w): сетка точек цвета новой сцены растет волной до сплошного фона, затем тает в том же направлении.
  // Все от t: задержка точки - ее место в волне + хеш клетки, без случайностей
  let dc,dx;const CELL=30,RM=22,GX=36,GY=64;
  const hash=(i,j)=>{const v=Math.sin(i*127.1+j*311.7)*43758.5453;return v-Math.floor(v)};
  function dots(t){const x=SC.find((x,i)=>i&&x.tr=='dots'&&t>=x.a&&t<x.a+x.d);
    if(!dc){dc=document.createElement('canvas');dc.width=1080;dc.height=1920;
      dc.style.cssText='position:absolute;left:0;top:0;width:1080px;height:1920px;z-index:40;pointer-events:none';document.body.appendChild(dc);dx=dc.getContext('2d')}
    dx.clearRect(0,0,1080,1920);if(!x){dc.style.display='none';return}dc.style.display='block';
    const e=(t-x.a)/x.d,ph=e<.5?e/.5:(e-.5)/.5;
    const dir=x.s.dataset.dotsDir;
    dx.fillStyle=x.s.classList.contains('white')?'#fff':'#121212';dx.beginPath();
    for(let j=0;j<GY;j++)for(let i=0;i<GX;i++){
      const wave=dir==='right'?i/(GX-1):dir==='left'?1-i/(GX-1):dir==='down'?j/(GY-1):dir==='up'?1-j/(GY-1):i/GX*.4+j/GY*.6;
      const dl=.45*wave+.15*hash(i,j),g=S(clamp((ph-dl)/.4)),r=RM*(e<.5?g:1-g);
      if(r>.3){const cx=i*CELL+CELL/2,cy=j*CELL+CELL/2;dx.moveTo(cx+r,cy);dx.arc(cx,cy,r,0,6.2832)}}
    dx.fill()}
  const prev=window.hook;
  window.hook=t=>{
    ready||setup();if(W)blurDefs();
    SC.forEach((x,i)=>{const s=x.s,nx=SC[i+1];
      const on=t>=x.a&&t<x.b,out=nx&&!on&&t>=x.b&&t<x.b+(W?nx.d:D)&&Math.abs(nx.a-x.b)<.01&&nx.tr!=='cut';
      s.style.display=on||out?'flex':'none';s.style.clipPath='';s.style.filter='';s.style.zIndex='';s.style.opacity=1;if(W)s.style.transformOrigin='0 0';
      if(!on&&!out)return;
      const c=cam(x,t);
      if(out){const lv=leave(nx,(t-x.b)/(W?nx.d:D),s);
        if(W){const [tf,cp='',f='',op=1]=lv;s.style.transform=tf+' '+c;s.style.clipPath=cp;s.style.filter=f;s.style.opacity=op;s.style.zIndex=nx.tr=='shrink'?3:''}else s.style.transform=lv+' '+c;return}
      const e=clamp((t-x.a)/(W?x.d:D));
      if(i&&e<1){const [tf,op,cp,f='']=enter(x,e);s.style.transform=tf+' '+c;s.style.opacity=op;s.style.clipPath=cp;s.style.filter=f}
      else s.style.transform=c;
      // цвет плашки меняется на середине перехода
      document.body.dataset.th=themeOf(i&&e<.5?SC[i-1].s:s);
    });
    if(W)dots(t);
    // входы элементов: плавное проявление со сдвигом, без отскоков и вращений
    for(const el of exEls){const a=el.dataset.a,d=+(el.dataset.d||DEN),p=clamp((t-+el.dataset.in)/d),F=W?EZ(el.dataset.ease,EN):O,o=F(p),r=+(el.dataset.r||0);let tf='';
      if(a=='rise')tf=`translateY(${(1-o)*40}px)`;
      else if(a=='left'||a=='right')tf=`translateX(${(1-o)*(a=='left'?-60:60)}px)`;
      else if(a=='drop')tf=`translateY(${(1-o)*-40}px)`;
      else if(W&&(a=='zoom'||a=='soft'||a=='spin'||a=='pop'))tf=`translateY(${(1-o)*24}px)`;
      else if(a=='blur'){tf=`translateY(${(1-o)*24}px)`;   // из размытия 8px со сдвигом 24px (чат-пузыри, карточки)
        // inline-фильтр входа перебивает приглушение фокус-наезда (styles/p5-world.css), поэтому приглушение добавляем сами, иначе в конце входа скачок яркости
        const dm=el.classList.contains('cam-old')?' opacity(var(--cold,1))':el.classList.contains('cam-on')?' opacity(var(--cnew,1))':el.matches(DIMQ)?' opacity(var(--dim,1))':'';
        el.style.filter=p<1?`blur(${(8*(1-o)).toFixed(2)}px)${dm}`:''}
      else if(W&&a=='stamp'){tf=`translateX(${(1-o)*-16}px)`;el.style.clipPath=p<1?`inset(0 ${(1-o)*100}% 0 0)`:''}
      else if(a=='zoom'||a=='soft'||a=='spin'||a=='pop')tf=`scale(${a=='zoom'?1.08-.08*o:.92+.08*o})`;
      else if(a=='flip')tf=`perspective(1200px) rotateX(${(1-o)*-24}deg)`;
      else if(a=='stamp'&&!W)tf=`scale(${1.18-.18*o})`;
      else if(a=='zdrop')tf=`translateZ(${(1-o)*160}px)`;
      el.style.transform=tf+(r?` rotate(${r}deg)`:'');el.style.opacity=F(clamp(p*1.4))}
    // мягкий уход data-exit: все от t, без накопленного состояния (стили пишутся в каждом кадре)
    for(const el of exits){const [a,d=.6]=num(el.dataset.exit),p=clamp((t-a)/Math.max(.05,d)),e=S(p),hasIn=el.dataset.in!=null;
      el.style.translate=p>0?`0 ${(-24*e).toFixed(2)}px`:'';
      el.style.opacity=hasIn?String((el.style.opacity===''?1:+el.style.opacity)*(1-e)):p>0?String(1-e):''}
    // аватар перед переходом down/up уходит размытием: за 0.4 с до смены и 0.2 с после
    if(W)for(const x of SC){const nx=SC[x.i+1];if(!nx||(nx.tr!='down'&&nx.tr!='up'))continue;const p=S(clamp((t-x.b+.4)/.6));
      for(const el of x.s.querySelectorAll('.ava')){el.style.setProperty('--ab',(p*24).toFixed(1)+'px');const base=el.hasAttribute('data-in')?el.style.opacity:avatarOpacity.get(el);el.style.opacity=p>0?String(+(base||1)*(1-p)):(base??'')}}
    // иконки: проявляются со своим словом
    for(const ic of icons){const p=clamp((t-ic.t)/.5),o=O(p);ic.el.style.opacity=o;ic.el.style.transform=`scale(${.8+.2*o})`}
    for(const el of mks)el.style.setProperty('--k',S(clamp((t-+el.dataset.mk)/.55)));
    for(const el of chars){const [a,st]=num(el.dataset.chars);[...el.children].forEach((c,i)=>{const p=clamp((t-a-i*st)/.5),o=O(p);
      c.style.opacity=o;c.style.transform=`translateY(${(1-o)*35}%)`})}
    for(const el of rots){const [rx,ry,amp,sp]=num(el.dataset.rot3d);el.style.transform=`rotateX(${rx+Math.sin(t*sp*.7)*amp*.3}deg) rotateY(${ry+Math.sin(t*sp)*amp}deg)`}
    for(const el of turns){const [rx,rz,amp,sp]=num(el.dataset.turn);el.style.transform=`rotateX(${rx}deg) rotateZ(${amp?rz+Math.sin(t*sp)*amp:rz+t*sp}deg)`}
    for(const el of marqs){const w=el.firstElementChild.scrollWidth/2;el.firstElementChild.style.transform=`translateX(${-((t*+el.dataset.marq)%w)}px)`}
    // покачивание + тряска (свойство translate, не совмещать с data-p4-build/data-tilt на том же элементе)
    for(const el of floats){const [amp,sp=1]=num(el.dataset.float),ph=floats.indexOf(el)*1.3;el.style.translate=`0 ${Math.sin(t*sp+ph)*amp}px`}
    for(const el of shakes){const [a,amp=8]=num(el.dataset.shake),d=t-a;if(d>=0&&d<.4)el.style.translate=`${Math.sin(d*40)*amp*(1-d/.4)}px 0`;else if(!el.dataset.float)el.style.translate=''}
    // блик shimmer
    const c=(t%3)/2;document.body.style.setProperty('--sp',c>1?-20:120-140*S(c));
    prev&&prev(t);window.p5hook&&p5hook(t);
  };

  // звуки: [время, имя, громкость]. Немного и тихо: смена сцены, штамп, печать, замена значения, зачеркивание и то, что задано явно.
  // Имена - audio/p5-audio.mjs (мягкие звуки sfx/p5-*.mp3, сгенерированы engine/audio/sfx-gen.py).
  window.p5cues=()=>{ready||setup();const c=[];
    const startOf=el=>el.dataset.in!=null?+el.dataset.in:el.dataset.s!=null?+el.dataset.s:el.dataset.p4Swap?num(el.dataset.p4Swap)[0]
      :el.dataset.wd?wdTimes(el)[1][0]:el.dataset.chars?num(el.dataset.chars)[0]:el.dataset.mk?+el.dataset.mk:el.dataset.t0!=null?+el.dataset.t0:0;
    SC.slice(1).forEach(x=>{if(x.tr!=='cut'&&!x.s.hasAttribute('data-nowhoosh'))c.push([x.a,'whoosh',.3])});
    SC.forEach(x=>x.punch.forEach(p=>{if(p.snd&&p.snd!=='-')c.push([p.t,p.snd,.35])}));
    exEls.filter(el=>el.dataset.a=='stamp').forEach(el=>c.push([+el.dataset.in,'thud',.35]));
    $$('[data-type]').forEach(el=>c.push([+el.dataset.t0,'type',.3]));
    $$('[data-p4-swap]').forEach(el=>c.push([num(el.dataset.p4Swap)[0],'tick',.3]));
    $$('[data-strike]').forEach(el=>c.push([+el.dataset.strike,'swish',.3]));
    // data-sfx="имя[:громкость][@время][~длительность]": ~ обрезает длинный звук с затуханием 0.3 с (тишина после гула)
    $$('[data-sfx]').forEach(el=>el.dataset.sfx.split(/\s+/).forEach(x=>{const m=x.match(/^([\w-]+)(?::([\d.]+))?(?:@([\d.]+))?(?:~([\d.]+))?$/);
      if(m)c.push([m[3]!=null?+m[3]:startOf(el),m[1],m[2]!=null?+m[2]:.35,...(m[4]!=null?[+m[4]]:[])])}));
    // одинаковые звуки ближе 0.4с не дублируем
    const seen={};return c.sort((a,b)=>a[0]-b[0]).filter(([t,n])=>{const ok=!(t-seen[n]<.4);if(ok)seen[n]=t;return ok});
  };
})();
