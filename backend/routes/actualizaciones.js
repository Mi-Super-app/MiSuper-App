const express = require('express');
const router = express.Router();
const ActualizacionLog = require('../models/ActualizacionLog');
const ProductoSupermercado = require('../models/ProductoSupermercado');
const { actualizarPrecios } = require('../jobs/actualizarPrecios');

// Protección simple: si en .env pones ADMIN_CLAVE=algo, estas rutas
// piden el encabezado  x-admin-clave: algo
function soloAdmin(req, res, next) {
  const clave = process.env.ADMIN_CLAVE;
  if (clave && req.get('x-admin-clave') !== clave) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

router.use(soloAdmin);

// GET /api/actualizaciones → las últimas 10 actualizaciones (¿funcionó hoy?)
router.get('/', async (req, res) => {
  const logs = await ActualizacionLog.find().sort('-inicio').limit(10);
  res.json(logs);
});

// GET /api/actualizaciones/revisar → precios con error o cambio sospechoso
router.get('/revisar', async (req, res) => {
  const pendientes = await ProductoSupermercado.find({
    $or: [{ requiereRevision: true }, { ultimoError: { $ne: null } }]
  })
    .populate('producto', 'nombre')
    .populate('supermercado', 'nombre');
  res.json(pendientes);
});

// POST /api/actualizaciones/ejecutar → corre la actualización ahora mismo
router.post('/ejecutar', (req, res) => {
  actualizarPrecios({ disparadoPor: 'manual' }).catch(error =>
    console.error('[precios] Error en actualización manual:', error.message)
  );
  res.status(202).json({ mensaje: 'Actualización iniciada. Consulta GET /api/actualizaciones en unos minutos.' });
});

module.exports = router;
