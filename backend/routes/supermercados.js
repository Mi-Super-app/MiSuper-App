const express = require('express');
const router = express.Router();
const Supermercado = require('../models/Supermercado');

router.get('/', async (req, res) => {
  try {
    const supermercados = await Supermercado.find();
    res.json(supermercados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;