/* ══════════════════════════════════════════════════════════
   MI SÚPER · LÓGICA DE LA APP (app.html)
   Usa el backend:  /api/productos, /api/listas, /api/listas/:id/comparar …
   Cada dispositivo guarda los ids de SUS listas en localStorage.
   ══════════════════════════════════════════════════════════ */

const LS_LISTAS = 'misuper-listas';
const LS_ACTIVA = 'misuper-lista-activa';

const estado = {
  productos: [],          // catálogo con precios
  porId: new Map(),       // producto por id
  categoria: 'todas',
  busqueda: '',
  listas: [],             // listas de este dispositivo (nombre, presupuesto…)
  lista: null,            // lista abierta, con sus productos
  comparacion: null,      // resultado de /comparar
  ocupado: false,
  instalar: null          // evento para instalar la app (PWA)
};

const $ = sel => document.querySelector(sel);

/* ── Guardar en el dispositivo ── */
function leerIds() { try { return JSON.parse(localStorage.getItem(LS_LISTAS)) || []; } catch { return []; } }
function guardarIds(ids) { try { localStorage.setItem(LS_LISTAS, JSON.stringify(ids)); } catch { } }
function leerActiva() { try { return localStorage.getItem(LS_ACTIVA); } catch { return null; } }
function guardarActiva(id) { try { localStorage.setItem(LS_ACTIVA, id); } catch { } }

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
function abrirHoja(html) {
  $('#hoja').innerHTML = html;
  $('#fondo-hoja').hidden = false;
  const campo = $('#hoja input');
  if (campo) setTimeout(() => { campo.focus(); campo.select(); }, 80);
}
function cerrarHoja() {
  $('#fondo-hoja').hidden = true;
  $('#hoja').innerHTML = '';
}

/* ── Navegación entre secciones ── */
function irA(vista) {
  document.body.dataset.vista = vista;
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
    const [info, productos] = await Promise.all([api('/api/estado'), api('/api/productos')]);
    $('#aviso').hidden = true;
    estado.productos = productos;
    estado.porId = new Map(productos.map(p => [p.id, p]));
    $('#actualizado').textContent = info.ultimaActualizacionDePrecios
      ? `Precios actualizados ${fechaAmigable(info.ultimaActualizacionDePrecios)}`
      : 'Precios sin actualizar todavía';
    renderChips();
    renderProductos();
    await cargarListas();
  } catch (error) {
    $('#aviso').hidden = false;
    $('#actualizado').textContent = 'Sin conexión';
    $('#prod-grid').innerHTML = '<div class="vacio"><span class="vacio-ico">📡</span><p>No pudimos cargar los productos.</p></div>';
  }
}

async function cargarListas() {
  const ids = leerIds();
  estado.listas = ids.length ? await api('/api/listas?ids=' + ids.join(',')) : [];
  guardarIds(estado.listas.map(l => l._id)); // olvida las que ya no existen
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
  estado.lista = await api('/api/listas/' + id);
  await actualizarComparacion();
  renderTodo();
}

async function actualizarComparacion() {
  estado.comparacion = estado.lista ? await api(`/api/listas/${estado.lista._id}/comparar`) : null;
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
  guardarIds([...leerIds(), nueva._id]);
  estado.listas.unshift(nueva);
  await abrirLista(nueva._id);
  if (productoPendiente) await agregar(productoPendiente);
}

async function agregar(prodId) {
  if (!estado.lista) return hojaBienvenida(prodId);
  const lista = await api(`/api/listas/${estado.lista._id}/items`, { method: 'POST', body: { productoId: prodId, cantidad: 1 } });
  await trasCambio(lista);
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

function hojaOpciones() {
  if (!estado.lista) return hojaNuevaLista();
  abrirHoja(`
    <h2>${esc(estado.lista.nombre)}</h2>
    <div class="menu-opciones">
      <button class="btn-ghost" data-accion="presupuesto">💰 Cambiar presupuesto</button>
      <button class="btn-ghost" data-accion="renombrar">✏️ Cambiar nombre</button>
      <button class="btn-ghost" data-accion="duplicar">🔁 Duplicar para reutilizarla</button>
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
  $('#badge').hidden = cant === 0;
  $('#badge').textContent = cant;
}

function renderChips() {
  const presentes = Object.keys(CATEGORIAS).filter(c => estado.productos.some(p => p.categoria === c));
  const chip = (valor, texto) => `<button class="chip ${estado.categoria === valor ? 'activa' : ''}" data-accion="categoria" data-valor="${valor}" role="tab">${texto}</button>`;
  $('#chips').innerHTML = chip('todas', '✨ Todos') + presentes.map(c => chip(c, `${CATEGORIAS[c].emoji} ${CATEGORIAS[c].nombre}`)).join('');
}

function productosFiltrados() {
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
    $('#prod-grid').innerHTML = `<div class="vacio" style="grid-column:1/-1"><span class="vacio-ico">🔎</span><p>No encontramos "${esc(estado.busqueda)}".<br>Probá con otra palabra.</p></div>`;
    return;
  }
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
    return `<article class="prod-card ${cant ? 'en-lista' : ''}">
      <div class="prod-top">
        <div class="prod-emoji" aria-hidden="true">${cat.emoji}</div>
        <div class="prod-info"><div class="prod-nombre">${esc(p.nombre)}</div><div class="prod-cat">${cat.nombre}${cant ? ' · <span class="en-lista-txt">✓ En tu lista</span>' : ''}</div></div>
        <div class="prod-acc">${accion}</div>
      </div>
      <div class="precios">${celdasPrecio(p)}</div>
    </article>`;
  }).join('');
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
    <div class="res-total ${pasado ? 'pasado' : ''}">${fmtC(total)}</div>
    <div class="res-donde">${donde}</div>
    <div class="barra-pres" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><div class="${pasado ? 'pasado' : ''}" style="width:${pct}%"></div></div>
    <div class="res-estado ${pasado ? 'mal' : 'ok'}">${pasado ? `✗ Te pasás por ${fmtC(-diferencia)}` : `✓ Te sobran ${fmtC(diferencia)}`}</div>
    ${ahorroExtra >= 1 ? `<p class="res-nota">💡 Si combinás supermercados ahorrás ${fmtC(ahorroExtra)} más. <a href="#comparar" data-accion="ir" data-vista="comparar" style="color:var(--mint);font-weight:800">Ver cómo</a></p>` : ''}
  </div>`;
}

function renderItems() {
  const caja = $('#items');
  const btnComparar = $('#btn-ver-comparar');
  if (!estado.lista) { caja.innerHTML = ''; btnComparar.hidden = true; return; }
  const items = itemsValidos();
  btnComparar.hidden = items.length === 0;
  if (!items.length) {
    caja.innerHTML = `<div class="vacio"><span class="vacio-ico">🛒</span><p>Tu lista está vacía.<br>Agregá productos desde el catálogo.</p>
      <button class="btn-ghost solo-movil" data-accion="ir" data-vista="productos">Ver productos</button></div>`;
    return;
  }
  const comprados = items.filter(i => i.comprado).length;
  const ordenados = [...items].sort((a, b) => (a.comprado - b.comprado) || a.producto.nombre.localeCompare(b.producto.nombre));
  caja.innerHTML = `<div class="items-titulo"><span>${items.length} producto${items.length === 1 ? '' : 's'}</span><span>${comprados} en el carrito</span></div>` +
    ordenados.map(item => {
      const id = idDe(item.producto);
      const prod = estado.porId.get(id);
      const mejor = prod ? mejorPrecio(prod) : null;
      const detalle = mejor
        ? `<b>${fmtC(mejor.precio)}</b> en ${mejor.super}${item.cantidad > 1 ? ` · ${item.cantidad} = ${fmtC(mejor.precio * item.cantidad)}` : ''}`
        : 'Sin precio hoy';
      return `<div class="item ${item.comprado ? 'comprado' : ''}">
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
      <div class="barra-pres"><div class="${pasado ? 'pasado' : ''}" style="width:${pct}%"></div></div>
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
}

/* ══════════════ EVENTOS ══════════════ */
const acciones = {
  ir: el => irA(el.dataset.vista),
  categoria: el => { estado.categoria = el.dataset.valor; renderChips(); renderProductos(); },
  agregar: el => ejecutar(() => agregar(el.dataset.id)),
  mas: el => ejecutar(() => cambiarCantidad(el.dataset.id, +1)),
  menos: el => ejecutar(() => cambiarCantidad(el.dataset.id, -1)),
  quitar: el => ejecutar(() => quitar(el.dataset.id)),
  comprado: el => ejecutar(() => marcarComprado(el.dataset.id)),
  bienvenida: () => hojaBienvenida(),
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
    guardarIds([...leerIds(), copia._id]);
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
    guardarIds(leerIds().filter(id => id !== estado.lista._id));
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

$('#selector-lista').addEventListener('change', e => ejecutar(() => abrirLista(e.target.value)));
$('#buscar').addEventListener('input', e => { estado.busqueda = e.target.value; renderProductos(); });
$('#fondo-hoja').addEventListener('click', e => { if (e.target.id === 'fondo-hoja') cerrarHoja(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarHoja(); });

/* Instalar como app (PWA) */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); estado.instalar = e; });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}

/* Arranque */
irA(['lista', 'comparar'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'productos');
iniciar();
