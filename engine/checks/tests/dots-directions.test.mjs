import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openPage,ENGINE} from '../../pipeline/video-tools.mjs';

test('dots direction, endpoints, legacy geometry and arbitrary seek',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dots-direction-'));
  const file=path.join(dir,'fixture.html');
  let html=await fs.readFile(path.join(ENGINE,'templates/template.html'),'utf8');
  html=html.replace('<base href="../../engine/">',`<base href="${pathToFileURL(ENGINE+'/').href}">`);
  html=html.slice(0,html.indexOf('<section'))+
    '<section class="s black" data-s="0" data-e="3"></section>'+ 
    '<section id="next" class="s white" data-s="3" data-e="6" data-tr="dots"></section>'+
    html.slice(html.indexOf('<script src="node_modules/animejs'));
  await fs.writeFile(file,html);
  const {browser,page,errors}=await openPage(file);
  try {
    assert.deepEqual(errors,[]);
    for(const direction of ['right','up','left','down'])await t.test(direction,async()=>{
      const result=await page.evaluate(direction=>{
        const scene=document.getElementById('next');scene.dataset.dotsDir=direction;
        const capture=time=>{render(time);return [...document.querySelectorAll('canvas')].find(c=>c.style.zIndex==='40')};
        const regions=time=>{
          const c=capture(time),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
          const sums={left:0,right:0,top:0,bottom:0};
          for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
            const a=d[(y*c.width+x)*4+3];
            if(x<c.width/4)sums.left+=a;if(x>=c.width*3/4)sums.right+=a;
            if(y<c.height/4)sums.top+=a;if(y>=c.height*3/4)sums.bottom+=a;
          }return sums;
        };
        const enter=regions(3.18),exit=regions(3.63);
        const first=capture(3.18).toDataURL();
        capture(5);capture(0);const reverse=capture(3.18).toDataURL();
        const repeat=capture(3.18).toDataURL();
        for(let n=0;n<=95;n++)capture(n/30);
        const sequential=capture(3.18).toDataURL();
        const alpha=time=>{const c=capture(time);const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let min=255,max=0;for(let i=3;i<d.length;i+=4){min=Math.min(min,d[i]);max=Math.max(max,d[i])}return {min,max}};
        const start=alpha(3),middle=alpha(3.45),end=alpha(3.9+1e-6);
        return {enter,exit,deterministic:first===reverse&&first===repeat&&first===sequential,start,middle,end,hidden:capture(4).style.display==='none'};
      },direction);
      const [from,to]={right:['left','right'],left:['right','left'],up:['bottom','top'],down:['top','bottom']}[direction];
      assert.ok(result.enter[from]>result.enter[to]*3,JSON.stringify(result.enter));
      assert.ok(result.exit[from]<result.exit[to]/3,JSON.stringify(result.exit));
      assert.equal(result.start.max,0);assert.equal(result.middle.min,255);
      assert.equal(result.end.max,0);assert.ok(result.hidden);assert.ok(result.deterministic);
    });
    await t.test('missing or unknown direction preserves original diagonal geometry',async()=>{
      const result=await page.evaluate(()=>{
        const scene=document.getElementById('next');
        render(3);
        const canvas=[...document.querySelectorAll('canvas')].find(c=>c.style.zIndex==='40');
        const ctx=canvas.getContext('2d'),arc=ctx.arc;
        const sample=(time,direction)=>{
          if(direction===null)delete scene.dataset.dotsDir;else scene.dataset.dotsDir=direction;
          const actual=[];
          ctx.arc=function(...args){actual.push(args);return arc.apply(this,args)};
          try{render(time)}finally{ctx.arc=arc}
          const expected=[],e=(time-3)/.9,ph=e<.5?e/.5:(e-.5)/.5;
          const S=x=>x*x*x*(x*(6*x-15)+10),clamp=x=>Math.max(0,Math.min(1,x));
          for(let j=0;j<64;j++)for(let i=0;i<36;i++){
            const v=Math.sin(i*127.1+j*311.7)*43758.5453;
            const dl=.45*(i/36*.4+j/64*.6)+.15*(v-Math.floor(v));
            const g=S(clamp((ph-dl)/.4)),r=22*(e<.5?g:1-g);
            if(r>.3)expected.push([i*30+15,j*30+15,r,0,6.2832]);
          }
          return actual.length===expected.length&&actual.every((a,i)=>a.every((v,j)=>Math.abs(v-expected[i][j])<1e-9));
        };
        return [3.05,3.18,3.44,3.45,3.63,3.899].every(time=>sample(time,null)&&sample(time,'unknown'));
      });
      assert.ok(result);
    });
  } finally {await browser.close();await fs.rm(dir,{recursive:true,force:true})}
});
