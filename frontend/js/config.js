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

/* ── Sesión y dispositivo ──
   misuper-token: la sesión de la cuenta (si la persona entró)
   misuper-dispositivo: clave al azar de este celular/compu (para listas sin cuenta) */
const LS_TOKEN = 'misuper-token';
const LS_DISPOSITIVO = 'misuper-dispositivo';
function leerLS(clave) { try { return localStorage.getItem(clave); } catch { return null; } }
function guardarLS(clave, valor) { try { valor === null ? localStorage.removeItem(clave) : localStorage.setItem(clave, valor); } catch { } }

function claveDispositivo() {
  let clave = leerLS(LS_DISPOSITIVO);
  if (!clave) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    clave = 'd-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    guardarLS(LS_DISPOSITIVO, clave);
  }
  return clave;
}

/* Pide datos al backend. Uso: const productos = await api('/api/productos') */
async function api(ruta, opciones = {}, reintento = false) {
  const headers = { 'Content-Type': 'application/json', 'x-dispositivo': claveDispositivo() };
  const token = leerLS(LS_TOKEN);
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(API_BASE + ruta, {
    ...opciones,
    headers,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });
  const datos = await res.json().catch(() => ({}));

  // Sesión vencida: la cerramos y repetimos la petición sin cuenta
  if (res.status === 401 && token && !reintento && !ruta.startsWith('/api/auth/')) {
    guardarLS(LS_TOKEN, null);
    window.dispatchEvent(new Event('misuper:sesion-vencida'));
    return api(ruta, opciones, true);
  }
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
  if (!iso) return t('sin datos');
  const f = new Date(iso);
  const hoy = new Date();
  const hora = f.toLocaleTimeString(LOCALE(), { hour: 'numeric', minute: '2-digit' });
  if (f.toDateString() === hoy.toDateString()) return t('hoy {hora}', { hora });
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (f.toDateString() === ayer.toDateString()) return t('ayer {hora}', { hora });
  return f.toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' }) + ' ' + hora;
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
  congelados:       { nombre: 'Congelados',       emoji: '🧊' },
  licores:          { nombre: 'Cervezas y licores', emoji: '🍺' },
  bebes:            { nombre: 'Bebés',            emoji: '🍼' },
  mascotas:         { nombre: 'Mascotas',         emoji: '🐾' },
  farmacia:         { nombre: 'Farmacia',         emoji: '💊' },
  hogar:            { nombre: 'Hogar y desechables', emoji: '🍽️' },
  otros:            { nombre: 'Otros',            emoji: '📦' }
};

/* Colores y emoji de cada supermercado (por nombre, como los devuelve la API) */
const SUPERS = {
  'La Colonia': { emoji: '🏪', color: '#1db96a', slug: 'la-colonia' },
  'La Unión':   { emoji: '🛒', color: '#5ba8ff', slug: 'la-union' },
  'Walmart':    { emoji: '🏬', color: '#ffc220', slug: 'walmart' }
};
const ORDEN_SUPERS = ['La Colonia', 'La Unión', 'Walmart'];

/* ══════════════ AJUSTES (se guardan en este dispositivo) ══════════════
   idioma:     'es' | 'en'
   letra:      'normal' | 'grande'
   supers:     los supermercados que la persona quiere comparar
   presupuesto: el monto que se pone solo al crear una lista
   orden:      'nombre' | 'precio'  (cómo se ordenan los productos)
   movimiento: 'auto' (lo que diga el celular) | 'reducido'
   El tema (claro / oscuro / automático) va aparte en "misuper-theme". */
const LS_AJUSTES = 'misuper-ajustes';
const AJUSTES_BASE = { idioma: 'es', letra: 'normal', supers: ORDEN_SUPERS, presupuesto: 1000, orden: 'nombre', movimiento: 'auto' };
function leerAjustes() {
  let guardados = {};
  try { guardados = JSON.parse(leerLS(LS_AJUSTES) || '{}') || {}; } catch { }
  const a = { ...AJUSTES_BASE, ...guardados };
  a.supers = Array.isArray(a.supers) ? ORDEN_SUPERS.filter(s => a.supers.includes(s)) : ORDEN_SUPERS;
  if (!a.supers.length) a.supers = ORDEN_SUPERS;
  if (!(Number(a.presupuesto) > 0)) a.presupuesto = AJUSTES_BASE.presupuesto;
  return a;
}
const AJUSTES = leerAjustes();
function guardarAjustes(cambios) {
  Object.assign(AJUSTES, cambios);
  guardarLS(LS_AJUSTES, JSON.stringify(AJUSTES));
}

/* ══════════════ IDIOMA ══════════════
   t('Texto en español') devuelve la traducción si la app está en inglés.
   Las traducciones están en js/i18n.js (solo las carga la app).
   Variables: t('Te sobran {monto}', { monto: 'C$50' }) */
const TRADUCCIONES = {};
const enIngles = () => AJUSTES.idioma === 'en' && Boolean(TRADUCCIONES.__listo);
const LOCALE = () => (enIngles() ? 'en-US' : 'es-NI');
function t(texto, vars) {
  let s = (enIngles() && TRADUCCIONES[texto]) || texto;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(v);
  return s;
}
