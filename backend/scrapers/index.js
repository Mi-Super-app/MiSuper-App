// LECTOR DE PRECIOS
// -----------------
// Punto único para pedir precios a cualquier supermercado.
// El resto del código solo usa estas dos funciones:
//
//   obtenerDatos('walmart', link)   → { nombre, precio, precioNormal, disponible }
//   buscar('walmart', 'leche')      → lista de productos con nombre, precio y link
//                                     (solo La Unión y Walmart; ver scrapers/lacolonia.js)

const configuraciones = require('./config');
const { obtenerDatosVtex, buscarVtex } = require('./vtex');
const { obtenerDatosLaColonia } = require('./lacolonia');

function obtenerConfig(slug) {
  const config = configuraciones[slug];
  if (!config) {
    throw new Error(`No hay lector de precios para "${slug}". Opciones: ${Object.keys(configuraciones).join(', ')}`);
  }
  return config;
}

async function obtenerDatos(slug, url) {
  const config = obtenerConfig(slug);
  if (config.tipo === 'lacolonia') return obtenerDatosLaColonia(url);
  return obtenerDatosVtex(url);
}

async function buscar(slug, texto, cantidad = 10) {
  const config = obtenerConfig(slug);
  if (config.tipo === 'lacolonia') {
    throw new Error(
      'La Colonia pide que los programas no usen su buscador. Busca el producto tú mismo en ' +
        'https://lacolonia.com.ni con tu navegador y copia el número del final de su link (…/producto/NUMERO).'
    );
  }
  return buscarVtex(config.sitio, texto, cantidad);
}

module.exports = { obtenerDatos, buscar, obtenerConfig };
