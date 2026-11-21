const express = require('express');
const router = express.Router();
const Supermercado = require('../models/Supermercado');
const ProductoSupermercado = require('../models/ProductoSupermercado');

// GET /api/supermercados → todos los supermercados
router.get('/', async (req, res) => {
  const supermercados = await Supermercado.find().sort('nombre');
  res.json(supermercados);
});

// GET /api/supermercados/:slug/productos → la "sección propia" de un súper:
// todos sus productos con el precio de ESE súper y cuándo se actualizó.
// Ej: /api/supermercados/walmart/productos
router.get('/:slug/productos', async (req, res) => {
  const superm = await Supermercado.findOne({ slug: req.params.slug });
  if (!superm) return res.status(404).json({ error: 'Supermercado no encontrado' });

  const enlaces = await ProductoSupermercado.find({ supermercado: superm._id }).populate('producto');

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

  res.json({ supermercado: superm, productos });
});

module.exports = router;
