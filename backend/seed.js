// CARGAR / SINCRONIZAR EL CATÁLOGO
// --------------------------------
// Uso:  npm run seed
//
// Lee data/supermercados.js y data/productos.js y los guarda en MongoDB.
// Después importa el catálogo completo de cada tienda y trae los precios REALES
// (la primera vez tarda unos 10 minutos: son miles de productos).
//
// Se puede ejecutar todas las veces que quieras:
//   - no borra tus listas de compras
//   - no duplica nada (si un producto ya existe, lo actualiza)
//   - si agregas un producto en data/productos.js, lo crea
//   - borra los supermercados que ya no están en data/supermercados.js (ej: Palí)
//   - NO borra los productos importados automáticamente del catálogo de cada tienda
//
// Para cargar el catálogo SIN traer precios:  npm run seed -- --sin-precios

require('dotenv').config();
const mongoose = require('mongoose');
const Supermercado = require('./models/Supermercado');
const Producto = require('./models/Producto');
const ProductoSupermercado = require('./models/ProductoSupermercado');
const HistorialPrecio = require('./models/HistorialPrecio');
const Lista = require('./models/Lista');
const supermercados = require('./data/supermercados');
const productos = require('./data/productos');
const { actualizarPrecios } = require('./jobs/actualizarPrecios');

// Quita el link de un producto importado que resultó ser uno del catálogo base.
// Si el importado se queda sin links, se borra y en las listas se cambia por el del catálogo.
async function quitarEnlaceImportado(enlace, productoCatalogoId) {
  const importado = await Producto.findById(enlace.producto);
  await enlace.deleteOne();
  if (!importado || importado.origen !== 'importado') return;
  if (await ProductoSupermercado.exists({ producto: importado._id })) return;
  await Lista.updateMany(
    { 'items.producto': importado._id },
    { $set: { 'items.$[i].producto': productoCatalogoId } },
    { arrayFilters: [{ 'i.producto': importado._id }] }
  );
  await HistorialPrecio.deleteMany({ producto: importado._id });
  await importado.deleteOne();
}

async function sincronizar() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Conectado a MongoDB\n');

  // 1) Supermercados: crear o actualizar
  const porSlug = {};
  for (const s of supermercados) {
    porSlug[s.slug] = await Supermercado.findOneAndUpdate(
      { slug: s.slug },
      { ...s, actualizacionAutomatica: true },
      { upsert: true, returnDocument: 'after' }
    );
  }

  // Borrar supermercados que ya no usamos (y sus precios)
  const viejos = await Supermercado.find({ slug: { $nin: supermercados.map(s => s.slug) } });
  for (const v of viejos) {
    await ProductoSupermercado.deleteMany({ supermercado: v._id });
    await HistorialPrecio.deleteMany({ supermercado: v._id });
    await v.deleteOne();
    console.log(`Eliminado supermercado que ya no se usa: ${v.nombre}`);
  }

  // 2) Productos y sus links en cada súper
  let vinculos = 0;
  for (const p of productos) {
    const producto = await Producto.findOneAndUpdate(
      { nombre: p.nombre },
      { nombre: p.nombre, categoria: p.categoria, origen: 'catalogo' },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    for (const [slug, url] of Object.entries(p.links)) {
      if (!porSlug[slug]) {
        console.log(`⚠️  "${p.nombre}": el supermercado "${slug}" no existe en data/supermercados.js`);
        continue;
      }
      // Si la importación automática ya había traído este mismo producto, se quita ese repetido
      const repetido = await ProductoSupermercado.findOne({
        supermercado: porSlug[slug]._id,
        urlExterna: url,
        producto: { $ne: producto._id }
      });
      if (repetido) await quitarEnlaceImportado(repetido, producto._id);

      const enlace = await ProductoSupermercado.findOne({ producto: producto._id, supermercado: porSlug[slug]._id });
      if (!enlace) {
        await ProductoSupermercado.create({ producto: producto._id, supermercado: porSlug[slug]._id, urlExterna: url });
      } else if (enlace.urlExterna !== url) {
        // Cambió el link: el precio viejo ya no sirve
        enlace.urlExterna = url;
        enlace.precioActual = undefined;
        enlace.fuente = 'manual';
        await enlace.save();
      }
      vinculos++;
    }
  }

  // Productos viejos que ya no están en el catálogo (ej: los de ejemplo del seed anterior).
  // Los importados automáticamente NO se tocan.
  const nombres = productos.map(p => p.nombre);
  const sobrantes = await Producto.find({ nombre: { $nin: nombres }, origen: { $ne: 'importado' } });
  for (const s of sobrantes) {
    await ProductoSupermercado.deleteMany({ producto: s._id });
    await HistorialPrecio.deleteMany({ producto: s._id });
    await s.deleteOne();
  }
  if (sobrantes.length) console.log(`Eliminados ${sobrantes.length} producto(s) que ya no están en data/productos.js`);

  // Borra la colección vieja "precios" si quedó de la primera versión
  await mongoose.connection.db.dropCollection('precios').catch(() => {});

  console.log(`✅ Catálogo listo: ${supermercados.length} supermercados, ${productos.length} productos, ${vinculos} links\n`);

  // 3) Traer precios reales
  if (process.argv.includes('--sin-precios')) {
    console.log('Precios no actualizados (--sin-precios). Ejecuta: npm run precios');
  } else {
    console.log('Importando el catálogo de las tiendas con sus precios (tarda unos minutos)...\n');
    await actualizarPrecios({ disparadoPor: 'seed' });
  }

  await mongoose.disconnect();
}

sincronizar().catch(async error => {
  console.error('Error:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
