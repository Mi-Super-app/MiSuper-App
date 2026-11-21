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
  }).populate('supermercado');

  return productos.map(p => {
    const deEste = enlaces.filter(e => e.producto.equals(p._id) && e.supermercado);

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

    return { id: p._id, nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, precios, antes, actualizado, mejor };
  });
}

module.exports = { productosConPrecios };
