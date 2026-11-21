// CUENTAS: crear cuenta, entrar y ver mis datos
//   POST /api/auth/registro  { nombre, email, password }
//   POST /api/auth/login     { email, password }
//   GET  /api/auth/yo        → datos del usuario con sesión
//   PUT  /api/auth/yo        { nombre }            → cambiar el nombre
//   PUT  /api/auth/password  { actual, nueva }     → cambiar la contraseña
//   DELETE /api/auth/yo      { actual }            → eliminar la cuenta con sus listas y gastos
//
//   POST /api/auth/olvide      { email }            → manda un correo con un link para cambiar la contraseña
//   POST /api/auth/restablecer { token, password }  → pone la contraseña nueva y deja la sesión abierta
//
// Al crear cuenta o entrar, las listas (y compras del historial) que la persona tenía
// SIN cuenta en ese dispositivo (encabezado x-dispositivo) pasan a ser de su cuenta.

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const Usuario = require('../models/Usuario');
const Lista = require('../models/Lista');
const Compra = require('../models/Compra');
const { crearToken, requiereUsuario, limiteIntentos } = require('../middleware/auth');
const { enviarCorreo } = require('../helpers/correo');
const { VERSION_TERMINOS } = require('../helpers/legal');

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VIGENCIA_LINK = 60 * 60 * 1000; // el link del correo sirve 1 hora
const ESPERA_ENTRE_CORREOS = 60 * 1000; // máximo 1 correo por minuto a la misma cuenta

const hashCodigo = codigo => crypto.createHash('sha256').update(codigo).digest('hex');

// Pasa las listas y compras sin cuenta de este dispositivo a la cuenta
async function adoptarListas(usuarioId, dispositivo) {
  if (!dispositivo) return 0;
  const filtro = { dispositivo, usuario: { $exists: false } };
  const cambio = { $set: { usuario: usuarioId }, $unset: { dispositivo: 1 } };
  const r = await Lista.updateMany(filtro, cambio);
  await Compra.updateMany(filtro, cambio);
  return r.modifiedCount || 0;
}

// Dirección de la app para el link del correo.
// En internet SIEMPRE hay que poner APP_URL (ej: https://misuper.onrender.com):
// no usamos la dirección que manda el navegador porque alguien podría falsificarla
// y hacer que el link del correo apunte a otra página.
function direccionApp(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const host = req.get('host') || '';
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `${req.protocol}://${host}`;
  return null;
}

function mensajeCorreo(usuario, link) {
  const nombre = usuario.nombre.split(' ')[0];
  const texto =
    `Hola, ${nombre}:\n\n` +
    `Pediste cambiar tu contraseña de Mi Súper. Abrí este link para poner una nueva (sirve durante 1 hora):\n\n` +
    `${link}\n\n` +
    `Si no fuiste vos, ignorá este correo: tu contraseña sigue igual.\n\n— Mi Súper`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0a1a2c">
      <h2 style="color:#0d7a45">Mi Súper</h2>
      <p>Hola, ${nombre.replace(/[<>&"]/g, '')}:</p>
      <p>Pediste cambiar tu contraseña. Tocá el botón para poner una nueva. El link sirve durante <b>1 hora</b>.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${link}" style="background:#0d7a45;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Cambiar mi contraseña</a>
      </p>
      <p style="font-size:13px;color:#555">Si el botón no funciona, copiá este link en tu navegador:<br>${link}</p>
      <p style="font-size:13px;color:#555">Si no fuiste vos, ignorá este correo: tu contraseña sigue igual.</p>
    </div>`;
  return { para: usuario.email, asunto: 'Cambiá tu contraseña de Mi Súper', texto, html };
}

router.post('/registro', limiteIntentos, async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!nombre) return res.status(400).json({ error: 'Escribí tu nombre' });
  if (!EMAIL_VALIDO.test(email)) return res.status(400).json({ error: 'Ese correo no parece válido' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  // La casilla "Acepto los Términos de uso y la Política de privacidad" es obligatoria
  if (![true, 'true', 'on'].includes(req.body.aceptaTerminos)) {
    return res.status(400).json({ error: 'Para crear una cuenta tenés que aceptar los Términos de uso y la Política de privacidad' });
  }
  if (await Usuario.exists({ email })) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo. Probá "Entrar".' });
  }

  const usuario = await Usuario.create({
    nombre,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    terminosAceptados: { fecha: new Date(), version: VERSION_TERMINOS }
  });
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

// OLVIDÉ MI CONTRASEÑA
// Siempre respondemos lo mismo, exista o no la cuenta (así nadie puede averiguar
// qué correos están registrados). El correo se manda "por detrás" sin esperar.
router.post('/olvide', limiteIntentos, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_VALIDO.test(email)) return res.status(400).json({ error: 'Ese correo no parece válido' });

  const respuesta = { mensaje: 'Si hay una cuenta con ese correo, te mandamos un link para cambiar la contraseña. Revisá también la carpeta de spam.' };
  const base = direccionApp(req);
  if (!base) {
    console.error('[auth] Falta APP_URL en las variables de entorno: no puedo armar el link del correo.');
    return res.status(503).json({ error: 'La recuperación de contraseña no está configurada todavía' });
  }

  const usuario = await Usuario.findOne({ email });
  const reciente = usuario && usuario.resetPedidoEn && Date.now() - usuario.resetPedidoEn < ESPERA_ENTRE_CORREOS;
  if (!usuario || reciente) return res.json(respuesta);

  const codigo = crypto.randomBytes(32).toString('hex');
  usuario.resetHash = hashCodigo(codigo);
  usuario.resetExpira = new Date(Date.now() + VIGENCIA_LINK);
  usuario.resetPedidoEn = new Date();
  await usuario.save();

  const link = `${base}/app.html#restablecer=${codigo}`;
  enviarCorreo(mensajeCorreo(usuario, link)).catch(error =>
    console.error('[correo] No se pudo enviar el correo de recuperación:', error.message)
  );
  res.json(respuesta);
});

router.post('/restablecer', limiteIntentos, async (req, res) => {
  const codigo = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (!/^[a-f0-9]{64}$/.test(codigo)) return res.status(400).json({ error: 'El link no es válido. Pedí uno nuevo.' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const usuario = await Usuario.findOne({ resetHash: hashCodigo(codigo), resetExpira: { $gt: new Date() } });
  if (!usuario) return res.status(400).json({ error: 'El link venció o ya se usó. Pedí uno nuevo.' });

  usuario.passwordHash = await bcrypt.hash(password, 10);
  usuario.resetHash = undefined; // el link sirve una sola vez
  usuario.resetExpira = undefined;
  await usuario.save();

  const adoptadas = await adoptarListas(usuario._id, req.dispositivo);
  res.json({ token: crearToken(usuario), usuario, listasAgregadas: adoptadas });
});

router.get('/yo', requiereUsuario, async (req, res) => {
  const usuario = await Usuario.findById(req.usuarioId);
  if (!usuario) return res.status(401).json({ error: 'La cuenta ya no existe' });
  res.json(usuario);
});

// PUT /api/auth/yo { nombre } → cambiar mi nombre
router.put('/yo', requiereUsuario, async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribí tu nombre' });
  if (nombre.length > 60) return res.status(400).json({ error: 'El nombre es muy largo' });
  const usuario = await Usuario.findByIdAndUpdate(req.usuarioId, { nombre }, { returnDocument: 'after' });
  if (!usuario) return res.status(401).json({ error: 'La cuenta ya no existe' });
  res.json(usuario);
});

// Revisa que la contraseña actual sea la correcta (para cambios delicados)
async function usuarioConClave(req, res) {
  const usuario = await Usuario.findById(req.usuarioId);
  if (!usuario) {
    res.status(401).json({ error: 'La cuenta ya no existe' });
    return null;
  }
  if (!(await bcrypt.compare(String(req.body.actual || ''), usuario.passwordHash))) {
    res.status(400).json({ error: 'La contraseña actual no es correcta' });
    return null;
  }
  return usuario;
}

// PUT /api/auth/password { actual, nueva } → cambiar contraseña
router.put('/password', requiereUsuario, limiteIntentos, async (req, res) => {
  const nueva = String(req.body.nueva || '');
  if (nueva.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  const usuario = await usuarioConClave(req, res);
  if (!usuario) return;
  usuario.passwordHash = await bcrypt.hash(nueva, 10);
  usuario.resetHash = undefined;
  usuario.resetExpira = undefined;
  await usuario.save();
  res.json({ mensaje: 'Contraseña cambiada' });
});

// DELETE /api/auth/yo { actual } → eliminar mi cuenta, mis listas y mi historial de gastos
router.delete('/yo', requiereUsuario, limiteIntentos, async (req, res) => {
  const usuario = await usuarioConClave(req, res);
  if (!usuario) return;
  await Lista.deleteMany({ usuario: usuario._id });
  await Compra.deleteMany({ usuario: usuario._id });
  await usuario.deleteOne();
  res.json({ mensaje: 'Cuenta eliminada' });
});

module.exports = router;
