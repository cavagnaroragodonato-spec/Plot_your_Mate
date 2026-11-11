// Vista 3D aproximada: envuelve la plantilla alrededor del objeto (cilindro) o la apoya sobre la tapa (plano).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let state = null;

export function openPreview(canvasEl, tpl, textureCanvas, itemColor = '#2f7d4a') {
  close();
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / h, 1, 5000);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(300, 400, 500); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffc6e0, 0.8); rim.position.set(-400, 100, -300); scene.add(rim);

  const tex = new THREE.CanvasTexture(textureCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: itemColor, roughness: 0.45, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.6 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.7 });
  let size;

  if (tpl.shape === 'cylinder') {
    const r = tpl.d / 2, H = tpl.h;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.004, r * 1.004, H, 96, 1, true), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, metalness: 0.05 }));
    cyl.rotation.y = Math.PI; // la mitad de la plantilla queda al frente, la costura atrás
    group.add(cyl);
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, H, 96), body));
    if (tpl.item === 'termo' || tpl.item === 'botella') {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.95, H * 0.22, 64), tpl.item === 'termo' ? cream : dark);
      cap.position.y = H / 2 + H * 0.11; group.add(cap);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.0, H * 0.06, 64), dark);
      base.position.y = -H / 2 - H * 0.03; group.add(base);
    } else if (tpl.item === 'vaso') {
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, H * 0.08, 64), cream);
      lid.position.y = H / 2 + H * 0.04; group.add(lid);
      const straw = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.08, H * 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xffe14d }));
      straw.position.set(r * 0.25, H / 2 + H * 0.3, 0); group.add(straw);
    } else if (tpl.item === 'mate') {
      const rimM = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.06, 12, 64), cream);
      rimM.rotation.x = Math.PI / 2; rimM.position.y = H / 2; group.add(rimM);
      const bomb = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.05, H * 1.4, 12), new THREE.MeshStandardMaterial({ color: 0xd9d4c7, metalness: .8, roughness: .25 }));
      bomb.position.set(r * 0.3, H * 0.75, 0); bomb.rotation.z = -0.3; group.add(bomb);
    }
    size = Math.max(H * 1.5, tpl.d * 2);
  } else {
    const W = tpl.w, H = tpl.h, T = Math.max(4, Math.min(W, H) * 0.04);
    const shape = new THREE.Shape();
    const r = tpl.r || 0, x = -W / 2, y = -H / 2;
    shape.moveTo(x + r, y); shape.lineTo(x + W - r, y); shape.quadraticCurveTo(x + W, y, x + W, y + r);
    shape.lineTo(x + W, y + H - r); shape.quadraticCurveTo(x + W, y + H, x + W - r, y + H);
    shape.lineTo(x + r, y + H); shape.quadraticCurveTo(x, y + H, x, y + H - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 16 }), body);
    slab.position.z = -T; group.add(slab);
    const face = new THREE.ShapeGeometry(shape, 16);
    // UV del frente: mapea el rectángulo de la plantilla
    const pos = face.attributes.position, uv = face.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x) / W, (pos.getY(i) - y) / H);
    const front = new THREE.Mesh(face, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35 }));
    front.position.z = 0.3; group.add(front);
    if (tpl.item === 'compu') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(W, T * 1.2, H * 0.95), new THREE.MeshStandardMaterial({ color: 0xc9c3b6, roughness: .5, metalness: .3 }));
      base.position.set(0, -H / 2 - T * 0.6, H * 0.45); group.add(base);
      group.rotation.x = -0.12;
    }
    size = Math.max(W, H) * 1.6;
  }
  scene.add(group);
  camera.position.set(size * 0.45, size * 0.3, size * 1.75);
  const controls = new OrbitControls(camera, canvasEl);
  controls.enableDamping = true;
  if (tpl.shape === 'cylinder') { controls.target.set(0, tpl.h * 0.06, 0); }
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
  controls.enablePan = false;
  controls.minDistance = size * 0.4; controls.maxDistance = size * 3;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  let raf;
  const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  loop();
  state = { renderer, raf, controls, tex, scene };
}

export function close() {
  if (!state) return;
  cancelAnimationFrame(state.raf);
  state.controls.dispose();
  state.tex.dispose();
  state.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  state.renderer.dispose();
  state = null;
}
