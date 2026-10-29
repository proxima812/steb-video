import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const file = new URL('../../components/p5-direction.js', import.meta.url);
const context = vm.createContext({});
if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
const api = context.P5Direction;
const scene = () => ({id:'intro', start:0, end:5, concept:'Одна причина', visualMetaphor:'Путь сигнала', composition:'hero', focalPoint:'subject',
  motion:[{target:'subject', purpose:'Показать результат', pattern:'reveal', startsAt:1, duration:.8}],
  camera:[{target:'subject', purpose:'Прочитать результат', shot:'medium', startsAt:2, duration:.8, scale:1.08}],
  transition:{type:'cut', reason:'Первый кадр'}});
const doc = () => ({version:1,timing:'demo',scenes:[scene()]});
const codes = r => r.errors.map(x => x.code);
test('Scene IR implementation exists',()=>assert.ok(api?.validate));
test('accepts complete direction without altering input',()=>{const d=doc(), before=JSON.stringify(d);assert.equal(api.validate(d).ok,true);assert.equal(JSON.stringify(d),before)});
test('rejects motion without a purpose and outside scene',()=>{const d=doc();d.scenes[0].motion[0].purpose='';d.scenes[0].motion[0].startsAt=4.8;const r=api.validate(d);assert.ok(codes(r).includes('purpose'));assert.ok(codes(r).includes('motion-interval'))});
test('rejects unknown patterns, IDs, duplicate scene and non-finite timing',()=>{const d=doc();d.scenes[0].motion[0].pattern='spin-forever';d.scenes[0].focalPoint='a; onclick=x';d.scenes[0].end=NaN;d.scenes.push(scene());assert.equal(api.validate(d).ok,false)});
test('reports repetitive composition without silently rewriting a scene',()=>{const d=doc();d.scenes.push({...scene(),id:'second',start:5,end:10,motion:[],camera:[],transition:{type:'down',reason:'Продолжение'}});assert.ok(api.validate(d).warnings.some(x=>x.code==='composition-repeat'))});
test('rejects overlapping camera moves and truncated camera action',()=>{const d=doc();d.scenes[0].camera.push({...d.scenes[0].camera[0],startsAt:2.3});assert.ok(codes(api.validate(d)).includes('camera-overlap'));d.scenes[0].camera[0].startsAt=4.8;assert.equal(api.validate(d).ok,false)});
test('narration cues must reference the supplied word onset',()=>{const d=doc();d.timing='narration';d.scenes[0].motion[0].wordIndex=0;const words=[['результат',1.4,1.8]];assert.ok(codes(api.validate(d,{words})).includes('word-sync'));d.scenes[0].motion[0].startsAt=1.4;assert.equal(api.validate(d,{words}).ok,true)});
test('number progression requires finite endpoints and no time drift',()=>{const d=doc();Object.assign(d.scenes[0].motion[0],{pattern:'number',from:0,to:100});assert.equal(api.validate(d).ok,true);d.scenes[0].motion[0].to=Infinity;assert.equal(api.validate(d).ok,false)});
test('rejects malformed collections with structured errors',()=>{for(const d of [null,{}, {version:1,timing:'demo',scenes:[null]}, {...doc(),scenes:[{...scene(),motion:42}]}]) assert.equal(api.validate(d).ok,false)});
test('decimal camera endpoints can touch without floating-point overlap',()=>{const d=doc();d.scenes[0].camera=[{...d.scenes[0].camera[0],startsAt:1.6,duration:.8},{...d.scenes[0].camera[0],startsAt:2.4,duration:.8}];assert.equal(api.validate(d).ok,true)});
