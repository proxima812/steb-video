// Помощники движения мира p5w: слот-роллер числа, курсор (наведение, клик, перетаскивание), перецентровка растущей группы.
// Подключение (как p5-lines.js: после runtime/p5-ease.js, до runtime/engine.js): <script src="runtime/p5-motion.js"></script>
// Все считается от t, без таймеров и накопленного состояния: кадр из середины ролика совпадает с кадром при проигрывании подряд.
//
// Роллер: <span class="num" data-roll="t0,t1,3000[,from]"> - каждая цифра крутит свой барабан вверх (smootherstep) и встает на место,
//   разряды останавливаются слева направо, последний - к t1. Смаз по вертикали пропорционален скорости. Кадр 0 уже показывает цифры from (по умолчанию 0).
//   class="roll cells" - каждая цифра в своей ячейке (карточка --card с обводкой --ring).
// Курсор: у сцены data-cur="ключ; ключ; ...", ключ - "t цель [действие] [d]":
//   "t x,y" или "t #id" - путь к точке или к центру элемента по плавной дуге за d (по умолчанию .75 с); первый ключ - курсор проявляется на месте;
//   "t #id click" - путь, пауза наведения, клик (сжатие курсора до .92). Цель получает --hover, --press и --done (0..1, смена состояния за .35 с после клика), с момента клика - класс .cur-done;
//   "t #chip drag #slot" - путь к #chip, захват, перенос по дуге к #slot (еще d), чип приподнят сдвигом и тенью (--lift), без масштаба.
//     Слот (элемент с той же разметкой, что чип) до drop - пунктирная рамка .cur-slot, при подлете подсвечивается (--hover), при drop
//     чип скрывается, слот заполняется (.cur-full). Места в макете чип и слот держат все время: соседи не прыгают.
//   "t hide" - курсор плавно исчезает. Не совмещать с data-float на чипе (оба пишут свойство translate).
// Перецентровка: data-grow="y|x|xy" у контейнера - пока его дети появляются, видимая часть группы стоит по центру места всей группы,
//   с каждым новым ребенком группа плавно (.6 с) съезжает (свойство translate). Время ребенка: data-at, иначе data-in,
//   иначе самый ранний data-in/data-t0 внутри. После появления всех детей сдвиг 0 - камера data-camk целится в итоговый макет.
// Связь: data-link="#from[,t0[,d]]" у карточки (несколько источников через пробел: "#a #b #c") - пунктирная кривая от #from к ней рисуется за d (.45 с) с t0 (по умолчанию data-in карточки - .4):
//   линия доходит, и на ее конце появляется карточка. Цель ниже - кривая сверху вниз (дерево), сбоку - слева направо (флоу).
//   Концы считаются в каждом кадре от макета (с учетом data-grow), линия лежит под контентом сцены. Цвет --mut.
(()=>{
  const $$=(q,r=document)=>[...r.querySelectorAll(q)];
  const num=s=>String(s).split(',').map(Number);
  const clamp=x=>Math.max(0,Math.min(1,x));
  const S=x=>x*x*x*(x*(6*x-15)+10);
  const dS=x=>30*x*x*(x-1)*(x-1);   // производная smootherstep: скорость барабана для смаза
  const lerp=(a,b,k)=>a+(b-a)*k;
  const CAM=()=>window.P5E?P5E.role.cam:S;
  const RH=1.1;   // высота строки барабана, em

  document.head.insertAdjacentHTML('beforeend','<style>'+
    '.roll{display:inline-flex;align-items:center;white-space:nowrap}'+
    '.roll .rd{display:inline-block;color:inherit;background:none;box-shadow:none}.roll .rw{display:block;height:'+RH+'em;overflow:hidden;'+
      'mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent);-webkit-mask-image:linear-gradient(transparent,#000 14%,#000 86%,transparent)}'+
    '.roll .rc{display:block;will-change:transform}.roll .rc>span{display:block;height:'+RH+'em;line-height:'+RH+'em;text-align:center}'+
    '.roll.cells{gap:.1em}.roll.cells .rd{padding:.04em .1em;border-radius:.16em;background:var(--card);box-shadow:0 0 0 3px var(--ring)}'+
    '.p5-cur{position:absolute;left:0;top:0;width:64px;height:64px;z-index:60;pointer-events:none;transform-origin:6px 5px;opacity:0;'+
      'filter:drop-shadow(0 6px 10px rgba(0,0,0,.28))}'+
    '.p5-cur svg{display:block;width:100%;height:100%}'+
    '.cur-drag{position:relative}'+
    '.cur-slot:not(.cur-full){color:transparent!important;background:transparent!important;box-shadow:none!important;'+
      'outline:3px dashed color-mix(in srgb,var(--acc) calc(100%*var(--hover,0)),var(--mut));outline-offset:-3px}'+
    '.cur-slot:not(.cur-full) *{visibility:hidden}'+
    '</style>');

  // ---- роллер ----
  const svgNS='http://www.w3.org/2000/svg';let defs=null;
  function filter(id){if(!defs){const s=document.createElementNS(svgNS,'svg');s.setAttribute('width','0');s.setAttribute('height','0');
      s.style.position='absolute';defs=document.createElementNS(svgNS,'defs');s.appendChild(defs);document.body.appendChild(s)}
    const f=document.createElementNS(svgNS,'filter');f.id=id;['x','y','width','height'].forEach((k,i)=>f.setAttribute(k,['-10%','-50%','120%','200%'][i]));
    const g=document.createElementNS(svgNS,'feGaussianBlur');g.setAttribute('stdDeviation','0 0');f.appendChild(g);defs.appendChild(f);return g}
  const rolls=$$('[data-roll]').map((el,k)=>{
    const [a,b,to,from=0]=num(el.dataset.roll),fs=String(Math.round(to)),n=fs.length,ss=String(Math.round(from)).padStart(n,'0').slice(-n);
    const st=Math.min(.25,(b-a)*.15);el.classList.add('roll');el.textContent='';
    if(!el.hasAttribute('data-safe'))el.dataset.safe='';   // проверка safe zone меряет рамку барабанов, а не строки за маской
    const ds=[...fs].map((ch,i)=>{const f=+ch,s=+ss[i],steps=Math.min(i+1,3)*10+(f-s+10)%10;   // правые разряды крутятся дольше
      const rd=document.createElement('span'),rw=document.createElement('span'),rc=document.createElement('span');rd.className='rd';rw.className='rw';rc.className='rc';
      rc.innerHTML=Array.from({length:steps+1},(_,j)=>`<span>${(s+j)%10}</span>`).join('');rw.appendChild(rc);rd.appendChild(rw);el.appendChild(rd);
      return {rc,rows:[...rc.children],steps,end:b-(n-1-i)*st,id:`p5rb${k}_${i}`,fe:filter(`p5rb${k}_${i}`)}});
    return {el,a,b,ds,px:0}});
  function roll(t){for(const r of rolls){if(!r.px)r.px=parseFloat(getComputedStyle(r.el).fontSize)*RH;
    for(const d of r.ds){const dur=Math.max(.05,d.end-r.a),p=clamp((t-r.a)/dur);
      // в макете только строки у окна (в покое - одна цифра): проверки планировки не видят барабан за маской
      const k=d.steps*S(p),f=Math.floor(k),lo=k===f?f:Math.max(0,f-1),hi=k===f?f:Math.min(d.steps,f+2);
      d.rc.style.transform=k===lo?'':`translateY(${(-(k-lo)*RH).toFixed(4)}em)`;
      d.rows.forEach((r,j)=>{const v=j>=lo&&j<=hi?'':'none';if(r.style.display!==v)r.style.display=v});
      const sig=p>0&&p<1?Math.min(12,d.steps*dS(p)/dur*r.px/30*.35):0;   // смаз ~ треть пути за кадр
      d.fe.setAttribute('stdDeviation',`0 ${sig.toFixed(2)}`);d.rc.style.filter=sig>.2?`url(#${d.id})`:''}}}

  // ---- перецентровка ----
  const timeOf=c=>{const v=c.dataset.at??c.dataset.in;if(v!=null)return +v;
    const ts=$$('[data-in],[data-t0]',c).map(e=>+(e.dataset.in??e.dataset.t0));return ts.length?Math.min(...ts):-1e9};
  const groups=$$('[data-grow]').map(g=>{if(getComputedStyle(g).position==='static')g.style.position='relative';
    return {g,ax:g.dataset.grow||'y',kids:[...g.children].map(c=>({c,t:timeOf(c)})).sort((x,y)=>x.t-y.t),key:''}});
  function grow(g,t){if(!g.g.offsetHeight){g.dx=g.dy=0;return}
    const key=document.fonts.status+':'+document.fonts.size;
    if(g.key!==key){g.key=key;g.kids.forEach(k=>k.r=[k.c.offsetLeft,k.c.offsetTop,k.c.offsetLeft+k.c.offsetWidth,k.c.offsetTop+k.c.offsetHeight])}
    const all=g.kids.reduce((m,k)=>[Math.min(m[0],k.r[0]),Math.min(m[1],k.r[1]),Math.max(m[2],k.r[2]),Math.max(m[3],k.r[3])],[1e9,1e9,-1e9,-1e9]);
    let v=null;for(const k of g.kids){const e=S(clamp((t-k.t)/.6));
      if(!v){v=[...k.r];continue}if(e<=0)break;
      v=[lerp(v[0],Math.min(v[0],k.r[0]),e),lerp(v[1],Math.min(v[1],k.r[1]),e),lerp(v[2],Math.max(v[2],k.r[2]),e),lerp(v[3],Math.max(v[3],k.r[3]),e)]}
    g.dx=g.ax.includes('x')&&v?(all[0]+all[2]-v[0]-v[2])/2:0;g.dy=g.ax.includes('y')&&v?(all[1]+all[3]-v[1]-v[3])/2:0;
    g.g.style.translate=g.dx||g.dy?`${g.dx.toFixed(2)}px ${g.dy.toFixed(2)}px`:''}

  // ---- курсор ----
  // точка элемента в координатах сцены без transform (входы не сбивают прицел) + текущие сдвиги групп data-grow
  // кончик курсора - правее и ниже центра (28% и 20% размера): стрелка не закрывает подпись цели
  function center(el,sec){let X=el.offsetWidth*.78,Y=el.offsetHeight*.7;
    for(let n=el;n&&n!==sec;n=n.offsetParent){X+=n.offsetLeft;Y+=n.offsetTop}
    for(let n=el.parentElement;n&&n!==sec;n=n.parentElement){const g=n._p5g;if(g){X+=g.dx||0;Y+=g.dy||0}}
    return [X,Y]}
  groups.forEach(g=>g.g._p5g=g);
  const ARROW='<svg viewBox="0 0 32 32"><path d="M3 2.5v23.6l6.3-5.9 4.1 9.3 4.3-1.9-4-9.1h8.7z" fill="var(--plain-l,#fff)" stroke="var(--plain-d,#121212)" stroke-width="2" stroke-linejoin="round"/></svg>';
  const curs=$$('section[data-cur]').map(sec=>{
    const keys=sec.dataset.cur.split(';').map(k=>k.trim()).filter(Boolean).map(k=>{const w=k.split(/\s+/),o={t:+w[0],tg:w[1],act:'',d:.75};
      if(w[2]==='click')o.act='click';else if(w[2]==='drag'){o.act='drag';o.to=w[3]}
      const last=+w[w.length-1];if(w.length>2&&!isNaN(last)&&w[w.length-1]!==w[0])o.d=last;return o});
    const el=document.createElement('div');el.className='p5-cur';el.dataset.safe='ignore';el.innerHTML=ARROW;sec.appendChild(el);
    const q=s=>s&&s[0]=='#'?sec.querySelector(s):null;
    keys.forEach(k=>{k.el=q(k.tg);k.toEl=q(k.to);if(k.toEl)k.toEl.classList.add('cur-slot');if(k.act==='drag'&&k.el)k.el.classList.add('cur-drag')});
    return {sec,el,keys}});
  const pt=(c,s)=>/^[\d.]+,[\d.]+$/.test(s)?num(s):(c.sec.querySelector(s)?center(c.sec.querySelector(s),c.sec):null);
  // путь по дуге: контрольная точка смещена вверх от середины на 15% длины
  function arc(A,B,p){const mx=(A[0]+B[0])/2,my=(A[1]+B[1])/2,dx=B[0]-A[0],dy=B[1]-A[1],L=Math.hypot(dx,dy)||1;
    let nx=-dy/L,ny=dx/L;if(ny>0){nx=-nx;ny=-ny}const C=[mx+nx*L*.15,my+ny*L*.15],u=1-p;
    return [u*u*A[0]+2*u*p*C[0]+p*p*B[0],u*u*A[1]+2*u*p*C[1]+p*p*B[1]]}
  const pressAt=d=>d<0?0:d<.1?S(d/.1):1-S(clamp((d-.1)/.25));   // клик: нажатие .1 с, возврат .25 с
  function cursor(c,t){if(c.sec.style.display==='none')return;const E=CAM();
    let pos=null,op=0,pr=0,hov=new Map(),press=new Map();
    const setH=(el,v)=>{if(el)hov.set(el,Math.max(hov.get(el)||0,v))};
    for(let i=0;i<c.keys.length;i++){const k=c.keys[i],nx=c.keys[i+1],tn=nx?nx.t:1e9;
      if(k.tg==='hide'){if(t>=k.t)op*=1-S(clamp((t-k.t)/.25));continue}
      if(t<k.t)break;
      const B=pt(c,k.tg);if(!B)continue;
      if(!pos){pos=B;op=S(clamp((t-k.t)/.25))}
      else{const p=E(clamp((t-k.t)/k.d));pos=arc(pos,B,p)}
      const arr=k.t+k.d,away=1-S(clamp((t-tn)/.2));
      if(k.act==='click'){setH(k.el,S(clamp((t-arr+.15)/.2))*away);const pp=pressAt(t-arr-.12);pr=Math.max(pr,pp);if(k.el)press.set(k.el,pp)}
      if(k.act==='drag'&&k.el){const g=arr+.12,go=g+.2,B2=k.toEl?center(k.toEl,c.sec):B,drop=go+k.d;
        setH(k.el,S(clamp((t-arr+.15)/.2))*(1-S(clamp((t-g)/.15))));
        pr=Math.max(pr,t>=g&&t<drop?S(clamp((t-g)/.1)):t>=drop?1-S(clamp((t-drop)/.2)):0);
        if(t>=go){const p=E(clamp((t-go)/k.d));pos=arc(B,B2,p);setH(k.toEl,S(clamp((p-.55)/.4))*(t<drop?1:0))}
        // чип едет за курсором от точки захвата, при drop его место в слоте занимает слот
        const lift=t<g?0:t<go?S((t-g)/.2):1-S(clamp((t-go-k.d*.8)/(k.d*.2)));
        const off=t>=go?[pos[0]-B[0],pos[1]-B[1]-8*lift]:[0,-8*lift];
        k.el.style.setProperty('--lift',lift.toFixed(3));k.el.style.filter=lift>.001?`drop-shadow(0 ${(14*lift).toFixed(1)}px ${(14*lift).toFixed(1)}px rgba(0,0,0,${(.3*lift).toFixed(3)}))`:'';   // тень только в полете: filter у стекла ломает backdrop-filter
        const done=t>=drop;k.el.style.translate=done||(!off[0]&&!off[1])?'':`${off[0].toFixed(2)}px ${off[1].toFixed(2)}px`;
        k.el.style.visibility=done?'hidden':'';if(k.toEl)k.toEl.classList.toggle('cur-full',done);
        let top=k.el;while(top.parentElement&&top.parentElement!==c.sec)top=top.parentElement;top.style.zIndex=t>=g&&!done?'5':''}}
    // состояния целей пишутся в каждом кадре, а не копятся
    for(const k of c.keys){for(const el of [k.el,k.toEl])if(el){el.style.setProperty('--hover',(hov.get(el)||0).toFixed(3))}
      if(k.act==='click'&&k.el){k.el.style.setProperty('--press',(press.get(k.el)||0).toFixed(3));const tc=k.t+k.d+.12;k.el.classList.toggle('cur-done',t>=tc);k.el.style.setProperty('--done',S(clamp((t-tc)/.35)).toFixed(3))}}
    c.el.style.opacity=pos?op.toFixed(3):0;
    if(pos)c.el.style.transform=`translate(${(pos[0]-6).toFixed(2)}px,${(pos[1]-5).toFixed(2)}px) scale(${(1-.08*pr).toFixed(4)})`}

  // ---- связи ----
  const box=(el,sec)=>{const [cx,cy]=center(el,sec),w=el.offsetWidth,h=el.offsetHeight;const x=cx-w*.78,y=cy-h*.7;return [x,y,w,h]};
  let lk=0;
  const links=$$('[data-link]').flatMap(el=>{const sec=el.closest('section');if(!sec)return [];const [sel,a,d]=el.dataset.link.split(',');
    return sel.trim().split(/\s+/).map(q=>{const from=sec.querySelector(q);if(!from)return null;const i=lk++;
    let svg=sec.querySelector(':scope>svg.p5-links');
    if(!svg){svg=document.createElementNS(svgNS,'svg');svg.setAttribute('class','p5-links');svg.setAttribute('width','1080');svg.setAttribute('height','1920');
      svg.dataset.safe='ignore';svg.style.cssText='position:absolute;left:0;top:0;z-index:1;pointer-events:none;overflow:visible';
      const bg=sec.querySelector(':scope>.bg,:scope>.wall-bg,:scope>.p5-deco');bg?bg.after(svg):sec.prepend(svg)}
    const id='p5lk'+i,m=document.createElementNS(svgNS,'mask'),mp=document.createElementNS(svgNS,'path'),vp=document.createElementNS(svgNS,'path');
    m.id=id;m.setAttribute('maskUnits','userSpaceOnUse');m.setAttribute('x','-200');m.setAttribute('y','-200');m.setAttribute('width','1480');m.setAttribute('height','2320');
    mp.setAttribute('fill','none');mp.setAttribute('stroke','#fff');mp.setAttribute('stroke-width','14');mp.setAttribute('pathLength','1');mp.setAttribute('stroke-dasharray','1 1');
    vp.setAttribute('fill','none');vp.setAttribute('stroke','var(--mut)');vp.setAttribute('stroke-width','4');vp.setAttribute('stroke-linecap','round');vp.setAttribute('stroke-dasharray','1 13');vp.setAttribute('mask',`url(#${id})`);
    m.appendChild(mp);svg.appendChild(m);svg.appendChild(vp);
    const t0=a!=null&&a!==''?+a:+(el.dataset.in??el.dataset.at??0)-.4;
    return {el,from,sec,mp,vp,t0,d:d?+d:.45}}).filter(Boolean)});
  function link(L,t){if(L.sec.style.display==='none')return;const p=S(clamp((t-L.t0)/L.d));
    if(p<=0){L.vp.style.display='none';return}L.vp.style.display='';
    const [ax,ay,aw,ah]=box(L.from,L.sec),[bx,by,bw,bh]=box(L.el,L.sec),G=10;
    const acx=ax+aw/2,acy=ay+ah/2,bcx=bx+bw/2,bcy=by+bh/2;let P;
    if(by>=ay+ah-4){const y1=ay+ah+G,y2=by-G,k=(y2-y1)*.55;P=`M${acx},${y1}C${acx},${y1+k} ${bcx},${y2-k} ${bcx},${y2}`}
    else if(by+bh<=ay+4){const y1=ay-G,y2=by+bh+G,k=(y1-y2)*.55;P=`M${acx},${y1}C${acx},${y1-k} ${bcx},${y2+k} ${bcx},${y2}`}
    else{const r=bcx>acx,x1=r?ax+aw+G:ax-G,x2=r?bx-G:bx+bw+G,k=(x2-x1)*.5;P=`M${x1},${acy}C${x1+k},${acy} ${x2-k},${bcy} ${x2},${bcy}`}
    L.vp.setAttribute('d',P);L.mp.setAttribute('d',P);L.mp.setAttribute('stroke-dashoffset',(1-p).toFixed(4))}

  const prev=window.hook;
  window.hook=t=>{
    roll(t);for(const g of groups)grow(g,t);for(const L of links)link(L,t);for(const c of curs)cursor(c,t);
    prev&&prev(t)};
  window.P5M={events:()=>{const ev=rolls.map(r=>[r.a,r.b]).concat(links.map(L=>[L.t0,L.t0+L.d]));
    for(const c of curs)for(const k of c.keys)if(k.tg!=='hide')ev.push([k.t,k.t+(k.act==='drag'?2*k.d+.32:k.d+(k.act==='click'?.5:0))]);return ev}};
})();
