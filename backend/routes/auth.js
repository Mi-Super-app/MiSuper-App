// CUENTAS: crear cuenta, entrar y ver mis datos
//   POST /api/auth/registro  { nombre, email, password }
//   POST /api/auth/login     { email, password }
//   GET  /api/auth/yo        → datos del usuario con sesión
//
// Al crear cuenta o entrar, las listas que la persona tenía SIN cuenta en ese
// dispositivo (encabezado x-dispositivo) pasan a ser de su cuenta.

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Usuario = require('../models/Usuario');
const Lista = require('../models/Lista');
const { crearToken, requiereUsuario, limiteIntentos } = require('../middleware/auth');

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Pasa las listas sin cuenta de este dispositivo a la cuenta
async function adoptarListas(usuarioId, dispositivo) {
  if (!dispositivo) return 0;
  const r = await Lista.updateMany(
    { dispositivo, usuario: { $exists: false } },
    { $set: { usuario: usuarioId }, $unset: { dispositivo: 1 } }
  );
  return r.modifiedCount || 0;
}

router.post('/registro', limiteIntentos, async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!nombre) return res.status(400).json({ error: 'Escribí tu nombre' });
  if (!EMAIL_VALIDO.test(email)) return res.status(400).json({ error: 'Ese correo no parece válido' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  if (await Usuario.exists({ email })) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo. Probá "Entrar".' });
  }

  const usuario = await Usuario.create({ nombre, email, passwordHash: await bcrypt.hash(password, 10) });
  const adoptadas = await adoptarListas(usuario._id, req.dispositivo);
  res.status(201).json({ token: crearToken(usuario), usuario, listasAgregadas: adoptadas });
});

router.post('/login', limiteIntentos, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const usuario = await Usuario.findOne({ email });

  // Mismo mensaje si no existe el correo o si la contraseña está mal (no damos pistas)
  if (!usuario || !(await bcrypt.compare(password, usuario.passwordHash))) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  const adoptadas = await adoptarListas(usuario._id, req.dispositivo);
  res.json({ token: crearToken(usuario), usuario, listasAgregadas: adoptadas });
});

router.get('/yo', requiereUsuario, async (req, res) => {
  const usuario = await Usuario.findById(req.usuarioId);
  if (!usuario) return res.status(401).json({ error: 'La cuenta ya no existe' });
  res.json(usuario);
});

module.exports = router;
