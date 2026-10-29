import * as THREE from '../node_modules/three/build/three.module.js';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const x = clamp(value); return x * x * x * (x * (6 * x - 15) + 10); };

function createView(canvas) {
  const section = canvas.closest('section');
  if (!section) throw new Error('Three.js canvas must be inside a timed section');
  const spec = JSON.parse(canvas.dataset.threeSpec);
  const kind = canvas.dataset.three;
  if (!['bars', 'layers'].includes(kind)) throw new Error(`Unknown Three.js component: ${kind}`);
  const css = getComputedStyle(section);
  const color = name => new THREE.Color(css.getPropertyValue(name).trim());
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(1);
  renderer.setSize(800, 320, false);
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5.8, 5.8, 2.32, -2.32, .1, 100);
  camera.position.set(5, 4.3, 6);
  camera.lookAt(0, 1, 0);
  scene.add(new THREE.HemisphereLight(color('--white'), color('--tile'), 2));
  const light = new THREE.DirectionalLight(color('--white'), 2.5);
  light.position.set(3, 6, 5); scene.add(light);
  const materials = [color('--acc'), color('--acc2')].map(c =>
    new THREE.MeshStandardMaterial({color: c, roughness: .55, metalness: .08}));
  const tile = new THREE.MeshStandardMaterial({color: color('--tile'), roughness: .9});
  const meshes = [];
  let update;
  if (kind === 'bars') {
    const geometry = new THREE.BoxGeometry(.7, 1, .8);
    const base = new THREE.Mesh(new THREE.BoxGeometry(spec.bars.length * 1.4 + .5, .06, 1.5), tile);
    scene.add(base);
    spec.bars.forEach((bar, i) => {
      const mesh = new THREE.Mesh(geometry, materials[i % 2]);
      mesh.position.x = (i - (spec.bars.length - 1) / 2) * 1.4;
      scene.add(mesh); meshes.push(mesh);
    });
    update = t => meshes.forEach((mesh, i) => {
      const bar = spec.bars[i], p = smooth((t - bar.at) / bar.duration);
      const height = 2.5 * bar.value / spec.max * p;
      mesh.visible = height > 0;
      mesh.scale.y = Math.max(.0001, height);
      mesh.position.y = .03 + height / 2;
    });
  } else {
    const geometry = new THREE.BoxGeometry(3.6, .12, 2);
    for (let i = 0; i < spec.count; i++) {
      const mesh = new THREE.Mesh(geometry, materials[i % 2]);
      scene.add(mesh); meshes.push(mesh);
    }
    update = t => {
      const gap = .15 + .42 * smooth((t - spec.at) / spec.duration);
      meshes.forEach((mesh, i) => { mesh.position.y = 1 + (i - (spec.count - 1) / 2) * gap; });
    };
  }
  let disposed = false;
  const render = t => {
    if (disposed || getComputedStyle(section).display === 'none') return;
    update(t); renderer.render(scene, camera);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(), usedMaterials = new Set([...materials, tile]);
    scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
    for (const geometry of geometries) geometry.dispose();
    for (const material of usedMaterials) material.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  };
  return {render, dispose, ready: () => renderer.compileAsync(scene, camera)};
}

export async function attachThree(root = document) {
  const views = [];
  let hook;
  const previous = window.p5hook;
  try {
    for (const canvas of root.querySelectorAll('canvas[data-three]')) views.push(createView(canvas));
    await Promise.all(views.map(view => view.ready()));
    hook = t => { previous?.(t); for (const view of views) view.render(t); };
    window.p5hook = hook;
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (window.p5hook === hook) window.p5hook = previous;
      for (const view of views) view.dispose();
      window.removeEventListener('pagehide', dispose);
    };
    window.addEventListener('pagehide', dispose, {once: true});
    return {revision: THREE.REVISION, render: hook, dispose};
  } catch (error) {
    for (const view of views) view.dispose();
    throw error;
  }
}
