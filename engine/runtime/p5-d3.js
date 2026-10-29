// Графики D3 в мире p5w (с ролика 37): только математика D3 (d3-scale, d3-shape, d3-interpolate), анимацию делает движок от t.
// Подключение: <script src="runtime/p5-d3.js"></script> после UMD-модулей D3 (порядок важен):
//   node_modules/d3-array/dist/d3-array.min.js, d3-color, d3-interpolate, d3-format, d3-time, d3-time-format, d3-scale, d3-path, d3-shape
// d3-transition и d3-timer не подключаем: они работают на таймерах.
//   const P=P5D3.plot(svg,{x:[-3,3],y:[-1,9],pad:[30,30,60,70]})  // svg с viewBox; поля: сверху, справа, снизу, слева
//   P.X(x), P.Y(y)               - шкалы d3.scaleLinear
//   P.fn(f,[a,b],n)              - путь графика функции (d3.line, сглаживание curveMonotoneX)
//   P.lerpFn(f,g,k)              - промежуточная функция между f и g (переход графика в график по d3-interpolate)
//   P.axes({xt:[..],yt:[..]})    - оси и подписи Google Sans цветами комнаты (возвращает разметку)
//   P.tangent(f,x0,len)          - отрезок касательной в точке x0 длиной len px: [x1,y1,x2,y2] в px
(()=>{
  const d3=window.d3;if(!d3?.scaleLinear||!d3?.line){console.warn('p5-d3: модули D3 не подключены');return}
  const NS='http://www.w3.org/2000/svg';
  function plot(svg,{x,y,pad=[30,30,60,70]}){
    const vb=svg.viewBox.baseVal,W=vb.width,H=vb.height,[pt,pr,pb,pl]=pad;
    const X=d3.scaleLinear().domain(x).range([pl,W-pr]),Y=d3.scaleLinear().domain(y).range([H-pb,pt]);
    const line=d3.line().x(p=>X(p[0])).y(p=>Y(p[1])).curve(d3.curveMonotoneX);
    const fn=(f,[a,b]=x,n=160)=>line(d3.range(n+1).map(i=>{const v=a+(b-a)*i/n;return [v,f(v)]}));
    const lerpFn=(f,g,k)=>v=>d3.interpolateNumber(f(v),g(v))(k);
    const d=1e-4,slope=(f,v)=>(f(v+d)-f(v-d))/(2*d);
    // длина отрезка в пикселях одинакова при любом наклоне
    const tangent=(f,x0,len)=>{const m=slope(f,x0),sx=X(1)-X(0),sy=Y(0)-Y(1),dx=len/2/(sx*Math.hypot(1,m*sy/sx));
      return [X(x0-dx),Y(f(x0)-m*dx),X(x0+dx),Y(f(x0)+m*dx)]};
    const axes=({xt=X.ticks(5),yt=Y.ticks(5),xl='x',yl='',grid=false}={})=>{
      let s=`<g class="p5ax">`;
      if(grid)for(const v of xt)s+=`<line class="p5grid" x1="${X(v)}" x2="${X(v)}" y1="${pt}" y2="${H-pb}"/>`;
      s+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(Math.max(y[0],Math.min(y[1],0)))}" y2="${Y(Math.max(y[0],Math.min(y[1],0)))}"/>`;
      s+=`<line x1="${X(Math.max(x[0],Math.min(x[1],0)))}" x2="${X(Math.max(x[0],Math.min(x[1],0)))}" y1="${pt}" y2="${H-pb}"/>`;
      for(const v of xt)s+=`<text x="${X(v)}" y="${H-pb+44}" text-anchor="middle">${v}</text>`;
      for(const v of yt)s+=`<text x="${pl-16}" y="${Y(v)+11}" text-anchor="end">${v}</text>`;
      if(xl)s+=`<text x="${W-pr}" y="${H-pb+44}" text-anchor="end" class="p5axl">${xl}</text>`;
      return s+'</g>'};
    return {svg,X,Y,fn,lerpFn,slope,tangent,axes,W,H};
  }
  const el=(tag,attrs={},parent)=>{const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);parent&&parent.appendChild(e);return e};
  window.P5D3={plot,el,d3};
})();
