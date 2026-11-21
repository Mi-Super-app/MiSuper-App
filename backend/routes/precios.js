const express = require('express');
const router = express.Router();
const Producto = require('../models/Producto');
const { productosConPrecios } = require('../helpers/precios');

// GET /api/precios/:categoria → productos de esa categoría con sus precios por súper
// (Express 5 manda solo los errores de funciones async al middleware de errores)
router.get('/:categoria', async (req, res) => {
  const productos = await Producto.find({ categoria: req.params.categoria }).sort('nombre');
  res.json(await productosConPrecios(productos));
});

module.exports = router;
