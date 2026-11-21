// CONFIGURACIÓN DE CADA SUPERMERCADO PARA LEER PRECIOS
// ----------------------------------------------------
// tipo 'lacolonia' → página pública de cada producto (datos schema.org), respetando
//                    su robots.txt, que no permite usar /api/ (ver scrapers/lacolonia.js)
// tipo 'vtex'      → plataforma VTEX: La Unión y Walmart  (ver scrapers/vtex.js)
//
// Las tres entregan el precio en formato de datos, así que no hay que "leer"
// el diseño de la página: no se rompe si cambian cómo se ve la web.
//
// esperaEntreConsultasMs: pausa entre un producto y otro, para no saturar la tienda.

module.exports = {
  'la-colonia': { tipo: 'lacolonia', sitio: 'https://lacolonia.com.ni', esperaEntreConsultasMs: 3000 },
  'la-union': { tipo: 'vtex', sitio: 'https://www.launion.com.ni', esperaEntreConsultasMs: 1500 },
  walmart: { tipo: 'vtex', sitio: 'https://www.walmart.com.ni', esperaEntreConsultasMs: 1500 }
};
