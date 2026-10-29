import test from 'node:test';import assert from 'node:assert/strict';
import {contrast,cameraSamples} from '../visual-metrics.mjs';
test('contrast uses linear sRGB luminance',()=>{assert.equal(contrast([0,0,0],[255,255,255]),21);assert.equal(contrast([120,120,120],[120,120,120]),1);assert.ok(Math.abs(contrast([128,128,128],[255,255,255])-3.94944)<.001)});
test('camera sampling follows delayed entrance rather than declared key',()=>{const ts=cameraSamples(5,10,{time:5.2,duration:.8},1.2);assert.equal(ts[0],6.2);assert.equal(ts.at(-1),7);assert.ok(ts.some(t=>Math.abs(t-6.6)<1e-9))});
test('never sample a camera in the following scene',()=>{assert.deepEqual(cameraSamples(5,6,{time:5.2,duration:1},1.2),[])});
