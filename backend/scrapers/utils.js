// Funciones de ayuda para los lectores de precios

// Pausa de X milisegundos. Uso: await esperar(2000)
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Descarga datos en formato JSON. Usa el fetch que ya trae Node.
async function descargarJson(url) {
  const respuesta = await fetch(url, {
    headers: {
      // Nos identificamos con honestidad: qué programa somos y para qué consultamos
      'User-Agent': 'MiSuperApp/1.0 (comparador de precios; consulta 1 vez al dia)',
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(20000) // si tarda más de 20 segundos, se cancela
  });

  // Las búsquedas de VTEX a veces responden 206 (respuesta parcial): también vale
  if (!respuesta.ok) {
    throw new Error(`La tienda respondió con error ${respuesta.status}`);
  }
  return respuesta.json();
}

module.exports = { esperar, descargarJson };
