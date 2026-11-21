/* ══════════════════════════════════════════════════════════
   MI SÚPER · LÓGICA DE LA APP (app.html)
   Usa el backend:  /api/productos, /api/listas, /api/listas/:id/comparar …
   Sin cuenta: las listas quedan ligadas a este dispositivo.
   Con cuenta (opcional): las listas se ven en todos los dispositivos.
   ══════════════════════════════════════════════════════════ */

const LS_ACTIVA = 'misuper-lista-activa';

const estado = {
  productos: [],          // catálogo base con precios (el mismo producto en las 3 tiendas)
  porId: new Map(),       // producto por id (catálogo base + los que se buscaron)
  categoria: 'todas',
  busqueda: '',
  resultados: null,       // lo que devolvió el servidor al buscar o elegir sección (null = catálogo base)
  paginaResultados: 1,
  hayMas: false,          // ¿hay más resultados para "Ver más"?
  resumen: {},            // cuántos productos hay en cada sección { lacteos: 900, … }
  usuario: null,          // cuenta con sesión (o null si usa la app sin cuenta)
  listas: [],             // mis listas (nombre, presupuesto…)
  lista: null,            // lista abierta, con sus productos
  comparacion: null,      // resultado de /comparar
  ocupado: false,
  recienAgregado: null,   // para el destello verde del producto recién agregado
  itemsPrevios: null,     // para animar los renglones nuevos de la lista (null = recién abierta)
  totalPrevio: 0,         // para que el total "cuente" del número anterior al nuevo
  pctPrevio: 0,
  gastos: null,           // historial de compras { meses, compras } (null = sin cargar)
  instalar: null          // evento para instalar la app (PWA)
};

const $ = sel => document.querySelector(sel);

/* ── Guardar en el dispositivo ── */
const leerActiva = () => leerLS(LS_ACTIVA);
const guardarActiva = id => guardarLS(LS_ACTIVA, id);

/* ── Utilidades ── */
const sinTildes = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const numero = v => Number(String(v).replace(/[^\d.]/g, ''));
const idDe = p => (p && typeof p === 'object' ? p._id : p);

function mejorPrecio(producto) {
  let mejor = null;
  for (const nombre of ORDEN_SUPERS) {
    const v = producto.precios[nombre];
    if (v !== undefined && (!mejor || v < mejor.precio)) mejor = { super: nombre, precio: v };
  }
  return mejor;
}

function itemsValidos() {
  return estado.lista ? estado.lista.items.filter(i => i.producto) : [];
}
function cantidadEnLista(prodId) {
  const item = itemsValidos().find(i => idDe(i.producto) === prodId);
  return item ? item.cantidad : 0;
}

/* ── Animaciones ── */
const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pausa = ms => new Promise(r => setTimeout(r, sinMovimiento() ? 0 : ms));

// Vuelve a disparar una animación CSS quitando y poniendo la clase
function reanimar(el, clase) {
  if (!el) return;
  el.classList.remove(clase);
  void el.offsetWidth; // obliga al navegador a "notar" el cambio
  el.classList.add(clase);
}

// Hace que un número cuente desde "desde" hasta "hasta" (ej: C$457 → C$586)
function contarNumero(el, desde, hasta) {
  if (!el) return;
  if (sinMovimiento() || desde === hasta) { el.textContent = fmtC(hasta); return; }
  const inicio = performance.now();
  const duracion = 500;
  const paso = ahora => {
    const t = Math.min(1, (ahora - inicio) / duracion);
    const suave = 1 - Math.pow(1 - t, 3);
    el.textContent = fmtC(Math.round((desde + (hasta - desde) * suave) * 100) / 100);
    if (t < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// Espera 2 cuadros de pantalla (así el navegador "ve" el ancho viejo y anima hacia el nuevo)
const dosCuadros = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

// Pone --i a cada hijo para que aparezcan en cascada (solo los primeros 12)
function cascada(contenedor) {
  if (!contenedor || sinMovimiento()) return;
  [...contenedor.children].forEach((hijo, i) => hijo.style.setProperty('--i', Math.min(i, 12)));
  reanimar(contenedor, 'cascada');
  setTimeout(() => contenedor.classList.remove('cascada'), 1200);
}

/* ── Pantalla de carga ── */
const inicioCarga = Date.now();
let splashOculto = false;
// Si el servidor tarda (en Render gratis puede estar "dormido"), explicamos por qué
const avisoLento = setTimeout(() => {
  const t = document.getElementById('splash-texto');
  if (t) t.textContent = 'Despertando el servidor… la primera visita del día puede tardar hasta un minuto ☕';
}, 4500);
function ocultarSplash() {
  if (splashOculto) return;
  splashOculto = true;
  clearTimeout(avisoLento);
  let yaVisto = false;
  try { yaVisto = sessionStorage.getItem('misuper-splash-app') === '1'; sessionStorage.setItem('misuper-splash-app', '1'); } catch { }
  const minimo = yaVisto ? 0 : 900; // la primera vez se luce el logo un momento
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('oculto');
    setTimeout(() => splash.remove(), 600);
    cascada($('#prod-grid'));
  }, Math.max(0, minimo - (Date.now() - inicioCarga)));
}

/* ── Avisos ── */
let temporizadorToast;
function avisar(mensaje) {
  const t = $('#toast');
  t.textContent = mensaje;
  t.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.classList.remove('visible'), 2600);
}

/* ── Hoja emergente ── */
let temporizadorHoja;
function abrirHoja(html) {
  clearTimeout(temporizadorHoja);
  $('#fondo-hoja').classList.remove('cerrando');
  $('#hoja').innerHTML = html;
  $('#fondo-hoja').hidden = false;
  reanimar($('#hoja'), 'abriendo');
  const campo = $('#hoja input');
  if (campo) setTimeout(() => { campo.focus(); campo.select(); }, 80);
}
function cerrarHoja() {
  const fondo = $('#fondo-hoja');
  if (fondo.hidden) return;
  fondo.classList.add('cerrando');
  temporizadorHoja = setTimeout(() => {
    fondo.hidden = true;
    fondo.classList.remove('cerrando');
    $('#hoja').innerHTML = '';
  }, sinMovimiento() ? 0 : 220);
}

/* ── Navegación entre secciones ── */
const ORDEN_VISTAS = { productos: 0, lista: 1, comparar: 2, gastos: 3 };
function irA(vista) {
  const anterior = document.body.dataset.vista;
  const cambio = anterior !== vista;
  document.documentElement.style.setProperty('--dir', (ORDEN_VISTAS[vista] >= (ORDEN_VISTAS[anterior] ?? 0)) ? 1 : -1);
  document.documentElement.style.setProperty('--tab', ORDEN_VISTAS[vista] ?? 0);
  document.body.dataset.vista = vista;
  if (cambio) {
    const seccion = document.getElementById('vista-' + vista);
    // En computadora "Mi lista" siempre está visible a la derecha: no se anima
    const fija = vista === 'lista' && window.matchMedia('(min-width: 1024px)').matches;
    if (seccion && !fija) reanimar(seccion, 'entrando');
    if (vista === 'comparar') cascada($('#comparar-cuerpo .comp-lista'));
  }
  if (vista === 'gastos') cargarGastos();
  document.querySelectorAll('[data-accion="ir"]').forEach(b => {
    const activa = b.dataset.vista === vista;
    b.classList.toggle('activa', activa && b.classList.contains('tab') || activa && b.classList.contains('tab-esc'));
    if (b.getAttribute('role') === 'tab') b.setAttribute('aria-selected', String(activa));
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', vista === 'productos' ? location.pathname : '#' + vista);
}

/* ── Ejecuta una acción que cambia datos, con manejo de errores ── */
async function ejecutar(fn) {
  if (estado.ocupado) return;
  estado.ocupado = true;
  try {
    await fn();
  } catch (error) {
    avisar('⚠️ ' + (error.message === 'Failed to fetch' ? 'Sin conexión con Mi Súper' : error.message));
  } finally {
    estado.ocupado = false;
  }
}

/* ══════════════ CARGA DE DATOS ══════════════ */
async function iniciar() {
  try {
    const [info, productos, resumen] = await Promise.all([
      api('/api/estado'),
      api('/api/productos'),
      api('/api/productos/resumen').catch(() => ({}))
    ]);
    $('#aviso').hidden = true;
    await revisarSesion();
    estado.productos = productos;
    estado.porId = new Map(productos.map(p => [p.id, p]));
    estado.resumen = resumen;
    if (info.productos > productos.length) {
      $('#buscar').placeholder = `Buscar entre ${info.productos.toLocaleString('es-NI')} productos: leche, arroz, café…`;
    }
    const textoPrecios = info.ultimaActualizacionDePrecios
      ? `Precios actualizados ${fechaAmigable(info.ultimaActualizacionDePrecios)}`
      : 'Precios sin actualizar todavía';
    $('#actualizado').textContent = textoPrecios;
    $('#sub-productos').textContent = textoPrecios + ' · La Colonia, La Unión y Walmart';
    renderChips();
    renderProductos();
    await cargarListas();
    ocultarSplash();
  } catch (error) {
    ocultarSplash();
    $('#aviso').hidden = false;
    $('#actualizado').textContent = 'Sin conexión';
    $('#prod-grid').innerHTML = '<div class="vacio"><span class="vacio-ico">📡</span><p>No pudimos cargar los productos.</p></div>';
  }
}

/* ¿Hay sesión guardada? */
async function revisarSesion() {
  if (!leerLS(LS_TOKEN)) { estado.usuario = null; renderCuenta(); return; }
  try {
    estado.usuario = await api('/api/auth/yo');
  } catch {
    guardarLS(LS_TOKEN, null);
    estado.usuario = null;
  }
  renderCuenta();
}

async function cargarListas() {
  // El servidor devuelve MIS listas: las de mi cuenta o las de este dispositivo
  estado.listas = await api('/api/listas');
  if (!estado.listas.length) {
    estado.lista = null;
    estado.comparacion = null;
    renderTodo();
    return;
  }
  const activa = estado.listas.some(l => l._id === leerActiva()) ? leerActiva() : estado.listas[0]._id;
  await abrirLista(activa);
}

async function abrirLista(id) {
  guardarActiva(id);
  estado.itemsPrevios = null;
  estado.lista = await api('/api/listas/' + id);
  await actualizarComparacion();
  renderTodo();
}

async function actualizarComparacion() {
  const [comparacion] = await Promise.all([
    estado.lista ? api(`/api/listas/${estado.lista._id}/comparar`) : null,
    asegurarProductos()
  ]);
  estado.comparacion = comparacion;
}

/* ══════════════ CATÁLOGO GRANDE: BUSCAR EN EL SERVIDOR ══════════════
   Hay miles de productos, así que no se cargan todos: al escribir o al elegir
   una sección se le pregunta al servidor, de 60 en 60. */
const POR_PAGINA = 60;
let temporizadorBusqueda = null;
let consultaActual = 0;

function guardarEnMapa(lista) {
  lista.forEach(p => estado.porId.set(p.id, p));
}

async function buscarProductos({ mas = false } = {}) {
  const q = estado.busqueda.trim();
  const consulta = ++consultaActual; // si llega una respuesta vieja, se ignora
  if (!q && estado.categoria === 'todas') {
    estado.resultados = null;
    estado.hayMas = false;
    renderProductos();
    return;
  }
  const pagina = mas ? estado.paginaResultados + 1 : 1;
  const params = new URLSearchParams({ limite: POR_PAGINA, pagina });
  if (q) params.set('q', q);
  if (estado.categoria !== 'todas') params.set('categoria', estado.categoria);
  if (!mas) $('#prod-grid').innerHTML = '<div class="vacio" style="grid-column:1/-1"><span class="vacio-ico">🔎</span><p>Buscando…</p></div>';
  try {
    const lista = await api('/api/productos?' + params);
    if (consulta !== consultaActual) return;
    guardarEnMapa(lista);
    estado.resultados = mas ? [...(estado.resultados || []), ...lista] : lista;
    estado.paginaResultados = pagina;
    estado.hayMas = lista.length === POR_PAGINA;
    renderProductos();
  } catch {
    if (consulta === consultaActual) avisar('⚠️ No pudimos buscar ahora. Probá de nuevo.');
  }
}

function buscarConPausa() {
  clearTimeout(temporizadorBusqueda);
  temporizadorBusqueda = setTimeout(buscarProductos, 300);
}

/* Los productos de la lista que no están cargados (ej: uno que se buscó ayer) */
async function asegurarProductos() {
  const faltan = itemsValidos().map(i => idDe(i.producto)).filter(id => !estado.porId.has(id));
  for (let i = 0; i < faltan.length; i += 200) {
    guardarEnMapa(await api(`/api/productos?limite=200&ids=${faltan.slice(i, i + 200).join(',')}`));
  }
}

/* Después de cada cambio en la lista */
async function trasCambio(listaNueva) {
  estado.lista = listaNueva;
  const resumen = estado.listas.find(l => l._id === listaNueva._id);
  if (resumen) { resumen.nombre = listaNueva.nombre; resumen.presupuesto = listaNueva.presupuesto; }
  await actualizarComparacion();
  renderTodo();
}

/* ══════════════ ACCIONES ══════════════ */
async function crearLista(nombre, presupuesto, productoPendiente) {
  const nueva = await api('/api/listas', { method: 'POST', body: { nombre, presupuesto } });
  estado.listas.unshift(nueva);
  await abrirLista(nueva._id);
  if (productoPendiente) await agregar(productoPendiente);
}

async function agregar(prodId) {
  if (!estado.lista) return hojaBienvenida(prodId);
  const lista = await api(`/api/listas/${estado.lista._id}/items`, { method: 'POST', body: { productoId: prodId, cantidad: 1 } });
  estado.recienAgregado = prodId;
  await trasCambio(lista);
  estado.recienAgregado = null;
  avisar(`✓ ${estado.porId.get(prodId)?.nombre || 'Producto'} agregado`);
}

async function cambiarCantidad(prodId, cambio) {
  const nueva = cantidadEnLista(prodId) + cambio;
  if (nueva <= 0) return quitar(prodId);
  const lista = await api(`/api/listas/${estado.lista._id}/items/${prodId}`, { method: 'PUT', body: { cantidad: nueva } });
  await trasCambio(lista);
}

async function quitar(prodId) {
  const lista = await api(`/api/listas/${estado.lista._id}/items/${prodId}`, { method: 'DELETE' });
  await trasCambio(lista);
  avisar('Producto quitado de la lista');
}

async function marcarComprado(prodId) {
  const item = itemsValidos().find(i => idDe(i.producto) === prodId);
  const lista = await api(`/api/listas/${estado.lista._id}/items/${prodId}`, { method: 'PUT', body: { comprado: !item.comprado } });
  await trasCambio(lista);
}

/* ══════════════ HOJAS (formularios) ══════════════ */
const ATAJOS = [500, 1000, 2000, 3000, 5000];
const atajosHtml = () => `<div class="atajos">${ATAJOS.map(v => `<button type="button" class="btn-ghost btn-sm" data-accion="atajo" data-valor="${v}">${fmtC(v)}</button>`).join('')}</div>`;

function hojaBienvenida(productoPendiente = '') {
  abrirHoja(`
    <form data-form="crear" data-pendiente="${esc(productoPendiente)}">
      <h2>¡Bienvenido a Mi Súper! 👋</h2>
      <p>Para empezar, decinos <b>cuánto querés gastar</b> en tu compra. Te avisamos en qué supermercado te alcanza mejor.</p>
      <label for="f-pres">Tu presupuesto (C$)</label>
      <input class="campo" id="f-pres" name="presupuesto" inputmode="numeric" value="1000" required>
      ${atajosHtml()}
      <label for="f-nombre">Nombre de la lista</label>
      <input class="campo" id="f-nombre" name="nombre" value="Compra de la semana" maxlength="40" required>
      <div class="hoja-acciones"><button class="btn-primary" type="submit">Empezar 🛒</button></div>
      <p class="nota-cuenta">¿Ya tenés cuenta? <button type="button" class="enlace" data-accion="cuenta" data-modo="entrar">Entrá</button> y aparecen tus listas.</p>
    </form>`);
}

function hojaNuevaLista() {
  abrirHoja(`
    <form data-form="crear">
      <h2>Nueva lista</h2>
      <label for="f-nombre">Nombre</label>
      <input class="campo" id="f-nombre" name="nombre" placeholder="Ej: Compra del mes" maxlength="40" required>
      <label for="f-pres">Presupuesto (C$)</label>
      <input class="campo" id="f-pres" name="presupuesto" inputmode="numeric" value="${estado.lista ? estado.lista.presupuesto : 1000}" required>
      ${atajosHtml()}
      <div class="hoja-acciones">
        <button class="btn-ghost" type="button" data-accion="cerrar">Cancelar</button>
        <button class="btn-primary" type="submit">Crear lista</button>
      </div>
    </form>`);
}

function hojaPresupuesto() {
  abrirHoja(`
    <form data-form="presupuesto">
      <h2>Tu presupuesto</h2>
      <p>¿Cuánto querés gastar en "${esc(estado.lista.nombre)}"?</p>
      <input class="campo" id="f-pres" name="presupuesto" inputmode="numeric" value="${estado.lista.presupuesto}" required aria-label="Presupuesto en córdobas">
      ${atajosHtml()}
      <div class="hoja-acciones">
        <button class="btn-ghost" type="button" data-accion="cerrar">Cancelar</button>
        <button class="btn-primary" type="submit">Guardar</button>
      </div>
    </form>`);
}

function hojaRenombrar() {
  abrirHoja(`
    <form data-form="renombrar">
      <h2>Cambiar nombre</h2>
      <input class="campo" name="nombre" value="${esc(estado.lista.nombre)}" maxlength="40" required aria-label="Nombre de la lista">
      <div class="hoja-acciones">
        <button class="btn-ghost" type="button" data-accion="cerrar">Cancelar</button>
        <button class="btn-primary" type="submit">Guardar</button>
      </div>
    </form>`);
}

/* ── CUENTA (opcional) ── */
function hojaCuenta(modo = 'entrar') {
  if (estado.usuario) return hojaPerfil();
  const crear = modo === 'crear';
  abrirHoja(`
    <div class="pestanas-cuenta" role="tablist">
      <button type="button" class="${crear ? '' : 'activa'}" data-accion="cuenta" data-modo="entrar" role="tab" aria-selected="${!crear}">Entrar</button>
      <button type="button" class="${crear ? 'activa' : ''}" data-accion="cuenta" data-modo="crear" role="tab" aria-selected="${crear}">Crear cuenta</button>
    </div>
    <form data-form="${crear ? 'registro' : 'login'}">
      <h2>${crear ? 'Creá tu cuenta' : '¡Hola de nuevo!'}</h2>
      <p>${crear
        ? 'Es opcional y gratis. Con una cuenta ves tus listas en tu celular y en tu compu. Las listas que ya tenés en este dispositivo pasan a tu cuenta.'
        : 'Entrá para ver tus listas en este dispositivo.'}</p>
      ${crear ? `<label for="f-nom">Tu nombre</label>
      <input class="campo" id="f-nom" name="nombre" autocomplete="name" maxlength="60" required>` : ''}
      <label for="f-email">Correo</label>
      <input class="campo" id="f-email" name="email" type="email" autocomplete="email" inputmode="email" required>
      <label for="f-pass">Contraseña${crear ? ' (mínimo 8 caracteres)' : ''}</label>
      <input class="campo" id="f-pass" name="password" type="password" minlength="${crear ? 8 : 1}" autocomplete="${crear ? 'new-password' : 'current-password'}" required>
      <label class="ver-pass"><input type="checkbox" data-ver-pass> Mostrar contraseña</label>
      <div class="hoja-acciones">
        <button class="btn-ghost" type="button" data-accion="cerrar">Ahora no</button>
        <button class="btn-primary" type="submit">${crear ? 'Crear cuenta' : 'Entrar'}</button>
      </div>
      ${crear ? '' : '<p class="nota-cuenta"><button type="button" class="enlace" data-accion="olvide">¿Olvidaste tu contraseña?</button></p>'}
    </form>`);
}

/* ── OLVIDÉ MI CONTRASEÑA ── */
function hojaOlvide(email = '') {
  abrirHoja(`
    <form data-form="olvide">
      <h2>¿Olvidaste tu contraseña?</h2>
      <p>Escribí el correo de tu cuenta y te mandamos un link para poner una nueva. El link sirve durante 1 hora.</p>
      <label for="f-email">Correo</label>
      <input class="campo" id="f-email" name="email" type="email" autocomplete="email" inputmode="email" value="${esc(email)}" required>
      <div class="hoja-acciones">
        <button class="btn-ghost" type="button" data-accion="cuenta" data-modo="entrar">Volver</button>
        <button class="btn-primary" type="submit">Mandar link</button>
      </div>
    </form>`);
}

function hojaCorreoEnviado(mensaje) {
  abrirHoja(`
    <div class="vacio" style="padding:10px 0 0">
      <span class="vacio-ico">📬</span>
      <h2>Revisá tu correo</h2>
      <p>${esc(mensaje)}</p>
    </div>
    <div class="hoja-acciones"><button class="btn-primary" type="button" data-accion="cerrar">Listo</button></div>`);
}

function hojaRestablecer(token) {
  abrirHoja(`
    <form data-form="restablecer" data-token="${esc(token)}">
      <h2>Tu contraseña nueva</h2>
      <p>Escribila dos veces. Después vas a quedar dentro de tu cuenta.</p>
      <label for="f-pass">Contraseña nueva (mínimo 8 caracteres)</label>
      <input class="campo" id="f-pass" name="password" type="password" minlength="8" autocomplete="new-password" required>
      <label for="f-pass2">Repetila</label>
      <input class="campo" id="f-pass2" name="password2" type="password" minlength="8" autocomplete="new-password" required>
      <label class="ver-pass"><input type="checkbox" data-ver-pass> Mostrar contraseña</label>
      <div class="hoja-acciones">
        <button class="btn-ghost" type="button" data-accion="cerrar">Cancelar</button>
        <button class="btn-primary" type="submit">Guardar</button>
      </div>
    </form>`);
}

function hojaPerfil() {
  const u = estado.usuario;
  abrirHoja(`
    <div class="perfil-cabeza">
      <span class="avatar grande">${esc(u.nombre.charAt(0).toUpperCase())}</span>
      <div><h2>${esc(u.nombre)}</h2><p style="margin:0">${esc(u.email)}</p></div>
    </div>
    <p>✓ Tus listas se guardan en tu cuenta. Entrá con el mismo correo en otro celular o compu y las vas a ver ahí también.</p>
    <div class="menu-opciones">
      <button class="btn-ghost" data-accion="cerrar-sesion">🚪 Cerrar sesión</button>
      <button class="btn-ghost" data-accion="cerrar">Cerrar</button>
    </div>`);
}

function renderCuenta() {
  const btn = $('#btn-cuenta');
  if (!btn) return;
  if (estado.usuario) {
    const nombre = estado.usuario.nombre.split(' ')[0];
    btn.innerHTML = `<span class="avatar">${esc(nombre.charAt(0).toUpperCase())}</span><span class="cuenta-txt">${esc(nombre)}</span>`;
    btn.setAttribute('aria-label', `Mi cuenta (${estado.usuario.nombre})`);
  } else {
    btn.innerHTML = '<span class="avatar vacio-av">👤</span><span class="cuenta-txt">Entrar</span>';
    btn.setAttribute('aria-label', 'Entrar o crear cuenta (opcional)');
  }
}

async function iniciarSesion(ruta, datos, saludo) {
  guardarLS(LS_TOKEN, null); // por si había una sesión vieja
  const r = await api(ruta, { method: 'POST', body: datos });
  guardarLS(LS_TOKEN, r.token);
  estado.usuario = r.usuario;
  renderCuenta();
  cerrarHoja();
  await cargarListas();
  const extra = r.listasAgregadas ? ` Pasamos ${r.listasAgregadas} lista${r.listasAgregadas === 1 ? '' : 's'} de este dispositivo a tu cuenta.` : '';
  estado.gastos = null; // el historial cambia de dueño
  if (document.body.dataset.vista === 'gastos') cargarGastos();
  avisar(`${saludo || `👋 ¡Hola, ${r.usuario.nombre.split(' ')[0]}!`}${extra}`);
}

function hojaOpciones() {
  if (!estado.lista) return hojaNuevaLista();
  abrirHoja(`
    <h2>${esc(estado.lista.nombre)}</h2>
    <div class="menu-opciones">
      <button class="btn-ghost" data-accion="presupuesto">💰 Cambiar presupuesto</button>
      <button class="btn-ghost" data-accion="renombrar">✏️ Cambiar nombre</button>
      <button class="btn-ghost" data-accion="duplicar">🔁 Duplicar para reutilizarla</button>
      ${itemsValidos().length ? '<button class="btn-ghost" data-accion="registrar-compra">✅ Terminé mi compra (guardar el gasto)</button>' : ''}
      <button class="btn-ghost" data-accion="desmarcar">↩️ Desmarcar todo (empezar de nuevo)</button>
      ${estado.instalar ? '<button class="btn-ghost" data-accion="instalar">📲 Instalar Mi Súper en este dispositivo</button>' : ''}
      <button class="btn-ghost btn-peligro" data-accion="confirmar-eliminar">🗑️ Eliminar lista</button>
      <button class="btn-ghost" data-accion="cerrar">Cerrar</button>
    </div>`);
}

function hojaEliminar() {
  abrirHoja(`
    <h2>¿Eliminar la lista?</h2>
    <p>Se va a borrar "${esc(estado.lista.nombre)}" con todos sus productos. Esto no se puede deshacer.</p>
    <div class="hoja-acciones">
      <button class="btn-ghost" data-accion="cerrar">Cancelar</button>
      <button class="btn-primary" style="background:var(--red)" data-accion="eliminar">Sí, eliminar</button>
    </div>`);
}

/* ══════════════ DIBUJAR LA PANTALLA ══════════════ */
function renderTodo() {
  renderSelector();
  renderResumen();
  renderItems();
  renderProductos();
  renderComparar();
  const cant = itemsValidos().length;
  const badge = $('#badge');
  const antes = Number(badge.textContent) || 0;
  badge.hidden = cant === 0;
  badge.textContent = cant;
  if (cant !== antes && cant > 0) reanimar(badge, 'bump');
}

function renderChips() {
  const presentes = Object.keys(CATEGORIAS).filter(c => estado.resumen[c] || estado.productos.some(p => p.categoria === c));
  const chip = (valor, texto) => `<button class="chip ${estado.categoria === valor ? 'activa' : ''}" data-accion="categoria" data-valor="${valor}" role="tab">${texto}</button>`;
  $('#chips').innerHTML = chip('todas', '✨ Todos') + presentes.map(c => chip(c, `${CATEGORIAS[c].emoji} ${CATEGORIAS[c].nombre}`)).join('');
}

function productosFiltrados() {
  if (estado.resultados) return estado.resultados; // lo que encontró el servidor
  const q = sinTildes(estado.busqueda.trim());
  return estado.productos.filter(p =>
    (estado.categoria === 'todas' || p.categoria === estado.categoria) &&
    (!q || sinTildes(p.nombre).includes(q))
  );
}

function celdasPrecio(p) {
  const mejor = mejorPrecio(p);
  return ORDEN_SUPERS.map(nombre => {
    const v = p.precios[nombre];
    const s = SUPERS[nombre];
    if (v === undefined) {
      return `<div class="precio-celda no-disp"><span class="pc-super">${s.emoji} ${nombre}</span><span class="pc-valor">—</span><span class="pc-extra">No disponible</span></div>`;
    }
    const esMejor = mejor && v === mejor.precio;
    const antes = p.antes && p.antes[nombre];
    const extra = esMejor ? '✓ Mejor precio' : antes ? `Antes ${fmtC(antes)}` : '&nbsp;';
    return `<div class="precio-celda ${esMejor ? 'mejor' : ''} ${antes ? 'rebaja' : ''}">
      <span class="pc-super">${s.emoji} ${nombre}</span>
      <span class="pc-valor">${fmtC(v)}</span>
      <span class="pc-extra">${esMejor && antes ? `✓ Mejor · antes ${fmtC(antes)}` : extra}</span>
    </div>`;
  }).join('');
}

function renderProductos() {
  const lista = productosFiltrados();
  if (!estado.productos.length) return;
  if (!lista.length) {
    const que = estado.busqueda.trim() ? `"${esc(estado.busqueda)}"` : 'productos en esta sección';
    $('#prod-grid').innerHTML = `<div class="vacio" style="grid-column:1/-1"><span class="vacio-ico">🔎</span><p>No encontramos ${que}.<br>Probá con otra palabra.</p></div>`;
    return;
  }
  const verMas = estado.resultados && estado.hayMas
    ? `<div style="grid-column:1/-1;text-align:center;padding:8px 0 16px"><button class="btn-ghost" data-accion="ver-mas">Ver más productos</button></div>`
    : '';
  $('#prod-grid').innerHTML = lista.map(p => {
    const cant = cantidadEnLista(p.id);
    const cat = CATEGORIAS[p.categoria] || CATEGORIAS.otros;
    const accion = cant
      ? `<div class="stepper mini" aria-label="${cant} en tu lista">
           <button data-accion="menos" data-id="${p.id}" aria-label="Quitar uno">−</button>
           <span class="cant">${cant}</span>
           <button data-accion="mas" data-id="${p.id}" aria-label="Agregar uno">+</button>
         </div>`
      : `<button class="btn-agregar" data-accion="agregar" data-id="${p.id}" aria-label="Agregar ${esc(p.nombre)} a mi lista">+ Agregar</button>`;
    return `<article class="prod-card ${cant ? 'en-lista' : ''} ${estado.recienAgregado === p.id ? 'recien' : ''}">
      <div class="prod-top">
        <div class="prod-emoji" aria-hidden="true">${cat.emoji}</div>
        <div class="prod-info"><div class="prod-nombre">${esc(p.nombre)}</div><div class="prod-cat">${cat.nombre}${cant ? ' · <span class="en-lista-txt">✓ En tu lista</span>' : ''}</div></div>
        <button class="btn-historial" data-accion="historial" data-id="${p.id}" title="Ver cómo ha cambiado el precio" aria-label="Ver cómo ha cambiado el precio de ${esc(p.nombre)}">📈</button>
        <div class="prod-acc">${accion}</div>
      </div>
      <div class="precios">${celdasPrecio(p)}</div>
    </article>`;
  }).join('') + verMas;
}

function renderSelector() {
  const sel = $('#selector-lista');
  if (!estado.listas.length) {
    sel.innerHTML = '<option>Sin listas todavía</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = estado.listas.map(l =>
    `<option value="${l._id}" ${estado.lista && l._id === estado.lista._id ? 'selected' : ''}>📝 ${esc(l.nombre)}</option>`
  ).join('');
}

function renderResumen() {
  const caja = $('#resumen');
  if (!estado.lista) {
    caja.innerHTML = `<div class="tarjeta vacio"><span class="vacio-ico">📝</span>
      <p>Todavía no tenés una lista.<br>Creala y poné tu presupuesto.</p>
      <button class="btn-primary" data-accion="bienvenida">Crear mi lista</button></div>`;
    return;
  }
  const pres = estado.lista.presupuesto;
  const comp = estado.comparacion;
  const botonPres = `<button class="res-pres" data-accion="presupuesto" aria-label="Cambiar presupuesto">${fmtC(pres)} <small>✏️</small></button>`;

  if (!itemsValidos().length || !comp) {
    caja.innerHTML = `<div class="res-tarjeta">
      <div class="res-fila"><span class="res-etq">Presupuesto</span>${botonPres}</div>
      <p class="res-nota">Agregá productos y te decimos cuánto vas a gastar y en qué súper te alcanza mejor.</p>
    </div>`;
    return;
  }

  const mejor = comp.porSupermercado.find(s => s.supermercado === comp.mejorSupermercado);
  const total = mejor ? mejor.total : comp.combinado.total;
  const diferencia = pres - total;
  const pct = pres > 0 ? Math.min(100, (total / pres) * 100) : 100;
  const pasado = diferencia < 0;
  const donde = mejor
    ? `Comprando todo en <b>${SUPERS[mejor.supermercado]?.emoji || ''} ${mejor.supermercado}</b>, el más barato`
    : 'Combinando supermercados (ninguno tiene todos tus productos)';
  const ahorroExtra = mejor ? mejor.total - comp.combinado.total : 0;

  caja.innerHTML = `<div class="res-tarjeta">
    <div class="res-fila"><span class="res-etq">Presupuesto</span>${botonPres}</div>
    <div class="res-total ${pasado ? 'pasado' : ''}" id="res-total">${fmtC(estado.totalPrevio || total)}</div>
    <div class="res-donde">${donde}</div>
    <div class="barra-pres" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><div id="res-barra" class="${pasado ? 'pasado' : ''}" style="width:${estado.pctPrevio}%"></div></div>
    <div class="res-estado ${pasado ? 'mal' : 'ok'}">${pasado ? `✗ Te pasás por ${fmtC(-diferencia)}` : `✓ Te sobran ${fmtC(diferencia)}`}</div>
    ${ahorroExtra >= 1 ? `<p class="res-nota">💡 Si combinás supermercados ahorrás ${fmtC(ahorroExtra)} más. <a href="#comparar" data-accion="ir" data-vista="comparar" style="color:var(--mint);font-weight:800">Ver cómo</a></p>` : ''}
  </div>`;
  contarNumero($('#res-total'), estado.totalPrevio || total, total);
  dosCuadros(() => { const b = $('#res-barra'); if (b) b.style.width = pct + '%'; });
  estado.totalPrevio = total;
  estado.pctPrevio = pct;
}

function renderItems() {
  const caja = $('#items');
  const btnComparar = $('#btn-ver-comparar');
  const btnTerminar = $('#btn-terminar');
  if (!estado.lista) { caja.innerHTML = ''; btnComparar.hidden = true; btnTerminar.hidden = true; return; }
  const items = itemsValidos();
  btnComparar.hidden = items.length === 0;
  btnTerminar.hidden = items.length === 0;
  if (!items.length) {
    estado.itemsPrevios = new Set();
    caja.innerHTML = `<div class="vacio"><span class="vacio-ico">🛒</span><p>Tu lista está vacía.<br>Agregá productos desde el catálogo.</p>
      <button class="btn-ghost solo-movil" data-accion="ir" data-vista="productos">Ver productos</button></div>`;
    return;
  }
  const comprados = items.filter(i => i.comprado).length;
  const previos = estado.itemsPrevios; // null = lista recién abierta: no se marca nada como "nuevo"
  const ordenados = [...items].sort((a, b) => (a.comprado - b.comprado) || a.producto.nombre.localeCompare(b.producto.nombre));
  caja.innerHTML = `<div class="items-titulo"><span>${items.length} producto${items.length === 1 ? '' : 's'}</span><span>${comprados} en el carrito</span></div>` +
    ordenados.map(item => {
      const id = idDe(item.producto);
      const prod = estado.porId.get(id);
      const mejor = prod ? mejorPrecio(prod) : null;
      const detalle = mejor
        ? `<b>${fmtC(mejor.precio)}</b> en ${mejor.super}${item.cantidad > 1 ? ` · ${item.cantidad} = ${fmtC(mejor.precio * item.cantidad)}` : ''}`
        : 'Sin precio hoy';
      const nuevo = previos && !previos.has(id) ? 'nuevo' : '';
      return `<div class="item ${item.comprado ? 'comprado' : ''} ${nuevo}">
        <button class="check ${item.comprado ? 'on' : ''}" data-accion="comprado" data-id="${id}" aria-label="${item.comprado ? 'Desmarcar' : 'Marcar como comprado'}">${item.comprado ? '✓' : ''}</button>
        <div class="item-info"><div class="item-nombre">${esc(item.producto.nombre)}</div><div class="item-precio">${detalle}</div></div>
        <div class="item-der">
          <div class="stepper">
            <button data-accion="menos" data-id="${id}" aria-label="Quitar uno">−</button>
            <span class="cant">${item.cantidad}</span>
            <button data-accion="mas" data-id="${id}" aria-label="Agregar uno">+</button>
          </div>
          <button class="quitar" data-accion="quitar" data-id="${id}">Quitar</button>
        </div>
      </div>`;
    }).join('');
  estado.itemsPrevios = new Set(items.map(i => idDe(i.producto)));
}

function renderComparar() {
  const caja = $('#comparar-cuerpo');
  const comp = estado.comparacion;
  if (!estado.lista || !comp || !itemsValidos().length) {
    $('#comparar-sub').textContent = 'El total de tu lista en cada supermercado.';
    caja.innerHTML = `<div class="tarjeta vacio"><span class="vacio-ico">📊</span>
      <p>Agregá productos a tu lista y acá vas a ver<br>cuánto cuesta en cada supermercado.</p>
      <button class="btn-primary" data-accion="ir" data-vista="productos">Agregar productos</button></div>`;
    return;
  }
  const pres = estado.lista.presupuesto;
  $('#comparar-sub').innerHTML = `Lista "<b>${esc(estado.lista.nombre)}</b>" · ${comp.lista.cantidadProductos} productos · Presupuesto <b>${fmtC(pres)}</b>`;

  const ordenados = [...comp.porSupermercado].sort((a, b) => (b.completo - a.completo) || (a.total - b.total));
  const tarjetas = ordenados.map(s => {
    const info = SUPERS[s.supermercado] || { emoji: '🏪', color: '#1db96a' };
    const ganador = s.supermercado === comp.mejorSupermercado;
    const pct = pres > 0 ? Math.min(100, (s.total / pres) * 100) : 100;
    const pasado = s.total > pres;
    let estadoTxt;
    if (!s.completo) estadoTxt = `<div class="cs-estado mal">No tiene todos tus productos</div>`;
    else estadoTxt = `<div class="cs-estado ${pasado ? 'mal' : 'ok'}">${pasado ? `✗ Te pasás por ${fmtC(s.total - pres)}` : `✓ Te sobran ${fmtC(pres - s.total)}`}</div>`;
    return `<div class="comp-super ${ganador ? 'ganador' : ''}">
      <div class="cs-cabeza">
        <div class="cs-logo" style="background:${info.color}22;color:${info.color}">${info.emoji}</div>
        <div class="cs-nombre">${s.supermercado}</div>
        ${ganador ? '<span class="cs-ganador">🏆 Más barato</span>' : ''}
      </div>
      <div class="cs-total" style="color:${info.color}">${fmtC(s.total)}</div>
      ${estadoTxt}
      <div class="barra-pres"><div class="${pasado ? 'pasado' : ''}" data-pct="${pct}" style="width:0%"></div></div>
      ${s.faltantes.length ? `<div class="cs-falta">Sin precio aquí: ${s.faltantes.map(esc).join(', ')}</div>` : ''}
    </div>`;
  }).join('');

  // Plan combinado agrupado por supermercado
  const grupos = {};
  comp.combinado.detalle.forEach(d => {
    const clave = d.supermercado || 'Sin precio';
    (grupos[clave] = grupos[clave] || []).push(d);
  });
  const mejor = comp.porSupermercado.find(s => s.supermercado === comp.mejorSupermercado);
  const ahorro = mejor ? mejor.total - comp.combinado.total : 0;
  const rutas = Object.entries(grupos).map(([superm, lineas]) => {
    const subtotal = lineas.reduce((a, l) => a + l.subtotal, 0);
    return `<div class="ruta-super">
      <h3><span>${SUPERS[superm]?.emoji || '❔'} ${esc(superm)}</span><span>${fmtC(subtotal)}</span></h3>
      ${lineas.map(l => `<div class="ruta-item"><span>${esc(l.producto)} × ${l.cantidad}</span><span>${l.precio ? fmtC(l.subtotal) : '—'}</span></div>`).join('')}
    </div>`;
  }).join('');

  caja.innerHTML = `
    <div class="comp-lista">${tarjetas}</div>
    <div class="combinado">
      <h2>🧭 Plan para gastar lo mínimo: ${fmtC(comp.combinado.total)}</h2>
      <p class="sub">Comprando cada producto donde está más barato${ahorro >= 1 ? ` ahorrás <b style="color:var(--mint)">${fmtC(ahorro)}</b> frente a ${comp.mejorSupermercado}` : ''}. Vale la pena si te queda cerca ir a más de un súper.</p>
      ${rutas}
    </div>
    <p class="aviso-precios">Precios de referencia tomados de las tiendas en línea; pueden variar en sucursal.<br>Mi Súper no está afiliada a La Colonia, La Unión ni Walmart.</p>`;
  dosCuadros(() => caja.querySelectorAll('[data-pct]').forEach(b => { b.style.width = b.dataset.pct + '%'; }));
}

/* ══════════════ TOOLTIP DE LAS GRÁFICAS ══════════════ */
// Muestra un cuadrito con datos sobre la gráfica (al pasar el mouse o tocar)
function mostrarTip(contenedor, html, x, y) {
  let tip = contenedor.querySelector('.tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tip';
    tip.setAttribute('role', 'status');
    contenedor.appendChild(tip);
  }
  tip.innerHTML = html;
  tip.hidden = false;
  const ancho = contenedor.clientWidth;
  tip.style.left = Math.max(0, Math.min(ancho - tip.offsetWidth, x - tip.offsetWidth / 2)) + 'px';
  tip.style.top = Math.max(0, y - tip.offsetHeight - 14) + 'px';
}
function ocultarTip(contenedor) {
  const tip = contenedor && contenedor.querySelector('.tip');
  if (tip) tip.hidden = true;
}
// Posición del puntero dentro del contenedor
function posicionEn(contenedor, e) {
  const c = contenedor.getBoundingClientRect();
  return { x: e.clientX - c.left, y: e.clientY - c.top, ancho: c.width };
}
// Ej: 1500 → "C$1.5k" (para los ejes, donde hay poco espacio)
function fmtCorto(n) {
  if (n >= 1000) return 'C$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  return 'C$' + Math.round(n);
}
// Un número "redondo" para el tope de la gráfica (ej: 2,340 → 2,500)
function techo(v) {
  if (!(v > 0)) return 100;
  const potencia = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].find(m => m * potencia >= v) * potencia;
}
// Barra con las esquinas de arriba redondeadas (4px) y la base plana
function barraRedondeada(x, y, w, h, r = 4) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/* ══════════════ MIS GASTOS (historial por mes) ══════════════ */
const FMT_MES_CORTO = new Intl.DateTimeFormat('es-NI', { month: 'short' });
const FMT_MES_LARGO = new Intl.DateTimeFormat('es-NI', { month: 'long', year: 'numeric' });
const FMT_DIA = new Intl.DateTimeFormat('es-NI', { day: 'numeric', month: 'short' });
const FMT_DIA_ANIO = new Intl.DateTimeFormat('es-NI', { day: 'numeric', month: 'short', year: 'numeric' });
const mayuscula = t => t.charAt(0).toUpperCase() + t.slice(1);

// "2026-11" en hora de Nicaragua (igual que el servidor)
function claveMes(fecha) {
  const local = new Date(new Date(fecha).getTime() - 6 * 3600e3);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}
const fechaDeMes = clave => { const [a, m] = clave.split('-').map(Number); return new Date(a, m - 1, 15); };
const nombreMes = clave => mayuscula(FMT_MES_LARGO.format(fechaDeMes(clave)));
const mesCorto = clave => mayuscula(FMT_MES_CORTO.format(fechaDeMes(clave)).replace('.', ''));

// Los últimos n meses, terminando en el actual: ['2025-12', …, '2026-11']
function ultimosMeses(n) {
  const [a, m] = claveMes(new Date()).split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(a, m - 1 - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* "Terminé mi compra": guarda el gasto en el historial */
function hojaRegistrarCompra() {
  if (!estado.lista || !itemsValidos().length) return avisar('Agregá productos a tu lista primero');
  const comp = estado.comparacion;
  // Opciones: los súper con todos los productos (del más barato al más caro), después "Varios"
  const opciones = [];
  if (comp) {
    [...comp.porSupermercado].filter(s => s.completo).sort((a, b) => a.total - b.total)
      .forEach(s => opciones.push({ valor: s.supermercado, total: s.total }));
    opciones.push({ valor: 'Varios', texto: 'Varios supermercados', total: comp.combinado.total });
  }
  ORDEN_SUPERS.forEach(n => { if (!opciones.some(o => o.valor === n)) opciones.push({ valor: n, total: null }); });
  if (!opciones.some(o => o.valor === 'Varios')) opciones.push({ valor: 'Varios', texto: 'Varios supermercados', total: null });

  const primera = opciones[0];
  abrirHoja(`
    <form data-form="compra">
      <h2>✅ Terminé mi compra</h2>
      <p>Guardamos cuánto gastaste en "${esc(estado.lista.nombre)}" para tu historial de gastos por mes.</p>
      <label for="f-super">¿Dónde compraste?</label>
      <select class="campo" id="f-super" name="supermercado" data-cambia-super>
        ${opciones.map(o => `<option value="${esc(o.valor)}" data-total="${o.total ?? ''}">${SUPERS[o.valor]?.emoji || '🧭'} ${esc(o.texto || o.valor)}${o.total ? ` · aprox. ${fmtC(o.total)}` : ''}</option>`).join('')}
      </select>
      <label for="f-total">¿Cuánto pagaste? (C$)</label>
      <input class="campo" id="f-total" name="total" inputmode="decimal" value="${primera.total ?? ''}" required>
      <p class="nota-campo">Lo calculamos con los precios en línea de hoy. Si tu factura dice otra cosa, cambialo.</p>
      <label for="f-fecha">Fecha</label>
      <input class="campo" id="f-fecha" name="fecha" type="date" value="${hoyISO()}" max="${hoyISO()}" required>
      <label class="ver-pass"><input type="checkbox" name="desmarcar" checked> Desmarcar la lista para la próxima compra</label>
      <div class="hoja-acciones">
        <button class="btn-ghost" type="button" data-accion="cerrar">Cancelar</button>
        <button class="btn-primary" type="submit">Guardar gasto</button>
      </div>
    </form>`);
}

async function registrarCompra(datos) {
  const total = numero(datos.total);
  if (!(total > 0)) return avisar('Escribí cuánto pagaste');
  const lista = estado.lista;
  await api('/api/compras', {
    method: 'POST',
    body: {
      nombre: lista.nombre,
      supermercado: datos.supermercado,
      total,
      presupuesto: lista.presupuesto,
      cantidadProductos: itemsValidos().length,
      listaId: lista._id,
      // Hoy → la hora exacta. Otro día → mediodía de ese día (hora de Nicaragua)
      fecha: !datos.fecha || datos.fecha === hoyISO() ? new Date().toISOString() : `${datos.fecha}T12:00:00-06:00`
    }
  });
  cerrarHoja();
  estado.gastos = null;
  if (datos.desmarcar) {
    const nueva = await api(`/api/listas/${lista._id}`, { method: 'PUT', body: { desmarcarTodo: true } });
    await trasCambio(nueva);
  }
  avisar(`📅 Gasto de ${fmtC(total)} guardado. Miralo en "Gastos".`);
}

function hojaBorrarCompra(id) {
  const c = estado.gastos && estado.gastos.compras.find(x => x._id === id);
  if (!c) return;
  abrirHoja(`
    <h2>¿Borrar esta compra?</h2>
    <p>"${esc(c.nombre)}" del ${FMT_DIA.format(new Date(c.fecha))} por ${fmtC(c.total)} se va a quitar de tu historial.</p>
    <div class="hoja-acciones">
      <button class="btn-ghost" data-accion="cerrar">Cancelar</button>
      <button class="btn-primary" style="background:var(--red)" data-accion="borrar-compra" data-id="${esc(id)}">Sí, borrar</button>
    </div>`);
}

let cargandoGastos = null;
async function cargarGastos() {
  if (estado.gastos) return renderGastos();
  if (cargandoGastos) return cargandoGastos;
  cargandoGastos = (async () => {
    try {
      estado.gastos = await api('/api/compras');
      renderGastos();
    } catch {
      $('#gastos-cuerpo').innerHTML = `<div class="tarjeta vacio"><span class="vacio-ico">📡</span>
        <p>No pudimos cargar tu historial.</p><button class="btn-ghost" data-accion="ir" data-vista="gastos">Reintentar</button></div>`;
    } finally {
      cargandoGastos = null;
    }
  })();
  return cargandoGastos;
}

function renderGastos() {
  const caja = $('#gastos-cuerpo');
  const g = estado.gastos;
  if (!g || !g.compras.length) {
    caja.innerHTML = `<div class="tarjeta vacio"><span class="vacio-ico">📅</span>
      <p>Todavía no guardaste ninguna compra.<br>Cuando termines de comprar, tocá <b>"✅ Terminé mi compra"</b> en tu lista y acá vas a ver cuánto gastás cada mes.</p>
      <button class="btn-primary" data-accion="ir" data-vista="lista">Ir a mi lista</button></div>`;
    return;
  }

  const porMes = new Map(g.meses.map(m => [m.mes, m]));
  const totalDe = k => (porMes.get(k) ? porMes.get(k).total : 0);
  const doce = ultimosMeses(12);
  const actual = doce[11];
  const pasado = doce[10];
  const anteriores = doce.slice(0, 11).filter(k => porMes.has(k));
  const promedio = anteriores.length ? anteriores.reduce((a, k) => a + totalDe(k), 0) / anteriores.length : null;
  const comprasMes = porMes.get(actual) ? porMes.get(actual).compras : 0;

  let comparacionTxt = '';
  if (promedio && totalDe(actual)) {
    const pct = Math.round((totalDe(actual) / promedio) * 100);
    comparacionTxt = `Llevás el ${pct}% de lo que gastás en un mes normal`;
  }

  const tiles = `
    <div class="tiles">
      <div class="tile destacado"><span class="tile-etq">Este mes</span><span class="tile-valor">${fmtC(totalDe(actual))}</span>
        <span class="tile-nota">${comprasMes} compra${comprasMes === 1 ? '' : 's'}${comparacionTxt ? ' · ' + comparacionTxt : ''}</span></div>
      <div class="tile"><span class="tile-etq">${nombreMes(pasado).split(' ')[0]}</span><span class="tile-valor">${porMes.has(pasado) ? fmtC(totalDe(pasado)) : '—'}</span>
        <span class="tile-nota">Mes pasado</span></div>
      <div class="tile"><span class="tile-etq">Promedio</span><span class="tile-valor">${promedio ? fmtC(Math.round(promedio)) : '—'}</span>
        <span class="tile-nota">${promedio ? `por mes (${anteriores.length} mes${anteriores.length === 1 ? '' : 'es'})` : 'Se calcula desde el próximo mes'}</span></div>
    </div>`;

  // Gráfica: desde el primer mes con datos (mínimo los últimos 6 meses)
  const primero = doce.findIndex(k => porMes.has(k));
  const meses = doce.slice(Math.min(primero === -1 ? 6 : primero, 6));

  // Lista de compras agrupadas por mes (la más reciente arriba)
  const grupos = new Map();
  g.compras.forEach(c => {
    const k = claveMes(c.fecha);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  });
  const lista = [...grupos.entries()].map(([k, compras]) => `
    <div class="gasto-mes">
      <h3><span>${nombreMes(k)}</span><span>${fmtC(totalDe(k))}</span></h3>
      ${compras.map(c => {
        const s = SUPERS[c.supermercado];
        let pres = '';
        if (c.presupuesto) {
          pres = c.total <= c.presupuesto
            ? `<span class="ok">✓ dentro del presupuesto</span>`
            : `<span class="mal">✗ ${fmtC(c.total - c.presupuesto)} sobre el presupuesto</span>`;
        }
        return `<div class="gasto-fila">
          <div class="gf-info">
            <div class="gf-nombre">${esc(c.nombre)}</div>
            <div class="gf-detalle">${FMT_DIA.format(new Date(c.fecha))} · ${s ? s.emoji + ' ' : '🧭 '}${esc(c.supermercado)}${c.cantidadProductos ? ` · ${c.cantidadProductos} productos` : ''}</div>
            ${pres ? `<div class="gf-detalle">${pres}</div>` : ''}
          </div>
          <div class="gf-der">
            <span class="gf-total">${fmtC(c.total)}</span>
            <button class="quitar" data-accion="confirmar-borrar-compra" data-id="${esc(c._id)}" aria-label="Borrar esta compra del historial">Borrar</button>
          </div>
        </div>`;
      }).join('')}
    </div>`).join('');

  caja.innerHTML = `${tiles}
    <div class="tarjeta grafica-tarjeta">
      <h2 class="grafica-titulo">Gasto por mes</h2>
      <div class="grafica" id="gastos-grafica">${graficaMeses(meses, totalDe, promedio, actual)}</div>
    </div>
    <div class="gastos-lista">${lista}</div>`;

  const contenedor = $('#gastos-grafica');
  const mover = e => {
    const barra = e.target.closest('[data-tip]');
    if (!barra) return ocultarTip(contenedor);
    const p = posicionEn(contenedor, e);
    mostrarTip(contenedor, barra.dataset.tip, p.x, p.y);
  };
  contenedor.addEventListener('pointermove', mover);
  contenedor.addEventListener('pointerdown', mover);
  contenedor.addEventListener('pointerleave', () => ocultarTip(contenedor));
}

// Gráfica de barras (SVG): un mes por barra
function graficaMeses(meses, totalDe, promedio, actual) {
  const W = 600, H = 230, izq = 52, der = 8, arriba = 14, abajo = 28;
  const anchoUtil = W - izq - der, altoUtil = H - arriba - abajo;
  const maximo = techo(Math.max(...meses.map(totalDe), promedio || 0));
  const y = v => arriba + altoUtil - (v / maximo) * altoUtil;
  const banda = anchoUtil / meses.length;
  const anchoBarra = Math.min(44, banda * 0.62);

  const lineas = [0, 0.5, 1].map(f => {
    const v = maximo * f;
    return `<line x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}" class="g-rejilla"/>
      <text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end" class="g-eje">${fmtCorto(v)}</text>`;
  }).join('');

  const barras = meses.map((k, i) => {
    const v = totalDe(k);
    const x = izq + banda * i + (banda - anchoBarra) / 2;
    const enCurso = k === actual;
    const tip = `<b>${nombreMes(k)}</b><br>${v ? fmtC(v) : 'Sin compras guardadas'}${enCurso && v ? '<br><small>Mes en curso</small>' : ''}`;
    return `<g data-tip="${esc(tip)}">
      <rect x="${izq + banda * i}" y="${arriba}" width="${banda}" height="${altoUtil}" fill="transparent"/>
      ${v > 0 ? `<path d="${barraRedondeada(x, y(v), anchoBarra, y(0) - y(v))}" class="g-barra ${enCurso ? 'en-curso' : ''}"/>` : ''}
      <text x="${x + anchoBarra / 2}" y="${H - 8}" text-anchor="middle" class="g-eje ${enCurso ? 'g-eje-fuerte' : ''}">${mesCorto(k)}</text>
    </g>`;
  }).join('');

  const lineaPromedio = promedio
    ? `<line x1="${izq}" x2="${W - der}" y1="${y(promedio)}" y2="${y(promedio)}" class="g-promedio"/>
       <text x="${W - der}" y="${y(promedio) - 6}" text-anchor="end" class="g-eje">promedio ${fmtCorto(promedio)}</text>`
    : '';

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto por mes de los últimos ${meses.length} meses">
    ${lineas}${barras}${lineaPromedio}
  </svg>`;
}

/* ══════════════ GRÁFICA: CÓMO CAMBIA EL PRECIO ══════════════ */
const RANGOS = { '1m': { dias: 30, texto: '1 mes' }, '3m': { dias: 90, texto: '3 meses' }, '6m': { dias: 180, texto: '6 meses' }, todo: { dias: null, texto: 'Todo' } };
const historialPrecio = { id: null, datos: null, rango: 'todo', series: null, t0: 0, t1: 0 };

async function hojaHistorialPrecio(id) {
  const p = estado.porId.get(id);
  if (!p) return;
  historialPrecio.id = id;
  historialPrecio.datos = null;
  const chips = Object.entries(RANGOS).map(([k, r]) =>
    `<button type="button" class="chip ${k === historialPrecio.rango ? 'activa' : ''}" data-accion="rango" data-valor="${k}" role="tab">${r.texto}</button>`).join('');
  abrirHoja(`
    <h2>📈 ${esc(p.nombre)}</h2>
    <p class="hist-sub">Cómo ha cambiado el precio en cada supermercado.</p>
    <div class="chips hist-rangos" role="tablist" aria-label="Periodo">${chips}</div>
    <div class="grafica hist-grafica" id="hist-grafica"><div class="cargando">Cargando historial…</div></div>
    <div id="hist-leyenda"></div>
    <div id="hist-tabla"></div>
    <div class="hoja-acciones"><button class="btn-ghost" type="button" data-accion="cerrar">Cerrar</button></div>`);
  try {
    const datos = await api(`/api/productos/${id}/historial`);
    if (historialPrecio.id !== id) return; // abrieron otro producto mientras cargaba
    historialPrecio.datos = datos;
    dibujarHistorial(historialPrecio.rango);
  } catch {
    const caja = $('#hist-grafica');
    if (caja && historialPrecio.id === id) caja.innerHTML = '<div class="vacio"><span class="vacio-ico">📡</span><p>No pudimos cargar el historial.</p></div>';
  }
}

// Precio de una serie en el momento t (el último cambio antes de t)
function precioEn(tramo, t) {
  let v = null;
  for (const p of tramo) { if (p.t <= t) v = p.v; else break; }
  return v;
}

function dibujarHistorial(rango) {
  historialPrecio.rango = rango;
  const caja = $('#hist-grafica');
  if (!caja || !historialPrecio.datos) return;
  document.querySelectorAll('.hist-rangos .chip').forEach(c => {
    c.classList.toggle('activa', c.dataset.valor === rango);
    c.setAttribute('aria-selected', String(c.dataset.valor === rango));
  });

  const prod = estado.porId.get(historialPrecio.id);
  const registros = historialPrecio.datos
    .filter(h => h.supermercado && h.valor > 0)
    .map(h => ({ s: h.supermercado, v: h.valor, t: new Date(h.fecha).getTime() }))
    .sort((a, b) => a.t - b.t);
  if (!registros.length) {
    caja.innerHTML = '<div class="vacio"><span class="vacio-ico">🕒</span><p>Todavía no hay historial de este producto.<br>Revisamos los precios todos los días: volvé en unos días.</p></div>';
    $('#hist-leyenda').innerHTML = '';
    $('#hist-tabla').innerHTML = '';
    return;
  }

  const t1 = Date.now();
  const primero = registros[0].t;
  const dias = RANGOS[rango].dias;
  let t0 = Math.max(dias ? t1 - dias * 864e5 : primero, primero);
  if (t1 - t0 < 864e5) t0 = t1 - 864e5; // al menos 1 día de ancho

  const series = ORDEN_SUPERS.map(nombre => {
    const pts = registros.filter(r => r.s === nombre);
    if (!pts.length) return null;
    const previo = pts.filter(p => p.t <= t0).pop();
    const tramo = [];
    if (previo) tramo.push({ t: t0, v: previo.v });
    tramo.push(...pts.filter(p => p.t > t0));
    if (!tramo.length) return null;
    const fin = tramo[tramo.length - 1].v;
    tramo.push({ t: t1, v: fin }); // el último precio sigue hasta hoy
    return { nombre, tramo, inicio: tramo[0].v, fin, hoy: prod ? prod.precios[nombre] : undefined };
  }).filter(Boolean);
  historialPrecio.series = series;
  historialPrecio.t0 = t0;
  historialPrecio.t1 = t1;

  // Escalas
  const W = 440, H = 220, izq = 54, der = 14, arriba = 14, abajo = 26;
  const valores = series.flatMap(s => s.tramo.map(p => p.v));
  let lo = Math.min(...valores), hi = Math.max(...valores);
  const margen = hi > lo ? (hi - lo) * 0.18 : Math.max(1, hi * 0.08);
  lo = Math.max(0, lo - margen);
  hi = hi + margen;
  const x = t => izq + ((t - t0) / (t1 - t0)) * (W - izq - der);
  const y = v => arriba + (1 - (v - lo) / (hi - lo)) * (H - arriba - abajo);
  historialPrecio.escala = { x, W, izq, der, arriba, abajo, H };

  const rejilla = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1].map(v =>
    `<line x1="${izq}" x2="${W - der}" y1="${y(v)}" y2="${y(v)}" class="g-rejilla"/>
     <text x="${izq - 8}" y="${y(v) + 4}" text-anchor="end" class="g-eje">${fmtC(Math.round(v))}</text>`).join('');
  const largo = t1 - t0 > 300 * 864e5;
  const fechaEje = t => (largo ? FMT_DIA_ANIO : FMT_DIA).format(new Date(t)).replace('.', '');
  const ejeX = [[t0, 'start'], [(t0 + t1) / 2, 'middle'], [t1, 'end']].map(([t, ancla]) =>
    `<text x="${x(t)}" y="${H - 6}" text-anchor="${ancla}" class="g-eje">${t === t1 ? 'Hoy' : fechaEje(t)}</text>`).join('');

  // Línea "en escalón": el precio se mantiene hasta el día que cambia
  const lineas = series.map(s => {
    const color = `var(--serie-${SUPERS[s.nombre].slug})`;
    let d = `M${x(s.tramo[0].t).toFixed(1)},${y(s.tramo[0].v).toFixed(1)}`;
    for (let i = 1; i < s.tramo.length; i++) {
      d += `H${x(s.tramo[i].t).toFixed(1)}V${y(s.tramo[i].v).toFixed(1)}`;
    }
    const ultimo = s.tramo[s.tramo.length - 1];
    return `<path d="${d}" class="g-linea" style="stroke:${color}"/>
      <circle cx="${x(ultimo.t)}" cy="${y(ultimo.v)}" r="4" class="g-punto" style="fill:${color}"/>`;
  }).join('');

  caja.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Precio de ${esc(prod ? prod.nombre : 'producto')} en cada supermercado">
    ${rejilla}${ejeX}
    <line id="hist-cruz" class="g-cruz" x1="0" x2="0" y1="${arriba}" y2="${H - abajo}" visibility="hidden"/>
    ${lineas}
    <rect x="${izq}" y="${arriba}" width="${W - izq - der}" height="${H - arriba - abajo}" fill="transparent" class="g-zona"/>
  </svg>`;

  // Cruz + tooltip con el precio de cada súper en esa fecha
  const mover = e => {
    const p = posicionEn(caja, e);
    const svgX = (p.x / p.ancho) * W;
    if (svgX < izq || svgX > W - der) return;
    const t = t0 + ((svgX - izq) / (W - izq - der)) * (t1 - t0);
    const cruz = document.getElementById('hist-cruz');
    cruz.setAttribute('x1', svgX); cruz.setAttribute('x2', svgX); cruz.setAttribute('visibility', 'visible');
    const filas = series.map(s => {
      const v = precioEn(s.tramo, t);
      return `<div class="tip-fila"><i style="background:var(--serie-${SUPERS[s.nombre].slug})"></i>${esc(s.nombre)}<b>${v === null ? '—' : fmtC(v)}</b></div>`;
    }).join('');
    mostrarTip(caja, `<b>${FMT_DIA_ANIO.format(new Date(t))}</b>${filas}`, p.x, 40);
  };
  const salir = () => { ocultarTip(caja); const c = document.getElementById('hist-cruz'); if (c) c.setAttribute('visibility', 'hidden'); };
  caja.onpointermove = mover;
  caja.onpointerdown = mover;
  caja.onpointerleave = salir;

  // Con menos de 2 días de datos la gráfica saldría casi vacía: mejor lo explicamos
  if (t1 - primero < 2 * 864e5) {
    caja.onpointermove = caja.onpointerdown = caja.onpointerleave = null;
    caja.innerHTML = `<div class="vacio hist-poco"><span class="vacio-ico">🕒</span>
      <p>Empezamos a guardar este precio el ${FMT_DIA.format(new Date(primero))}.<br>En unos días vas a ver aquí cómo sube o baja.</p></div>`;
  }

  // Leyenda: nombre, precio de hoy y cuánto cambió en el periodo
  $('#hist-leyenda').innerHTML = `<div class="leyenda">${series.map(s => {
    const dif = Math.round((s.fin - s.inicio) * 100) / 100;
    const pct = s.inicio ? Math.round((dif / s.inicio) * 1000) / 10 : 0;
    let cambio = '<span class="ley-cambio">= sin cambios</span>';
    if (dif < 0) cambio = `<span class="ley-cambio baja">▼ bajó ${fmtC(-dif)} (${-pct}%)</span>`;
    if (dif > 0) cambio = `<span class="ley-cambio sube">▲ subió ${fmtC(dif)} (+${pct}%)</span>`;
    const agotado = s.hoy === undefined ? ' <span class="ley-cambio">· no disponible hoy</span>' : '';
    return `<div class="ley-fila">
      <i class="ley-color" style="background:var(--serie-${SUPERS[s.nombre].slug})"></i>
      <span class="ley-nombre">${SUPERS[s.nombre].emoji} ${esc(s.nombre)}</span>
      <span class="ley-precio">${fmtC(s.fin)}</span>
      <span class="ley-detalle">${cambio}${agotado}</span>
    </div>`;
  }).join('')}</div>
  <p class="nota-campo">Revisamos los precios todos los días y guardamos cada cambio desde el ${FMT_DIA_ANIO.format(new Date(primero))}.</p>`;

  // Tabla con cada cambio (para leer los datos exactos)
  const cambios = registros.filter(r => r.t >= t0).reverse().slice(0, 60);
  $('#hist-tabla').innerHTML = cambios.length ? `<details class="hist-detalles">
    <summary>Ver todos los cambios (${cambios.length})</summary>
    <table class="hist-tabla"><thead><tr><th>Fecha</th><th>Supermercado</th><th>Precio</th></tr></thead><tbody>
    ${cambios.map(r => `<tr><td>${FMT_DIA_ANIO.format(new Date(r.t))}</td><td>${esc(r.s)}</td><td>${fmtC(r.v)}</td></tr>`).join('')}
    </tbody></table></details>` : '';
}

/* ══════════════ EVENTOS ══════════════ */
const acciones = {
  ir: el => irA(el.dataset.vista),
  categoria: el => {
    estado.categoria = el.dataset.valor;
    renderChips();
    buscarProductos().then(() => cascada($('#prod-grid')));
  },
  'ver-mas': el => { el.disabled = true; el.textContent = 'Cargando…'; buscarProductos({ mas: true }); },
  agregar: el => ejecutar(() => agregar(el.dataset.id)),
  mas: el => ejecutar(() => cambiarCantidad(el.dataset.id, +1)),
  menos: el => ejecutar(() => cambiarCantidad(el.dataset.id, -1)),
  quitar: el => ejecutar(async () => {
    const renglon = el.closest('.item');
    if (renglon) { renglon.classList.add('saliendo'); await pausa(200); }
    await quitar(el.dataset.id);
  }),
  comprado: el => ejecutar(() => marcarComprado(el.dataset.id)),
  bienvenida: () => hojaBienvenida(),
  cuenta: el => hojaCuenta(el.dataset.modo),
  olvide: () => hojaOlvide(($('#hoja input[name="email"]') || {}).value || ''),
  'registrar-compra': () => hojaRegistrarCompra(),
  'confirmar-borrar-compra': el => hojaBorrarCompra(el.dataset.id),
  'borrar-compra': el => ejecutar(async () => {
    await api('/api/compras/' + el.dataset.id, { method: 'DELETE' });
    cerrarHoja();
    estado.gastos = null;
    await cargarGastos();
    avisar('🗑️ Compra borrada del historial');
  }),
  historial: el => hojaHistorialPrecio(el.dataset.id),
  rango: el => dibujarHistorial(el.dataset.valor),
  'cerrar-sesion': () => ejecutar(async () => {
    guardarLS(LS_TOKEN, null);
    guardarLS(LS_ACTIVA, null);
    estado.usuario = null;
    estado.gastos = null;
    renderCuenta();
    cerrarHoja();
    await cargarListas();
    if (document.body.dataset.vista === 'gastos') cargarGastos();
    avisar('Sesión cerrada. Tus listas siguen guardadas en tu cuenta.');
  }),
  'nueva-lista': () => hojaNuevaLista(),
  'opciones-lista': () => hojaOpciones(),
  presupuesto: () => estado.lista ? hojaPresupuesto() : hojaBienvenida(),
  renombrar: () => hojaRenombrar(),
  'confirmar-eliminar': () => hojaEliminar(),
  atajo: el => { const campo = $('#hoja [name="presupuesto"]'); if (campo) campo.value = el.dataset.valor; },
  cerrar: () => cerrarHoja(),
  reintentar: () => iniciar(),
  duplicar: () => ejecutar(async () => {
    const copia = await api(`/api/listas/${estado.lista._id}/duplicar`, { method: 'POST', body: {} });
    estado.listas.unshift(copia);
    cerrarHoja();
    await abrirLista(copia._id);
    avisar('🔁 Lista duplicada');
  }),
  desmarcar: () => ejecutar(async () => {
    const lista = await api(`/api/listas/${estado.lista._id}`, { method: 'PUT', body: { desmarcarTodo: true } });
    cerrarHoja();
    await trasCambio(lista);
    avisar('↩️ Todo desmarcado');
  }),
  eliminar: () => ejecutar(async () => {
    await api(`/api/listas/${estado.lista._id}`, { method: 'DELETE' });
    cerrarHoja();
    await cargarListas();
    avisar('🗑️ Lista eliminada');
  }),
  instalar: async () => {
    cerrarHoja();
    if (!estado.instalar) return;
    estado.instalar.prompt();
    await estado.instalar.userChoice;
    estado.instalar = null;
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  const accion = acciones[el.dataset.accion];
  if (accion) accion(el);
});

/* Formularios de las hojas */
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(form));
  const tipo = form.dataset.form;

  if (tipo === 'login' || tipo === 'registro') {
    return ejecutar(() => iniciarSesion(tipo === 'login' ? '/api/auth/login' : '/api/auth/registro', datos));
  }
  if (tipo === 'olvide') {
    return ejecutar(async () => {
      const r = await api('/api/auth/olvide', { method: 'POST', body: { email: datos.email.trim() } });
      hojaCorreoEnviado(r.mensaje);
    });
  }
  if (tipo === 'restablecer') {
    if (datos.password !== datos.password2) return avisar('Las dos contraseñas no son iguales');
    return ejecutar(() => iniciarSesion('/api/auth/restablecer', { token: form.dataset.token, password: datos.password }, '🔑 ¡Listo! Tu contraseña cambió.'));
  }
  if (tipo === 'compra') return ejecutar(() => registrarCompra(datos, form));

  if (datos.presupuesto !== undefined) {
    datos.presupuesto = numero(datos.presupuesto);
    if (!(datos.presupuesto > 0)) return avisar('Escribí un presupuesto mayor que cero');
  }

  ejecutar(async () => {
    if (tipo === 'crear') {
      const pendiente = form.dataset.pendiente;
      cerrarHoja();
      await crearLista(datos.nombre.trim(), datos.presupuesto, pendiente);
      if (!pendiente) avisar('📝 Lista creada');
    } else if (tipo === 'presupuesto') {
      const lista = await api(`/api/listas/${estado.lista._id}`, { method: 'PUT', body: { presupuesto: datos.presupuesto } });
      cerrarHoja();
      await trasCambio(lista);
      avisar('💰 Presupuesto actualizado');
    } else if (tipo === 'renombrar') {
      const lista = await api(`/api/listas/${estado.lista._id}`, { method: 'PUT', body: { nombre: datos.nombre.trim() } });
      cerrarHoja();
      await trasCambio(lista);
      renderSelector();
    }
  });
});

document.addEventListener('change', e => {
  if (e.target.matches('[data-cambia-super]')) {
    // Al cambiar de súper, ponemos su total aproximado (si lo tenemos)
    const total = e.target.selectedOptions[0].dataset.total;
    const campo = $('#hoja [name="total"]');
    if (total && campo) campo.value = total;
  }
  if (e.target.matches('[data-ver-pass]')) {
    document.querySelectorAll('#hoja input[name^="password"]').forEach(campo => { campo.type = e.target.checked ? 'text' : 'password'; });
  }
});
window.addEventListener('misuper:sesion-vencida', () => {
  estado.usuario = null;
  renderCuenta();
  avisar('Tu sesión venció. Volvé a entrar para ver las listas de tu cuenta.');
});

$('#selector-lista').addEventListener('change', e => ejecutar(() => abrirLista(e.target.value)));
$('#buscar').addEventListener('input', e => { estado.busqueda = e.target.value; buscarConPausa(); });
$('#fondo-hoja').addEventListener('click', e => { if (e.target.id === 'fondo-hoja') cerrarHoja(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarHoja(); });

/* Instalar como app (PWA) */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); estado.instalar = e; });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}

/* Arranque */
// ¿Viene del link del correo "Olvidé mi contraseña"? (…/app.html#restablecer=CODIGO)
const codigoReset = (location.hash.match(/^#restablecer=([a-f0-9]{64})$/) || [])[1];
irA(['lista', 'comparar', 'gastos'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'productos');
iniciar().then(() => { if (codigoReset) hojaRestablecer(codigoReset); });
