// Modelos 3D procedurales (sin archivos externos) con estética de sticker/riso:
// material toon + contorno negro "dibujado" (técnica de casco invertido).
import * as THREE from 'three';

const INK = 0x1d1a16;
const gradientMap = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
const outlineFlat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide });

function toon(color) {
  return new THREE.MeshToonMaterial({ color, gradientMap });
}

// Agrega una malla con su contorno
function part(group, geo, color, outline = 0.045) {
  const m = new THREE.Mesh(geo, toon(color));
  group.add(m);
  if (outline > 0) {
    const flat = geo.type === 'CircleGeometry';
    const o = new THREE.Mesh(geo, flat ? outlineFlat : outlineMat);
    o.scale.setScalar(1 + outline);
    if (flat) o.position.z = -0.008;
    m.add(o);
  }
  return m;
}

function lathe(points, segs = 40) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

function roundedBox(w, h, d, r, seg = 4) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: Math.min(r, d) * 0.3, bevelSize: Math.min(r, d) * 0.3, bevelSegments: seg, curveSegments: seg * 2 });
  g.center();
  return g;
}

function termo() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.42, 0.42, 1.9, 40), 0x2f7d4a);
  // franja decorativa tipo sticker
  part(g, new THREE.CylinderGeometry(0.425, 0.425, 0.28, 40), 0xffe14d, 0.02).position.y = 0.1;
  part(g, new THREE.CylinderGeometry(0.44, 0.44, 0.12, 40), 0x1d1a16, 0).position.y = -0.98;
  const cap = part(g, new THREE.CylinderGeometry(0.34, 0.4, 0.45, 40), 0xf1ead8);
  cap.position.y = 1.18;
  const spout = part(g, new THREE.CylinderGeometry(0.08, 0.1, 0.22, 16), 0xf1ead8);
  spout.position.set(0.28, 1.42, 0); spout.rotation.z = -0.6;
  const handle = part(g, new THREE.TorusGeometry(0.36, 0.06, 10, 24, Math.PI), 0x1d1a16, 0.03);
  handle.rotation.z = -Math.PI / 2; handle.position.set(0.42, 0.45, 0);
  return g;
}

function mate() {
  const g = new THREE.Group();
  part(g, lathe([[0, -0.6], [0.35, -0.58], [0.55, -0.4], [0.62, -0.1], [0.58, 0.25], [0.45, 0.5], [0.42, 0.58], [0.38, 0.58]]), 0x8a5a2b);
  const rim = part(g, new THREE.TorusGeometry(0.42, 0.05, 10, 40), 0xd9d4c7, 0.03);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.58;
  // yerba
  const yerba = part(g, new THREE.CylinderGeometry(0.39, 0.39, 0.05, 32), 0x7da23a, 0);
  yerba.position.y = 0.52;
  // bombilla
  const b = part(g, new THREE.CylinderGeometry(0.035, 0.035, 1.3, 10), 0xd9d4c7, 0.08);
  b.position.set(0.15, 0.9, 0); b.rotation.z = -0.35;
  const tip = part(g, new THREE.CylinderGeometry(0.035, 0.035, 0.25, 10), 0xd9d4c7, 0.08);
  tip.position.set(0.32, 1.6, 0); tip.rotation.z = 0.9;
  return g;
}

function compu() {
  const g = new THREE.Group();
  const base = part(g, roundedBox(1.9, 1.3, 0.06, 0.08), 0xc9c3b6);
  base.rotation.x = -Math.PI / 2; base.position.y = -0.55;
  const lid = new THREE.Group();
  const lidMesh = part(lid, roundedBox(1.9, 1.25, 0.06, 0.08), 0x3d3a35);
  lidMesh.position.y = 0.62;
  // stickers en la tapa
  const s1 = part(lid, new THREE.CircleGeometry(0.18, 24), 0xff4f9a, 0.06); s1.position.set(-0.45, 0.85, -0.05); s1.rotation.y = Math.PI;
  const s2 = part(lid, roundedBox(0.4, 0.22, 0.01, 0.05), 0xffe14d, 0.05); s2.position.set(0.4, 0.4, -0.05); s2.rotation.z = 0.2;
  const s3 = part(lid, new THREE.CircleGeometry(0.12, 5), 0x2b6fd9, 0.08); s3.position.set(0.25, 0.95, -0.05); s3.rotation.y = Math.PI;
  // pantalla
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05), new THREE.MeshBasicMaterial({ color: 0x18a3a3 }));
  scr.position.set(0, 0.62, 0.04); lid.add(scr);
  lid.position.set(0, -0.55, -0.62); lid.rotation.x = -0.25;
  g.add(lid);
  g.position.y = 0.15;
  return g;
}

function vaso() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.5, 0.36, 1.5, 40), 0xd94f7a);
  const lid = part(g, new THREE.CylinderGeometry(0.53, 0.53, 0.14, 40), 0xf1ead8); lid.position.y = 0.82;
  const straw = part(g, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12), 0xffe14d, 0.08); straw.position.set(0.12, 1.2, 0); straw.rotation.z = -0.15;
  const handle = part(g, new THREE.TorusGeometry(0.32, 0.07, 10, 24, Math.PI), 0xd94f7a, 0.04);
  handle.rotation.z = -Math.PI / 2; handle.position.set(0.44, 0.05, 0);
  return g;
}

function celu() {
  const g = new THREE.Group();
  part(g, roundedBox(0.8, 1.6, 0.1, 0.14), 0xe0782b);
  const cam = part(g, roundedBox(0.3, 0.3, 0.04, 0.08), 0x1d1a16, 0.03); cam.position.set(-0.17, 0.52, -0.09);
  const lens = part(g, new THREE.CircleGeometry(0.07, 20), 0x2b6fd9, 0.1); lens.position.set(-0.17, 0.52, -0.13); lens.rotation.y = Math.PI;
  const st = part(g, new THREE.CircleGeometry(0.2, 6), 0xffe14d, 0.06); st.position.set(0.1, -0.2, -0.09); st.rotation.y = Math.PI;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 1.45), new THREE.MeshBasicMaterial({ color: 0x1d1a16 }));
  scr.position.z = 0.1; g.add(scr);
  return g;
}

function botella() {
  const g = new THREE.Group();
  part(g, lathe([[0, -0.85], [0.38, -0.85], [0.42, -0.78], [0.42, 0.45], [0.3, 0.7], [0.2, 0.8], [0.2, 0.88], [0, 0.88]]), 0x2b6fd9);
  const cap = part(g, new THREE.CylinderGeometry(0.23, 0.23, 0.25, 24), 0x1d1a16, 0.03); cap.position.y = 1.0;
  const loop = part(g, new THREE.TorusGeometry(0.13, 0.04, 8, 20), 0x1d1a16, 0.03); loop.position.set(0, 1.18, 0);
  part(g, new THREE.CylinderGeometry(0.425, 0.425, 0.35, 40), 0xff4f9a, 0.02).position.y = -0.15;
  return g;
}

function cuaderno() {
  const g = new THREE.Group();
  part(g, roundedBox(1.1, 1.5, 0.16, 0.04), 0x7a4fd9);
  const lab = part(g, roundedBox(0.6, 0.25, 0.01, 0.03), 0xf1ead8, 0.04); lab.position.set(0.05, 0.35, 0.13);
  for (let i = 0; i < 8; i++) {
    const r = part(g, new THREE.TorusGeometry(0.07, 0.018, 6, 14), 0xd9d4c7, 0.05);
    r.position.set(-0.55, -0.6 + i * 0.17, 0); r.rotation.y = Math.PI / 2;
  }
  const st = part(g, new THREE.CircleGeometry(0.17, 24), 0xffe14d, 0.06); st.position.set(0.2, -0.3, 0.13);
  return g;
}

const BUILDERS = { termo, mate, compu, vaso, celu, botella, cuaderno };

export function buildModel(key) {
  const g = BUILDERS[key]();
  g.userData.item = key;
  // normaliza tamaño
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const s = 1.8 / Math.max(size.x, size.y, size.z);
  const wrap = new THREE.Group();
  const center = box.getCenter(new THREE.Vector3());
  g.position.sub(center);
  wrap.add(g);
  wrap.scale.setScalar(s);
  wrap.userData.item = key;
  return wrap;
}

export function setupLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const d = new THREE.DirectionalLight(0xffffff, 1.6);
  d.position.set(3, 4, 5);
  scene.add(d);
}
