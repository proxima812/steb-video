// Кривые движения пресета default (с ролика 37). Подключать до runtime/engine.js: <script src="runtime/p5-ease.js"></script>.
// Все кривые: f(0)=0, f(1)=1, нулевая скорость в первом кадре (рывка нет), без отскока (f не выходит за 1).
//   soft  - smootherstep: симметричный разгон и торможение (так двигался мир до ролика 37; переходы сцен)
//   glide - пружина без отскока, как spring({bounce:0}) в Motion, но 3-го порядка: стартует без рывка,
//           к 30% времени проходит половину пути и долго мягко доезжает. Входы элементов и слов
//   cine  - асимметричный cubic-bezier(.45,0,.2,1): мягкий старт, половина пути к 37% времени, длинное торможение. Камера, графики, счетчики
//           (пиковая скорость 2.9 от средней; .6,0,.15,1 давал 3.8 - motion-check видел рывки на шторках)
//   quint / expo - inOutQuint / inOutExpo из Anime.js: «киношный» пролет для длинных движений камеры
// Выбор: data-ease="glide" у элемента; у ключа камеры - 5-е поле data-camk; на <body data-ease="soft"> или ?ease=soft -
// все по-старому (сравнение «было / стало»). window.P5E.get(имя) - кривая по имени.
(()=>{
  const cl=x=>x<0?0:x>1?1:x;
  const soft=x=>(x=cl(x),x*x*x*(x*(6*x-15)+10));
  // гамма-распределение k=3: x(τ)=1-(1+wτ+(wτ)²/2)e^{-wτ}, нормировано к 1 в τ=1. Скорость и ускорение в старте - ноль
  const gamma=(w,k)=>{const f=x=>{let s=0,a=1;for(let i=0;i<k;i++){s+=a;a*=w*x/(i+1)}return 1-s*Math.exp(-w*x)},n=f(1);return x=>(x=cl(x),x<=0?0:x>=1?1:f(x)/n)};
  // cubic-bezier: решаем x(s)=t методом Ньютона с запасным делением пополам (как в CSS и Anime.js)
  const bezier=(x1,y1,x2,y2)=>{const A=(a,b)=>1-3*b+3*a,B=(a,b)=>3*b-6*a,C=a=>3*a;
    const at=(s,a,b)=>((A(a,b)*s+B(a,b))*s+C(a))*s,sl=(s,a,b)=>3*A(a,b)*s*s+2*B(a,b)*s+C(a);
    return x=>{x=cl(x);if(x===0||x===1)return x;let s=x;for(let i=0;i<8;i++){const d=sl(s,x1,x2);if(Math.abs(d)<1e-6)break;const e=at(s,x1,x2)-x;if(Math.abs(e)<1e-7)return at(s,y1,y2);s-=e/d}
      let lo=0,hi=1;s=x;for(let i=0;i<40;i++){const e=at(s,x1,x2)-x;if(Math.abs(e)<1e-7)break;e>0?hi=s:lo=s;s=(lo+hi)/2}return at(s,y1,y2)}};
  const A=window.anime;   // Anime.js v4 (node_modules/animejs/dist/bundles/anime.umd.min.js), если подключен
  const quint=A?.eases?.inOutQuint?(f=>x=>f(cl(x)))(A.eases.inOutQuint):x=>(x=cl(x),x<.5?16*x**5:1-(-2*x+2)**5/2);
  const expo=A?.eases?.inOutExpo?(f=>x=>f(cl(x)))(A.eases.inOutExpo):x=>(x=cl(x),x===0||x===1?x:x<.5?2**(20*x-10)/2:(2-2**(-20*x+10))/2);
  const C={soft,glide:gamma(9,3),cine:A?.cubicBezier?(f=>x=>f(cl(x)))(A.cubicBezier(.45,0,.2,1)):bezier(.45,0,.2,1),quint,expo,linear:cl};
  const old=document.body?.dataset.ease==='soft'||/[?&]ease=soft/.test(location.search);
  // роли: вход элемента, слово, камера, переход сцены, рисование и счетчики. Длительности под кривую - в D.
  // Переход сцены остается smootherstep: шторка и круг идут через весь кадр, любая более крутая кривая дает скачок в середине
  const role=old?{enter:soft,word:soft,cam:soft,tr:soft,draw:soft}:{enter:C.glide,word:C.glide,cam:C.cine,tr:soft,draw:C.cine};
  window.P5E={...C,bezier,gamma,role,old,get:(n,def=soft)=>n&&C[n]||def,
    D:old?{enter:.6,word:.5}:{enter:.8,word:.7}};
})();
