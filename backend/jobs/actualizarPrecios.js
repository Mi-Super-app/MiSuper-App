// ACTUALIZACIÓN AUTOMÁTICA DE PRECIOS E IMPORTACIÓN DEL CATÁLOGO
// -------------------------------------------------------------
// Cada vez que corre:
//   1. Lee el catálogo COMPLETO de cada súper por categorías (ver scrapers/catalogo.js):
//      miles de productos con su precio en pocos minutos.
//   2. Productos que ya estaban → actualiza su precio.
//      Productos nuevos → los crea solos, cada uno en su sección (ver scrapers/secciones.js).
//      Productos que ya no aparecen en la tienda → "no disponible" (se conserva el último precio).
//   3. Los productos de data/productos.js que no salieron en el catálogo se revisan
//      uno por uno, como antes (son pocos).
//
// Se usa de 2 formas:
//   - Automática: node-cron la ejecuta todos los días (ver jobs/programador.js)
//   - A mano:     npm run precios
//
// Para solo actualizar precios SIN crear productos nuevos: IMPORTAR_CATALOGO=false en .env

const Supermercado = require('../models/Supermercado');
const Producto = require('../models/Producto');
const ProductoSupermercado = require('../models/ProductoSupermercado');
const HistorialPrecio = require('../models/HistorialPrecio');
const ActualizacionLog = require('../models/ActualizacionLog');
const { obtenerDatos, obtenerConfig } = require('../scrapers');
const { leerCatalogo } = require('../scrapers/catalogo');
const { esperar } = require('../scrapers/utils');

// Si un precio automático cambia más de este porcentaje de un día a otro,
// no se publica: se marca para revisión (probablemente algo se leyó mal).
const CAMBIO_MAXIMO = Number(process.env.CAMBIO_MAXIMO_PRECIO || 0.5); // 0.5 = 50 %
const LOTE = 1000; // cuántos cambios se mandan juntos a MongoDB

let enCurso = false; // evita que corran dos actualizaciones al mismo tiempo

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

// ══════════════ CAMINO 1: CATÁLOGO COMPLETO ══════════════

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

async function guardarCatalogo(superm, config, catalogo, log, { crearNuevos }) {
  const ahora = new Date();
  const esVtex = config.tipo === 'vtex';

  // Lo que ya hay guardado de esta tienda, por link
  const existentes = await ProductoSupermercado.find({ supermercado: superm._id })
    .select('producto urlExterna precioActual fuente precioPendiente')
    .lean();
  const porLink = new Map(existentes.filter(e => e.urlExterna).map(e => [e.urlExterna, e]));
  const productosEnEstaTienda = new Set(existentes.map(e => String(e.producto)));

  // Para no repetir productos: por clave, por nombre y (VTEX) por el link en la otra tienda VTEX
  const productos = await Producto.find().select('nombre clave').lean();
  const porClave = new Map(productos.filter(p => p.clave).map(p => [p.clave, p._id]));
  const nombresUsados = new Set(productos.map(p => p.nombre));
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
      if (valor) historial.push({ producto: enlace.producto, supermercado: superm._id, valor, fecha: ahora });
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
      const nuevo = new Producto({ nombre, categoria: item.seccion, origen: 'importado', clave });
      productosNuevos.push(nuevo);
      porClave.set(clave, nuevo._id);
      productoId = nuevo._id;
    }
    productosEnEstaTienda.add(String(productoId));

    enlacesNuevos.push({
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
    });
    historial.push({ producto: productoId, supermercado: superm._id, valor: item.precio, fecha: ahora });
    log.nuevos++;
  }

  // Guardar todo en lotes (mucho más rápido que de uno en uno)
  await enLotes(productosNuevos, lote => Producto.insertMany(lote, { ordered: false }), log, '(productos nuevos)');

  // Si algún producto nuevo no se pudo guardar, sus precios tampoco (quedarían huérfanos)
  const idsNuevos = productosNuevos.map(p => p._id);
  const guardados = new Set((await Producto.find({ _id: { $in: idsNuevos } }).distinct('_id')).map(String));
  const fallidos = new Set(idsNuevos.map(String).filter(id => !guardados.has(id)));
  const validos = x => !fallidos.has(String(x.producto));

  await enLotes(enlacesNuevos.filter(validos), lote => ProductoSupermercado.insertMany(lote, { ordered: false }), log, '(precios nuevos)');
  await enLotes(operaciones, lote => ProductoSupermercado.bulkWrite(lote, { ordered: false }), log, '(precios)');
  await enLotes(historial.filter(validos), lote => HistorialPrecio.insertMany(lote, { ordered: false }), log, '(historial)');

  // Importados que esta vez NO salieron en el catálogo → no disponibles (se guarda el último precio)
  const importados = await Producto.find({ origen: 'importado' }).distinct('_id');
  const retirados = await ProductoSupermercado.updateMany(
    {
      supermercado: superm._id,
      producto: { $in: importados },
      disponible: true,
      $or: [{ vistoEnCatalogo: { $lt: ahora } }, { vistoEnCatalogo: { $exists: false } }]
    },
    { $set: { disponible: false, ultimaActualizacion: ahora } }
  );
  log.agotados += retirados.modifiedCount || 0;

  console.log(
    `[precios] ${superm.nombre}: ${catalogo.length} en el catálogo, ${guardados.size} productos nuevos, ` +
      `${enlacesNuevos.length} precios nuevos, ${retirados.modifiedCount || 0} ya no aparecen`
  );
  return ahora;
}

function obtenerConfigSegura(slug) {
  try {
    return obtenerConfig(slug);
  } catch {
    return null;
  }
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

// ══════════════ TODO JUNTO ══════════════

async function actualizarPrecios({ disparadoPor = 'cron' } = {}) {
  if (enCurso) {
    console.log('[precios] Ya hay una actualización en curso; se omite esta.');
    return null;
  }
  enCurso = true;
  const log = await ActualizacionLog.create({ disparadoPor });
  const crearNuevos = process.env.IMPORTAR_CATALOGO !== 'false';

  try {
    const supermercados = await Supermercado.find({ actualizacionAutomatica: true });
    console.log(`[precios] Leyendo el catálogo de: ${supermercados.map(s => s.nombre).join(', ')} (tarda unos minutos)`);

    // Las tres tiendas se leen al mismo tiempo (son sitios distintos); se guardan una por una
    const catalogos = await Promise.allSettled(
      supermercados.map(s => leerCatalogo(s.slug, { aviso: texto => console.log(`[catálogo] ${texto}`) }))
    );

    for (const [i, superm] of supermercados.entries()) {
      const config = obtenerConfig(superm.slug);
      const leido = catalogos[i];
      let desde = null;

      if (leido.status === 'fulfilled' && leido.value.length) {
        try {
          desde = await guardarCatalogo(superm, config, leido.value, log, { crearNuevos });
        } catch (error) {
          log.errores++;
          log.detalleErrores.push({ supermercado: superm.nombre, producto: '(catálogo)', mensaje: error.message });
          console.error(`[precios] ${superm.nombre}: error al guardar el catálogo:`, error.message);
        }
      } else {
        const motivo = leido.status === 'rejected' ? leido.reason.message : 'el catálogo vino vacío';
        log.errores++;
        log.detalleErrores.push({ supermercado: superm.nombre, producto: '(catálogo)', mensaje: motivo });
        console.error(`[precios] ${superm.nombre}: no se pudo leer el catálogo (${motivo}). Se revisa uno por uno.`);
      }

      await actualizarUnoPorUno(superm, config, log, { desde });
    }
  } catch (error) {
    log.errores++;
    log.detalleErrores.push({ supermercado: '-', producto: '-', mensaje: error.message });
    console.error('[precios] Error general:', error.message);
  } finally {
    log.detalleErrores = log.detalleErrores.slice(0, 200); // que el registro no crezca sin fin
    log.fin = new Date();
    await log.save();
    enCurso = false;
    console.log(
      `[precios] Listo: ${log.revisados} revisados, ${log.nuevos} nuevos, ${log.actualizados} cambiaron, ` +
        `${log.sinCambio} sin cambio, ${log.agotados} agotados, ${log.sospechosos} sospechosos, ${log.errores} errores`
    );
  }
  return log;
}

module.exports = { actualizarPrecios, calcularCambios };

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
