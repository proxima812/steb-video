import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({});const file=new URL('../../runtime/p5-camera.js',import.meta.url);
if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),c);
const zone={left:65,top:250,right:1015,bottom:1670};
const fits=(r,p)=>r.left*p.scale+p.x>=65-1e-6 && r.right*p.scale+p.x<=1015+1e-6 && r.top*p.scale+p.y>=250-1e-6 && r.bottom*p.scale+p.y<=1670+1e-6;
test('camera solver exists',()=>assert.ok(c.P5Camera?.solve));
test('safe framing includes target near bottom and punch overscan',()=>{const r={left:110,right:910,top:1200,bottom:1660};const p=c.P5Camera.solve([r],1.2,zone);assert.ok(fits(r,p));assert.ok(p.scale<=1.1875)});
test('kept title and subject fit together instead of cropping title',()=>{const a={left:65,right:865,top:250,bottom:430},b={left:220,right:960,top:850,bottom:1500};const p=c.P5Camera.solve([a,b],1.2,zone);assert.ok(fits(a,p));assert.ok(fits(b,p));assert.ok(p.scale<=950/895)});
test('invalid geometry is rejected rather than propagating NaN',()=>assert.throws(()=>c.P5Camera.solve([{left:0,right:NaN,top:0,bottom:10}],1.2,zone)));
test('impossible layout reports cannot fit without shrinking below one',()=>{const p=c.P5Camera.solve([{left:0,right:1100,top:200,bottom:1800}],1.2,zone);assert.equal(p.fits,false);assert.equal(p.scale,1)});
test('safe wide shot does not expose the edge of the scene',()=>{const r={left:65,right:845,top:280,bottom:1200};const p=c.P5Camera.solve([r],1,zone,[450,700]);assert.equal(p.x,0);assert.equal(p.y,0)});
test('framing constraints are solved at endpoints, then interpolated without an early stop',()=>{
 const rects=[{left:65,right:745,top:280,bottom:500},{left:140,right:940,top:560,bottom:1390}];
 const key={time:2,duration:1,scale:1.2,focus:[540,975]};
 const smooth=x=>x*x*x*(x*(6*x-15)+10);key.ease=smooth;
 const state=t=>c.P5Camera.track({rects,zone,keys:[key],time:t});
 const a=state(2),b=state(3),mid=state(2.5);
 assert.ok(Math.abs(mid.scale-(a.scale+b.scale)/2)<1e-8);
 assert.ok(Math.abs(state(2+1/30).x-a.x)<1);
 assert.ok(Math.abs(state(3-1/30).x-b.x)<1);
 for(let n=0;n<=30;n++){const p=state(2+n/30);for(const r of rects)assert.ok(fits(r,p));assert.ok(p.x<=1e-8&&p.x+1080*p.scale>=1080-1e-8)}
 assert.deepEqual(state(2.3),state(2.3));
});
