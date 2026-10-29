// Optional endpoint framing solver. Pure functions: no DOM, clock or frame history.
(() => {
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=x=>x*x*x*(x*(6*x-15)+10);
  const mix=(a,b,p)=>({scale:a.scale+(b.scale-a.scale)*p,x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p,fits:a.fits&&b.fits});
  function solve(rects, requestedScale, zone, focus) {
    if (!rects.length || !Number.isFinite(requestedScale) || requestedScale < 1 ||
      ![zone.left,zone.right,zone.top,zone.bottom].every(Number.isFinite) || zone.right<=zone.left || zone.bottom<=zone.top ||
      rects.some(r=>![r.left,r.right,r.top,r.bottom].every(Number.isFinite) || r.right<=r.left || r.bottom<=r.top) ||
      focus && (!Array.isArray(focus) || !focus.slice(0,2).every(Number.isFinite))) throw new Error('P5Camera: invalid framing geometry');
    const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right)),top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));
    const max=Math.min((zone.right-zone.left)/(right-left),(zone.bottom-zone.top)/(bottom-top));
    const scale=Math.max(1,Math.min(requestedScale,max)),[cx,cy]=focus??[(left+right)/2,(top+bottom)/2],zoom=clamp((scale-1)/.08,0,1);
    const desiredX=cx+((zone.left+zone.right)/2-cx)*zoom-cx*scale;
    const desiredY=cy+((zone.top+zone.bottom)/2-cy)*.3*zoom-cy*scale;
    // Also cover the whole 1080x1920 canvas: no exposed stripe at a transition endpoint.
    const minX=Math.max(zone.left-left*scale,1080*(1-scale)),maxX=Math.min(zone.right-right*scale,0);
    const minY=Math.max(zone.top-top*scale,1920*(1-scale)),maxY=Math.min(zone.bottom-bottom*scale,0);
    return {scale,x:clamp(desiredX,minX,maxX),y:clamp(desiredY,minY,maxY),fits:max>=1&&minX<=maxX+1e-6&&minY<=maxY+1e-6};
  }
  function track({rects,zone,keys,time,punch=[]}) {
    const center=[(zone.left+zone.right)/2,(zone.top+zone.bottom)/2];
    let pose=solve(rects,1,zone,center),accent=solve(rects,1.02,zone,center);
    for(const key of keys){
      if(time<key.time)break;
      const p=(key.ease??smooth)(clamp((time-key.time)/key.duration,0,1));
      pose=mix(pose,solve(rects,key.scale,zone,key.focus),p);
      accent=mix(accent,solve(rects,key.scale*1.02,zone,key.focus),p);
    }
    let strength=0;
    for(const k of punch){const d=time-k.t;if(d>=0&&d<1.8)strength=Math.max(strength,clamp(k.a/.02,0,1)*(d<.5?smooth(d/.5):1-smooth(clamp((d-.5)/1.3,0,1))))}
    return mix(pose,accent,strength);
  }
  globalThis.P5Camera=Object.freeze({solve,track});
})();
