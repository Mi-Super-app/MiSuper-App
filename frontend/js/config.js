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

/* Precio por kilo, litro o unidad: (130, { cantidad: 2, unidad: 'kg' }) → "C$65/kg"
   El tamaño lo calcula el servidor a partir del nombre (backend/helpers/tamano.js).
   Si no se sabe el tamaño, devuelve '' (no se muestra nada). */
function precioPorUnidad(precio, tamano) {
  if (!precio || !tamano || !(tamano.cantidad > 0)) return null;
  return precio / tamano.cantidad;
}
function textoPorUnidad(precio, tamano) {
  const v = precioPorUnidad(precio, tamano);
  if (v === null) return '';
  const valor = v >= 100 ? 'C$' + Math.round(v).toLocaleString('en-US') : fmtC(Math.round(v * 100) / 100);
  const unidad = tamano.unidad === 'kg' ? 'kg' : tamano.unidad === 'l' ? 'L' : t('und');
  return `${valor}/${unidad}`;
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
  lacteos:          { nombre: 'Lácteos y huevos', icono: 'milk' },
  granos:           { nombre: 'Granos básicos',   icono: 'wheat' },
  abarrotes:        { nombre: 'Abarrotes',        icono: 'soup' },
  limpieza:         { nombre: 'Limpieza',         icono: 'spray-can' },
  higiene:          { nombre: 'Higiene',          icono: 'droplets' },
  carnes:           { nombre: 'Carnes',           icono: 'beef' },
  bebidas:          { nombre: 'Bebidas',          icono: 'cup-soda' },
  'frutas-verduras':{ nombre: 'Frutas y verduras',icono: 'carrot' },
  panaderia:        { nombre: 'Panadería',        icono: 'croissant' },
  congelados:       { nombre: 'Congelados',       icono: 'snowflake' },
  licores:          { nombre: 'Cervezas y licores', icono: 'beer' },
  bebes:            { nombre: 'Bebés',            icono: 'baby' },
  mascotas:         { nombre: 'Mascotas',         icono: 'paw-print' },
  farmacia:         { nombre: 'Farmacia',         icono: 'pill' },
  hogar:            { nombre: 'Hogar y desechables', icono: 'utensils' },
  otros:            { nombre: 'Otros',            icono: 'package' }
};

/* Color e iniciales de cada supermercado (por nombre, como los devuelve la API) */
const SUPERS = {
  'La Colonia': { sigla: 'LC', color: '#1db96a', slug: 'la-colonia' },
  'La Unión':   { sigla: 'LU', color: '#5ba8ff', slug: 'la-union' },
  'Walmart':    { sigla: 'W',  color: '#ffc220', slug: 'walmart' }
};

/* Puntito del color del supermercado, para ponerlo junto a su nombre */
function puntoSuper(nombre) {
  return `<i class="punto-super" style="background:${SUPERS[nombre]?.color || 'currentColor'}" aria-hidden="true"></i>`;
}
/* Cuadrito con las iniciales del supermercado (tipo logo) */
function logoSuper(nombre, clase = 'logo-super') {
  const s = SUPERS[nombre];
  return `<span class="${clase}" style="--c:${s ? s.color : 'var(--mint)'}" aria-hidden="true">${s ? s.sigla : ico('store')}</span>`;
}
const ORDEN_SUPERS = ['La Colonia', 'La Unión', 'Walmart'];

/* ══════════════ AJUSTES (se guardan en este dispositivo) ══════════════
   idioma:     'es' | 'en'
   letra:      'normal' | 'grande'
   supers:     los supermercados que la persona quiere comparar
   presupuesto: el monto que se pone solo al crear una lista
   orden:      'nombre' | 'precio' | 'unidad'  (cómo se ordenan los productos)
   movimiento: 'auto' (lo que diga el celular) | 'todas' | 'reducido'
   vidrio:     'si' | 'no'  (efecto Liquid Glass)
   El tema (claro / oscuro / automático) va aparte en "misuper-theme". */
const LS_AJUSTES = 'misuper-ajustes';
const AJUSTES_BASE = { idioma: 'es', letra: 'normal', supers: ORDEN_SUPERS, presupuesto: 1000, orden: 'nombre', movimiento: 'auto', vidrio: 'si' };
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
  // Los pausados que la persona tenía elegidos se siguen guardando: si vuelven, reaparecen
  guardarLS(LS_AJUSTES, JSON.stringify({ ...AJUSTES, supers: [...AJUSTES.supers, ...PAUSADOS_ELEGIDOS] }));
}

/* ══════════════ SUPERMERCADOS PAUSADOS ══════════════
   Si en el servidor se pausa un súper (SUPERS_PAUSADOS en Render), /api/estado
   lo avisa y aquí se quita de la app: no se muestra ni se compara. */
const PAUSADOS_ELEGIDOS = [];
function quitarSupersPausados(nombres) {
  for (const nombre of nombres || []) {
    const i = ORDEN_SUPERS.indexOf(nombre);
    if (i < 0) continue;
    ORDEN_SUPERS.splice(i, 1);
    if (AJUSTES.supers.includes(nombre)) PAUSADOS_ELEGIDOS.push(nombre);
  }
  AJUSTES.supers = ORDEN_SUPERS.filter(s => AJUSTES.supers.includes(s));
  if (!AJUSTES.supers.length) AJUSTES.supers = [...ORDEN_SUPERS];
  // La página de inicio: se ocultan sus tarjetas
  document.querySelectorAll('[data-super-card]').forEach(el => { el.hidden = !ORDEN_SUPERS.includes(el.dataset.superCard); });
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
