// VINCULAR UN PRODUCTO CON SU PÁGINA EN UN SUPERMERCADO
// -----------------------------------------------------
// Uso:  npm run vincular -- "<nombre del producto>" <slug-super> <url> [precio-inicial]
// Ej.:  npm run vincular -- "Fabuloso (1lt)" maxi-pali https://maxipali.com.ni/.../fabuloso-...-9917613264
//
// Esto se hace UNA sola vez por producto y supermercado.
// Después, la actualización diaria lee el precio sola.

require('dotenv').config();
const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const Supermercado = require('../models/Supermercado');
const ProductoSupermercado = require('../models/ProductoSupermercado');

async function main() {
  const [nombre, slug, url, precio] = process.argv.slice(2);
  if (!nombre || !slug || !url) {
    console.log('Uso: npm run vincular -- "<nombre del producto>" <slug-super> <url> [precio-inicial]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const producto = await Producto.findOne({ nombre });
  if (!producto) throw new Error(`No existe el producto "${nombre}" (revisa mayúsculas y tildes)`);

  const superm = await Supermercado.findOne({ slug });
  if (!superm) throw new Error(`No existe el supermercado con slug "${slug}"`);

  const cambios = { urlExterna: url };
  if (precio) {
    cambios.precioActual = Number(precio);
    cambios.fuente = 'manual';
    cambios.ultimaActualizacion = new Date();
  }

  await ProductoSupermercado.findOneAndUpdate(
    { producto: producto._id, supermercado: superm._id },
    cambios,
    { upsert: true, new: true } // si no existe lo crea
  );

  console.log(`✅ "${nombre}" vinculado en ${superm.nombre}:\n   ${url}`);
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('Error:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
