// Portada: anillo de modelos 3D girando alrededor del título.
// Al pasar el cursor el anillo frena; al hacer click te lleva al taller con ese elemento.
import * as THREE from 'three';
import { buildModel, setupLights } from './models.js';
import { ITEMS, ITEM_ORDER } from './catalog.js';

const foot = document.getElementById('home-foot');
foot.innerHTML = ITEM_ORDER.map(k => `<a href="design.html?item=${k}"><span class="tag">${ITEMS[k].emoji} ${ITEMS[k].name}</span></a>`).join('');

const canvas = document.getElementById('ring-canvas');
const label = document.getElementById('ring-label');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) {
  document.body.classList.add('no-webgl');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 14);
setupLights(scene);

const ring = new THREE.Group();
scene.add(ring);

const models = ITEM_ORDER.map((key, i) => {
  const holder = new THREE.Group();
  const m = buildModel(key);
  holder.add(m);
  holder.userData = { item: key, base: (i / ITEM_ORDER.length) * Math.PI * 2, spin: Math.random() * 6, hover: 0, model: m };
  ring.add(holder);
  return holder;
});

let rx = 4, ry = 3, modelScale = 1;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const visW = visH * camera.aspect;
  ry = visH * 0.36;
  rx = Math.min(visW * 0.38, ry * 1.55);
  if (camera.aspect < 0.8) { rx = visW * 0.36; ry = visH * 0.33; }
  modelScale = Math.min(1.25, Math.max(0.6, Math.min(visW, visH) / 7.5));
}
addEventListener('resize', resize);
resize();

// ---- interacción ----
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2(9, 9);
let hovered = null;
let speed = 1;            // velocidad actual (se frena al hacer hover)
let angle = 0;

function pick(clientX, clientY) {
  pointer.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  const hits = ray.intersectObjects(models, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !models.includes(o)) o = o.parent;
  return o;
}

canvas.addEventListener('pointermove', e => {
  hovered = pick(e.clientX, e.clientY);
  canvas.style.cursor = hovered ? 'pointer' : 'default';
});
canvas.addEventListener('pointerleave', () => { hovered = null; });
canvas.addEventListener('click', e => {
  const h = pick(e.clientX, e.clientY);
  if (h) go(h.userData.item);
});

function go(key) {
  document.body.style.transition = 'opacity .35s';
  document.body.style.opacity = '0';
  setTimeout(() => { location.href = `design.html?item=${key}`; }, 280);
}

// ---- animación ----
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const target = hovered ? 0 : (reduce ? 0.15 : 1);
  speed += (target - speed) * Math.min(1, dt * 6);
  angle += dt * 0.22 * speed;

  models.forEach(m => {
    const a = m.userData.base + angle;
    m.position.set(Math.cos(a) * rx, Math.sin(a) * ry, 0);
    const isH = m === hovered;
    m.userData.hover += ((isH ? 1 : 0) - m.userData.hover) * Math.min(1, dt * 10);
    const s = modelScale * (1 + m.userData.hover * 0.3);
    m.scale.setScalar(s);
    m.userData.spin += dt * (isH ? 1.8 : 0.6 * Math.max(speed, 0.3));
    m.userData.model.rotation.y = m.userData.spin;
    m.userData.model.rotation.x = Math.sin(m.userData.spin * 0.7) * 0.18 + 0.12;
    m.userData.model.rotation.z = isH ? Math.sin(performance.now() / 160) * 0.08 : 0;
  });

  if (hovered) {
    tmp.copy(hovered.position).add(new THREE.Vector3(0, 1.25 * modelScale, 0)).project(camera);
    label.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
    label.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
    label.textContent = `${ITEMS[hovered.userData.item].name} · diseñar →`;
    label.classList.add('show');
  } else label.classList.remove('show');

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
