// Catálogo de elementos ploteables y presets de medidas.
// Todas las medidas están en milímetros y son APROXIMADAS: siempre conviene medir el objeto real.
// shape: 'cylinder' -> la plantilla es el cilindro "desenrollado" (ancho = π · diámetro)
//        'flat'     -> la plantilla es un rectángulo (con esquinas redondeadas opcionales)

export const ITEMS = {
  termo: {
    name: 'Termo', emoji: '🧉', shape: 'cylinder', color: '#2f7d4a',
    blurb: 'El clásico compañero del mate. Ploteamos el cuerpo, sin tapa ni base.',
    tip: 'Medí solo la parte lisa del cuerpo: dejá afuera la tapa, el pico y el aro de la base. Si tiene manija, contá que esa franja queda tapada.',
    presets: [
      { name: 'Stanley Classic 950 ml', h: 240, d: 94 },
      { name: 'Stanley Classic 1,4 L', h: 285, d: 102 },
      { name: 'Lumilagro Luminox 1 L', h: 230, d: 90 },
      { name: 'Waterdog 1 L', h: 225, d: 90 },
    ],
  },
  mate: {
    name: 'Mate', emoji: '🍵', shape: 'cylinder', color: '#8a5a2b',
    blurb: 'Mates de acero o térmicos con pared recta.',
    tip: 'Funciona en mates de pared recta o casi recta. En mates de calabaza o muy curvos el sticker se arruga.',
    presets: [
      { name: 'Stanley Mate 236 ml', h: 75, d: 85 },
      { name: 'Mate térmico de acero (genérico)', h: 80, d: 80 },
      { name: 'Waterdog mate', h: 80, d: 82 },
    ],
  },
  vaso: {
    name: 'Vaso', emoji: '🥤', shape: 'cylinder', color: '#d94f7a',
    blurb: 'Vasos térmicos tipo tumbler.',
    tip: 'Si el vaso es cónico, medí el diámetro en el medio de la zona a plotear. En la v1 la plantilla es recta: en vasos muy cónicos dejá un margen extra.',
    presets: [
      { name: 'Stanley Quencher 40 oz', h: 180, d: 98 },
      { name: 'Stanley Quencher 30 oz', h: 150, d: 92 },
      { name: 'Vaso térmico 600 ml (genérico)', h: 130, d: 85 },
    ],
  },
  botella: {
    name: 'Botella', emoji: '🍶', shape: 'cylinder', color: '#2b6fd9',
    blurb: 'Botellas de agua reutilizables.',
    tip: 'Medí desde donde termina el cuello hasta donde empieza la curva de la base.',
    presets: [
      { name: 'Nalgene 1 L boca ancha', h: 170, d: 89 },
      { name: 'Waterdog 750 ml', h: 160, d: 75 },
      { name: 'Contigo 720 ml', h: 150, d: 76 },
    ],
  },
  compu: {
    name: 'Compu', emoji: '💻', shape: 'flat', color: '#3d3a35',
    blurb: 'La tapa de tu notebook, lista para llenarse de stickers.',
    tip: 'Medí la tapa de borde a borde. Si querés dejar libre el logo, tenelo en cuenta al ubicar las imágenes.',
    presets: [
      { name: 'MacBook Air 13"', w: 304, h: 215, r: 10 },
      { name: 'MacBook Pro 14"', w: 313, h: 221, r: 10 },
      { name: 'Notebook 15,6" (genérica)', w: 360, h: 240, r: 6 },
    ],
  },
  celu: {
    name: 'Celu', emoji: '📱', shape: 'flat', color: '#e0782b',
    blurb: 'Para la funda o el dorso del celu.',
    tip: 'Dejá libre la zona de la cámara: ubicá ahí una imagen chica o nada.',
    presets: [
      { name: 'iPhone 15', w: 72, h: 147, r: 10 },
      { name: 'Samsung Galaxy S24', w: 71, h: 147, r: 9 },
      { name: 'Celu grande (genérico)', w: 76, h: 163, r: 9 },
    ],
  },
  cuaderno: {
    name: 'Cuaderno', emoji: '📓', shape: 'flat', color: '#7a4fd9',
    blurb: 'Tapas de cuadernos, carpetas y agendas.',
    tip: 'Si el cuaderno tiene espiral, restale al ancho la franja del espiral.',
    presets: [
      { name: 'Tapa A4', w: 210, h: 297, r: 3 },
      { name: 'Tapa A5', w: 148, h: 210, r: 3 },
      { name: 'Agenda 15 × 21', w: 150, h: 210, r: 4 },
    ],
  },
};

export const ITEM_ORDER = ['termo', 'mate', 'compu', 'vaso', 'celu', 'botella', 'cuaderno'];

export const SECTIONS = [
  { id: 'none', name: 'Sin sección', color: '#9a9184' },
  { id: 'amigos', name: 'Amigos', color: '#ff4f9a' },
  { id: 'familia', name: 'Familia', color: '#ff8a2b' },
  { id: 'trabajo', name: 'Trabajo', color: '#2b6fd9' },
  { id: 'educacion', name: 'Educación', color: '#7a4fd9' },
  { id: 'frases', name: 'Frases', color: '#1d1a16' },
  { id: 'viajes', name: 'Viajes', color: '#18a3a3' },
  { id: 'musica', name: 'Música', color: '#d9b51f' },
  { id: 'futbol', name: 'Fútbol', color: '#2f7d4a' },
];

// Convierte la selección (preset o medidas propias) en una plantilla en mm
export function makeTemplate(itemKey, dims) {
  const item = ITEMS[itemKey];
  if (item.shape === 'cylinder') {
    const w = Math.PI * dims.d;
    return { item: itemKey, shape: 'cylinder', w, h: dims.h, d: dims.d, r: 0, label: dims.label || 'Medidas propias' };
  }
  return { item: itemKey, shape: 'flat', w: dims.w, h: dims.h, r: dims.r || 0, label: dims.label || 'Medidas propias' };
}
