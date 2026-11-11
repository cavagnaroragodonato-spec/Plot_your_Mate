// Flujo del taller: bienvenida → elemento → medidas → editor de plantilla
import { ITEMS, ITEM_ORDER, SECTIONS, makeTemplate } from './catalog.js';
import { Editor, pngWithDpi, fmtCm } from './editor.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AUTOSAVE = 'pym-autosave-v1';

const params = new URLSearchParams(location.search);
const state = {
  item: ITEMS[params.get('item')] ? params.get('item') : null,
  dims: null,        // { h, d } o { w, h, r } en mm + label
  presetIdx: null,
  tpl: null,
  activeSection: 'none',
  sections: SECTIONS.map(s => ({ ...s })),
};

function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}
const safeStorage = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
};

// =========================================================== navegación
const ORDER = ['welcome', 'choose', 'measure', 'editor'];
function show(step, push = true) {
  if (step === 'measure' && !state.item) step = 'choose';
  if (step === 'editor' && !state.tpl) step = state.item ? 'measure' : 'choose';
  $$('.stage').forEach(s => s.classList.toggle('on', s.id === 'stage-' + step));
  const i = ORDER.indexOf(step);
  $$('#steps li').forEach((li, j) => { li.classList.toggle('on', j === i); li.classList.toggle('done', j < i); });
  if (push) history.pushState({ step }, '', location.pathname + location.search + '#' + step);
  if (step === 'measure') renderMeasure();
  if (step === 'editor') enterEditor();
  if (step !== 'editor') window.scrollTo(0, 0);
}
addEventListener('popstate', e => show(e.state?.step || 'welcome', false));
$$('[data-goto]').forEach(b => b.addEventListener('click', () => show(b.dataset.goto)));

// =========================================================== bienvenida
if (state.item) {
  const it = ITEMS[state.item];
  $('#welcome-item').textContent = `elegiste: ${it.emoji} ${it.name}`;
  $('#welcome-kicker').textContent = `bienvenido/a · ${it.name.toLowerCase()} en camino`;
}
$('#start-btn').addEventListener('click', () => show(state.item ? 'measure' : 'choose'));
const saved = safeStorage.get(AUTOSAVE);
if (saved) {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = '↺ Seguir con mi último diseño';
  b.addEventListener('click', async () => {
    try {
      const p = JSON.parse(saved);
      state.item = p.template.item;
      state.tpl = p.template;
      if (p.sections) state.sections = p.sections;
      show('editor');
      await editor.loadProject(p);
      toast('Recuperamos tu último diseño');
    } catch (e) { toast('No se pudo recuperar el diseño anterior'); }
  });
  $('.welcome-actions').appendChild(b);
}

// =========================================================== elegir elemento
$('#items').innerHTML = ITEM_ORDER.map(k => {
  const it = ITEMS[k];
  return `<button class="item-card${state.item === k ? ' sel' : ''}" data-item="${k}">
    <span class="sw" style="background:${it.color}22">${it.emoji}</span>
    <b>${it.name}</b><small>${it.blurb}</small>
    <span class="tag">${it.shape === 'cylinder' ? 'plantilla envolvente' : 'plantilla plana'}</span></button>`;
}).join('');
$$('.item-card').forEach(c => c.addEventListener('click', () => {
  if (state.item !== c.dataset.item) { state.item = c.dataset.item; state.dims = null; state.presetIdx = null; }
  $$('.item-card').forEach(x => x.classList.toggle('sel', x === c));
  show('measure');
}));

// =========================================================== medidas
function renderMeasure() {
  const it = ITEMS[state.item];
  $('#m-item-name').textContent = it.name.toLowerCase();
  $('#m-item-name2').textContent = it.name.toLowerCase();
  $('#tipbox').innerHTML = `<b>Tip para medir</b>${it.tip}`;
  $('#presets').innerHTML = it.presets.map((p, i) => `<button class="preset${state.presetIdx === i ? ' sel' : ''}" data-i="${i}">
      <b>${esc(p.name)}</b><span>${it.shape === 'cylinder' ? `${fmtCm(p.h)} × ⌀ ${fmtCm(p.d)} cm` : `${fmtCm(p.w)} × ${fmtCm(p.h)} cm`}</span></button>`).join('');
  const f = $('#custom-fields');
  if (it.shape === 'cylinder') {
    f.innerHTML = `
      <div class="field"><label>Alto a plotear</label><div class="inp"><input type="number" step="0.1" min="1" id="f-h"><span class="unit">cm</span></div></div>
      <div class="field"><label>Diámetro</label><div class="inp"><input type="number" step="0.1" min="1" id="f-d"><span class="unit">cm</span></div></div>
      <div class="field"><label>o la vuelta</label><div class="inp"><input type="number" step="0.1" min="1" id="f-c"><span class="unit">cm</span></div></div>`;
  } else {
    f.innerHTML = `
      <div class="field"><label>Ancho</label><div class="inp"><input type="number" step="0.1" min="1" id="f-w"><span class="unit">cm</span></div></div>
      <div class="field"><label>Alto</label><div class="inp"><input type="number" step="0.1" min="1" id="f-h"><span class="unit">cm</span></div></div>
      <div class="field"><label>Esquinas redondeadas</label><div class="inp"><input type="number" step="1" min="0" id="f-r"><span class="unit">mm</span></div></div>`;
  }
  if (!state.dims) { state.presetIdx = 0; state.dims = { ...it.presets[0], label: it.presets[0].name }; $$('.preset')[0]?.classList.add('sel'); }
  fillFields();
  $$('.preset').forEach(b => b.addEventListener('click', () => {
    state.presetIdx = +b.dataset.i;
    const p = it.presets[state.presetIdx];
    state.dims = { ...p, label: p.name };
    $$('.preset').forEach(x => x.classList.toggle('sel', x === b));
    fillFields(); updatePreview();
  }));
  $$('#custom-fields input').forEach(inp => inp.addEventListener('input', () => {
    const v = id => parseFloat($(id)?.value);
    if (it.shape === 'cylinder') {
      if (inp.id === 'f-c' && v('#f-c') > 0) $('#f-d').value = (v('#f-c') / Math.PI).toFixed(1);
      if (inp.id === 'f-d' && v('#f-d') > 0) $('#f-c').value = (v('#f-d') * Math.PI).toFixed(1);
      state.dims = { h: v('#f-h') * 10, d: v('#f-d') * 10, label: 'Medidas propias' };
    } else {
      state.dims = { w: v('#f-w') * 10, h: v('#f-h') * 10, r: (v('#f-r') || 0), label: 'Medidas propias' };
    }
    state.presetIdx = null;
    $$('.preset').forEach(x => x.classList.remove('sel'));
    updatePreview();
  }));
  updatePreview();
}
function fillFields() {
  const d = state.dims, it = ITEMS[state.item];
  const set = (id, v) => { const e = $(id); if (e) e.value = v; };
  if (it.shape === 'cylinder') { set('#f-h', (d.h / 10).toFixed(1)); set('#f-d', (d.d / 10).toFixed(1)); set('#f-c', (d.d * Math.PI / 10).toFixed(1)); }
  else { set('#f-w', (d.w / 10).toFixed(1)); set('#f-h', (d.h / 10).toFixed(1)); set('#f-r', d.r || 0); }
}
function validDims() {
  const d = state.dims, it = ITEMS[state.item];
  if (!d) return false;
  const ok = v => Number.isFinite(v) && v >= 10 && v <= 2000;
  return it.shape === 'cylinder' ? ok(d.h) && ok(d.d) : ok(d.w) && ok(d.h);
}
function updatePreview() {
  const c = $('#tpl-preview'), ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  // plancha de corte
  ctx.fillStyle = '#1f5c45'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }
  const ok = validDims();
  $('#to-editor').disabled = !ok;
  if (!ok) { $('#tpl-meta').innerHTML = 'Completá las medidas (entre 1 y 200 cm).'; return; }
  const tpl = makeTemplate(state.item, state.dims);
  const s = Math.min((W - 180) / tpl.w, (H - 160) / tpl.h);
  const tw = tpl.w * s, th = tpl.h * s, x0 = (W - tw) / 2, y0 = (H - th) / 2 + 10;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, x0 + 8, y0 + 8, tw, th, tpl.r * s); ctx.fill();
  ctx.fillStyle = '#fffdf6'; rr(ctx, x0, y0, tw, th, tpl.r * s); ctx.fill();
  ctx.setLineDash([10, 6]); ctx.strokeStyle = '#1d1a16'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  // stickers de ejemplo
  const pal = ['#ff4f9a', '#ffe14d', '#2b6fd9', '#2f7d4a', '#ff8a2b'];
  for (let i = 0; i < 7; i++) {
    const r = Math.min(tw, th) * (0.09 + (i % 3) * 0.03);
    const cx = x0 + tw * (0.12 + i * 0.125), cy = y0 + th * (0.32 + ((i * 37) % 5) * 0.09);
    ctx.fillStyle = pal[i % pal.length]; ctx.beginPath();
    if (i % 2) ctx.arc(cx, cy, r, 0, 7); else rr(ctx, cx - r, cy - r * 0.7, r * 2, r * 1.4, r * 0.3);
    ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1d1a16'; ctx.stroke();
  }
  // cotas
  ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 1.5;
  ctx.font = '600 18px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
  ctx.beginPath(); ctx.moveTo(x0, y0 - 22); ctx.lineTo(x0 + tw, y0 - 22); ctx.moveTo(x0, y0 - 30); ctx.lineTo(x0, y0 - 14); ctx.moveTo(x0 + tw, y0 - 30); ctx.lineTo(x0 + tw, y0 - 14); ctx.stroke();
  ctx.fillText(`${fmtCm(tpl.w)} cm${tpl.shape === 'cylinder' ? '  (π × ⌀)' : ''}`, x0 + tw / 2, y0 - 32);
  ctx.beginPath(); ctx.moveTo(x0 - 22, y0); ctx.lineTo(x0 - 22, y0 + th); ctx.moveTo(x0 - 30, y0); ctx.lineTo(x0 - 14, y0); ctx.moveTo(x0 - 30, y0 + th); ctx.lineTo(x0 - 14, y0 + th); ctx.stroke();
  ctx.save(); ctx.translate(x0 - 34, y0 + th / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(`${fmtCm(tpl.h)} cm`, 0, 0); ctx.restore();
  if (tpl.shape === 'cylinder') {
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillText('↻ la plantilla envuelve el objeto: los bordes se tocan', W / 2, y0 + th + 34);
  }
  const it = ITEMS[state.item];
  $('#tpl-meta').innerHTML = `<b>${esc(state.dims.label)}</b> · ${it.name}<br>Plantilla: <b>${fmtCm(tpl.w)} × ${fmtCm(tpl.h)} cm</b>${tpl.shape === 'cylinder' ? ` · ⌀ ${fmtCm(tpl.d)} cm` : ''}`;
}
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
$('#to-editor').addEventListener('click', () => {
  if (!validDims()) return;
  state.tpl = makeTemplate(state.item, state.dims);
  show('editor');
});

// =========================================================== editor
const editor = new Editor({
  canvas: $('#editor-canvas'),
  wrap: $('#canvas-wrap'),
  hintsEl: $('#hints'),
  onChange: kind => {
    if (kind === 'view') { $('#zoom-val').textContent = editor.zoomPct + '%'; return; }
    renderLibrary();
    updatePropValues(editor.selected());
    $('#empty-msg').style.display = editor.objs.length ? 'none' : '';
    updateToolState();
    scheduleSave();
  },
  onSelect: (sel, live) => { live ? updatePropValues(sel) : renderProps(sel); updateToolState(); },
  onDblClick: o => { if (o.type === 'text') setTimeout(() => $('#p-text')?.focus(), 30); },
});

function enterEditor() {
  const t = state.tpl;
  const same = editor.tpl && editor.tpl.w === t.w && editor.tpl.h === t.h && editor.tpl.r === t.r && editor.tpl.shape === t.shape;
  if (!same) {
    editor.setTemplate(t);
    if (!editor.history.length) editor.commit();
  }
  $('#ed-tpl-label').textContent = `${ITEMS[t.item].emoji} ${t.label} · ${fmtCm(t.w)} × ${fmtCm(t.h)} cm`;
  requestAnimationFrame(() => { editor.resize(); editor.fit(); });
  renderChips(); renderLibrary(); renderProps(editor.selected());
}

// ---------- secciones ----------
function renderChips() {
  $('#sec-chips').innerHTML = state.sections.map(s => `<button class="chip${state.activeSection === s.id ? ' on' : ''}" data-sec="${s.id}"><i style="background:${s.color}"></i>${esc(s.name)}</button>`).join('') +
    `<button class="chip add" id="add-sec">+ sección</button>`;
  $$('#sec-chips [data-sec]').forEach(b => b.addEventListener('click', () => {
    state.activeSection = b.dataset.sec;
    // si hay stickers seleccionados, también les asigna la sección
    const sel = editor.selected();
    if (sel.length) { sel.forEach(o => { o.section = state.activeSection; }); editor.commit(); renderProps(sel); toast(`Movidos a “${secName(state.activeSection)}”`); }
    renderChips();
  }));
  $('#add-sec').addEventListener('click', () => { $('#sec-name').value = ''; openModal('section-modal'); setTimeout(() => $('#sec-name').focus(), 50); });
}
const secName = id => state.sections.find(s => s.id === id)?.name || 'Sin sección';
const secColor = id => state.sections.find(s => s.id === id)?.color || '#9a9184';
$('#sec-add').addEventListener('click', () => {
  const name = $('#sec-name').value.trim();
  if (!name) return;
  const palette = ['#e0453a', '#18a3a3', '#a35bd9', '#d9871f', '#3a9e5f', '#d94fa8'];
  const id = 'c-' + Math.random().toString(36).slice(2, 7);
  state.sections.push({ id, name, color: palette[state.sections.length % palette.length] });
  state.activeSection = id;
  closeModals(); renderChips(); scheduleSave();
});
$('#sec-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('#sec-add').click(); });

// ---------- biblioteca ----------
function renderLibrary() {
  const lib = $('#library');
  const assets = [...editor.assets.values()];
  if (!assets.length) { lib.innerHTML = '<p class="side-note" style="margin:8px 0">Todavía no subiste nada. Tus imágenes aparecen acá agrupadas por sección.</p>'; return; }
  const groups = state.sections.map(s => ({ s, list: assets.filter(a => (a.section || 'none') === s.id) })).filter(g => g.list.length);
  lib.innerHTML = groups.map(g => `<div class="lib-group"><h4><i style="background:${g.s.color}"></i>${esc(g.s.name)} · ${g.list.length}</h4><div class="lib-grid">${
    g.list.map(a => { const u = editor.usage(a.id); return `<div class="thumb" draggable="true" data-asset="${a.id}" title="${esc(a.name)} — click para agregar, o arrastrala" style="background-image:url('${a.dataURL}')">${u ? `<span class="used">×${u}</span>` : ''}<button class="x" data-del="${a.id}" title="Quitar">×</button></div>`; }).join('')
  }</div></div>`).join('');
  $$('.thumb', lib).forEach(t => {
    t.addEventListener('click', e => { if (e.target.dataset.del) return; editor.addImage(t.dataset.asset); });
    t.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-pym-asset', t.dataset.asset); e.dataTransfer.effectAllowed = 'copy'; });
  });
  $$('[data-del]', lib).forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const u = editor.usage(b.dataset.del);
    if (u && !confirmSoft(b)) return;
    editor.removeAsset(b.dataset.del);
  }));
}
// confirmación sin diálogos del navegador: primer click avisa, segundo borra
function confirmSoft(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; btn.textContent = '!'; btn.style.background = 'var(--pink)'; btn.style.display = 'block';
  toast('Está en la plantilla: tocá de nuevo para quitarla de todos lados');
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = '×'; btn.style.background = ''; btn.style.display = ''; }, 2500);
  return false;
}

// ---------- subir archivos ----------
const drop = $('#drop'), fileInput = $('#file-input');
fileInput.addEventListener('change', async () => {
  const files = [...fileInput.files];
  fileInput.value = '';
  await importFiles(files);
});
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('over')));
drop.addEventListener('drop', async e => { e.preventDefault(); await importFiles([...e.dataTransfer.files]); });

async function importFiles(files, at = null) {
  if (!files.length) return;
  toast(`Cargando ${files.length} ${files.length === 1 ? 'imagen' : 'imágenes'}…`, 1200);
  const added = await editor.addFiles(files, state.activeSection, at);
  if (!added.length) return toast('Ese archivo no es una imagen');
  if (!at) {
    // si es lo primero que suben, lo ponemos directo en la plantilla
    if (editor.objs.length === 0) added.forEach((a, i) => editor.addImage(a.id, null, i === added.length - 1));
    else toast(`${added.length} en tu biblioteca: click o arrastrá para usarlas`);
  }
}

const wrap = $('#canvas-wrap');
wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('dragover'); });
wrap.addEventListener('dragleave', e => { if (e.target === wrap || !wrap.contains(e.relatedTarget)) wrap.classList.remove('dragover'); });
wrap.addEventListener('drop', async e => {
  e.preventDefault(); wrap.classList.remove('dragover');
  const r = $('#editor-canvas').getBoundingClientRect();
  const at = editor.toMM(e.clientX - r.left, e.clientY - r.top);
  const id = e.dataTransfer.getData('text/x-pym-asset');
  if (id) { editor.addImage(id, at); return; }
  await importFiles([...e.dataTransfer.files], at);
});
addEventListener('paste', async e => {
  if (!$('#stage-editor').classList.contains('on')) return;
  const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
  if (files.length) { e.preventDefault(); await importFiles(files, { x: editor.tpl.w / 2, y: editor.tpl.h / 2 }); }
});

// ---------- barra de herramientas ----------
$('#toolbar').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'undo') editor.undo();
  else if (a === 'redo') editor.redo();
  else if (a === 'text') await editor.addText('Tu frase acá', { section: state.activeSection === 'none' ? 'frases' : state.activeSection });
  else if (a.startsWith('al-')) editor.align(a);
  else if (a === 'dist-h') editor.distribute('x');
  else if (a === 'dist-v') editor.distribute('y');
  else if (a === 'radial') editor.radial();
  else if (a === 'pack') editor.pack();
  else if (a === 'up') editor.layer(1);
  else if (a === 'down') editor.layer(-1);
  else if (a === 'dup') editor.duplicateSel();
  else if (a === 'flip') editor.flipSel();
  else if (a === 'del') editor.deleteSel();
  else if (a === 'snap') { editor.snapOn = !editor.snapOn; b.classList.toggle('on', editor.snapOn); toast(editor.snapOn ? 'Guías inteligentes activadas' : 'Guías desactivadas (tip: mantené Alt para soltar el imán un momento)'); }
  else if (a === 'zones') { editor.settings.showZones = !editor.settings.showZones; if (editor.settings.showZones && !editor.zones.length) toast('Usá “Ordenar por secciones” para crear las zonas'); editor.commit(); }
  else if (a === 'zoom-in') editor.zoomAt(1.25);
  else if (a === 'zoom-out') editor.zoomAt(0.8);
  else if (a === 'fit') editor.fit();
});
function updateToolState() {
  const n = editor.sel.length;
  $$('[data-act="up"],[data-act="down"],[data-act="dup"],[data-act="flip"],[data-act="del"]').forEach(b => { b.disabled = !n; });
  $$('[data-act^="al-"]').forEach(b => { b.disabled = !n; });
  $$('[data-act="dist-h"],[data-act="dist-v"]').forEach(b => { b.disabled = n < 2; });
  $('[data-act="undo"]').disabled = editor.history.length < 2;
  $('[data-act="redo"]').disabled = !editor.future.length;
  $('[data-act="zones"]').classList.toggle('on', !!editor.settings.showZones);
}
$('#organize-btn').addEventListener('click', () => editor.organizeBySections(state.sections));

// ---------- panel de propiedades ----------
const FONTS = [
  { f: 'Fraunces', w: 900, n: 'Fraunces (serif)' },
  { f: 'Instrument Sans', w: 700, n: 'Instrument Sans' },
  { f: 'Caveat', w: 700, n: 'Caveat (a mano)' },
  { f: 'Bagel Fat One', w: 400, n: 'Bagel (gordita)' },
  { f: 'Shrikhand', w: 400, n: 'Shrikhand (retro)' },
  { f: 'JetBrains Mono', w: 600, n: 'Mono' },
];
let propsKey = '';
function renderProps(sel) {
  const p = $('#props');
  const key = sel.map(o => o.id).join(',');
  propsKey = key;
  p.classList.toggle('tpl-panel', !sel.length);
  if (!editor.tpl) { p.classList.remove('on'); return; }
  const secOpts = cur => state.sections.map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  if (!sel.length) {
    const st = editor.settings;
    p.innerHTML = `<h4>Plantilla <span>${fmtCm(editor.tpl.w)} × ${fmtCm(editor.tpl.h)} cm</span></h4>
      <div class="fields">
        <div class="field"><label>Fondo</label><div class="inp"><input type="color" id="t-bg" value="${st.bg}" style="height:34px;padding:2px"></div></div>
        <div class="field"><label>Margen seg.</label><div class="inp"><input type="number" id="t-safe" min="0" max="20" step="1" value="${st.safe}"><span class="unit">mm</span></div></div>
      </div>
      <label class="check"><input type="checkbox" id="t-transp" ${st.transparent ? 'checked' : ''}> Fondo transparente (solo los stickers)</label>
      <p class="side-note" style="margin:10px 0 0">Tips: <b>Shift</b> para elegir varios · <b>Alt</b> suelta el imán · <b>Espacio</b> + arrastrar mueve la vista · <b>Ctrl + rueda</b> zoom.</p>`;
    $('#t-bg').addEventListener('input', e => { st.bg = e.target.value; st.transparent = false; $('#t-transp').checked = false; editor.render(); });
    $('#t-bg').addEventListener('change', () => editor.commit());
    $('#t-safe').addEventListener('change', e => { st.safe = Math.max(0, Math.min(20, +e.target.value || 0)); editor.commit(); });
    $('#t-transp').addEventListener('change', e => { st.transparent = e.target.checked; editor.commit(); });
    p.classList.add('on');
    return;
  }
  if (sel.length > 1) {
    p.innerHTML = `<h4>${sel.length} stickers <button class="btn small ghost" id="m-none" style="padding:0 6px">✕</button></h4>
      <div class="field"><label>Sección</label><div class="inp"><select id="m-sec"><option value="">— elegir —</option>${secOpts('')}</select></div></div>
      <p class="side-note" style="margin:10px 0 0">Usá la barra de arriba para alinear, repartir parejo o armar un círculo con estos stickers.</p>
      <div class="row"><button class="btn small" id="m-radial">◎ En círculo</button><button class="btn small" id="m-pack">▦ Grilla</button></div>`;
    $('#m-sec').addEventListener('change', e => { if (!e.target.value) return; sel.forEach(o => { o.section = e.target.value; }); editor.commit(); toast(`Movidos a “${secName(e.target.value)}”`); });
    $('#m-radial').addEventListener('click', () => editor.radial());
    $('#m-pack').addEventListener('click', () => editor.pack());
    $('#m-none').addEventListener('click', () => editor.select([]));
    p.classList.add('on');
    return;
  }
  const o = sel[0];
  const isText = o.type === 'text';
  p.innerHTML = `<h4>${isText ? 'Frase' : 'Imagen'} <span style="color:${secColor(o.section)}">● ${esc(secName(o.section))}</span></h4>
    ${isText ? `<div class="field full" style="margin-bottom:8px"><label>Texto</label><div class="inp"><textarea id="p-text" rows="2">${esc(o.text)}</textarea></div></div>
      <div class="fields" style="margin-bottom:8px">
        <div class="field"><label>Fuente</label><div class="inp"><select id="p-font">${FONTS.map(f => `<option value="${f.f}"${f.f === o.font ? ' selected' : ''}>${f.n}</option>`).join('')}</select></div></div>
        <div class="field"><label>Color</label><div class="inp"><input type="color" id="p-color" value="${o.color}" style="height:32px;padding:2px"></div></div>
      </div>` : ''}
    <div class="fields">
      <div class="field"><label>X centro</label><div class="inp"><input type="number" step="0.1" id="p-x"><span class="unit">cm</span></div></div>
      <div class="field"><label>Y centro</label><div class="inp"><input type="number" step="0.1" id="p-y"><span class="unit">cm</span></div></div>
      <div class="field"><label>Ancho</label><div class="inp"><input type="number" step="0.1" min="0.3" id="p-w"><span class="unit">cm</span></div></div>
      <div class="field"><label>Alto</label><div class="inp"><input type="number" step="0.1" min="0.3" id="p-h"><span class="unit">cm</span></div></div>
      <div class="field"><label>Rotación</label><div class="inp"><input type="number" step="1" id="p-rot"><span class="unit">°</span></div></div>
      <div class="field"><label>Sección</label><div class="inp"><select id="p-sec">${secOpts(o.section)}</select></div></div>
    </div>
    <label class="check"><input type="checkbox" id="p-lock" checked> Mantener proporción</label>
    <div class="field" style="margin-top:10px"><label>Opacidad</label><input type="range" id="p-op" min="10" max="100" value="${Math.round((o.opacity ?? 1) * 100)}"></div>
    <div class="fields" style="margin-top:8px">
      <div class="field"><label>Forma</label><div class="inp"><select id="p-mask">
        <option value="none"${o.mask === 'none' ? ' selected' : ''}>Original</option>
        <option value="circle"${o.mask === 'circle' ? ' selected' : ''}>Círculo</option>
        <option value="rounded"${o.mask === 'rounded' ? ' selected' : ''}>Redondeada</option></select></div></div>
      <div class="field"><label>Color borde</label><div class="inp"><input type="color" id="p-bc" value="${o.borderColor || '#ffffff'}" style="height:32px;padding:2px"></div></div>
    </div>
    <div class="field" style="margin-top:8px"><label>Borde troquelado (sticker) · <span id="p-bv">${(o.border || 0).toFixed(1)}</span> mm</label><input type="range" id="p-border" min="0" max="8" step="0.5" value="${o.border || 0}"></div>
    <div class="row">
      <button class="btn small" id="p-center">⊕ Centrar</button>
      <button class="btn small" id="p-dup">Duplicar</button>
      <button class="btn small ghost" id="p-del">Borrar</button>
    </div>`;
  updatePropValues(sel);
  const num = id => parseFloat($(id).value);
  const live = () => { editor.render(); };
  const commit = () => editor.commit();
  $('#p-x').addEventListener('change', () => { if (!isNaN(num('#p-x'))) { o.x = num('#p-x') * 10; commit(); } });
  $('#p-y').addEventListener('change', () => { if (!isNaN(num('#p-y'))) { o.y = num('#p-y') * 10; commit(); } });
  const resize = (dim) => {
    const lock = $('#p-lock').checked || isText;
    const v = num(dim === 'w' ? '#p-w' : '#p-h') * 10;
    if (!(v > 2)) return;
    if (dim === 'w') { if (lock) o.h *= v / o.w; o.w = v; } else { if (lock) o.w *= v / o.h; o.h = v; }
    commit(); updatePropValues([o]);
  };
  $('#p-w').addEventListener('change', () => resize('w'));
  $('#p-h').addEventListener('change', () => resize('h'));
  $('#p-rot').addEventListener('change', () => { o.rot = (num('#p-rot') || 0) * Math.PI / 180; commit(); });
  $('#p-sec').addEventListener('change', e => { o.section = e.target.value; commit(); renderProps([o]); });
  $('#p-op').addEventListener('input', e => { o.opacity = e.target.value / 100; live(); });
  $('#p-op').addEventListener('change', commit);
  $('#p-mask').addEventListener('change', e => { o.mask = e.target.value; commit(); });
  $('#p-bc').addEventListener('input', e => { o.borderColor = e.target.value; live(); });
  $('#p-bc').addEventListener('change', commit);
  $('#p-border').addEventListener('input', e => { o.border = +e.target.value; $('#p-bv').textContent = o.border.toFixed(1); live(); });
  $('#p-border').addEventListener('change', commit);
  $('#p-center').addEventListener('click', () => { o.x = editor.tpl.w / 2; o.y = editor.tpl.h / 2; commit(); updatePropValues([o]); editor.flash(['✦ Centrado en la plantilla']); });
  $('#p-dup').addEventListener('click', () => editor.duplicateSel());
  $('#p-del').addEventListener('click', () => editor.deleteSel());
  if (isText) {
    let tmr;
    $('#p-text').addEventListener('input', e => { o.text = e.target.value || ' '; clearTimeout(tmr); tmr = setTimeout(async () => { await editor.buildText(o); updatePropValues([o]); commit(); }, 250); });
    $('#p-font').addEventListener('change', async e => { o.font = e.target.value; o.weight = FONTS.find(f => f.f === o.font).w; await editor.buildText(o); commit(); updatePropValues([o]); });
    $('#p-color').addEventListener('input', async e => { o.color = e.target.value; await editor.buildText(o); });
    $('#p-color').addEventListener('change', commit);
  }
  p.classList.add('on');
}
function updatePropValues(sel) {
  if (sel.length !== 1 || sel.map(o => o.id).join(',') !== propsKey) { if (sel.map(o => o.id).join(',') !== propsKey) renderProps(sel); return; }
  const o = sel[0];
  const set = (id, v) => { const e = $(id); if (e && document.activeElement !== e) e.value = v; };
  set('#p-x', (o.x / 10).toFixed(1)); set('#p-y', (o.y / 10).toFixed(1));
  set('#p-w', (o.w / 10).toFixed(1)); set('#p-h', (o.h / 10).toFixed(1));
  let deg = Math.round(Math.atan2(Math.sin(o.rot), Math.cos(o.rot)) * 180 / Math.PI);
  set('#p-rot', deg);
  const bv = $('#p-border'); if (bv && document.activeElement !== bv) { bv.value = o.border || 0; $('#p-bv').textContent = (o.border || 0).toFixed(1); }
}

// ---------- teclado ----------
addEventListener('keydown', e => {
  if (!$('#stage-editor').classList.contains('on')) return;
  if ($$('.modal.on').length) { if (e.key === 'Escape') closeModals(); return; }
  const tag = document.activeElement?.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
  const mod = e.ctrlKey || e.metaKey;
  const step = e.shiftKey ? 10 : 1;
  if (e.code === 'Space') { editor.space = true; e.preventDefault(); return; }
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); }
  else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); editor.duplicateSel(); }
  else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); editor.selectAll(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editor.deleteSel(); }
  else if (e.key === 'Escape') editor.select([]);
  else if (e.key === 'ArrowLeft') { e.preventDefault(); editor.nudge(-step, 0); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); editor.nudge(step, 0); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); editor.nudge(0, -step); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); editor.nudge(0, step); }
  else if (e.key.toLowerCase() === 't' && !mod) editor.addText('Tu frase acá', { section: 'frases' });
  else if (e.key === '+' || e.key === '=') editor.zoomAt(1.2);
  else if (e.key === '-') editor.zoomAt(1 / 1.2);
  else if (e.key === '0') editor.fit();
});
addEventListener('keyup', e => { if (e.code === 'Space') editor.space = false; });

// ---------- guardar / abrir proyecto ----------
let saveT, warnedQuota = false;
function project() { return { ...editor.toProject(), sections: state.sections }; }
function scheduleSave() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (!editor.tpl) return;
    const ok = safeStorage.set(AUTOSAVE, JSON.stringify(project()));
    if (!ok && !warnedQuota) { warnedQuota = true; toast('Tu diseño pesa mucho para autoguardarse: usá “Guardar proyecto”', 3500); }
  }, 900);
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const baseName = () => `plot-your-mate-${state.tpl.item}-${fmtCm(state.tpl.w).replace(',', '.')}x${fmtCm(state.tpl.h).replace(',', '.')}cm`;
$('#save-project').addEventListener('click', () => {
  download(new Blob([JSON.stringify(project())], { type: 'application/json' }), baseName() + '.plotmate.json');
  toast('Proyecto guardado: lo podés abrir después desde “Abrir”');
});
$('#open-project').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (p.app !== 'plot-your-mate') throw new Error('formato');
    state.item = p.template.item; state.tpl = p.template;
    if (p.sections) state.sections = p.sections;
    await editor.loadProject(p);
    enterEditor();
    toast('Proyecto abierto');
  } catch (err) { toast('Ese archivo no es un proyecto de Plot your Mate'); }
});

// ---------- modales ----------
function openModal(id) { $('#' + id).classList.add('on'); }
function closeModals() {
  $$('.modal.on').forEach(m => m.classList.remove('on'));
  import('./preview3d.js').then(m => m.close()).catch(() => {});
}
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); }));

// ---------- exportar ----------
function updateExportInfo() {
  const dpi = +$('#exp-dpi').value, bleed = $('#exp-bleed').checked ? 3 : 0;
  const w = state.tpl.w + bleed * 2, h = state.tpl.h + bleed * 2;
  const px = mm => Math.round(mm / 25.4 * dpi);
  $('#exp-info').innerHTML = `Tamaño final: <b>${fmtCm(w)} × ${fmtCm(h)} cm</b><br>${px(w)} × ${px(h)} px a ${dpi} DPI · ${editor.objs.length} ${editor.objs.length === 1 ? 'elemento' : 'elementos'}`;
}
$('#export-btn').addEventListener('click', () => {
  if (!editor.objs.length) return toast('Agregá al menos una imagen antes de descargar');
  editor.select([]);
  updateExportInfo(); openModal('export-modal');
});
['#exp-dpi', '#exp-bleed', '#exp-format'].forEach(s => $(s).addEventListener('change', updateExportInfo));
$('#exp-go').addEventListener('click', async () => {
  const btn = $('#exp-go');
  btn.disabled = true; btn.textContent = 'Preparando…';
  await new Promise(r => setTimeout(r, 30));
  try {
    const dpi = +$('#exp-dpi').value, fmt = $('#exp-format').value;
    const res = editor.exportCanvas({ dpi, cut: $('#exp-cut').checked, bleed: $('#exp-bleed').checked ? 3 : 0 });
    if (fmt === 'png') {
      const blob = await new Promise(r => res.canvas.toBlob(r, 'image/png'));
      download(await pngWithDpi(blob, res.dpi), baseName() + '.png');
    } else {
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) throw new Error('No cargó la librería de PDF (¿sin internet?). Probá con PNG.');
      const doc = new jsPDF({ orientation: res.wmm > res.hmm ? 'l' : 'p', unit: 'mm', format: [res.wmm, res.hmm] });
      doc.addImage(res.canvas.toDataURL('image/png'), 'PNG', 0, 0, res.wmm, res.hmm, undefined, 'FAST');
      doc.save(baseName() + '.pdf');
    }
    if ($('#exp-sheet').checked) {
      const pages = editor.exportSheets({ dpi });
      for (let i = 0; i < pages.length; i++) {
        const blob = await new Promise(r => pages[i].toBlob(r, 'image/png'));
        download(await pngWithDpi(blob, dpi), `${baseName()}-plancha-A4-${i + 1}.png`);
      }
    }
    closeModals();
    toast('¡Listo! Llevá el archivo a tu imprenta de stickers 🧉', 3500);
  } catch (err) {
    console.error(err);
    toast(err.message || 'No se pudo exportar: probá con menos DPI', 4000);
  } finally { btn.disabled = false; btn.textContent = 'Descargar'; }
});

// ---------- vista 3D ----------
$('#preview-btn').addEventListener('click', async () => {
  $('#pv-item').textContent = ITEMS[state.tpl.item].name.toLowerCase();
  openModal('preview-modal');
  try {
    const m = await import('./preview3d.js');
    const tex = editor.exportCanvas({ dpi: 110, cut: false, bleed: 0 }).canvas;
    m.openPreview($('#preview3d'), state.tpl, tex, ITEMS[state.tpl.item].color);
  } catch (e) { console.error(e); toast('La vista 3D no está disponible en este navegador'); }
});

// =========================================================== inicio
show(location.hash.slice(1) && ORDER.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'welcome', false);
history.replaceState({ step: $$('.stage.on')[0]?.id.replace('stage-', '') || 'welcome' }, '');

// acceso para depurar desde la consola del navegador
window.plotYourMate = { editor, state };
