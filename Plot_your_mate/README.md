# Plot your Mate 🧉

Taller web para diseñar los stickers de tu **termo, mate, vaso, botella, compu, celu o cuaderno**, con una plantilla a la medida exacta de tu objeto, lista para mandar a imprimir.

## Cómo funciona

1. **Portada**: un anillo de modelos 3D gira alrededor del título. Pasás el cursor, el anillo frena, y con un click elegís qué vas a plotear.
2. **Bienvenida**: te explica el taller en 4 pasos.
3. **Medidas**: elegís un modelo conocido (Stanley, Lumilagro, Waterdog, MacBook, iPhone…) o ponés tus propias medidas. En los objetos cilíndricos podés poner el diámetro *o* la vuelta medida con un centímetro: la plantilla mide `π × diámetro` de ancho.
4. **Editor** (*Add your plots*):
   - Subí imágenes (PNG, JPG, SVG, WEBP), arrastralas o pegalas con Ctrl+V.
   - Mover, escalar (proporcional o libre), rotar, espejar, opacidad, forma (círculo/redondeada) y **borde troquelado** tipo sticker.
   - **Guías inteligentes**: te avisa cuando un sticker está centrado, alineado con otros (bordes o centros), con espaciado parejo entre vecinos, a la misma distancia del centro que otro (radial, con ángulos parejos), con el mismo tamaño o la misma rotación, o "mirando hacia afuera" del centro.
   - Herramientas: alinear, repartir parejo, distribuir en círculo, acomodar en grilla.
   - **Secciones** opcionales (amigos, familia, trabajo, educación, frases, viajes, música, fútbol o las tuyas) y "Ordenar por secciones" para armar zonas automáticamente.
   - Frases con varias tipografías.
   - En plantillas envolventes, lo que pasa por un borde aparece del otro (la costura).
   - **Vista 3D** del objeto con tu diseño puesto.
5. **Descarga**: PNG con los DPI grabados (150/300/600) o PDF en tamaño real, con línea de corte y sangrado opcional. También podés bajar todos los stickers sueltos en una plancha A4.

El proyecto se autoguarda en el navegador y además se puede guardar/abrir como archivo `.plotmate.json`.

## Correrlo en tu compu

Es un sitio estático, pero usa módulos de JavaScript, así que hay que abrirlo con un servidor local (no con doble click):

```bash
cd Plot_your_mate
python -m http.server 8000
# abrí http://localhost:8000
```

## Publicarlo en GitHub Pages

```bash
git init
git add .
git commit -m "Plot your Mate v1"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/Plot_your_mate.git
git push -u origin main
```

Después, en GitHub: **Settings → Pages → Branch: `main` / root → Save**. En un minuto queda en `https://<tu-usuario>.github.io/Plot_your_mate/`.

## Estructura

```
index.html        portada con el anillo 3D
design.html       taller: bienvenida, elemento, medidas y editor
css/style.css     estética (papel, risografía, plancha de corte)
js/catalog.js     elementos, medidas recomendadas y secciones  ← para agregar modelos o marcas
js/models.js      modelos 3D hechos con código (Three.js)
js/ring.js        animación de la portada
js/editor.js      editor de plantillas, guías inteligentes y exportación
js/preview3d.js   vista 3D del diseño
js/design.js      flujo del taller y paneles
```

Librerías por CDN: [Three.js](https://threejs.org) 0.160 y [jsPDF](https://github.com/parallax/jsPDF) 2.5.1.

> Las medidas recomendadas son aproximadas: siempre conviene medir el objeto real antes de imprimir.
