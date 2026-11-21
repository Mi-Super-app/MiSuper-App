const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  categoria: {
    type: String,
    required: true,
    enum: ['carnes', 'lacteos', 'limpieza', 'higiene']
  }
});

module.exports = mongoose.model('Producto', productoSchema);