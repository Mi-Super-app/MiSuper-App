const express = require('express');
const router = express.Router();
const Producto = require('../models/Producto');
const { productosConPrecios } = require('../helpers/precios');

// GET /api/precios/:categoria → productos de esa categoría con sus precios por súper
// Por páginas de 200 (hay secciones con miles de productos): ?pagina=2
// (Express 5 manda solo los errores de funciones async al middleware de errores)
router.get('/:categoria', async (req, res) => {
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
  const productos = await Producto.find({ categoria: req.params.categoria })
    .sort({ origen: 1, nombre: 1 })
    .skip((pagina - 1) * 200)
    .limit(200)
    .lean();
  res.json(await productosConPrecios(productos));
});

module.exports = router;
