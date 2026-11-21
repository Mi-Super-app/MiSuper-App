// PROGRAMADOR (node-cron)
// -----------------------
// node-cron ejecuta una función a la hora que le digas, mientras el servidor
// esté encendido. El horario se escribe en "formato cron":
//
//   ┌──────── minuto (0-59)
//   │ ┌────── hora (0-23)
//   │ │ ┌──── día del mes (1-31)
//   │ │ │ ┌── mes (1-12)
//   │ │ │ │ ┌ día de la semana (0-7, 0 y 7 = domingo)
//   │ │ │ │ │
//   0 6 * * *   → todos los días a las 6:00 a.m.
//
// Otros ejemplos:  '30 5 * * *' = 5:30 a.m. diario
//                  '*/2 * * * *' = cada 2 minutos (solo para probar)

const cron = require('node-cron');
const { actualizarPrecios } = require('./actualizarPrecios');
const ActualizacionLog = require('../models/ActualizacionLog');

const ZONA_HORARIA = 'America/Managua';

async function correrSinRomper(disparadoPor) {
  try {
    await actualizarPrecios({ disparadoPor });
  } catch (error) {
    // Un error aquí no debe tumbar el servidor
    console.error('[precios] Error en la actualización:', error.message);
  }
}

// Si la computadora/servidor estuvo apagado a la hora programada,
// al encender revisamos: si pasaron más de 24 h, actualizamos de una vez.
async function revisarSiFaltaActualizar() {
  const ultima = await ActualizacionLog.findOne({ fin: { $exists: true } }).sort({ fin: -1 });
  const horas = ultima ? (Date.now() - ultima.fin.getTime()) / 36e5 : Infinity;
  if (horas > 24) {
    console.log('[precios] La última actualización tiene más de 24 h. Actualizando ahora...');
    correrSinRomper('inicio'); // sin await: el servidor sigue arrancando mientras tanto
  }
}

function iniciarProgramador() {
  if (process.env.ACTUALIZACION_AUTOMATICA === 'false') {
    console.log('[precios] Actualización automática desactivada (ACTUALIZACION_AUTOMATICA=false)');
    return;
  }

  const horario = process.env.CRON_PRECIOS || '0 6 * * *';
  if (!cron.validate(horario)) {
    console.error(`[precios] El horario CRON_PRECIOS="${horario}" no es válido`);
    return;
  }

  cron.schedule(horario, () => correrSinRomper('cron'), { timezone: ZONA_HORARIA });
  console.log(`[precios] Programado con node-cron: "${horario}" (${ZONA_HORARIA})`);

  revisarSiFaltaActualizar().catch(error =>
    console.error('[precios] No se pudo revisar la última actualización:', error.message)
  );
}

module.exports = { iniciarProgramador };
