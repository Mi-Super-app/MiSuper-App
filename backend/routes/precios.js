const express = require('express');
const router = express.Router();
const Producto = require('../models/Producto');
const Precio = require('../models/Precio');

router.get('/:categoria', async (req, res) => {
  try {
    const productos = await Producto.find({ categoria: req.params.categoria });
    const ids = productos.map(p => p._id);
    const precios = await Precio.find({ producto: { $in: ids } }).populate('supermercado');

    const resultado = productos.map(p => {
      const deEste = precios.filter(x => x.producto.equals(p._id));

      const porSuper = {};
      deEste.forEach(x => {
        porSuper[x.supermercado.nombre] = x.valor;
      });

      const minimo = Math.min(...deEste.map(x => x.valor));
      const mejor = deEste.find(x => x.valor === minimo).supermercado.nombre;

      return { id: p._id, nombre: p.nombre, precios: porSuper, mejor };
    });

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;