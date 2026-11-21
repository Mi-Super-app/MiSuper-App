// LECTOR PARA LA COLONIA (lacolonia.com.ni)
// -----------------------------------------
// IMPORTANTE: el archivo robots.txt de La Colonia pide a los programas automáticos
// que NO usen sus rutas /api/ ni su buscador (/buscar). Por respeto a esa regla,
// aquí NO usamos su servicio interno.
//
// En su lugar leemos la página pública de cada producto, que sí está permitida:
//   https://lacolonia.com.ni/producto/4100108
//
// Esa página incluye "datos estructurados" (JSON-LD, formato schema.org) que las
// tiendas publican a propósito para que buscadores como Google muestren el precio:
//   { "@type": "Product", "offers": { "price": "52.20", "availability": ".../InStock" } }
//
// Por eso tampoco hay búsqueda automática en La Colonia: para agregar un producto,
// búscalo tú en lacolonia.com.ni con tu navegador y copia el número de su link.

const SITIO = 'https://lacolonia.com.ni';

const { pedir } = require('./utils');

async function descargarPagina(url) {
  try {
    return await (await pedir(url, { tipo: 'text/html' })).text();
  } catch (error) {
    if (error.status === 404) throw new Error('El producto ya no existe en La Colonia');
    throw error;
  }
}

// Busca el bloque JSON-LD de tipo "Product" dentro del HTML
function extraerProducto(html) {
  const bloques = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  for (const bloque of bloques) {
    try {
      const datos = JSON.parse(bloque[1]);
      const lista = Array.isArray(datos) ? datos : [datos];
      const producto = lista.find(d => d && d['@type'] === 'Product');
      if (producto) return producto;
    } catch {
      // bloque mal formado: lo ignoramos
    }
  }
  return null;
}

function resumirProducto(producto, url) {
  const oferta = Array.isArray(producto.offers) ? producto.offers[0] : producto.offers;
  const precio = oferta && Number(oferta.price) > 0 ? Number(oferta.price) : null;
  return {
    nombre: producto.name,
    link: url,
    precio,
    precioNormal: null, // la página pública solo trae el precio actual
    disponible: Boolean(oferta && String(oferta.availability || '').includes('InStock'))
  };
}

async function obtenerDatosLaColonia(url) {
  if (!new URL(url).pathname.startsWith('/producto/')) {
    throw new Error('El link de La Colonia debe ser de un producto: https://lacolonia.com.ni/producto/CODIGO');
  }
  const producto = extraerProducto(await descargarPagina(url));
  if (!producto) throw new Error('La página de La Colonia no trae los datos del producto (quizá cambió de formato)');
  return resumirProducto(producto, url);
}

module.exports = { obtenerDatosLaColonia, extraerProducto, resumirProducto, SITIO };
