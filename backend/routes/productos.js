const express = require('express');
const router = express.Router();
const Producto = require('../models/Producto');
const HistorialPrecio = require('../models/HistorialPrecio');
const { productosConPrecios } = require('../helpers/precios');

// Escapa caracteres especiales para usar el texto del usuario en una búsqueda
function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/productos            → todos
// GET /api/productos?q=leche    → busca por nombre
// GET /api/productos?categoria=lacteos
router.get('/', async (req, res) => {
  const filtro = {};
  if (req.query.q) filtro.nombre = { $regex: escaparRegex(req.query.q), $options: 'i' };
  if (req.query.categoria) filtro.categoria = req.query.categoria;

  const productos = await Producto.find(filtro).sort('nombre');
  res.json(await productosConPrecios(productos));
});

// GET /api/productos/categorias → lista de categorías válidas (útil para el frontend)
router.get('/categorias', (req, res) => {
  res.json(Producto.CATEGORIAS);
});

// GET /api/productos/:id → un producto con sus precios
router.get('/:id', async (req, res) => {
  const producto = await Producto.findById(req.params.id);
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
  const [resultado] = await productosConPrecios([producto]);
  res.json(resultado);
});

// GET /api/productos/:id/historial → cómo ha cambiado su precio en cada súper
router.get('/:id/historial', async (req, res) => {
  const historial = await HistorialPrecio.find({ producto: req.params.id })
    .populate('supermercado', 'nombre')
    .sort('fecha');
  res.json(
    historial.map(h => ({ supermercado: h.supermercado ? h.supermercado.nombre : null, valor: h.valor, fecha: h.fecha }))
  );
});

module.exports = router;
