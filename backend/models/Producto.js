const mongoose = require('mongoose');

// Lista de categorías permitidas. Si necesitas otra, agrégala aquí.
const CATEGORIAS = [
  'carnes',
  'lacteos',
  'limpieza',
  'higiene',
  'granos',
  'abarrotes',
  'bebidas',
  'frutas-verduras',
  'panaderia',
  'otros'
];

// El producto "general" de tu app (ej: "Leche Eskimo (lt)").
// OJO: aquí NO va el precio. El precio de cada súper vive en ProductoSupermercado.
const productoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    categoria: { type: String, required: true, enum: CATEGORIAS },
    unidad: { type: String } // 'lt', 'kg', 'lb', '12un'... (opcional)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Producto', productoSchema);
module.exports.CATEGORIAS = CATEGORIAS;
