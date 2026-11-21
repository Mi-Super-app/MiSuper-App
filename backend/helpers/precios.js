const ProductoSupermercado = require('../models/ProductoSupermercado');

// Recibe una lista de productos y les agrega sus precios en cada súper.
// Devuelve algo como:
// {
//   id, nombre, categoria,
//   precios:     { 'La Colonia': 52.2, 'La Unión': 50, 'Walmart': 50 },
//   antes:       { 'La Colonia': 60 }            ← solo si hay rebaja
//   actualizado: { 'La Colonia': '2026-11-21T12:00:00Z', ... },
//   mejor: 'La Unión'
// }
async function productosConPrecios(productos) {
  const ids = productos.map(p => p._id);
  const enlaces = await ProductoSupermercado.find({
    producto: { $in: ids },
    precioActual: { $gt: 0 },
    disponible: true
  })
    .select('producto supermercado precioActual precioNormal ultimaActualizacion')
    .populate('supermercado', 'nombre')
    .lean();

  // Agrupa los precios por producto (rápido aunque haya miles de productos)
  const porProducto = new Map();
  for (const e of enlaces) {
    if (!e.supermercado) continue;
    const clave = String(e.producto);
    if (!porProducto.has(clave)) porProducto.set(clave, []);
    porProducto.get(clave).push(e);
  }

  return productos.map(p => {
    const deEste = porProducto.get(String(p._id)) || [];

    const precios = {};
    const antes = {};
    const actualizado = {};
    deEste.forEach(e => {
      const nombre = e.supermercado.nombre;
      precios[nombre] = e.precioActual;
      if (e.precioNormal && e.precioNormal > e.precioActual) antes[nombre] = e.precioNormal;
      actualizado[nombre] = e.ultimaActualizacion || null;
    });

    // Si el producto no tiene precios todavía, "mejor" es null
    let mejor = null;
    if (deEste.length > 0) {
      mejor = deEste.reduce((a, b) => (b.precioActual < a.precioActual ? b : a)).supermercado.nombre;
    }

    return { id: p._id, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, origen: p.origen || 'catalogo', precios, antes, actualizado, mejor };
  });
}

module.exports = { productosConPrecios };
