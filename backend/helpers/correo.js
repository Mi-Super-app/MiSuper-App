// ENVIAR CORREOS (por ahora solo el de "Olvidé mi contraseña")
// ------------------------------------------------------------
// Hay 2 formas de mandar correos. Configurá UNA en el .env (y en Render):
//
//   1) BREVO (recomendado si la app está en Render gratis)
//      Render gratis bloquea los puertos de correo (SMTP), pero Brevo se usa por
//      internet normal (HTTPS), así que funciona igual. Es gratis hasta 300 correos/día.
//        BREVO_API_KEY=xkeysib-...
//        CORREO_REMITENTE=misupernicaragua@gmail.com   ← verificado en Brevo
//
//   2) SMTP (por ejemplo Gmail con una "contraseña de aplicación")
//        SMTP_HOST=smtp.gmail.com
//        SMTP_PORT=465
//        SMTP_USER=misupernicaragua@gmail.com
//        SMTP_PASS=la contraseña de aplicación de 16 letras
//        CORREO_REMITENTE=misupernicaragua@gmail.com
//
// Si no hay ninguna configurada (mientras probás en tu compu), el correo NO se
// manda: se muestra en la consola del servidor para que copies el link.

const nodemailer = require('nodemailer');

const NOMBRE_REMITENTE = 'Mi Súper';

function remitente() {
  return process.env.CORREO_REMITENTE || process.env.SMTP_USER || '';
}

async function enviarConBrevo({ para, asunto, texto, html }) {
  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: NOMBRE_REMITENTE, email: remitente() },
      to: [{ email: para }],
      subject: asunto,
      textContent: texto,
      htmlContent: html
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!respuesta.ok) {
    throw new Error(`Brevo respondió ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
  }
}

let transporte = null;
async function enviarConSmtp({ para, asunto, texto, html }) {
  if (!transporte) {
    const puerto = Number(process.env.SMTP_PORT || 465);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: puerto,
      secure: puerto === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 15000
    });
  }
  await transporte.sendMail({ from: `"${NOMBRE_REMITENTE}" <${remitente()}>`, to: para, subject: asunto, text: texto, html });
}

function correoConfigurado() {
  return Boolean(process.env.BREVO_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

async function enviarCorreo(mensaje) {
  if (process.env.BREVO_API_KEY) return enviarConBrevo(mensaje);
  if (correoConfigurado()) return enviarConSmtp(mensaje);
  console.log('\n[correo] ✉️  No hay servicio de correo configurado. Este correo NO se envió:');
  console.log(`  Para:   ${mensaje.para}\n  Asunto: ${mensaje.asunto}\n${mensaje.texto}\n`);
}

module.exports = { enviarCorreo, correoConfigurado };
