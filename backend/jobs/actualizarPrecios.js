// ACTUALIZACIÓN AUTOMÁTICA DE PRECIOS E IMPORTACIÓN DEL CATÁLOGO
// -------------------------------------------------------------
// Cada vez que corre:
//   1. Lee el catálogo de cada súper POR CATEGORÍAS (ver scrapers/catalogo.js):
//      muchos productos con su precio en cada consulta, así se hacen pocas consultas.
//   2. Cada categoría se guarda apenas se lee:
//      productos que ya estaban → actualiza su precio
//      productos nuevos         → los crea solos, cada uno en su sección (ver scrapers/secciones.js)
//      El historial (HistorialPrecio) solo guarda una fila cuando el precio CAMBIA.
//   3. Al terminar un súper: lo que ya no apareció en su tienda → "no disponible"
//      (se conserva el último precio). Solo si TODAS sus categorías se leyeron bien.
//   4. Los productos de data/productos.js que no salieron en el catálogo se revisan
//      uno por uno, como antes (son pocos).
//
// SI EL SERVIDOR SE REINICIA A MEDIAS (Render lo hace al dormir o al publicar):
//   en ActualizacionLog.progreso queda anotada cada categoría ya guardada.
//   Al volver a arrancar, el servidor continúa la misma actualización y se salta
//   lo que ya estaba hecho (ver reanudarSiQuedoPendiente, en jobs/programador.js).
//
// SUPERS_PAUSADOS=walmart → ese súper no se consulta (ver helpers/pausados.js).
//
// Se usa de 2 formas:
//   - Automática: GitHub Actions / node-cron la ejecutan todos los días
//   - A mano:     npm run precios
//
// Para solo actualizar precios SIN crear productos nuevos: IMPORTAR_CATALOGO=false en .env

const mongoose = require('mongoose');
const Supermercado = require('../models/Supermercado');
const Producto = require('../models/Producto');
const ProductoSupermercado = require('../models/ProductoSupermercado');
const HistorialPrecio = require('../models/HistorialPrecio');
const ActualizacionLog = require('../models/ActualizacionLog');
const { obtenerDatos, obtenerConfig } = require('../scrapers');
const { leerCatalogo } = require('../scrapers/catalogo');
const { esperar } = require('../scrapers/utils');
const { estaPausado, slugsPausados } = require('../helpers/pausados');
const { leerTamano, VERSION_TAMANO } = require('../helpers/tamano');
const { completarTamanos } = require('./tamanos');

// Si un precio automático cambia más de este porcentaje de un día a otro,
// no se publica: se marca para revisión (probablemente algo se leyó mal).
const CAMBIO_MAXIMO = Number(process.env.CAMBIO_MAXIMO_PRECIO || 0.5); // 0.5 = 50 %
const LOTE = 1000; // cuántos cambios se mandan juntos a MongoDB

const HORAS_PARA_REANUDAR = 20; // una actualización a medias más vieja que esto ya no se continúa
const LATIDO_MS = 60 * 1000; //      cada minuto, la actualización avisa "sigo trabajando"
const LATIDO_VENCIDO_MS = 3 * 60 * 1000; // sin aviso en 3 minutos = se detuvo (el servidor se reinició)

let enCurso = false; // evita que corran dos actualizaciones al mismo tiempo en este servidor

// ══════════════ LA REGLA DEL PRECIO (igual para todos los caminos) ══════════════
// Recibe lo guardado (enlace) y lo leído de la tienda (datos).
// Devuelve qué campos cambiar, en qué contador cae y si va al historial.
function calcularCambios(enlace, datos, ahora = new Date()) {
  const base = { nombreEnTienda: datos.nombre };

  // Agotado o sin precio: no disponible, SIN borrar el último precio
  if (!datos.precio || !datos.disponible) {
    return {
      resultado: 'agotados',
      cambios: { ...base, disponible: false, ultimaActualizacion: ahora, ultimoError: null }
    };
  }

  const precio = datos.precio;
  const anterior = enlace.precioActual;

  // ¿Cambio sospechoso? Solo se revisa entre dos precios automáticos.
  // Si el mismo precio "raro" aparece otra vez en la siguiente actualización, se acepta.
  const cambioGrande = enlace.fuente === 'automatica' && anterior && Math.abs(precio - anterior) / anterior > CAMBIO_MAXIMO;
  if (cambioGrande && enlace.precioPendiente !== precio) {
    return {
      resultado: 'sospechosos',
      cambios: {
        ...base,
        precioPendiente: precio,
        requiereRevision: true,
        ultimoError: `Cambio sospechoso: C$${anterior} → C$${precio}. Se aplicará si se repite en la próxima actualización.`
      }
    };
  }

  const cambios = {
    ...base,
    precioPendiente: undefined,
    precioNormal: datos.precioNormal || undefined,
    fuente: 'automatica',
    disponible: true,
    ultimaActualizacion: ahora,
    ultimoError: null,
    requiereRevision: false
  };
  if (precio !== anterior) {
    cambios.precioAnterior = anterior;
    cambios.precioActual = precio;
    return { resultado: 'actualizados', cambios, historial: precio };
  }
  return { resultado: 'sinCambio', cambios };
}

// { a: 1, b: undefined } → { $set: { a: 1 }, $unset: { b: '' } }
function aOperacion(cambios) {
  const $set = {};
  const $unset = {};
  for (const [k, v] of Object.entries(cambios)) {
    if (v === undefined) $unset[k] = '';
    else $set[k] = v;
  }
  return Object.keys($unset).length ? { $set, $unset } : { $set };
}

// Manda los cambios en grupos. Si un grupo falla en parte (ej: un nombre repetido),
// el resto se guarda igual y el error queda anotado.
async function enLotes(lista, fn, log, que) {
  for (let i = 0; i < lista.length; i += LOTE) {
    try {
      await fn(lista.slice(i, i + LOTE));
    } catch (error) {
      log.errores++;
      log.detalleErrores.push({ supermercado: '-', producto: que, mensaje: error.message.slice(0, 300) });
    }
  }
}

// ══════════════ CAMINO 1: CATÁLOGO POR CATEGORÍAS ══════════════

// Los cambios a la base se hacen de a uno (en fila), aunque las tres tiendas
// se lean al mismo tiempo: así dos tiendas no crean el mismo producto a la vez.
let cola = Promise.resolve();
function enCola(fn) {
  const resultado = cola.then(fn);
  cola = resultado.catch(() => {});
  return resultado;
}

function anotarError(log, supermercado, producto, mensaje) {
  log.errores++;
  log.detalleErrores.push({ supermercado, producto, mensaje: String(mensaje).slice(0, 300) });
}

// Guarda el registro (con el progreso) en la base
async function guardarLog(log) {
  log.detalleErrores = log.detalleErrores.slice(0, 200); // que el registro no crezca sin fin
  log.latido = new Date();
  log.markModified('progreso');
  await log.save();
}

// Un nombre que no choque con otro producto (el nombre es único en la base)
function nombreLibre(nombre, superm, codigo, usados) {
  for (const intento of [nombre, `${nombre} (${superm.nombre})`, `${nombre} (${superm.nombre} ${codigo})`]) {
    if (!usados.has(intento)) {
      usados.add(intento);
      return intento;
    }
  }
  return null;
}

function obtenerConfigSegura(slug) {
  try {
    return obtenerConfig(slug);
  } catch {
    return null;
  }
}

// Lo que se necesita saber de TODOS los productos (una vez por actualización)
async function prepararProductos() {
  const productos = await Producto.find().select('nombre clave marca').lean();
  return {
    porClave: new Map(productos.filter(p => p.clave).map(p => [p.clave, p._id])),
    nombresUsados: new Set(productos.map(p => p.nombre)),
    sinMarca: new Set(productos.filter(p => !p.marca).map(p => String(p._id))) // se completa con lo que diga la tienda
  };
}

// Lo que se necesita saber de UNA tienda (una vez por tienda)
async function prepararTienda(superm, config) {
  const esVtex = config.tipo === 'vtex';
  const existentes = await ProductoSupermercado.find({ supermercado: superm._id })
    .select('producto urlExterna precioActual fuente precioPendiente')
    .lean();
  const porLink = new Map(existentes.filter(e => e.urlExterna).map(e => [e.urlExterna, e]));
  const productosEnEstaTienda = new Set(existentes.map(e => String(e.producto)));

  // VTEX: el mismo producto en la otra tienda VTEX (mismo link) → es el mismo producto
  const porRutaVtex = new Map();
  if (esVtex) {
    const otrasVtex = await Supermercado.find({ _id: { $ne: superm._id } }).lean();
    const ids = otrasVtex.filter(s => obtenerConfigSegura(s.slug)?.tipo === 'vtex').map(s => s._id);
    const enlacesVtex = await ProductoSupermercado.find({ supermercado: { $in: ids }, urlExterna: { $exists: true } })
      .select('producto urlExterna')
      .lean();
    for (const e of enlacesVtex) {
      try {
        porRutaVtex.set(new URL(e.urlExterna).pathname, e.producto);
      } catch {
        // link mal escrito: se ignora
      }
    }
  }
  return { superm, esVtex, porLink, productosEnEstaTienda, porRutaVtex, nuevosProductos: 0, nuevosPrecios: 0 };
}

// Guarda los productos de UNA categoría
async function guardarPaso(tienda, comun, catalogo, log, { crearNuevos }) {
  const ahora = new Date();
  const { superm, esVtex, porLink, productosEnEstaTienda, porRutaVtex } = tienda;
  const { porClave, nombresUsados, sinMarca } = comun;
  const marcas = []; // productos que todavía no tenían marca

  const operaciones = [];
  const historial = [];
  const productosNuevos = [];
  const enlacesNuevos = [];

  for (const item of catalogo) {
    log.revisados++;
    const enlace = porLink.get(item.link);

    if (enlace) {
      const { resultado, cambios, historial: valor } = calcularCambios(enlace, item, ahora);
      cambios.vistoEnCatalogo = ahora;
      operaciones.push({ updateOne: { filter: { _id: enlace._id }, update: aOperacion(cambios) } });
      // Solo cuando el precio CAMBIA se agrega una fila al historial
      if (valor) historial.push({ producto: enlace.producto, supermercado: superm._id, valor, fecha: ahora });
      if (item.marca && sinMarca.has(String(enlace.producto))) {
        sinMarca.delete(String(enlace.producto));
        marcas.push({ updateOne: { filter: { _id: enlace.producto, marca: { $exists: false } }, update: { $set: { marca: item.marca } } } });
      }
      log[resultado]++;
      continue;
    }

    if (!crearNuevos || !item.precio) continue; // sin precio no vale la pena crearlo

    // ¿Ya existe el producto (por ejemplo, lo creó la otra tienda VTEX)?
    const clave = esVtex ? `vtex:${item.codigo}` : `${superm.slug}:${item.codigo}`;
    let productoId = porClave.get(clave) || (esVtex && porRutaVtex.get(new URL(item.link).pathname));
    if (productoId && productosEnEstaTienda.has(String(productoId))) productoId = null; // ya tiene otro link aquí

    if (!productoId) {
      const nombre = nombreLibre(item.nombre, superm, item.codigo, nombresUsados);
      if (!nombre) continue;
      const tamano = leerTamano(item.nombre, item.seccion); // para el precio por kilo, litro o unidad
      const nuevo = new Producto({
        nombre,
        categoria: item.seccion,
        origen: 'importado',
        clave,
        ...(tamano ? { tamano } : {}),
        ...(item.marca ? { marca: item.marca } : {}),
        tamanoVersion: VERSION_TAMANO
      });
      productosNuevos.push(nuevo);
      porClave.set(clave, nuevo._id);
      productoId = nuevo._id;
    }
    productosEnEstaTienda.add(String(productoId));

    const enlaceNuevo = {
      _id: new mongoose.Types.ObjectId(),
      producto: productoId,
      supermercado: superm._id,
      nombreEnTienda: item.nombre,
      urlExterna: item.link,
      precioActual: item.precio,
      precioNormal: item.precioNormal || undefined,
      disponible: item.disponible,
      fuente: 'automatica',
      ultimaActualizacion: ahora,
      vistoEnCatalogo: ahora,
      ultimoError: null
    };
    enlacesNuevos.push(enlaceNuevo);
    // Si el mismo link sale en otra categoría, ya se trata como existente
    porLink.set(item.link, { _id: enlaceNuevo._id, producto: productoId, precioActual: item.precio, fuente: 'automatica' });
    historial.push({ producto: productoId, supermercado: superm._id, valor: item.precio, fecha: ahora }); // primer precio
    log.nuevos++;
  }

  // Guardar todo en lotes (mucho más rápido que de uno en uno)
  await enLotes(productosNuevos, lote => Producto.insertMany(lote, { ordered: false }), log, '(productos nuevos)');

  // Si algún producto nuevo no se pudo guardar, sus precios tampoco (quedarían huérfanos)
  const idsNuevos = productosNuevos.map(p => p._id);
  const guardados = idsNuevos.length
    ? new Set((await Producto.find({ _id: { $in: idsNuevos } }).distinct('_id')).map(String))
    : new Set();
  const fallidos = new Set(idsNuevos.map(String).filter(id => !guardados.has(id)));
  const validos = x => !fallidos.has(String(x.producto));

  const enlacesValidos = enlacesNuevos.filter(validos);
  await enLotes(enlacesValidos, lote => ProductoSupermercado.insertMany(lote, { ordered: false }), log, '(precios nuevos)');
  await enLotes(operaciones, lote => ProductoSupermercado.bulkWrite(lote, { ordered: false }), log, '(precios)');
  await enLotes(historial.filter(validos), lote => HistorialPrecio.insertMany(lote, { ordered: false }), log, '(historial)');
  await enLotes(marcas, lote => Producto.bulkWrite(lote, { ordered: false }), log, '(marcas)');

  tienda.nuevosProductos += guardados.size;
  tienda.nuevosPrecios += enlacesValidos.length;
}

// Importados que en ESTA actualización no salieron en el catálogo → no disponibles
// (se conserva el último precio). "desde" = cuándo empezó la actualización.
async function retirarNoVistos(superm, desde, log) {
  const importados = await Producto.find({ origen: 'importado' }).distinct('_id');
  const retirados = await ProductoSupermercado.updateMany(
    {
      supermercado: superm._id,
      producto: { $in: importados },
      disponible: true,
      $or: [{ vistoEnCatalogo: { $lt: desde } }, { vistoEnCatalogo: { $exists: false } }]
    },
    { $set: { disponible: false, ultimaActualizacion: new Date() } }
  );
  log.agotados += retirados.modifiedCount || 0;
  return retirados.modifiedCount || 0;
}

// Lee y guarda el catálogo de una tienda, categoría por categoría
async function catalogoDeTienda(superm, config, progreso, log, comun, opciones) {
  const tienda = await prepararTienda(superm, config);
  let fallidos = 0;
  const leidos = await leerCatalogo(superm.slug, {
    aviso: texto => console.log(`[catálogo] ${texto}`),
    hechos: new Set(progreso.pasos), // lo ya hecho antes de un reinicio se salta
    alPaso: (clave, productos) =>
      enCola(async () => {
        if (productos.length) await guardarPaso(tienda, comun, productos, log, opciones);
        progreso.pasos.push(clave);
        await guardarLog(log);
      }),
    alFallar: (clave, error) => {
      fallidos++;
      anotarError(log, superm.nombre, `(catálogo ${clave})`, error.message);
    }
  });

  // Solo si TODAS las categorías se leyeron bien se marcan como "no disponibles"
  // los que no aparecieron (si una falló, sus productos no se tocan).
  let retirados = 0;
  if (fallidos === 0) retirados = await enCola(() => retirarNoVistos(superm, log.inicio, log));
  else console.log(`[precios] ${superm.nombre}: ${fallidos} categoría(s) fallaron; no se marcan productos como "ya no aparecen".`);

  console.log(
    `[precios] ${superm.nombre}: ${leidos.length} leídos en esta vuelta, ${tienda.nuevosProductos} productos nuevos, ` +
      `${tienda.nuevosPrecios} precios nuevos, ${retirados} ya no aparecen`
  );
}

// ══════════════ CAMINO 2: UNO POR UNO (productos de data/productos.js) ══════════════

async function actualizarUno(enlace, superm, log) {
  const nombreProducto = enlace.producto ? enlace.producto.nombre : '(producto borrado)';
  log.revisados++;

  try {
    const datos = await obtenerDatos(superm.slug, enlace.urlExterna);
    const { resultado, cambios, historial: valor } = calcularCambios(enlace, datos);
    enlace.set(cambios);
    if (valor) await HistorialPrecio.create({ producto: enlace.producto._id, supermercado: superm._id, valor });
    await enlace.save();
    log[resultado]++;
  } catch (error) {
    // IMPORTANTE: si algo falla, el precio NO se toca: se queda el último bueno
    enlace.ultimoError = error.message;
    await enlace.save();
    log.errores++;
    log.detalleErrores.push({ supermercado: superm.nombre, producto: nombreProducto, mensaje: error.message });
  }
}

async function actualizarUnoPorUno(superm, config, log, { desde } = {}) {
  const filtro = { supermercado: superm._id, urlExterna: { $exists: true, $nin: [null, ''] } };
  // Si el catálogo se leyó bien, solo faltan los que no salieron en él
  if (desde) filtro.$or = [{ vistoEnCatalogo: { $lt: desde } }, { vistoEnCatalogo: { $exists: false } }];

  const enlaces = (await ProductoSupermercado.find(filtro).populate('producto')).filter(
    e => e.producto && e.producto.origen !== 'importado' // los importados se actualizan solo por catálogo
  );
  for (const enlace of enlaces) {
    await actualizarUno(enlace, superm, log);
    await esperar(config.esperaEntreConsultasMs);
  }
  if (enlaces.length) console.log(`[precios] ${superm.nombre}: ${enlaces.length} producto(s) revisados uno por uno`);
}

// ══════════════ UNA TIENDA (de principio a fin) ══════════════

async function actualizarTienda(superm, log, comun, opciones) {
  log.progreso[superm.slug] = log.progreso[superm.slug] || { pasos: [] };
  const progreso = log.progreso[superm.slug];
  if (progreso.terminado) return; // ya se terminó antes de un reinicio

  const config = obtenerConfig(superm.slug);
  if (!progreso.catalogoListo) {
    try {
      await catalogoDeTienda(superm, config, progreso, log, comun, opciones);
      progreso.catalogoListo = true;
    } catch (error) {
      // No se pudo ni empezar (ej: la tienda no responde): se revisa uno por uno lo que se pueda
      anotarError(log, superm.nombre, '(catálogo)', error.message);
      console.error(`[precios] ${superm.nombre}: no se pudo leer el catálogo (${error.message}). Se revisa uno por uno.`);
      progreso.catalogoListo = true;
      progreso.catalogoFallo = true;
    }
    await enCola(() => guardarLog(log));
  }

  // Si el catálogo se leyó, solo faltan los productos manuales que no salieron en él
  await actualizarUnoPorUno(superm, config, log, { desde: progreso.catalogoFallo ? null : log.inicio });
  progreso.terminado = true;
  await enCola(() => guardarLog(log));
}

// ══════════════ ¿HAY UNA ACTUALIZACIÓN A MEDIAS? ══════════════
// Devuelve la actualización que quedó a medias (y la "toma" para este servidor),
// o null si no hay ninguna. Si otro servidor la está trabajando ahora mismo, devuelve 'ocupada'.
async function tomarPendiente() {
  const pendiente = await ActualizacionLog.findOne({ fin: { $exists: false } }).sort({ inicio: -1 });
  if (!pendiente) return null;

  // Muy vieja: se cierra y se empieza otra
  if (Date.now() - pendiente.inicio.getTime() > HORAS_PARA_REANUDAR * 36e5) {
    pendiente.fin = new Date();
    anotarError(pendiente, '-', '-', 'Se interrumpió y ya era muy vieja para continuarla');
    await pendiente.save();
    return null;
  }

  // "La tomo" solo si nadie dio señales de vida en los últimos 3 minutos.
  // Se hace en un solo paso en la base, para que dos servidores no la tomen a la vez.
  const vencido = new Date(Date.now() - LATIDO_VENCIDO_MS);
  const tomada = await ActualizacionLog.findOneAndUpdate(
    { _id: pendiente._id, fin: { $exists: false }, $or: [{ latido: { $lt: vencido } }, { latido: { $exists: false } }] },
    { $set: { latido: new Date() }, $inc: { reanudaciones: 1 } },
    { new: true }
  );
  return tomada || 'ocupada';
}

// ══════════════ TODO JUNTO ══════════════

async function actualizarPrecios({ disparadoPor = 'cron' } = {}) {
  if (enCurso) {
    console.log('[precios] Ya hay una actualización en curso; se omite esta.');
    return null;
  }
  enCurso = true;
  let log = null;
  let latido = null;
  const crearNuevos = process.env.IMPORTAR_CATALOGO !== 'false';

  try {
    const pendiente = await tomarPendiente();
    if (pendiente === 'ocupada') {
      console.log('[precios] Otra actualización está trabajando ahora mismo; se omite esta.');
      return null;
    }
    if (pendiente) {
      log = pendiente;
      log.progreso = log.progreso || {};
      console.log(`[precios] Continuando la actualización del ${log.inicio.toISOString()} (quedó a medias)`);
    } else {
      log = await ActualizacionLog.create({ disparadoPor, latido: new Date() });
    }

    // "Sigo trabajando": si el servidor se apaga, el latido se detiene y otro arranque la continúa
    latido = setInterval(() => {
      ActualizacionLog.updateOne({ _id: log._id }, { $set: { latido: new Date() } }).catch(() => {});
    }, LATIDO_MS);

    const todos = await Supermercado.find({ actualizacionAutomatica: true });
    const supermercados = todos.filter(s => !estaPausado(s.slug));
    if (slugsPausados().length) console.log(`[precios] Pausados (no se consultan): ${slugsPausados().join(', ')}`);
    console.log(`[precios] Leyendo el catálogo de: ${supermercados.map(s => s.nombre).join(', ')} (tarda unos minutos)`);

    const comun = await prepararProductos();
    // Las tiendas se leen al mismo tiempo (son sitios distintos); lo que se guarda va en fila
    const resultados = await Promise.allSettled(supermercados.map(s => actualizarTienda(s, log, comun, { crearNuevos })));
    resultados.forEach((r, i) => {
      if (r.status === 'rejected') anotarError(log, supermercados[i].nombre, '-', r.reason.message);
    });
    // Tamaño de los productos que todavía no lo tienen (precio por kilo, litro o unidad)
    await completarTamanos().catch(error => anotarError(log, '-', '(tamaños)', error.message));
  } catch (error) {
    if (log) anotarError(log, '-', '-', error.message);
    console.error('[precios] Error general:', error.message);
  } finally {
    clearInterval(latido);
    if (log) {
      log.fin = new Date();
      await enCola(() => guardarLog(log)).catch(error => console.error('[precios] No se pudo guardar el registro:', error.message));
      console.log(
        `[precios] Listo: ${log.revisados} revisados, ${log.nuevos} nuevos, ${log.actualizados} cambiaron, ` +
          `${log.sinCambio} sin cambio, ${log.agotados} agotados, ${log.sospechosos} sospechosos, ${log.errores} errores`
      );
    }
    enCurso = false;
  }
  return log;
}

// Al arrancar el servidor: si quedó una actualización a medias, se continúa
async function hayPendiente() {
  return Boolean(await ActualizacionLog.exists({ fin: { $exists: false } }));
}

module.exports = { actualizarPrecios, calcularCambios, hayPendiente };

// Esto solo se ejecuta si corres el archivo directamente: npm run precios
if (require.main === module) {
  require('dotenv').config();
  const mongoose = require('mongoose');
  (async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    await actualizarPrecios({ disparadoPor: 'manual' });
    await mongoose.disconnect();
  })().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
