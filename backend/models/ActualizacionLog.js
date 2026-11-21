const mongoose = require('mongoose');

// Un registro por cada vez que corre la actualización de precios.
// Así puedes ver si funcionó sin estar mirando la consola.
const actualizacionLogSchema = new mongoose.Schema({
  inicio: { type: Date, default: Date.now },
  fin: { type: Date },
  disparadoPor: { type: String, enum: ['cron', 'inicio', 'manual', 'seed'], default: 'cron' },
  revisados: { type: Number, default: 0 },
  actualizados: { type: Number, default: 0 },
  sinCambio: { type: Number, default: 0 },
  agotados: { type: Number, default: 0 },
  sospechosos: { type: Number, default: 0 },
  errores: { type: Number, default: 0 },
  detalleErrores: [
    {
      _id: false,
      supermercado: String,
      producto: String,
      mensaje: String
    }
  ]
});

module.exports = mongoose.model('ActualizacionLog', actualizacionLogSchema);
