const express = require('express');
const router = express.Router();
const Supermercado = require('../models/Supermercado');
const ProductoSupermercado = require('../models/ProductoSupermercado');
const Producto = require('../models/Producto');

// GET /api/supermercados → todos los supermercados
router.get('/', async (req, res) => {
  const supermercados = await Supermercado.find().sort('nombre');
  res.json(supermercados);
});

// GET /api/supermercados/:slug/productos → la "sección propia" de un súper:
// sus productos con el precio de ESE súper y cuándo se actualizó.
// Ej: /api/supermercados/walmart/productos
//     /api/supermercados/walmart/productos?categoria=lacteos   → solo una sección
//     &pagina=2&limite=200   (son miles de productos: van por páginas, máx. 500)
router.get('/:slug/productos', async (req, res) => {
  const superm = await Supermercado.findOne({ slug: req.params.slug });
  if (!superm) return res.status(404).json({ error: 'Supermercado no encontrado' });

  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 200, 1), 500);
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);

  const filtroProducto = req.query.categoria ? { categoria: String(req.query.categoria) } : {};
  const enEsteSuper = await ProductoSupermercado.distinct('producto', { supermercado: superm._id });
  const filtro = { ...filtroProducto, _id: { $in: enEsteSuper } };
  const [elegidos, total] = await Promise.all([
    Producto.find(filtro).sort({ nombre: 1 }).skip((pagina - 1) * limite).limit(limite).select('_id').lean(),
    Producto.countDocuments(filtro)
  ]);

  const enlaces = await ProductoSupermercado.find({
    supermercado: superm._id,
    producto: { $in: elegidos.map(p => p._id) }
  }).populate('producto');

  const productos = enlaces
    .filter(e => e.producto)
    .map(e => ({
      id: e.producto._id,
      nombre: e.producto.nombre,
      categoria: e.producto.categoria,
      nombreEnTienda: e.nombreEnTienda,
      precio: e.precioActual ?? null,
      precioNormal: e.precioNormal ?? null, // si es mayor que "precio", hay rebaja
      precioAnterior: e.precioAnterior ?? null,
      link: e.urlExterna,
      disponible: e.disponible,
      fuente: e.fuente,
      ultimaActualizacion: e.ultimaActualizacion,
      requiereRevision: e.requiereRevision,
      ultimoError: e.ultimoError
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  res.json({ supermercado: superm, total, pagina, paginas: Math.ceil(total / limite), productos });
});

module.exports = router;
