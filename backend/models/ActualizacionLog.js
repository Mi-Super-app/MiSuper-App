const mongoose = require('mongoose');

// Un registro por cada vez que corre la actualización de precios.
// Así puedes ver si funcionó sin estar mirando la consola.
const actualizacionLogSchema = new mongoose.Schema({
  inicio: { type: Date, default: Date.now },
  fin: { type: Date },
  disparadoPor: { type: String, enum: ['cron', 'inicio', 'manual', 'seed', 'reanudacion'], default: 'cron' },
  revisados: { type: Number, default: 0 },
  nuevos: { type: Number, default: 0 }, // productos que se agregaron solos desde el catálogo de la tienda
  actualizados: { type: Number, default: 0 },
  sinCambio: { type: Number, default: 0 },
  agotados: { type: Number, default: 0 },
  sospechosos: { type: Number, default: 0 },
  errores: { type: Number, default: 0 },
  // HASTA DÓNDE LLEGÓ (para continuar si el servidor se reinicia a medias):
  //   { 'walmart': { pasos: ['/1/', '/2/+sub', '/2/30/'], catalogoListo: true, terminado: false } }
  // Un "paso" es una categoría ya leída y guardada.
  progreso: { type: Object, default: {} },
  latido: { type: Date }, // la última vez que dijo "sigo trabajando" (cada minuto mientras corre)
  reanudaciones: { type: Number, default: 0 }, // cuántas veces se continuó después de un reinicio
  detalleErrores: [
    {
      _id: false,
      supermercado: String,
      producto: String,
      mensaje: String
    }
  ]
});

// Para encontrar rápido la actualización que quedó a medias (sin "fin")
actualizacionLogSchema.index({ fin: 1, inicio: -1 });

module.exports = mongoose.model('ActualizacionLog', actualizacionLogSchema);
