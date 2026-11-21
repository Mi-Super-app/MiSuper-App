// REPORTES DE LA APP
//   POST /api/reportes { mensaje, producto?, contacto? } → alguien avisa de un precio incorrecto
//   contacto: solo un correo (opcional). No se piden números de teléfono.
// Los reportes se leen en GET /api/actualizaciones/reportes (solo administrador).

const express = require('express');
const router = express.Router();
const Reporte = require('../models/Reporte');
const { limiteIntentos } = require('../middleware/auth');

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', limiteIntentos, async (req, res) => {
  const mensaje = String(req.body.mensaje || '').trim();
  if (mensaje.length < 3) return res.status(400).json({ error: 'Contanos qué está mal' });
  const contacto = String(req.body.contacto || '').trim().toLowerCase().slice(0, 120);
  if (contacto && !CORREO_VALIDO.test(contacto)) return res.status(400).json({ error: 'Ese correo no parece válido' });
  await Reporte.create({
    mensaje: mensaje.slice(0, 1000),
    producto: String(req.body.producto || '').trim().slice(0, 200) || undefined,
    contacto: contacto || undefined,
    usuario: req.usuarioId || undefined
  });
  res.status(201).json({ mensaje: '¡Gracias! Lo vamos a revisar.' });
});

module.exports = router;
