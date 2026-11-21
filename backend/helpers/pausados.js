// SUPERMERCADOS PAUSADOS
// ----------------------
// Si un supermercado te pide que dejes de mostrar sus precios, en Render agregás:
//     SUPERS_PAUSADOS=walmart              (uno)
//     SUPERS_PAUSADOS=walmart,la-union     (varios, separados por coma)
//
// Un supermercado pausado:
//   - NO se consulta nunca (ni catálogo, ni producto por producto)
//   - NO aparece en la app: ni sus precios, ni en comparar, ni en el historial
// Sus datos NO se borran: si quitás la variable, vuelve a aparecer tal como estaba.
// Para que el cambio se aplique, Render reinicia el servidor solo al guardar la variable.

const Supermercado = require('../models/Supermercado');

function slugsPausados() {
  return String(process.env.SUPERS_PAUSADOS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

const estaPausado = slug => slugsPausados().includes(String(slug).toLowerCase());

// Los _id y nombres de los pausados (se consultan una sola vez y se recuerdan)
let memoria = null;
async function pausados() {
  const slugs = slugsPausados();
  const clave = slugs.join(',');
  if (!memoria || memoria.clave !== clave) {
    const supers = slugs.length ? await Supermercado.find({ slug: { $in: slugs } }).select('_id nombre slug').lean() : [];
    memoria = { clave, slugs, ids: supers.map(s => s._id), nombres: supers.map(s => s.nombre) };
  }
  return memoria;
}

// Para agregar a una búsqueda en ProductoSupermercado o HistorialPrecio:
//   { supermercado: await superVisible() }  → excluye los pausados
async function superVisible() {
  return { $nin: (await pausados()).ids };
}

module.exports = { slugsPausados, estaPausado, pausados, superVisible };
