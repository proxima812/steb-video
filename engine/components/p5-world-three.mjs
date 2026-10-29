// 3D для пресета default (styles/p5-world.css). Нужен importmap: {"three":"./node_modules/three/build/three.module.js"}.
// Качество: рендер в 2x, мягкие тени на «пол», матовые материалы с окружением RoomEnvironment,
// контур чертежа (толстые линии Line2) цветом текста комнаты, точки - круглые диски, как на доске.
// Все анимации - функции от t, которые возвращает build(); вызывать render(t) из window.p5hook.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';

export {THREE};
export const cl = x => Math.max(0, Math.min(1, x));
export const S = x => { x = cl(x); return x * x * x * (x * (6 * x - 15) + 10); };   // плавный разгон и торможение
export const O = x => S(x);   // в мире p5w все входы с плавным стартом: рывок в первом кадре недопустим
export const lerp = (a, b, k) => a + (b - a) * k;

const views = [];
// проезд 3D-камеры по ключам: keys = [[t, zoom, [x,y,z] цель, длительность], ...]; камера смотрит на цель с направления base.dir.
// zoom 1 - исходный план. Между ключами кривая камеры мира (runtime/p5-ease.js: cine, 5-е поле ключа - имя кривой); подписи (label) едут вместе, т.к. проецируются этой камерой.
export function camPath(cam, keys, {target = [0, 0, 0], dir, dist}) {
  const T0 = new THREE.Vector3(...target), D = new THREE.Vector3(...dir).normalize(), T = new THREE.Vector3();
  return (t, toWorld = v => v) => {
    let z = 1; T.copy(T0);
    for (const [kt, kz, kp, kd = 1.2, ke] of keys) { if (t < kt) break; const E = window.P5E ? P5E.get(ke, P5E.role.cam) : S, p = E(cl((t - kt) / kd)); z = lerp(z, kz, p); T.lerp(toWorld(new THREE.Vector3(...kp)), p); }
    if (cam.isOrthographicCamera) { cam.zoom = z; cam.position.copy(T).addScaledVector(D, dist); cam.updateProjectionMatrix(); }
    else cam.position.copy(T).addScaledVector(D, dist / z);
    cam.lookAt(T); cam.updateMatrixWorld();
  };
}
// цвета комнаты из CSS секции
function themeOf(sec) {
  const css = getComputedStyle(sec), v = n => css.getPropertyValue(n).trim();
  const bg = css.backgroundColor;
  return {bg: new THREE.Color(bg), fg: new THREE.Color(css.color), acc: new THREE.Color(v('--acc')), acc2: new THREE.Color(v('--acc2')),
    mut: new THREE.Color(css.color).lerp(new THREE.Color(bg), .5),
    dark: new THREE.Color(bg).getHSL({}).l < .5};
}

export function view(id, build, {ortho = 0, fov = 30} = {}) {
  const c = document.getElementById(id), sec = c.closest('section'), th = themeOf(sec);
  const w = +c.getAttribute('width'), h = +c.getAttribute('height');
  c.style.width = w + 'px'; c.style.height = h + 'px';
  const r = new THREE.WebGLRenderer({canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true});
  r.setPixelRatio(2); r.setSize(w, h, false); r.setClearColor(0, 0);
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = th.dark ? .55 : .8;
  const cam = ortho ? new THREE.OrthographicCamera(-ortho * w / h, ortho * w / h, ortho, -ortho, .1, 200) : new THREE.PerspectiveCamera(fov, w / h, .1, 200);
  const key = new THREE.DirectionalLight(0xffffff, th.dark ? 1.6 : 1.9);
  key.position.set(6, 12, 8); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -.0004;
  Object.assign(key.shadow.camera, {left: -14, right: 14, top: 14, bottom: -14, near: .5, far: 60});
  scene.add(key, new THREE.AmbientLight(0xffffff, th.dark ? .25 : .45));
  const kit = {scene, cam, th, w, h, stage: c.parentElement,
    mat: (color, o = {}) => new THREE.MeshStandardMaterial({color, roughness: .78, metalness: 0, ...o}),
    // контур чертежа вокруг меша
    edges: (mesh, color = th.fg, width = 2.2) => {
      const g = new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(mesh.geometry, 25));
      const m = new LineMaterial({color, linewidth: width, worldUnits: false, transparent: true});
      m.resolution.set(w, h); const l = new LineSegments2(g, m); mesh.add(l); return l;
    },
    // толстый отрезок (оси, связи); set(a,b,k) - рисуется от a к b на долю k
    seg: (color, width = 4) => {
      const g = new LineSegmentsGeometry(); g.setPositions([0, 0, 0, 0, 0, 0]);
      const m = new LineMaterial({color, linewidth: width, worldUnits: false, transparent: true}); m.resolution.set(w, h);
      const l = new LineSegments2(g, m); l.frustumCulled = false; scene.add(l);
      l.set = (a, b, k = 1) => { g.setPositions([a.x, a.y, a.z, lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k)]); m.opacity = k > 0 ? 1 : 0; };
      return l;
    },
    // пол, на который ложится мягкая тень
    floor: (y = 0, size = 40) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({opacity: th.dark ? .45 : .16}));
      f.rotation.x = -Math.PI / 2; f.position.y = y; f.receiveShadow = true; scene.add(f); return f; },
    // круглые точки-диски (как на доске), цвета по вершинам
    dots: (positions, colors, size = 22) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions.flat(), 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colors.flatMap(c => [c.r, c.g, c.b]), 3));
      g.setAttribute('k', new THREE.Float32BufferAttribute(positions.map(() => 1), 1));
      const m = new THREE.ShaderMaterial({transparent: true, depthWrite: false, uniforms: {size: {value: size * 2}},
        vertexShader: 'attribute float k;attribute vec3 color;varying vec3 vC;varying float vK;uniform float size;void main(){vC=color;vK=k;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*k*(18./-mv.z);gl_Position=projectionMatrix*mv;}',
        fragmentShader: 'varying vec3 vC;varying float vK;void main(){vec2 p=gl_PointCoord-.5;float d=length(p);float a=1.-smoothstep(.44,.5,d);if(a<.01)discard;gl_FragColor=vec4(vC,a*clamp(vK*2.,0.,1.));#include <colorspace_fragment>\n}'});
      const p = new THREE.Points(g, m); scene.add(p); return p;
    },
    // HTML-ярлык, следующий за точкой в 3D
    label: (text, cls = '') => { const el = document.createElement('div'); el.className = 'tag3 ' + cls; el.textContent = text; c.parentElement.appendChild(el);
      const v = new THREE.Vector3();
      el.at = (obj3OrVec, op = 1) => { (obj3OrVec.isVector3 ? v.copy(obj3OrVec) : obj3OrVec.getWorldPosition(v)).project(cam);
        const X = (v.x + 1) / 2 * w, Y = (1 - v.y) / 2 * h; el.style.left = X + 'px'; el.style.top = Y + 'px';
        const edge = Math.min(X - 40, w - 40 - X, Y - 30, h - 20 - Y); el.style.opacity = op * Math.max(0, Math.min(1, edge / 80)); };   // у края области подпись гаснет, а не обрезается
      return el; },
  };
  const update = build(kit);
  views.push({sec, r, scene, cam, update});
}

export async function start() {
  await Promise.all(views.map(v => v.r.compileAsync(v.scene, v.cam)));
  const prev = window.p5hook;
  window.p5hook = t => { prev?.(t); for (const v of views) { if (getComputedStyle(v.sec).display === 'none') continue; v.update(t); v.r.render(v.scene, v.cam); } };
  window.render(0);
}
