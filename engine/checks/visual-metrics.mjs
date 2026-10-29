// Conservative contrast math for opaque DOM surfaces. Images/glass remain unmeasured.
export function contrast(fg,bg) {
  const luminance=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
export function cameraSamples(start,end,key,transition=0) {
  const at=Math.max(key.time,start+transition),finish=Math.min(at+key.duration,end-1/30);
  if(finish<at)return [];
  return [...new Set([at,at+1/30,...[.25,.5,.75,1].map(k=>at+(finish-at)*k)])].filter(t=>t<end).sort((a,b)=>a-b);
}
// Runs inside the browser through page.evaluate. Return samples, not an aesthetic score.
export function inspectSurfaces() {
  const samples=[],unknown=[],small=[],overflow=[];
  const rgba=value=>{const m=value.match(/^rgba?\(([^)]+)\)$/);if(!m)return null;const n=m[1].split(/[ ,/]+/).map(Number);return n.length>=3&&n.every(Number.isFinite)?[...n.slice(0,3),n[3]??1]:null};
  for(const s of document.querySelectorAll('section')) {
    if(getComputedStyle(s).display==='none')continue;
    const w=document.createTreeWalker(s,NodeFilter.SHOW_TEXT);
    while(w.nextNode()) {
      const n=w.currentNode,el=n.parentElement,text=n.textContent.trim();
      if(!text || !el || el.closest('svg,[data-safe="ignore"],script,style'))continue;
      let visible=true,opacity=1,uncertain=false,bg=null;
      for(let p=el;p;p=p.parentElement) {
        const c=getComputedStyle(p);opacity*=+c.opacity;
        if(c.display==='none'||c.visibility==='hidden'){visible=false;break}
        if(c.filter!=='none' || c.backdropFilter!=='none')uncertain=true;
        if(!bg){if(c.backgroundImage!=='none'||p.classList.contains('wall')||p.classList.contains('glass'))uncertain=true;
          const color=rgba(c.backgroundColor);if(color?.[3]===1)bg=color;else if(color?.[3]>0)uncertain=true;}
      }
      if(!visible||opacity<.9)continue;
      const c=getComputedStyle(el),fg=rgba(c.color),size=parseFloat(c.fontSize),weight=parseFloat(c.fontWeight);
      const label={element:el.id||el.className||el.tagName,text:text.slice(0,60)};
      if(size<30)small.push({...label,size});
      if(el.clientWidth>0&&el.scrollWidth>el.clientWidth+2&&c.overflowX!=='visible')overflow.push(label);
      if(!bg||!fg||uncertain){unknown.push(label);continue}
      const color=fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
      samples.push({...label,fg:color,bg:bg.slice(0,3),minimum:size>=72||size>=56&&weight>=700?3:4.5});
    }
  }
  return {samples,unknown,small,overflow};
}
