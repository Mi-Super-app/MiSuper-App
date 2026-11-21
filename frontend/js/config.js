/* ══════════════════════════════════════════════════════════
   CONFIGURACIÓN COMPARTIDA (la usan index.html y app.html)
   ══════════════════════════════════════════════════════════ */

/* ¿Dónde está el backend?
   - Si abrís la página desde el mismo servidor (http://localhost:3000) → misma dirección.
   - Si la abrís con Live Server (puerto 5500) o como archivo → usa http://localhost:3000.
   - Cuando publiquen la API en internet, cambien API_PUBLICA por su dirección. */
const API_PUBLICA = '';
const API_BASE = (function () {
  if (API_PUBLICA) return API_PUBLICA;
  const { protocol, hostname, port } = window.location;
  const esLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (protocol === 'file:' || (esLocal && port !== '3000')) return 'http://localhost:3000';
  return '';
})();

/* Pide datos al backend. Uso: const productos = await api('/api/productos') */
async function api(ruta, opciones = {}) {
  const res = await fetch(API_BASE + ruta, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error || `Error ${res.status}`);
  return datos;
}

/* Formato de dinero: 1234.5 → "C$1,234.50"  (sin decimales si es entero) */
function fmtC(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const entero = Math.round(n * 100) % 100 === 0;
  return 'C$' + Number(n).toLocaleString('en-US', {
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: 2
  });
}

/* Hace seguro un texto antes de meterlo en el HTML */
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* "hace 3 horas", "hoy 6:02 a.m." … */
function fechaAmigable(iso) {
  if (!iso) return 'sin datos';
  const f = new Date(iso);
  const hoy = new Date();
  const hora = f.toLocaleTimeString('es-NI', { hour: 'numeric', minute: '2-digit' });
  if (f.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (f.toDateString() === ayer.toDateString()) return `ayer ${hora}`;
  return f.toLocaleDateString('es-NI', { day: 'numeric', month: 'short' }) + ' ' + hora;
}

const CATEGORIAS = {
  lacteos:          { nombre: 'Lácteos y huevos', emoji: '🥛' },
  granos:           { nombre: 'Granos básicos',   emoji: '🌾' },
  abarrotes:        { nombre: 'Abarrotes',        emoji: '🥫' },
  limpieza:         { nombre: 'Limpieza',         emoji: '🧹' },
  higiene:          { nombre: 'Higiene',          emoji: '🧴' },
  carnes:           { nombre: 'Carnes',           emoji: '🥩' },
  bebidas:          { nombre: 'Bebidas',          emoji: '🥤' },
  'frutas-verduras':{ nombre: 'Frutas y verduras',emoji: '🥦' },
  panaderia:        { nombre: 'Panadería',        emoji: '🍞' },
  otros:            { nombre: 'Otros',            emoji: '📦' }
};

/* Colores y emoji de cada supermercado (por nombre, como los devuelve la API) */
const SUPERS = {
  'La Colonia': { emoji: '🏪', color: '#1db96a', slug: 'la-colonia' },
  'La Unión':   { emoji: '🛒', color: '#5ba8ff', slug: 'la-union' },
  'Walmart':    { emoji: '🏬', color: '#ffc220', slug: 'walmart' }
};
const ORDEN_SUPERS = ['La Colonia', 'La Unión', 'Walmart'];
