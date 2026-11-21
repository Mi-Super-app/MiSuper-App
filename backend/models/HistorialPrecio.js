const mongoose = require('mongoose');

// Cada vez que un precio CAMBIA, se guarda una fila aquí.
// Sirve para mostrar después "subió / bajó" o una gráfica de precios.
const historialPrecioSchema = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
  supermercado: { type: mongoose.Schema.Types.ObjectId, ref: 'Supermercado', required: true },
  valor: { type: Number, required: true },
  fecha: { type: Date, default: Date.now }
});

historialPrecioSchema.index({ producto: 1, supermercado: 1, fecha: -1 });

module.exports = mongoose.model('HistorialPrecio', historialPrecioSchema);
