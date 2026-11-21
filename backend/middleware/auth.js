// INICIO DE SESIÓN CON "TOKEN" (JWT)
// ---------------------------------
// Cuando alguien entra con su correo y contraseña, el servidor le da un "token":
// un texto firmado que el navegador guarda y manda en cada petición
// (encabezado  Authorization: Bearer <token>). Así el servidor sabe quién es.
//
// JWT_SECRET es la clave con la que se firman los tokens. Va en el .env y en Render.
// Si alguien la conociera, podría hacerse pasar por cualquier usuario: nunca la subas a GitHub.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  SECRETO = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[auth] ⚠️  Falta JWT_SECRET en el .env. Uso una clave temporal: las sesiones se cierran cada vez que reinicias el servidor.'
  );
}

const DURACION = '30d'; // la sesión dura 30 días

function crearToken(usuario) {
  return jwt.sign({ sub: String(usuario._id) }, SECRETO, { expiresIn: DURACION });
}

// Lee el token si viene. No obliga a tener sesión (la app funciona sin cuenta).
// Si el token es válido, deja el id del usuario en req.usuarioId
function leerUsuario(req, res, next) {
  const encabezado = req.get('authorization') || '';
  const [tipo, token] = encabezado.split(' ');
  if (tipo === 'Bearer' && token) {
    try {
      req.usuarioId = jwt.verify(token, SECRETO).sub;
    } catch {
      // Token vencido o falso: respondemos 401 para que la app cierre la sesión
      return res.status(401).json({ error: 'Tu sesión venció. Volvé a entrar.' });
    }
  }
  next();
}

// Clave del dispositivo: cada celular/compu genera una al azar y la manda en
// el encabezado "x-dispositivo". Sirve para las listas de quien NO tiene cuenta.
function leerDispositivo(req, res, next) {
  const clave = req.get('x-dispositivo');
  if (clave && /^[A-Za-z0-9-]{20,100}$/.test(clave)) req.dispositivo = clave;
  next();
}

// Para rutas que SÍ necesitan sesión
function requiereUsuario(req, res, next) {
  if (!req.usuarioId) return res.status(401).json({ error: 'Necesitás iniciar sesión' });
  next();
}

// Límite de intentos (evita que prueben miles de contraseñas)
// Máximo 20 intentos cada 15 minutos por dirección IP.
const intentos = new Map();
function limiteIntentos(req, res, next) {
  const ahora = Date.now();
  const ventana = 15 * 60 * 1000;
  const clave = req.ip;
  const registro = (intentos.get(clave) || []).filter(t => ahora - t < ventana);
  if (registro.length >= 20) {
    return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' });
  }
  registro.push(ahora);
  intentos.set(clave, registro);
  next();
}

module.exports = { crearToken, leerUsuario, leerDispositivo, requiereUsuario, limiteIntentos };
