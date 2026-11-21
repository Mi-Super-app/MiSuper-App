// CALCULAR EL TAMAÑO DE LOS PRODUCTOS (para el precio por kilo, litro o unidad)
// ---------------------------------------------------------------------------
// Lee el tamaño del nombre de cada producto (ver helpers/tamano.js) y lo guarda
// en Producto.tamano. Solo revisa los que todavía no tienen la versión actual
// de las reglas, así que la segunda vez es casi instantáneo.
//
// Se ejecuta solo:
//   - al encender el servidor
//   - al final de cada actualización de precios (para los productos nuevos)
// A mano:  npm run tamanos

const Producto = require('../models/Producto');
const { leerTamano, VERSION_TAMANO } = require('../helpers/tamano');

const LOTE = 1000;

async function completarTamanos() {
  const pendientes = await Producto.find({ tamanoVersion: { $ne: VERSION_TAMANO } })
    .select('nombre categoria')
    .lean();
  if (!pendientes.length) return { revisados: 0, conTamano: 0 };

  let conTamano = 0;
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const operaciones = pendientes.slice(i, i + LOTE).map(p => {
      const tamano = leerTamano(p.nombre, p.categoria);
      if (tamano) conTamano++;
      const update = tamano
        ? { $set: { tamano, tamanoVersion: VERSION_TAMANO } }
        : { $set: { tamanoVersion: VERSION_TAMANO }, $unset: { tamano: '' } };
      return { updateOne: { filter: { _id: p._id }, update } };
    });
    await Producto.bulkWrite(operaciones, { ordered: false });
  }
  console.log(`[tamaños] ${pendientes.length} productos revisados, ${conTamano} con tamaño (precio por kilo, litro o unidad)`);
  return { revisados: pendientes.length, conTamano };
}

module.exports = { completarTamanos };

// npm run tamanos
if (require.main === module) {
  require('dotenv').config();
  const mongoose = require('mongoose');
  (async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    await completarTamanos();
    await mongoose.disconnect();
  })().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}
