// Funciones de ayuda para los lectores de precios

const { AGENTE, revisarRobots } = require('./robots');

// Pausa de X milisegundos. Uso: await esperar(2000)
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// LA ÚNICA PUERTA PARA CONSULTAR A UNA TIENDA.
// Todas las consultas pasan por aquí, así que todas:
//   1. revisan el robots.txt de la tienda (si la ruta está prohibida, no se consulta)
//   2. se identifican con el User-Agent honesto de la app
//   3. se cancelan si tardan demasiado
async function pedir(url, { tipo = 'application/json', tiempoMs = 20000 } = {}) {
  await revisarRobots(url);
  const respuesta = await fetch(url, {
    headers: { 'User-Agent': AGENTE, Accept: tipo },
    signal: AbortSignal.timeout(tiempoMs)
  });
  // Las búsquedas de VTEX a veces responden 206 (respuesta parcial): también vale
  if (!respuesta.ok) {
    const error = new Error(`La tienda respondió con error ${respuesta.status}`);
    error.status = respuesta.status;
    throw error;
  }
  return respuesta;
}

// Descarga datos en formato JSON
async function descargarJson(url) {
  return (await pedir(url)).json();
}

module.exports = { esperar, pedir, descargarJson, AGENTE };
