const mongoose = require('mongoose');

// Lista de secciones (categorías) permitidas. Si necesitas otra, agrégala aquí
// y también en frontend/js/config.js (nombre y emoji para mostrarla).
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
  'congelados',
  'licores',
  'bebes',
  'mascotas',
  'farmacia',
  'hogar',
  'otros'
];

// El producto "general" de tu app (ej: "Leche Eskimo (lt)").
// OJO: aquí NO va el precio. El precio de cada súper vive en ProductoSupermercado.
const productoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    categoria: { type: String, required: true, enum: CATEGORIAS, index: true },
    unidad: { type: String }, // 'lt', 'kg', 'lb', '12un'... (opcional)

    // 'catalogo'  = está en data/productos.js: el MISMO producto revisado a mano en las 3 tiendas
    // 'importado' = lo trajo solo la importación automática del catálogo de una tienda
    origen: { type: String, enum: ['catalogo', 'importado'], default: 'catalogo', index: true },
    // Identificador del producto importado en su tienda, para no repetirlo:
    //   'vtex:3805'           → mismo producto en La Unión y Walmart (comparten catálogo)
    //   'la-colonia:4100108'  → producto de La Colonia
    clave: { type: String, unique: true, sparse: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Producto', productoSchema);
module.exports.CATEGORIAS = CATEGORIAS;
