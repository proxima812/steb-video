// Пресет 4 «Минимал»: подключать после runtime/engine.js, до init(). Все считается от t, без таймеров.
// data-wd="t0,шаг" [data-wd-times="t1,t2,.."] [data-wd-d=".32"] - слова выезжают из маски строки (тайминги из озвучки);
//   с data-txt="blur" (у <body> или элемента, нужен runtime/p5-lines.js) - слово поднимается на 3px из размытия 4px, без маски;
// data-draw="t0,t1" - отрисовка SVG-пути; data-tilt="t0,deg" - панель выпрямляется по rotateX;
// data-p4-build="t0,d,шаг" - сборка слоями: сам блок, затем его дети по очереди;
// data-p4-exit="t0,d" [data-p4-exit-to="x,y,scale"] - мягкий выход (по умолчанию 0,-18,.98);
// data-p4-view="t0,d" data-p4-from="x,y,scale" [data-p4-to="0,0,1"] [data-p4-origin="якорь"] - камера: деталь -> общий план;
// .hero data-p4-path="t:якорь:scale;t:якорь:scale" [data-p4-show="t0,d,tКонец"] - герой перелетает между якорями
//   (<i class="anc" data-anchor="имя">), в том числе через границу сцен; цвет берет из активной сцены;
// data-p4-swap="t0,d" - замена значения в неподвижной маске: <span data-p4-swap><span>старое</span><span>новое</span></span>.
// Звук: data-sfx="имя[:громкость][@время]" на любом элементе (время по умолчанию - момент появления элемента);
//   сами собой: смена сцены - whoosh, .meme - pop, data-p4-swap - tick, перелет героя - swish.
//   window.p4cues() отдает список, микширует engine/p4-audio.mjs.
(()=>{
  const S=x=>x*x*x*(x*(6*x-15)+10);               // плавный разгон и торможение
  const num=s=>s.split(',').map(Number);
  const $$=q=>[...document.querySelectorAll(q)];
  const wds=$$('[data-wd]').map(el=>{
    el.classList.add('wd');
    el.innerHTML=el.innerHTML.replace(/(<[^>]+>)|([^\s<]+)/g,(m,tag,w)=>tag||`<span class="w8"><span class="w8i">${w}</span></span>`);
    const [a,st]=num(el.dataset.wd),ws=[...el.querySelectorAll('.w8i')];
    let ts=el.dataset.wdTimes?num(el.dataset.wdTimes):ws.map((_,i)=>a+i*st);
    ts=ws.map((_,i)=>ts[i]??ts[ts.length-1]+.15*(i-ts.length+1));   // слов больше, чем таймингов - остальные следом
    // появление «blur» (runtime/p5-lines.js, P5T): слово без маски поднимается на 3px из размытия 4px
    const blur=!!(window.P5T&&P5T.blur(el));el.classList.toggle('wd-blur',blur);
    return [ws,ts,+(el.dataset.wdD||.32),blur];
  });
  const draws=$$('[data-draw]').map(p=>{const L=p.getTotalLength();p.style.strokeDasharray=L;return [p,L]});
  const tilts=$$('[data-tilt]'),builds=$$('[data-p4-build]'),exits=$$('[data-p4-exit]'),swaps=$$('[data-p4-swap]');
  const views=$$('[data-p4-view]'),heroes=$$('.hero[data-p4-path]');
  // якоря меряются один раз (после загрузки шрифтов) в «чистом» состоянии: все сцены видны, трансформации сброшены
  let A=null,fontState='';
  function measure(){
    const shown=$$('section').map(s=>[s,s.style.display]);
    document.body.classList.add('p4-measure');
    A={};
    for(const v of views){const r=v.getBoundingClientRect();v._r=r}
    for(const a of $$('[data-anchor]')){const r=a.getBoundingClientRect();
      A[a.dataset.anchor]={x:r.left+r.width/2,y:r.top+r.height/2,view:a.closest('[data-p4-view]')}}
    for(const v of views){const o=v.dataset.p4Origin&&A[v.dataset.p4Origin];
      v._o=o?{x:o.x,y:o.y}:{x:v._r.left+v._r.width/2,y:v._r.top+v._r.height/2};
      v.style.transformOrigin=`${v._o.x-v._r.left}px ${v._o.y-v._r.top}px`}
    document.body.classList.remove('p4-measure');
    for(const [s,d] of shown)s.style.display=d;
    fontState=document.fonts.status;
  }
  const viewState=(v,t)=>{const [a,d]=num(v.dataset.p4View),f=num(v.dataset.p4From),to=num(v.dataset.p4To||'0,0,1'),e=S(clamp((t-a)/d));
    return f.map((x,i)=>x+(to[i]-x)*e)};
  // точка якоря с учетом текущего положения камеры
  const at=(name,t)=>{const a=A[name];if(!a.view)return {x:a.x,y:a.y,s:1};
    const v=a.view,[tx,ty,s]=viewState(v,t);return {x:v._o.x+(a.x-v._o.x)*s+tx,y:v._o.y+(a.y-v._o.y)*s+ty,s}};
  // звуковые подсказки: [время, имя, громкость]
  const startOf=el=>el.dataset.in!=null?+el.dataset.in:el.dataset.s!=null?+el.dataset.s:el.dataset.p4Swap?num(el.dataset.p4Swap)[0]
    :el.dataset.wd?(el.dataset.wdTimes?num(el.dataset.wdTimes)[0]:num(el.dataset.wd)[0]):el.dataset.draw?num(el.dataset.draw)[0]
    :el.dataset.p4Build?num(el.dataset.p4Build)[0]:el.dataset.t0!=null?+el.dataset.t0:0;
  window.p4cues=()=>{const c=[];
    $$('section').slice(1).forEach(s=>{if(!s.hasAttribute('data-nowhoosh'))c.push([+s.dataset.s,'whoosh',.5])});
    $$('.meme').forEach(m=>c.push([startOf(m),'pop',.7]));
    swaps.forEach(el=>c.push([startOf(el),'tick',.6]));
    heroes.forEach(h=>{const ks=h.dataset.p4Path.split(';');if(ks.length>1)c.push([+ks[1].split(':')[0]-.45,'swish',.45])});
    $$('[data-sfx]').forEach(el=>el.dataset.sfx.split(/\s+/).forEach(x=>{const m=x.match(/^([\w-]+)(?::([\d.]+))?(?:@([\d.]+))?$/);
      if(m)c.push([m[3]!=null?+m[3]:startOf(el),m[1],m[2]!=null?+m[2]:.7])}));
    return c.sort((a,b)=>a[0]-b[0]);
  };
  const prev=window.hook;
  window.hook=t=>{
    if(!A||fontState!==document.fonts.status)measure();
    const scene=$$('section').find(s=>s.style.display!='none');
    for(const s of $$('section'))s.style.transform='';   // свой зум сцены движка выключен: движением управляет пресет
    const W=document.body.classList.contains('p5w');
    const PE=W&&window.P5E,WE=PE?PE.role.word:S,DR=PE?PE.role.draw:out3;
    for(const [ws,ts,d0,blur] of wds)ws.forEach((w,i)=>{const d=W?Math.max(d0,PE?PE.D.word:.5):d0,p=clamp((t-ts[i])/d),e=W?WE(p):out3(p);
      if(blur)return P5T.set(w,p);
      w.style.opacity=W?clamp(e*1.8):clamp(p*2.5);w.style.transform=p<1?`translateY(${(1-e)*105}%)`:''});
    for(const [p,L] of draws){const [a,b]=num(p.dataset.draw);p.style.strokeDashoffset=L*(1-(W?DR:out3)(clamp((t-a)/(b-a))))}
    for(const el of tilts){const [a,d]=num(el.dataset.tilt);el.style.rotate=`x ${d*(1-out3(clamp((t-a)/.8)))}deg`}
    for(const el of builds){const [a,d,st]=num(el.dataset.p4Build);
      [el,...el.children].forEach((l,i)=>{const e=out3(clamp((t-a-i*st)/d));l.style.opacity=e;l.style.translate=`0 ${16*(1-e)}px`})}
    for(const el of exits){const [a,d]=num(el.dataset.p4Exit),[x,y,s]=num(el.dataset.p4ExitTo||'0,-18,.98'),e=out3(clamp((t-a)/d));
      if(t<a)continue;const base=builds.includes(el)||el.dataset.in?+el.style.opacity:1;el.style.opacity=base*(1-e);el.style.translate=`${x*e}px ${y*e}px`;el.style.scale=1+(s-1)*e}
    for(const v of views){const [x,y,s]=viewState(v,t);v.style.transform=`translate(${x}px,${y}px) scale(${s})`}
    for(const el of swaps){const [a,d]=num(el.dataset.p4Swap),e=(W?DR:S)(clamp((t-a)/d)),[o,n]=el.children;
      o.style.transform=`translateY(${-100*e}%)`;n.style.transform=`translateY(${100*(1-e)}%)`}
    for(const h of heroes){
      const ks=h.dataset.p4Path.split(';').map(k=>{const [tt,n,s]=k.split(':');return [+tt,n,+(s||1)]});
      let i=ks.findIndex(k=>t<k[0]);if(i<0)i=ks.length;
      const k0=ks[Math.max(0,i-1)],k1=ks[Math.min(ks.length-1,i)];
      const e=k0===k1?1:S(clamp((t-k0[0])/(k1[0]-k0[0]))),p0=at(k0[1],t),p1=at(k1[1],t);
      const [a,d,end=1e9]=num(h.dataset.p4Show||'0,.01'),sh=t>=end?0:out3(clamp((t-a)/d));
      const sc=(k0[2]*p0.s+(k1[2]*p1.s-k0[2]*p0.s)*e)*(.92+.08*sh);
      h.style.left=p0.x+(p1.x-p0.x)*e+'px';h.style.top=p0.y+(p1.y-p0.y)*e+'px';
      h.style.transform=`translate(-50%,-50%) scale(${sc})`;h.style.opacity=sh;
      if(scene)h.style.color=getComputedStyle(scene).getPropertyValue('--acc-on');
    }
    prev&&prev(t);
  };
})();
