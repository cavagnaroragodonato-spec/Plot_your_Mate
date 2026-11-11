// =====================================================================
// Editor de plantillas de Plot your Mate
// Coordenadas internas en milímetros (mm). La pantalla se dibuja con view.scale (px por mm).
// Especialidad: guías inteligentes (centrado, alineado, espaciado parejo, radial, mismo tamaño).
// =====================================================================

const uid = () => Math.random().toString(36).slice(2, 10);
const DEG = Math.PI / 180;
const HANDLE = 9;          // radio de agarre de los manejadores (px)
const SNAP_PX = 7;         // distancia de imán (px de pantalla)
const FIELDS = ['id', 'type', 'asset', 'x', 'y', 'w', 'h', 'rot', 'flip', 'opacity', 'section', 'mask', 'border', 'borderColor', 'text', 'font', 'color', 'weight'];

export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}
function natural(img) {
  const w = img.naturalWidth || img.width || 1000;
  const h = img.naturalHeight || img.height || 1000;
  return { w, h };
}
const readAsDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

// Reduce imágenes enormes para que el proyecto no pese una tonelada
async function normalizeImage(file) {
  const url = await readAsDataURL(file);
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return url;
  const img = await loadImage(url);
  const { w, h } = natural(img);
  const MAX = 3200;
  if (Math.max(w, h) <= MAX) return url;
  const k = MAX / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Editor {
  constructor({ canvas, wrap, hintsEl, onChange, onSelect, onDblClick }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wrap = wrap;
    this.hintsEl = hintsEl;
    this.onChange = onChange || (() => {});
    this.onSelect = onSelect || (() => {});
    this.onDblClick = onDblClick || (() => {});
    this.tpl = null;
    this.objs = [];
    this.assets = new Map();
    this.sel = [];
    this.settings = { bg: '#ffffff', transparent: false, safe: 3, showZones: false };
    this.zones = [];
    this.snapOn = true;
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.fitScale = 1;
    this.history = [];
    this.future = [];
    this.guides = [];
    this.drag = null;
    this.space = false;
    this.dpr = 1;
    this.cache = new Map();
    this._bind();
    new ResizeObserver(() => this.resize()).observe(wrap);
  }

  // ------------------------------------------------------------ plantilla / vista
  setTemplate(tpl) {
    this.tpl = tpl;
    this.zones = [];
    this.resize();
    this.fit();
  }
  resize() {
    const r = this.wrap.getBoundingClientRect();
    if (!r.width) return;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.cw = r.width; this.ch = r.height;
    if (!this._fitted && this.tpl) this.fit();
    this.render();
  }
  fit() {
    if (!this.tpl || !this.cw) return;
    const padX = this.cw < 600 ? 30 : 70, padY = this.cw < 600 ? 40 : 80;
    const panel = this.cw > 900 ? 270 : 0; // espacio para el panel de propiedades
    const availW = this.cw - padX * 2 - panel;
    const s = Math.min(availW / this.tpl.w, (this.ch - padY * 2) / this.tpl.h);
    this.fitScale = s;
    this.view.scale = s;
    this.view.ox = padX + 20 + (availW - this.tpl.w * s) / 2;
    this.view.oy = (this.ch - this.tpl.h * s) / 2;
    this._fitted = true;
    this.render();
    this.onChange('view');
  }
  zoomAt(factor, sx = this.cw / 2, sy = this.ch / 2) {
    const v = this.view;
    const ns = Math.min(Math.max(v.scale * factor, this.fitScale * 0.2), this.fitScale * 12);
    const mx = (sx - v.ox) / v.scale, my = (sy - v.oy) / v.scale;
    v.scale = ns; v.ox = sx - mx * ns; v.oy = sy - my * ns;
    this.render();
    this.onChange('view');
  }
  get zoomPct() { return Math.round(this.view.scale / this.fitScale * 100); }
  toMM(sx, sy) { return { x: (sx - this.view.ox) / this.view.scale, y: (sy - this.view.oy) / this.view.scale }; }
  toScreen(x, y) { return { x: this.view.ox + x * this.view.scale, y: this.view.oy + y * this.view.scale }; }

  // ------------------------------------------------------------ assets
  async addFiles(files, section = 'none', at = null) {
    const added = [];
    for (const f of files) {
      if (!f.type.startsWith('image/') && !/\.svg$/i.test(f.name)) continue;
      try {
        const dataURL = await normalizeImage(f);
        const a = await this.registerAsset({ name: f.name, dataURL, section });
        added.push(a);
      } catch (e) { console.warn('No se pudo leer', f.name, e); }
    }
    if (at) added.forEach((a, i) => this.addImage(a.id, { x: at.x + i * 8, y: at.y + i * 8 }, i === added.length - 1));
    this.onChange('assets');
    return added;
  }
  async registerAsset({ id = uid(), name, dataURL, section = 'none' }) {
    const img = await loadImage(dataURL);
    const a = { id, name, dataURL, img, section };
    this.assets.set(id, a);
    return a;
  }
  removeAsset(id) {
    this.assets.delete(id);
    const before = this.objs.length;
    this.objs = this.objs.filter(o => o.asset !== id);
    this.sel = this.sel.filter(s => this.objs.some(o => o.id === s));
    if (before !== this.objs.length) this.commit();
    this.onChange('assets');
    this.onSelect(this.selected());
    this.render();
  }
  usage(assetId) { return this.objs.filter(o => o.asset === assetId).length; }

  // ------------------------------------------------------------ objetos
  defaultSize(aspect) {
    const T = this.tpl;
    const base = Math.min(T.w, T.h) * 0.42;
    return aspect >= 1 ? { w: base, h: base / aspect } : { w: base * aspect, h: base };
  }
  addImage(assetId, at = null, select = true) {
    const a = this.assets.get(assetId);
    if (!a) return;
    const { w: nw, h: nh } = natural(a.img);
    const n = this.objs.length;
    const pos = at || { x: this.tpl.w / 2 + ((n % 5) - 2) * 6, y: this.tpl.h / 2 + ((n % 5) - 2) * 6 };
    const o = { id: uid(), type: 'image', asset: assetId, ...pos, ...this.defaultSize(nw / nh), rot: 0, flip: false, opacity: 1, section: a.section, mask: 'none', border: 0, borderColor: '#ffffff' };
    this.objs.push(o);
    if (select) this.select([o.id]);
    this.commit();
    return o;
  }
  async addText(text = 'Tu frase acá', opts = {}) {
    const o = { id: uid(), type: 'text', text, font: opts.font || 'Fraunces', color: opts.color || '#1d1a16', weight: opts.weight || 900, x: this.tpl.w / 2, y: this.tpl.h / 2, w: 10, h: Math.min(this.tpl.h, this.tpl.w) * 0.14, rot: 0, flip: false, opacity: 1, section: opts.section || 'frases', mask: 'none', border: 0, borderColor: '#ffffff' };
    await this.buildText(o, true);
    this.objs.push(o);
    this.select([o.id]);
    this.commit();
    return o;
  }
  async buildText(o, keepHeight = true) {
    const fontStr = `${o.weight || 700} 200px "${o.font}"`;
    try { await document.fonts.load(fontStr, o.text); } catch (e) { /* sin fuente: usa fallback */ }
    const lines = (o.text || ' ').split('\n');
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = fontStr;
    const lh = 230;
    const maxW = Math.max(...lines.map(l => ctx.measureText(l || ' ').width), 20);
    c.width = Math.ceil(maxW + 40);
    c.height = Math.ceil(lines.length * lh + 30);
    ctx.font = fontStr;
    ctx.fillStyle = o.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, 15 + lh * (i + 0.5)));
    o._text = c;
    o._ver = (o._ver || 0) + 1;
    const aspect = c.width / c.height;
    if (keepHeight) o.w = o.h * aspect; else o.h = o.w / aspect;
    this.render();
  }
  selected() { return this.objs.filter(o => this.sel.includes(o.id)); }
  select(ids) {
    this.sel = ids;
    this.onSelect(this.selected());
    this.render();
  }
  selectAll() { this.select(this.objs.map(o => o.id)); }
  deleteSel() {
    if (!this.sel.length) return;
    this.objs = this.objs.filter(o => !this.sel.includes(o.id));
    this.select([]);
    this.commit();
  }
  duplicateSel() {
    const copies = this.selected().map(o => {
      const c = { ...this.strip(o), id: uid(), x: o.x + 6, y: o.y + 6 };
      if (o._text) { c._text = o._text; c._ver = o._ver; }
      return c;
    });
    this.objs.push(...copies);
    this.select(copies.map(c => c.id));
    this.commit();
  }
  layer(dir) {
    const ids = new Set(this.sel);
    if (!ids.size) return;
    if (dir > 0) {
      for (let i = this.objs.length - 2; i >= 0; i--) if (ids.has(this.objs[i].id) && !ids.has(this.objs[i + 1].id)) [this.objs[i], this.objs[i + 1]] = [this.objs[i + 1], this.objs[i]];
    } else {
      for (let i = 1; i < this.objs.length; i++) if (ids.has(this.objs[i].id) && !ids.has(this.objs[i - 1].id)) [this.objs[i], this.objs[i - 1]] = [this.objs[i - 1], this.objs[i]];
    }
    this.commit();
  }
  flipSel() { this.selected().forEach(o => { o.flip = !o.flip; }); this.commit(); }
  nudge(dx, dy) { this.selected().forEach(o => { o.x += dx; o.y += dy; }); this.commit(); }

  // ------------------------------------------------------------ geometría
  box(o) { const b = o.border || 0; return { w: o.w + 2 * b, h: o.h + 2 * b }; }
  corners(o) {
    const { w, h } = this.box(o);
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({ x: o.x + x * c - y * s, y: o.y + x * s + y * c }));
  }
  aabb(o) {
    const p = this.corners(o);
    const xs = p.map(q => q.x), ys = p.map(q => q.y);
    const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
    return { l, r, t, b, cx: (l + r) / 2, cy: (t + b) / 2, w: r - l, h: b - t };
  }
  union(list) {
    if (!list.length) return null;
    const bs = list.map(o => this.aabb(o));
    const l = Math.min(...bs.map(b => b.l)), r = Math.max(...bs.map(b => b.r));
    const t = Math.min(...bs.map(b => b.t)), b = Math.max(...bs.map(b => b.b));
    return { l, r, t, b, cx: (l + r) / 2, cy: (t + b) / 2, w: r - l, h: b - t };
  }
  hit(o, p) {
    const dx = p.x - o.x, dy = p.y - o.y;
    const c = Math.cos(-o.rot), s = Math.sin(-o.rot);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    const { w, h } = this.box(o);
    return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
  }
  topAt(p) {
    for (let i = this.objs.length - 1; i >= 0; i--) if (this.hit(this.objs[i], p)) return this.objs[i];
    return null;
  }
  handlesFor(o) {
    // en coordenadas de pantalla
    const { w, h } = this.box(o);
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const toS = (lx, ly) => this.toScreen(o.x + lx * c - ly * s, o.y + lx * s + ly * c);
    const hs = [];
    const signs = o.type === 'text' ? [[-1, -1], [1, -1], [1, 1], [-1, 1]] : [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
    signs.forEach(([sx, sy]) => hs.push({ kind: 'scale', sx, sy, ...toS(sx * w / 2, sy * h / 2) }));
    const top = toS(0, -h / 2);
    hs.push({ kind: 'rotate', x: top.x + s * 28, y: top.y - c * 28, ax: top.x, ay: top.y });
    return hs;
  }

  // ------------------------------------------------------------ render de fuentes (máscara + borde sticker)
  source(o, maxPx = 1400) {
    const base = o.type === 'text' ? o._text : this.assets.get(o.asset)?.img;
    if (!base) return null;
    const b = o.border || 0;
    if ((!o.mask || o.mask === 'none') && !b) return base;
    const key = [o.id, o.mask, b.toFixed(2), o.borderColor, b ? o.w.toFixed(1) : '', maxPx, o._ver || 0, o.asset].join('|');
    const hit = this.cache.get(o.id);
    if (hit && hit.key === key) return hit.canvas;
    const nat = base instanceof HTMLCanvasElement ? { w: base.width, h: base.height } : natural(base);
    const k = Math.min(1, maxPx / Math.max(nat.w, nat.h));
    const cw = Math.max(1, Math.round(nat.w * k)), ch = Math.max(1, Math.round(nat.h * k));
    // 1) máscara
    const m = document.createElement('canvas');
    m.width = cw; m.height = ch;
    const mc = m.getContext('2d');
    if (o.mask === 'circle') { mc.beginPath(); mc.ellipse(cw / 2, ch / 2, cw / 2, ch / 2, 0, 0, Math.PI * 2); mc.clip(); }
    else if (o.mask === 'rounded') { roundRectPath(mc, 0, 0, cw, ch, Math.min(cw, ch) * 0.18); mc.clip(); }
    if (o.mask === 'cover-circle' || o.mask === 'square') { /* reservado */ }
    mc.drawImage(base, 0, 0, cw, ch);
    if (!b) { this.cache.set(o.id, { key, canvas: m }); return m; }
    // 2) borde troquelado (dilatación del contorno)
    const pad = Math.max(1, (b / o.w) * cw);
    const out = document.createElement('canvas');
    out.width = Math.round(cw + pad * 2); out.height = Math.round(ch + pad * 2);
    const oc = out.getContext('2d');
    const sil = document.createElement('canvas');
    sil.width = cw; sil.height = ch;
    const sc = sil.getContext('2d');
    sc.drawImage(m, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = o.borderColor || '#fff';
    sc.fillRect(0, 0, cw, ch);
    const steps = 28;
    for (const rr of [pad, pad * 0.66, pad * 0.33]) {
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        oc.drawImage(sil, pad + Math.cos(a) * rr, pad + Math.sin(a) * rr);
      }
    }
    oc.drawImage(m, pad, pad);
    this.cache.set(o.id, { key, canvas: out });
    return out;
  }

  // ------------------------------------------------------------ dibujo
  tplPath(ctx, grow = 0) {
    const T = this.tpl;
    roundRectPath(ctx, -grow, -grow, T.w + grow * 2, T.h + grow * 2, T.shape === 'flat' ? T.r + (T.r ? grow : 0) : 0);
  }
  drawObj(ctx, o, dx = 0, maxPx) {
    const src = this.source(o, maxPx);
    if (!src) return;
    const { w, h } = this.box(o);
    ctx.save();
    ctx.translate(o.x + dx, o.y);
    ctx.rotate(o.rot);
    if (o.flip) ctx.scale(-1, 1);
    ctx.globalAlpha *= o.opacity ?? 1;
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  drawAll(ctx, maxPxFn) {
    const T = this.tpl;
    for (const o of this.objs) {
      const mp = maxPxFn ? maxPxFn(o) : undefined;
      this.drawObj(ctx, o, 0, mp);
      if (T.shape === 'cylinder') {
        const b = this.aabb(o);
        if (b.l < 0) this.drawObj(ctx, o, T.w, mp);
        if (b.r > T.w) this.drawObj(ctx, o, -T.w, mp);
      }
    }
  }

  render() {
    const ctx = this.ctx, T = this.tpl;
    if (!T || !this.cw) return;
    const d = this.dpr, v = this.view, S = v.scale;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, this.cw, this.ch);
    const px = 1 / S; // 1px de pantalla en mm

    ctx.setTransform(S * d, 0, 0, S * d, v.ox * d, v.oy * d);

    // sombra de la plantilla
    ctx.save();
    ctx.translate(5 * px, 5 * px);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    this.tplPath(ctx); ctx.fill();
    ctx.restore();

    // fantasmas: lo que queda fuera de la plantilla
    ctx.save();
    ctx.globalAlpha = 0.28;
    for (const o of this.objs) this.drawObj(ctx, o);
    ctx.restore();

    // fondo de la plantilla
    ctx.save();
    this.tplPath(ctx);
    if (this.settings.transparent) {
      ctx.fillStyle = this._checker(ctx, px); ctx.fill();
    } else { ctx.fillStyle = this.settings.bg; ctx.fill(); }
    ctx.clip();
    this.drawAll(ctx);

    // zonas de secciones
    if (this.settings.showZones && this.zones.length) {
      for (const z of this.zones) {
        ctx.save();
        ctx.setLineDash([6 * px, 5 * px]);
        ctx.lineWidth = 1.5 * px;
        ctx.strokeStyle = z.color;
        ctx.fillStyle = z.color + '14';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeRect(z.x + px, z.y + px, z.w - 2 * px, z.h - 2 * px);
        ctx.setLineDash([]);
        ctx.font = `600 ${11 * px}px "JetBrains Mono", monospace`;
        const tw = ctx.measureText(z.name.toUpperCase()).width;
        ctx.fillStyle = z.color;
        roundRectPath(ctx, z.x + 6 * px, z.y + 6 * px, tw + 14 * px, 18 * px, 9 * px); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(z.name.toUpperCase(), z.x + 13 * px, z.y + 15.5 * px);
        ctx.restore();
      }
    }
    ctx.restore();

    // margen de seguridad
    const m = this.settings.safe;
    if (m > 0) {
      ctx.save();
      ctx.setLineDash([3 * px, 4 * px]);
      ctx.strokeStyle = 'rgba(255,79,154,.7)';
      ctx.lineWidth = 1 * px;
      roundRectPath(ctx, m, m, T.w - 2 * m, T.h - 2 * m, Math.max(0, (T.r || 0) - m));
      ctx.stroke();
      ctx.restore();
    }
    // línea de corte
    ctx.save();
    ctx.setLineDash([8 * px, 5 * px]);
    ctx.strokeStyle = '#1d1a16';
    ctx.lineWidth = 1.6 * px;
    this.tplPath(ctx); ctx.stroke();
    ctx.restore();

    // costura del cilindro
    if (T.shape === 'cylinder') {
      ctx.save();
      ctx.fillStyle = '#ffe14d';
      ctx.font = `600 ${10 * px}px "JetBrains Mono", monospace`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      ctx.fillText('↔ costura', 0, T.h + 8 * px);
      ctx.fillText('costura ↔', T.w, T.h + 8 * px);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillText('lo que pasa de un borde aparece en el otro: da la vuelta', T.w / 2, T.h + 22 * px);
      ctx.restore();
    }

    this._rulers(ctx, px);

    // guías inteligentes
    this._drawGuides(ctx, px);

    // selección (en pantalla)
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const sel = this.selected();
    for (const o of sel) {
      const p = this.corners(o).map(q => this.toScreen(q.x, q.y));
      ctx.beginPath();
      p.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.closePath();
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#1d1a16'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (sel.length === 1 && !(this.drag && this.drag.mode === 'move')) {
      const hs = this.handlesFor(sel[0]);
      for (const hd of hs) {
        if (hd.kind === 'rotate') {
          ctx.beginPath(); ctx.moveTo(hd.ax, hd.ay); ctx.lineTo(hd.x, hd.y); ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.arc(hd.x, hd.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#ff4f9a'; ctx.fill(); ctx.strokeStyle = '#1d1a16'; ctx.lineWidth = 2; ctx.stroke();
        } else {
          const r = hd.sx && hd.sy ? 6 : 4.5;
          ctx.beginPath(); ctx.rect(hd.x - r, hd.y - r, r * 2, r * 2); ctx.fillStyle = '#fffdf6'; ctx.fill(); ctx.strokeStyle = '#1d1a16'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    } else if (sel.length > 1) {
      const u = this.union(sel);
      const a = this.toScreen(u.l, u.t), b = this.toScreen(u.r, u.b);
      ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 1.5; ctx.strokeRect(a.x - 4, a.y - 4, b.x - a.x + 8, b.y - a.y + 8); ctx.setLineDash([]);
    }
    // recuadro de selección múltiple
    if (this.drag && this.drag.mode === 'marquee' && this.drag.cur) {
      const a = this.drag.startS, b = this.drag.curS;
      ctx.fillStyle = 'rgba(255,225,77,.15)'; ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 1;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
  }
  _checker(ctx, px) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#e4e0d6'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
    const p = ctx.createPattern(c, 'repeat');
    p.setTransform(new DOMMatrix().scale(px));
    return p;
  }
  _rulers(ctx, px) {
    const T = this.tpl;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 1 * px;
    ctx.font = `${10 * px}px "JetBrains Mono", monospace`;
    const step = this.view.scale * 10 < 9 ? 50 : 10; // cada 1 cm (o 5 cm si está muy lejos)
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (let x = 0; x <= T.w + 0.01; x += step) {
      const big = Math.round(x) % 50 === 0;
      ctx.beginPath(); ctx.moveTo(x, -4 * px); ctx.lineTo(x, -(big ? 12 : 7) * px); ctx.stroke();
      if (big && x > 0) ctx.fillText(Math.round(x / 10), x, -14 * px);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = 0; y <= T.h + 0.01; y += step) {
      const big = Math.round(y) % 50 === 0;
      ctx.beginPath(); ctx.moveTo(-4 * px, y); ctx.lineTo(-(big ? 12 : 7) * px, y); ctx.stroke();
      if (big && y > 0) ctx.fillText(Math.round(y / 10), -15 * px, y);
    }
    // medidas totales
    ctx.fillStyle = '#ffe14d';
    ctx.font = `600 ${12 * px}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${fmtCm(T.w)} cm`, T.w / 2, -28 * px);
    ctx.save(); ctx.translate(-34 * px, T.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`${fmtCm(T.h)} cm`, 0, 0); ctx.restore();
    ctx.restore();
  }
  _drawGuides(ctx, px) {
    if (!this.guides.length) return;
    const T = this.tpl;
    ctx.save();
    ctx.strokeStyle = '#ff2f86';
    ctx.fillStyle = '#ff2f86';
    ctx.lineWidth = 1.5 * px;
    ctx.font = `600 ${10 * px}px "JetBrains Mono", monospace`;
    for (const g of this.guides) {
      if (g.type === 'v') { ctx.beginPath(); ctx.moveTo(g.x, g.y1); ctx.lineTo(g.x, g.y2); ctx.stroke(); }
      else if (g.type === 'h') { ctx.beginPath(); ctx.moveTo(g.x1, g.y); ctx.lineTo(g.x2, g.y); ctx.stroke(); }
      else if (g.type === 'center') {
        ctx.save(); ctx.setLineDash([2 * px, 3 * px]);
        if (g.axis === 'x') { ctx.beginPath(); ctx.moveTo(T.w / 2, -10 * px); ctx.lineTo(T.w / 2, T.h + 10 * px); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(-10 * px, T.h / 2); ctx.lineTo(T.w + 10 * px, T.h / 2); ctx.stroke(); }
        ctx.restore();
      } else if (g.type === 'gap') {
        const t = 4 * px;
        ctx.beginPath();
        if (g.axis === 'x') {
          ctx.moveTo(g.a, g.at); ctx.lineTo(g.b, g.at);
          ctx.moveTo(g.a, g.at - t); ctx.lineTo(g.a, g.at + t); ctx.moveTo(g.b, g.at - t); ctx.lineTo(g.b, g.at + t);
        } else {
          ctx.moveTo(g.at, g.a); ctx.lineTo(g.at, g.b);
          ctx.moveTo(g.at - t, g.a); ctx.lineTo(g.at + t, g.a); ctx.moveTo(g.at - t, g.b); ctx.lineTo(g.at + t, g.b);
        }
        ctx.stroke();
        const lbl = `${fmtCm(Math.abs(g.b - g.a))}`;
        const mx = g.axis === 'x' ? (g.a + g.b) / 2 : g.at, my = g.axis === 'x' ? g.at : (g.a + g.b) / 2;
        const tw = ctx.measureText(lbl).width;
        ctx.fillStyle = '#ff2f86';
        roundRectPath(ctx, mx - tw / 2 - 4 * px, my - 8 * px - 6 * px, tw + 8 * px, 13 * px, 4 * px); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lbl, mx, my - 7.5 * px);
        ctx.fillStyle = '#ff2f86';
      } else if (g.type === 'circle') {
        ctx.save(); ctx.setLineDash([5 * px, 4 * px]);
        ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(g.cx, g.cy, 3 * px, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        (g.rays || []).forEach(p => { ctx.save(); ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.restore(); });
      } else if (g.type === 'size') {
        ctx.save(); ctx.lineWidth = 3 * px; ctx.globalAlpha = .8;
        ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ guías inteligentes
  _others(excl) { return this.objs.filter(o => !excl.has(o.id)).map(o => ({ o, b: this.aabb(o) })); }

  _spacing(axis, mb, others, thr) {
    const lo = axis === 'x' ? 'l' : 't', hi = axis === 'x' ? 'r' : 'b';
    const plo = axis === 'x' ? 't' : 'l', phi = axis === 'x' ? 'b' : 'r';
    const c = axis === 'x' ? 'cx' : 'cy';
    const ov = others.map(x => x.b).filter(b => b[phi] > mb[plo] && b[plo] < mb[phi]);
    if (!ov.length) return [];
    const size = mb[hi] - mb[lo];
    const left = ov.filter(b => b[c] < mb[c] && b[hi] <= mb[lo] + thr * 3).sort((a, b) => b[hi] - a[hi]);
    const right = ov.filter(b => b[c] > mb[c] && b[lo] >= mb[hi] - thr * 3).sort((a, b) => a[lo] - b[lo]);
    const L = left[0], R = right[0];
    const out = [];
    if (L && R) {
      const gap = (R[lo] - L[hi] - size) / 2;
      if (gap > 0.5) out.push({ v: (L[hi] + gap) - mb[lo], kind: 'between', L, R, gap });
    }
    const sorted = ov.slice().sort((a, b) => a[lo] - b[lo]);
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = sorted[i + 1][lo] - sorted[i][hi];
      if (g <= 0.5) continue;
      const ref = { a: sorted[i], b: sorted[i + 1], g };
      if (L && L !== sorted[i + 1]) out.push({ v: (L[hi] + g) - mb[lo], kind: 'gap', side: 'L', N: L, ref });
      if (R && R !== sorted[i]) out.push({ v: (R[lo] - g) - mb[hi], kind: 'gap', side: 'R', N: R, ref });
    }
    out.forEach(o => { o.d = Math.abs(o.v); });
    return out;
  }

  snapMove(mb, excl) {
    const T = this.tpl, thr = SNAP_PX / this.view.scale, m = this.settings.safe;
    const others = this._others(excl);
    const hints = [];
    const guides = [];

    const axisBest = (axis) => {
      const lo = axis === 'x' ? 'l' : 't', hi = axis === 'x' ? 'r' : 'b', c = axis === 'x' ? 'cx' : 'cy';
      const L = axis === 'x' ? T.w : T.h;
      let best = { d: thr, v: 0, none: true };
      const tg = [{ v: L / 2, kind: 'center', only: c }, { v: 0, kind: 'edge' }, { v: L, kind: 'edge' }];
      if (m > 0) tg.push({ v: m, kind: 'safe' }, { v: L - m, kind: 'safe' });
      others.forEach(({ b }) => { tg.push({ v: b[lo], kind: 'obj' }, { v: b[c], kind: 'obj' }, { v: b[hi], kind: 'obj' }); });
      for (const k of [lo, c, hi]) for (const t of tg) {
        if (t.only && t.only !== k) continue;
        const d = Math.abs(t.v - mb[k]);
        if (d < best.d - 1e-6) best = { d, v: t.v - mb[k], t, k };
      }
      for (const s of this._spacing(axis, mb, others, thr)) {
        if (s.d < best.d - 1e-6) best = { d: s.d, v: s.v, spacing: s };
      }
      return best;
    };

    let bx = axisBest('x'), by = axisBest('y');

    // radial: misma distancia al centro que otro sticker
    const C = { x: T.w / 2, y: T.h / 2 };
    let radial = null;
    const rp = Math.hypot(mb.cx - C.x, mb.cy - C.y);
    if (rp > 6) {
      for (const { b } of others) {
        const rt = Math.hypot(b.cx - C.x, b.cy - C.y);
        if (rt < 6) continue;
        const d = Math.abs(rp - rt);
        if (d < thr && (!radial || d < radial.d)) radial = { d, r: rt };
      }
    }
    let dx = 0, dy = 0;
    if (radial && radial.d < Math.min(bx.none ? Infinity : bx.d, by.none ? Infinity : by.d)) {
      let a = Math.atan2(mb.cy - C.y, mb.cx - C.x);
      // ángulos parejos sobre el mismo círculo
      const angs = others.filter(({ b }) => Math.abs(Math.hypot(b.cx - C.x, b.cy - C.y) - radial.r) < 0.6)
        .map(({ b }) => Math.atan2(b.cy - C.y, b.cx - C.x)).sort((p, q) => p - q);
      let even = false;
      if (angs.length >= 1) {
        const cands = [];
        const norm = x => Math.atan2(Math.sin(x), Math.cos(x));
        if (angs.length >= 2) {
          const steps = angs.map((x, i) => norm(angs[(i + 1) % angs.length] - x)).map(x => x <= 0 ? x + Math.PI * 2 : x);
          angs.forEach((x, i) => {
            const nx = angs[(i + 1) % angs.length];
            let span = norm(nx - x); if (span <= 0) span += Math.PI * 2;
            cands.push(x + span / 2);
            steps.forEach(st => { if (st < Math.PI * 1.9) { cands.push(x + st); cands.push(x - st); } });
          });
        } else {
          [Math.PI, Math.PI / 2, -Math.PI / 2].forEach(st => cands.push(angs[0] + st));
        }
        let bestA = null;
        for (const ca of cands) {
          const da = Math.abs(norm(ca - a)) * radial.r;
          if (da < thr && (!bestA || da < bestA.d)) bestA = { d: da, a: ca };
        }
        if (bestA) { a = bestA.a; even = true; }
      }
      const nx = C.x + Math.cos(a) * radial.r, ny = C.y + Math.sin(a) * radial.r;
      dx = nx - mb.cx; dy = ny - mb.cy;
      const rays = others.filter(({ b }) => Math.abs(Math.hypot(b.cx - C.x, b.cy - C.y) - radial.r) < 0.6).map(({ b }) => ({ x: b.cx, y: b.cy }));
      rays.push({ x: nx, y: ny });
      guides.push({ type: 'circle', cx: C.x, cy: C.y, r: radial.r, rays });
      hints.push(`◎ Distribución radial · r ${fmtCm(radial.r)} cm`);
      if (even) hints.push('Ángulos parejos ✦');
      this.guides = guides; this._hints = hints;
      return { dx, dy };
    }

    if (!bx.none) dx = bx.v;
    if (!by.none) dy = by.v;
    const nb = { l: mb.l + dx, r: mb.r + dx, t: mb.t + dy, b: mb.b + dy, cx: mb.cx + dx, cy: mb.cy + dy };

    const describe = (axis, best) => {
      if (best.none) return;
      const lo = axis === 'x' ? 'l' : 't', hi = axis === 'x' ? 'r' : 'b', c = axis === 'x' ? 'cx' : 'cy';
      if (best.spacing) {
        const s = best.spacing;
        const at = (bb) => axis === 'x' ? (Math.max(bb.t, nb.t) + Math.min(bb.b, nb.b)) / 2 : (Math.max(bb.l, nb.l) + Math.min(bb.r, nb.r)) / 2;
        if (s.kind === 'between') {
          guides.push({ type: 'gap', axis, a: s.L[hi], b: nb[lo], at: at(s.L) });
          guides.push({ type: 'gap', axis, a: nb[hi], b: s.R[lo], at: at(s.R) });
          hints.push('↔ Espaciado parejo entre vecinos');
        } else {
          if (s.side === 'L') guides.push({ type: 'gap', axis, a: s.N[hi], b: nb[lo], at: at(s.N) });
          else guides.push({ type: 'gap', axis, a: nb[hi], b: s.N[lo], at: at(s.N) });
          const ra = s.ref.a, rb = s.ref.b;
          const rat = axis === 'x' ? (Math.max(ra.t, rb.t) + Math.min(ra.b, rb.b)) / 2 : (Math.max(ra.l, rb.l) + Math.min(ra.r, rb.r)) / 2;
          guides.push({ type: 'gap', axis, a: ra[hi], b: rb[lo], at: rat });
          hints.push('↔ Misma separación que otros');
        }
        return;
      }
      const kind = best.t.kind;
      const Lt = axis === 'x' ? T.w : T.h;
      if (kind === 'center') { guides.push({ type: 'center', axis }); hints.push(axis === 'x' ? 'Centrado horizontal' : 'Centrado vertical'); return; }
      const val = nb[best.k];
      if (kind === 'edge' || kind === 'safe') {
        if (axis === 'x') guides.push({ type: 'v', x: val, y1: 0, y2: T.h }); else guides.push({ type: 'h', y: val, x1: 0, x2: T.w });
        hints.push(kind === 'safe' ? 'En el margen de seguridad' : (val <= 0.01 || Math.abs(val - Lt) < 0.01) ? 'Pegado al borde' : 'Alineado');
        return;
      }
      // alineado con otros: encontrar todos los que comparten esa línea
      const matches = others.filter(({ b }) => [b[lo], b[c], b[hi]].some(q => Math.abs(q - val) < 0.05));
      const span = [nb, ...matches.map(x => x.b)];
      if (axis === 'x') guides.push({ type: 'v', x: val, y1: Math.min(...span.map(b => b.t)) - 4, y2: Math.max(...span.map(b => b.b)) + 4 });
      else guides.push({ type: 'h', y: val, x1: Math.min(...span.map(b => b.l)) - 4, x2: Math.max(...span.map(b => b.r)) + 4 });
      const how = best.k === c ? 'por el centro' : (best.k === lo ? (axis === 'x' ? 'por la izquierda' : 'por arriba') : (axis === 'x' ? 'por la derecha' : 'por abajo'));
      hints.push(`Alineado ${how} con ${matches.length} ${matches.length === 1 ? 'sticker' : 'stickers'}`);
    };
    describe('x', bx);
    describe('y', by);
    if (!bx.none && !by.none && bx.t?.kind === 'center' && by.t?.kind === 'center') {
      hints.length = 0; hints.push('✦ Centrado en la plantilla');
    }
    this.guides = guides;
    this._hints = hints;
    return { dx, dy };
  }

  snapRotation(o, rot) {
    const T = this.tpl;
    const tol = 4 * DEG;
    const norm = a => Math.atan2(Math.sin(a), Math.cos(a));
    const cands = [{ a: 0, h: 'Derecho' }, { a: Math.PI / 2, h: '90°' }, { a: -Math.PI / 2, h: '-90°' }, { a: Math.PI, h: '180°' }, { a: Math.PI / 4, h: '45°' }, { a: -Math.PI / 4, h: '-45°' }];
    const C = { x: T.w / 2, y: T.h / 2 };
    if (Math.hypot(o.x - C.x, o.y - C.y) > 8) {
      const out = Math.atan2(o.y - C.y, o.x - C.x) + Math.PI / 2;
      cands.push({ a: out, h: '◎ Mirando hacia afuera', radial: true }, { a: out + Math.PI, h: '◎ Mirando al centro', radial: true });
    }
    // igual rotación que otro sticker
    this.objs.forEach(p => { if (p.id !== o.id && Math.abs(norm(p.rot)) > 1 * DEG) cands.push({ a: p.rot, h: 'Misma rotación que otro' }); });
    let best = null;
    for (const c of cands) {
      const d = Math.abs(norm(rot - c.a));
      if (d < tol && (!best || d < best.d)) best = { ...c, d };
    }
    this.guides = [];
    if (best) {
      if (best.radial) this.guides.push({ type: 'circle', cx: C.x, cy: C.y, r: Math.hypot(o.x - C.x, o.y - C.y), rays: [{ x: o.x, y: o.y }] });
      this._hints = [best.h];
      return best.a;
    }
    this._hints = [`${Math.round(norm(rot) / DEG)}°`];
    return rot;
  }

  // ------------------------------------------------------------ interacción
  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this._down(e));
    c.addEventListener('pointermove', e => this._move(e));
    c.addEventListener('pointerup', e => this._up(e));
    c.addEventListener('pointercancel', e => this._up(e));
    c.addEventListener('dblclick', e => {
      const p = this._p(e);
      const o = this.topAt(p);
      if (o) this.onDblClick(o);
    });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) this.zoomAt(Math.exp(-e.deltaY * 0.01), e.offsetX, e.offsetY);
      else { this.view.ox -= e.deltaX; this.view.oy -= e.deltaY; this.render(); }
    }, { passive: false });
  }
  _p(e) { return this.toMM(e.offsetX, e.offsetY); }

  _down(e) {
    if (!this.tpl) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this._p(e);
    const S = { x: e.offsetX, y: e.offsetY };
    if (e.button === 1 || this.space) { this.drag = { mode: 'pan', S, ox: this.view.ox, oy: this.view.oy }; return; }
    const sel = this.selected();
    if (sel.length === 1) {
      const o = sel[0];
      for (const h of this.handlesFor(o)) {
        if (Math.hypot(h.x - S.x, h.y - S.y) <= HANDLE + 2) {
          if (h.kind === 'rotate') {
            this.drag = { mode: 'rotate', o, startRot: o.rot, startA: Math.atan2(p.y - o.y, p.x - o.x) };
          } else {
            this.drag = { mode: 'scale', o, h, start: { x: o.x, y: o.y, w: o.w, h: o.h, b: o.border || 0 } };
          }
          return;
        }
      }
    }
    const hitO = this.topAt(p);
    if (hitO) {
      if (e.shiftKey) {
        this.select(this.sel.includes(hitO.id) ? this.sel.filter(i => i !== hitO.id) : [...this.sel, hitO.id]);
      } else if (!this.sel.includes(hitO.id)) this.select([hitO.id]);
      const moving = this.selected();
      this.drag = { mode: 'move', p0: p, starts: moving.map(o => ({ o, x: o.x, y: o.y })), ids: new Set(moving.map(o => o.id)), moved: false };
      this.render();
      return;
    }
    if (!e.shiftKey) this.select([]);
    this.drag = { mode: 'marquee', p0: p, startS: S, base: e.shiftKey ? [...this.sel] : [] };
  }

  _move(e) {
    const p = this._p(e);
    const S = { x: e.offsetX, y: e.offsetY };
    const d = this.drag;
    if (!d) { this._hover(p, S); return; }
    const snap = this.snapOn && !e.altKey;
    if (d.mode === 'pan') {
      this.view.ox = d.ox + (S.x - d.S.x); this.view.oy = d.oy + (S.y - d.S.y);
      this.render(); return;
    }
    if (d.mode === 'move') {
      let dx = p.x - d.p0.x, dy = p.y - d.p0.y;
      if (!d.moved && Math.hypot(dx, dy) * this.view.scale < 2) return;
      d.moved = true;
      d.starts.forEach(s => { s.o.x = s.x + dx; s.o.y = s.y + dy; });
      if (snap) {
        const u = this.union(d.starts.map(s => s.o));
        const c = this.snapMove(u, d.ids);
        d.starts.forEach(s => { s.o.x += c.dx; s.o.y += c.dy; });
      } else { this.guides = []; this._hints = []; }
      this._showHints();
      this.render(); this.onSelect(this.selected(), true); return;
    }
    if (d.mode === 'scale') { this._scale(d, p, e.shiftKey, snap); return; }
    if (d.mode === 'rotate') {
      const o = d.o;
      const a = Math.atan2(p.y - o.y, p.x - o.x);
      let r = d.startRot + (a - d.startA);
      if (e.shiftKey) { r = Math.round(r / (15 * DEG)) * 15 * DEG; this._hints = [`${Math.round(r / DEG)}°`]; this.guides = []; }
      else if (snap) r = this.snapRotation(o, r);
      else this._hints = [`${Math.round(r / DEG)}°`];
      o.rot = r;
      d.changed = true;
      this._showHints(); this.render(); this.onSelect(this.selected(), true); return;
    }
    if (d.mode === 'marquee') {
      d.cur = p; d.curS = S;
      const l = Math.min(d.p0.x, p.x), r = Math.max(d.p0.x, p.x), t = Math.min(d.p0.y, p.y), b = Math.max(d.p0.y, p.y);
      const inside = this.objs.filter(o => { const bb = this.aabb(o); return bb.r > l && bb.l < r && bb.b > t && bb.t < b; }).map(o => o.id);
      this.sel = [...new Set([...d.base, ...inside])];
      this.onSelect(this.selected());
      this.render();
    }
  }

  _scale(d, p, free, snap) {
    const o = d.o, st = d.start, { sx, sy } = d.h;
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const bw = st.w + 2 * st.b, bh = st.h + 2 * st.b;
    // ancla: el punto opuesto queda fijo
    const ax = st.x + (-sx * bw / 2) * c - (-sy * bh / 2) * s;
    const ay = st.y + (-sx * bw / 2) * s + (-sy * bh / 2) * c;
    const vx = p.x - ax, vy = p.y - ay;
    const lx = vx * c + vy * s, ly = -vx * s + vy * c; // vector en el marco del objeto
    let nbw = bw, nbh = bh;
    const min = 3;
    const keep = (sx && sy && !free) || o.type === 'text';
    this._hints = []; this.guides = [];
    if (keep) {
      const dxv = sx * bw, dyv = sy * bh;
      let k = (lx * dxv + ly * dyv) / (dxv * dxv + dyv * dyv);
      k = Math.max(k, min / Math.min(bw, bh));
      if (snap) {
        const thr = SNAP_PX / this.view.scale;
        let best = null;
        for (const q of this.objs) {
          if (q.id === o.id) continue;
          const qb = this.box(q);
          for (const [mine, theirs, lbl] of [[bw, qb.w, 'Mismo ancho que otro'], [bh, qb.h, 'Mismo alto que otro']]) {
            const kk = theirs / mine;
            const dd = Math.abs(mine * k - theirs);
            if (dd < thr && (!best || dd < best.dd)) best = { dd, kk, lbl, q };
          }
        }
        if (best) { k = best.kk; this._hints = [`▣ ${best.lbl}`]; const qb = this.aabb(best.q); this.guides = [{ type: 'size', x1: qb.l, y1: qb.b + 3, x2: qb.r, y2: qb.b + 3 }]; }
      }
      nbw = bw * k; nbh = bh * k;
    } else {
      if (sx) nbw = Math.max(min, sx * lx);
      if (sy) nbh = Math.max(min, sy * ly);
    }
    const b = st.b * (keep ? nbw / bw : 1);
    o.border = st.b ? b : 0;
    o.w = Math.max(1, nbw - 2 * o.border); o.h = Math.max(1, nbh - 2 * o.border);
    const half = { x: sx * nbw / 2, y: sy * nbh / 2 };
    o.x = ax + half.x * c - half.y * s;
    o.y = ay + half.x * s + half.y * c;
    if (!this._hints.length) this._hints = [`${fmtCm(o.w)} × ${fmtCm(o.h)} cm`];
    d.changed = true;
    this._showHints(); this.render(); this.onSelect(this.selected(), true);
  }

  _up() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if ((d.mode === 'move' && d.moved) || ((d.mode === 'scale' || d.mode === 'rotate') && d.changed)) {
      this._normalizeWrap();
      this.commit();
      this._warn();
    }
    this.guides = [];
    this._fadeHints();
    this.render();
  }

  _hover(p, S) {
    let cur = 'default';
    const sel = this.selected();
    if (this.space) cur = 'grab';
    else {
      if (sel.length === 1) {
        for (const h of this.handlesFor(sel[0])) {
          if (Math.hypot(h.x - S.x, h.y - S.y) <= HANDLE + 2) {
            if (h.kind === 'rotate') cur = 'grab';
            else {
              const ang = (Math.atan2(h.sy, h.sx) + sel[0].rot) / DEG;
              const a = ((ang % 180) + 180) % 180;
              cur = a < 22.5 || a >= 157.5 ? 'ew-resize' : a < 67.5 ? 'nwse-resize' : a < 112.5 ? 'ns-resize' : 'nesw-resize';
            }
            break;
          }
        }
      }
      if (cur === 'default' && this.topAt(p)) cur = 'move';
    }
    this.canvas.style.cursor = cur;
  }

  _normalizeWrap() {
    const T = this.tpl;
    if (T.shape !== 'cylinder') return;
    this.objs.forEach(o => { if (o.x < 0) o.x += T.w; else if (o.x > T.w) o.x -= T.w; });
  }

  _warn() {
    const T = this.tpl;
    const sel = this.selected();
    const msgs = [];
    for (const o of sel) {
      const b = this.aabb(o);
      if (T.shape === 'cylinder') {
        if (b.t < 0 || b.b > T.h) msgs.push('⚠ Parte del sticker queda fuera de la plantilla');
        else if (b.l < 0 || b.r > T.w) msgs.push('↻ Este sticker cruza la costura: se va a ver continuo al dar la vuelta');
      } else if (b.l < 0 || b.r > T.w || b.t < 0 || b.b > T.h) msgs.push('⚠ Parte del sticker queda fuera de la plantilla');
    }
    if (msgs.length) { this._hints = [...new Set(msgs)]; this._showHints(true); this._fadeHints(2600); }
  }

  _showHints(soft = false) {
    const h = this._hints || [];
    this.hintsEl.innerHTML = h.map(t => `<span class="hint-pill${soft ? ' soft' : ''}">${t}</span>`).join('');
    clearTimeout(this._ht);
  }
  _fadeHints(ms = 1100) {
    clearTimeout(this._ht);
    this._ht = setTimeout(() => { this.hintsEl.innerHTML = ''; }, ms);
  }
  flash(msgs, ms = 1800) { this._hints = msgs; this._showHints(); this._fadeHints(ms); }

  // ------------------------------------------------------------ herramientas de alineación / distribución
  align(mode) {
    const sel = this.selected();
    if (!sel.length) return;
    const T = this.tpl;
    const ref = sel.length === 1 ? { l: 0, r: T.w, t: 0, b: T.h, cx: T.w / 2, cy: T.h / 2 } : this.union(sel);
    sel.forEach(o => {
      const b = this.aabb(o);
      if (mode === 'al-left') o.x += ref.l - b.l;
      if (mode === 'al-right') o.x += ref.r - b.r;
      if (mode === 'al-cx') o.x += ref.cx - b.cx;
      if (mode === 'al-top') o.y += ref.t - b.t;
      if (mode === 'al-bottom') o.y += ref.b - b.b;
      if (mode === 'al-cy') o.y += ref.cy - b.cy;
    });
    this.flash([sel.length === 1 ? 'Alineado a la plantilla' : `Alineados ${sel.length} stickers`]);
    this.commit();
  }
  distribute(axis) {
    const sel = this.selected();
    if (sel.length < 3) {
      if (sel.length === 2) return this.flash(['Elegí 3 o más para repartir el espacio parejo']);
      return this.flash(['Seleccioná varios stickers (Shift + click o arrastrá un recuadro)']);
    }
    const lo = axis === 'x' ? 'l' : 't', hi = axis === 'x' ? 'r' : 'b', c = axis === 'x' ? 'cx' : 'cy', key = axis === 'x' ? 'x' : 'y';
    const items = sel.map(o => ({ o, b: this.aabb(o) })).sort((a, b) => a.b[c] - b.b[c]);
    const first = items[0].b, last = items[items.length - 1].b;
    const total = items.reduce((s, it) => s + (it.b[hi] - it.b[lo]), 0);
    const gap = (last[hi] - first[lo] - total) / (items.length - 1);
    let cur = first[lo];
    items.forEach(it => { const size = it.b[hi] - it.b[lo]; it.o[key] += cur - it.b[lo]; cur += size + gap; });
    this.flash([`↔ Espaciado parejo: ${fmtCm(Math.max(gap, 0))} cm`]);
    this.commit();
  }
  radial() {
    let list = this.selected();
    if (list.length < 2) list = this.objs.slice();
    if (list.length < 2) return this.flash(['Necesitás al menos 2 stickers para armar un círculo']);
    const T = this.tpl, m = this.settings.safe;
    const C = { x: T.w / 2, y: T.h / 2 };
    const n = list.length;
    const R0 = Math.min(T.w, T.h) / 2 - m;
    const dmax = Math.min(R0 * 0.62, (2 * Math.PI * R0) / (1.15 * n + Math.PI));
    list.sort((a, b) => Math.atan2(a.y - C.y, a.x - C.x) - Math.atan2(b.y - C.y, b.x - C.x));
    list.forEach(o => {
      const bx = this.box(o);
      const big = Math.max(bx.w, bx.h);
      if (big > dmax) { const k = dmax / big; o.w *= k; o.h *= k; o.border = (o.border || 0) * k; }
    });
    const r = R0 - dmax / 2;
    list.forEach((o, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      o.x = C.x + Math.cos(a) * r; o.y = C.y + Math.sin(a) * r;
    });
    if (list.length === this.objs.length) this.select(list.map(o => o.id));
    this.flash([`◎ ${n} stickers en círculo · r ${fmtCm(r)} cm`, 'Tip: rotá uno y el imán te ofrece "mirando hacia afuera"']);
    this.commit();
  }
  packInto(list, R, gap = 3) {
    if (!list.length) return;
    const items = list.map(o => ({ o, a: this.box(o).w / this.box(o).h }));
    const layout = (hRow) => {
      const rows = [[]]; let x = 0;
      for (const it of items) {
        const w = hRow * it.a;
        if (w > R.w) return null;
        if (x > 0 && x + w > R.w) { rows.push([]); x = 0; }
        rows[rows.length - 1].push({ it, x, w });
        x += w + gap;
      }
      const H = rows.length * hRow + (rows.length - 1) * gap;
      return H <= R.h ? { rows, H } : null;
    };
    let lo = 1, hi = R.h, best = null;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      const L = layout(mid);
      if (L) { best = { L, h: mid }; lo = mid; } else hi = mid;
    }
    if (!best) return;
    const { L, h } = best;
    let y = R.y + (R.h - L.H) / 2;
    for (const row of L.rows) {
      const rw = row.reduce((s, q) => s + q.w, 0) + gap * (row.length - 1);
      const x0 = R.x + (R.w - rw) / 2;
      for (const q of row) {
        const o = q.it.o;
        const ratio = (h) / this.box(o).h;
        o.border = (o.border || 0) * ratio;
        o.h = h - 2 * o.border; o.w = q.w - 2 * o.border;
        o.rot = 0;
        o.x = x0 + q.x + q.w / 2; o.y = y + h / 2;
      }
      y += h + gap;
    }
  }
  pack() {
    let list = this.selected();
    if (list.length < 2) list = this.objs.slice();
    if (!list.length) return;
    const T = this.tpl, m = this.settings.safe + 2;
    this.packInto(list, { x: m, y: m, w: T.w - 2 * m, h: T.h - 2 * m });
    this.zones = [];
    this.flash(['▦ Acomodado en grilla pareja']);
    this.commit();
  }
  organizeBySections(sections) {
    if (!this.objs.length) return this.flash(['Primero agregá algunas imágenes']);
    const T = this.tpl, m = this.settings.safe + 2;
    const groups = sections.map(s => ({ s, list: this.objs.filter(o => (o.section || 'none') === s.id) })).filter(g => g.list.length);
    const horizontal = T.w >= T.h;
    const total = groups.reduce((s, g) => s + g.list.length, 0);
    const span = (horizontal ? T.w : T.h) - 2 * m;
    let cur = m;
    this.zones = [];
    groups.forEach(g => {
      const size = span * g.list.length / total;
      const R = horizontal ? { x: cur, y: m, w: size, h: T.h - 2 * m } : { x: m, y: cur, w: T.w - 2 * m, h: size };
      this.zones.push({ ...R, name: g.s.name, color: g.s.color });
      const inner = { x: R.x + 3, y: R.y + 26 / this.view.scale + 3, w: R.w - 6, h: R.h - 26 / this.view.scale - 6 };
      this.packInto(g.list, inner);
      cur += size;
    });
    this.settings.showZones = true;
    this.flash([`✦ Ordenado en ${groups.length} ${groups.length === 1 ? 'sección' : 'secciones'}`]);
    this.commit();
  }

  // ------------------------------------------------------------ historial
  strip(o) { const r = {}; FIELDS.forEach(k => { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
  snapshot() { return JSON.stringify({ objs: this.objs.map(o => this.strip(o)), settings: this.settings, zones: this.zones }); }
  commit() {
    const s = this.snapshot();
    if (this.history[this.history.length - 1] !== s) {
      this.history.push(s);
      if (this.history.length > 80) this.history.shift();
      this.future = [];
    }
    this.render();
    this.onChange('objs');
  }
  async restore(s) {
    const data = JSON.parse(s);
    const prev = new Map(this.objs.map(o => [o.id, o]));
    this.objs = data.objs.map(o => {
      const p = prev.get(o.id);
      const n = { ...o };
      if (o.type === 'text' && p && p._text && p.text === o.text && p.font === o.font && p.color === o.color && p.weight === o.weight) { n._text = p._text; n._ver = p._ver; }
      return n;
    });
    for (const o of this.objs) if (o.type === 'text' && !o._text) { const h = o.h, w = o.w; await this.buildText(o); o.h = h; o.w = w; }
    Object.assign(this.settings, data.settings);
    this.zones = data.zones || [];
    this.sel = this.sel.filter(id => this.objs.some(o => o.id === id));
    this.onSelect(this.selected());
    this.render();
    this.onChange('objs');
  }
  undo() { if (this.history.length < 2) return; this.future.push(this.history.pop()); this.restore(this.history[this.history.length - 1]); }
  redo() { if (!this.future.length) return; const s = this.future.pop(); this.history.push(s); this.restore(s); }

  // ------------------------------------------------------------ proyecto
  toProject() {
    return {
      app: 'plot-your-mate', version: 1, template: this.tpl, settings: this.settings, zones: this.zones,
      assets: [...this.assets.values()].map(a => ({ id: a.id, name: a.name, section: a.section, dataURL: a.dataURL })),
      objs: this.objs.map(o => this.strip(o)),
    };
  }
  async loadProject(p) {
    this.assets.clear();
    this.cache.clear();
    for (const a of p.assets || []) { try { await this.registerAsset(a); } catch (e) { console.warn(e); } }
    this.setTemplate(p.template);
    Object.assign(this.settings, p.settings || {});
    this.zones = p.zones || [];
    this.objs = [];
    for (const o of p.objs || []) {
      const n = { ...o };
      if (n.type === 'text') { const w = n.w, h = n.h; await this.buildText(n); n.w = w; n.h = h; }
      if (n.type === 'image' && !this.assets.has(n.asset)) continue;
      this.objs.push(n);
    }
    this.history = []; this.future = [];
    this.sel = [];
    this.commit();
    this.onSelect([]);
    this.onChange('assets');
  }

  // ------------------------------------------------------------ exportación
  exportCanvas({ dpi = 300, cut = true, bleed = 0 } = {}) {
    const T = this.tpl;
    let ppm = dpi / 25.4;
    const Wmm = T.w + bleed * 2, Hmm = T.h + bleed * 2;
    const MAXPX = 80e6;
    if (Wmm * Hmm * ppm * ppm > MAXPX) ppm = Math.sqrt(MAXPX / (Wmm * Hmm));
    const c = document.createElement('canvas');
    c.width = Math.round(Wmm * ppm); c.height = Math.round(Hmm * ppm);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(ppm, 0, 0, ppm, bleed * ppm, bleed * ppm);
    ctx.save();
    this.tplPath(ctx, bleed);
    if (!this.settings.transparent) { ctx.fillStyle = this.settings.bg; ctx.fill(); }
    ctx.clip();
    this.drawAll(ctx, o => Math.min(6000, Math.ceil(Math.max(o.w, o.h) * ppm * 1.1)));
    ctx.restore();
    if (cut) {
      ctx.save();
      ctx.strokeStyle = '#ec008c';
      ctx.lineWidth = 0.25;
      this.tplPath(ctx);
      ctx.stroke();
      ctx.restore();
    }
    this.cache.clear(); // las versiones grandes ocupan memoria
    this.render();
    return { canvas: c, dpi: ppm * 25.4, wmm: Wmm, hmm: Hmm };
  }
  // Plancha A4 con cada sticker suelto en su tamaño real
  exportSheets({ dpi = 300 } = {}) {
    const PW = 210, PH = 297, M = 8, G = 5;
    const ppm = dpi / 25.4;
    const items = this.objs.map(o => {
      let { w, h } = this.box(o);
      const k = Math.min(1, (PW - 2 * M) / w, (PH - 2 * M) / h);
      return { o, w: w * k, h: h * k };
    }).sort((a, b) => b.h - a.h);
    const pages = [];
    let page = null, x = M, y = M, rowH = 0;
    const newPage = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(PW * ppm); c.height = Math.round(PH * ppm);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.setTransform(ppm, 0, 0, ppm, 0, 0);
      page = { c, ctx }; pages.push(page); x = M; y = M; rowH = 0;
    };
    newPage();
    for (const it of items) {
      if (x + it.w > PW - M) { x = M; y += rowH + G; rowH = 0; }
      if (y + it.h > PH - M) newPage();
      const src = this.source(it.o, Math.min(6000, Math.ceil(Math.max(it.w, it.h) * ppm)));
      const ctx = page.ctx;
      ctx.save();
      ctx.translate(x + it.w / 2, y + it.h / 2);
      if (it.o.flip) ctx.scale(-1, 1);
      ctx.globalAlpha = it.o.opacity ?? 1;
      if (src) ctx.drawImage(src, -it.w / 2, -it.h / 2, it.w, it.h);
      ctx.restore();
      x += it.w + G; rowH = Math.max(rowH, it.h);
    }
    this.cache.clear();
    this.render();
    return pages.map(p => p.c);
  }
}

export function fmtCm(mm) {
  const v = mm / 10;
  return (Math.round(v * 10) / 10).toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

// Inserta el chunk pHYs en un PNG para que la imprenta lea los DPI correctos
export async function pngWithDpi(blob, dpi) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const ppmVal = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  dv.setUint32(8, ppmVal); dv.setUint32(12, ppmVal); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const ihdrEnd = 8 + 25; // firma + IHDR
  const out = new Uint8Array(buf.length + 21);
  out.set(buf.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(buf.subarray(ihdrEnd), ihdrEnd + 21);
  return new Blob([out], { type: 'image/png' });
}
let CRC_T;
function crc32(bytes) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
