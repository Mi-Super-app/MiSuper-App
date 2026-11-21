const mongoose = require('mongoose');

const supermercadoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true },
  tipo: { type: String }
});

module.exports = mongoose.model('Supermercado', supermercadoSchema);