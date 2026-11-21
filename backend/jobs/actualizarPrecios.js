// ACTUALIZACIÓN AUTOMÁTICA DE PRECIOS
// ----------------------------------
// Recorre todos los productos vinculados (los que tienen link en un súper),
// pide el precio a la tienda y lo guarda.
//
// Se usa de 2 formas:
//   - Automática: node-cron la ejecuta todos los días (ver jobs/programador.js)
//   - A mano:     npm run precios

const Supermercado = require('../models/Supermercado');
const ProductoSupermercado = require('../models/ProductoSupermercado');
const HistorialPrecio = require('../models/HistorialPrecio');
const ActualizacionLog = require('../models/ActualizacionLog');
const { obtenerDatos, obtenerConfig } = require('../scrapers');
const { esperar } = require('../scrapers/utils');

// Si un precio automático cambia más de este porcentaje de un día a otro,
// no se publica: se marca para revisión (probablemente algo se leyó mal).
const CAMBIO_MAXIMO = Number(process.env.CAMBIO_MAXIMO_PRECIO || 0.5); // 0.5 = 50 %

let enCurso = false; // evita que corran dos actualizaciones al mismo tiempo

async function actualizarUno(enlace, superm, log) {
  const nombreProducto = enlace.producto ? enlace.producto.nombre : '(producto borrado)';
  log.revisados++;

  try {
    const datos = await obtenerDatos(superm.slug, enlace.urlExterna);
    enlace.nombreEnTienda = datos.nombre;

    // Agotado o sin precio: lo marcamos no disponible, SIN borrar el último precio
    if (!datos.precio || !datos.disponible) {
      enlace.disponible = false;
      enlace.ultimaActualizacion = new Date();
      enlace.ultimoError = null;
      await enlace.save();
      log.agotados++;
      return;
    }

    const precio = datos.precio;
    const anterior = enlace.precioActual;

    // ¿Cambio sospechoso? Solo se revisa entre dos precios automáticos.
    // Si el mismo precio "raro" aparece otra vez en la siguiente actualización,
    // se da por confirmado y se acepta.
    const cambioGrande = enlace.fuente === 'automatica' && anterior && Math.abs(precio - anterior) / anterior > CAMBIO_MAXIMO;
    if (cambioGrande && enlace.precioPendiente !== precio) {
      enlace.precioPendiente = precio;
      enlace.requiereRevision = true;
      enlace.ultimoError = `Cambio sospechoso: C$${anterior} → C$${precio}. Se aplicará si se repite en la próxima actualización.`;
      await enlace.save();
      log.sospechosos++;
      return;
    }
    enlace.precioPendiente = undefined;

    if (precio !== anterior) {
      enlace.precioAnterior = anterior;
      enlace.precioActual = precio;
      await HistorialPrecio.create({ producto: enlace.producto._id, supermercado: superm._id, valor: precio });
      log.actualizados++;
    } else {
      log.sinCambio++;
    }

    enlace.precioNormal = datos.precioNormal;
    enlace.fuente = 'automatica';
    enlace.disponible = true;
    enlace.ultimaActualizacion = new Date();
    enlace.ultimoError = null;
    enlace.requiereRevision = false;
    await enlace.save();
  } catch (error) {
    // IMPORTANTE: si algo falla, el precio NO se toca: se queda el último bueno
    enlace.ultimoError = error.message;
    await enlace.save();
    log.errores++;
    log.detalleErrores.push({ supermercado: superm.nombre, producto: nombreProducto, mensaje: error.message });
  }
}

async function actualizarPrecios({ disparadoPor = 'cron' } = {}) {
  if (enCurso) {
    console.log('[precios] Ya hay una actualización en curso; se omite esta.');
    return null;
  }
  enCurso = true;
  const log = await ActualizacionLog.create({ disparadoPor });

  try {
    const supermercados = await Supermercado.find({ actualizacionAutomatica: true });
    console.log(`[precios] Iniciando: ${supermercados.map(s => s.nombre).join(', ')}`);

    for (const superm of supermercados) {
      const config = obtenerConfig(superm.slug);
      const enlaces = await ProductoSupermercado.find({
        supermercado: superm._id,
        urlExterna: { $exists: true, $nin: [null, ''] }
      }).populate('producto');

      for (const enlace of enlaces) {
        await actualizarUno(enlace, superm, log);
        await esperar(config.esperaEntreConsultasMs);
      }
      console.log(`[precios] ${superm.nombre}: ${enlaces.length} producto(s) revisados`);
    }
  } catch (error) {
    log.errores++;
    log.detalleErrores.push({ supermercado: '-', producto: '-', mensaje: error.message });
    console.error('[precios] Error general:', error.message);
  } finally {
    log.fin = new Date();
    await log.save();
    enCurso = false;
    console.log(
      `[precios] Listo: ${log.revisados} revisados, ${log.actualizados} cambiaron, ${log.sinCambio} sin cambio, ` +
        `${log.agotados} agotados, ${log.sospechosos} sospechosos, ${log.errores} errores`
    );
  }
  return log;
}

module.exports = { actualizarPrecios };

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
