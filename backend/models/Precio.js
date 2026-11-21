const mongoose = require('mongoose');

const precioSchema = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
  supermercado: { type: mongoose.Schema.Types.ObjectId, ref: 'Supermercado', required: true },
  valor: { type: Number, required: true },
  fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Precio', precioSchema);