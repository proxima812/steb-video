import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openPage,ENGINE} from '../../pipeline/video-tools.mjs';
const root=path.dirname(ENGINE);
const demo=path.join(root,'video/12-motion-direction-demo/v.html');
test('IR applies existing runtime attributes; validator catches subsequent HTML drift',async()=>{
 const {browser,page,errors}=await openPage(demo);
 try {assert.deepEqual(errors,[]);const r=await page.evaluate(()=>{render(13.8);const d=JSON.parse(document.getElementById('scene-direction').textContent),before=P5Direction.verify(d);document.getElementById('result').dataset.in='10';return {before,after:P5Direction.verify(d),result:getComputedStyle(document.getElementById('result')).opacity}});assert.equal(r.before.ok,true);assert.equal(r.after.ok,false);assert.ok(r.after.errors.some(e=>e.code==='direction-drift'));assert.ok(+r.result>.9)}finally{await browser.close()}
});
test('avatar fading is idempotent and reversible without data-in',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'p5-seek-'));const file=path.join(dir,'fixture.html');
 let html=await fs.readFile(path.join(ENGINE,'templates/template.html'),'utf8');
 html=html.replace('<base href="../../engine/">',`<base href="${pathToFileURL(ENGINE+'/').href}">`);
 html=html.slice(0,html.indexOf('<section'))+'<section class="s white" data-s="0" data-e="5"><div id="avatar" class="ava">Avatar</div></section><section class="s white" data-s="5" data-e="9" data-tr="down"><div class="h2">Next</div></section>'+html.slice(html.indexOf('<script src="node_modules/animejs'));
 await fs.writeFile(file,html);const {browser,page}=await openPage(file);
 try{const r=await page.evaluate(()=>{render(4.8);const a=document.getElementById('avatar').style.opacity;render(4.8);const b=document.getElementById('avatar').style.opacity;render(8);render(0);return {a,b,start:getComputedStyle(document.getElementById('avatar')).opacity}});assert.equal(r.a,r.b);assert.equal(r.start,'1')}finally{await browser.close();await fs.rm(dir,{recursive:true,force:true})}
});
test('demo pixels match repeated, reverse and fresh seeks',async()=>{
 const {browser,page,errors}=await openPage(demo);assert.deepEqual(errors,[]);
 const compare=async(a,b,label)=>{
  if(Buffer.compare(a,b)===0)return;
  const delta=await page.evaluate(async({a,b})=>{
   const pixels=async(s)=>{const raw=Uint8Array.from(atob(s),c=>c.charCodeAt(0)),img=await createImageBitmap(new Blob([raw],{type:'image/png'}));const canvas=new OffscreenCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,img.width,img.height).data;img.close();return data};
   const A=await pixels(a),B=await pixels(b);let max=0,sum=0;for(let i=0;i<A.length;i++){const d=Math.abs(A[i]-B[i]);max=Math.max(max,d);sum+=d}return {max,mean:sum/A.length};
  },{a:Buffer.from(a).toString('base64'),b:Buffer.from(b).toString('base64')});
  // Chrome filter compositing can differ by one 8-bit level; geometry or visible motion cannot.
  assert.ok(delta.max<=1&&delta.mean<.01,`${label}: ${JSON.stringify(delta)}`);
  console.log(label+' compositor delta '+JSON.stringify(delta));
 };
 const shot=async(p,t)=>{await p.evaluate(t=>render(t),t);return await p.screenshot()};
 try {
  const times=[0,2.5,5.5,8.8,10.6,12.5,15.5,18.8,20.5,22.8,24.6];const sequential={};
  for(let f=0;f<=750;f++){const t=f/30;await page.evaluate(t=>render(t),t);const hit=times.find(x=>Math.abs(x-t)<1e-7);if(hit!==undefined)sequential[hit]=await page.screenshot()}
  for(const t of [...times].reverse())await compare(await shot(page,t),sequential[t],`reverse seek ${t}`);
  for(const t of times){await compare(await shot(page,t),await shot(page,t),`repeat ${t}`)}
  const fresh=await openPage(demo);try{await compare(await shot(fresh.page,18.8),sequential[18.8],'fresh worker 18.8')}finally{await fresh.browser.close()}
 }finally{await browser.close()}
});
test('safe framing keeps protected title and every camera subject inside the frame throughout motion',async()=>{
 const {browser,page}=await openPage(demo);
 try{const failures=await page.evaluate(()=>{const out=[];for(let t=0;t<24;t+=1/30){render(t);for(const [i,s] of [...document.querySelectorAll('section[data-camfit="safe"]')].entries()){if(t<+s.dataset.s+(i?(P5TR.of(i)||0):0)||t>=+s.dataset.e)continue;const ids=[...new Set([...s.dataset.camk.matchAll(/#([\w-]+)/g)].map(m=>m[1]).concat([...s.querySelectorAll('[data-camera-keep]')].map(e=>e.id)))];for(const id of ids){const r=document.getElementById(id).getBoundingClientRect();if(r.left<64||r.right>1016||r.top<249||r.bottom>1671)out.push({t,id,box:[r.left,r.top,r.right,r.bottom]})}}}return out.slice(0,8)});assert.deepEqual(failures,[])}finally{await browser.close()}
});
test('rhythm checker does not report a static gap during a declared entry animation',async()=>{
 const {browser,page}=await openPage(demo);
 try{const overlaps=await page.evaluate(()=>{const ir=JSON.parse(document.getElementById('scene-direction').textContent),motion=ir.scenes.flatMap(s=>s.motion);return p5gaps(1).flatMap(g=>motion.filter(m=>Math.min(g[1],m.startsAt+m.duration)-Math.max(g[0],m.startsAt)>.01).map(m=>({gap:g,target:m.target})))});assert.deepEqual(overlaps,[])}finally{await browser.close()}
});
