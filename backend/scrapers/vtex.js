// LECTOR PARA TIENDAS VTEX (La Unión)
// -----------------------------------
// Las tiendas VTEX tienen un servicio público con los datos de cada producto.
// En vez de leer la página, le pedimos el JSON directamente:
//
//   Página del producto:  https://www.launion.com.ni/desinf-fabuloso-mar-fresco-900ml/p
//   Datos (JSON):         https://www.launion.com.ni/api/catalog_system/pub/products/search/desinf-fabuloso-mar-fresco-900ml/p
//
// En el JSON:  Price = precio que paga el cliente (ya con rebaja)
//              ListPrice = precio normal (antes de la rebaja)
//              IsAvailable = si hay existencias

const { descargarJson } = require('./utils');

// Saca la parte "desinf-fabuloso-mar-fresco-900ml" de la URL del producto
function slugDeUrl(url) {
  const { pathname } = new URL(url);
  const partes = pathname.split('/').filter(Boolean);
  if (partes.length < 2 || partes[partes.length - 1] !== 'p') {
    throw new Error('La URL no parece de un producto VTEX (debe terminar en /p)');
  }
  return partes[partes.length - 2];
}

// Convierte un producto del JSON de VTEX en algo simple
function resumirProducto(p) {
  const item = p.items && p.items[0];
  const oferta = item && item.sellers && item.sellers[0] && item.sellers[0].commertialOffer;
  return {
    nombre: p.productName,
    link: p.link,
    precio: oferta && oferta.Price > 0 ? oferta.Price : null,
    precioNormal: oferta && oferta.ListPrice > 0 ? oferta.ListPrice : null,
    disponible: Boolean(oferta && oferta.IsAvailable)
  };
}

// Precio de un producto a partir de la URL de su página
async function obtenerDatosVtex(url) {
  const { origin } = new URL(url);
  const datos = await descargarJson(`${origin}/api/catalog_system/pub/products/search/${slugDeUrl(url)}/p`);
  if (!Array.isArray(datos) || datos.length === 0) {
    throw new Error('El producto ya no existe en la tienda (quizá cambió de URL)');
  }
  return resumirProducto(datos[0]);
}

// Buscar productos por texto (para encontrar el link correcto al vincular)
async function buscarVtex(sitio, texto, cantidad = 10) {
  const { origin } = new URL(sitio);
  const url = `${origin}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(texto)}&_from=0&_to=${cantidad - 1}`;
  const datos = await descargarJson(url);
  return Array.isArray(datos) ? datos.map(resumirProducto) : [];
}

module.exports = { obtenerDatosVtex, buscarVtex, slugDeUrl };
