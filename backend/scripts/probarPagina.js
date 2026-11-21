// DIAGNÓSTICO DE UNA PÁGINA DE PRODUCTO
// -------------------------------------
// Uso:   npm run probar -- <url> [slug-del-super]
// Ej.:   npm run probar -- https://maxipali.com.ni/.../fabuloso-...-9917613264 maxi-pali
//
// Te dice si el precio viene en el HTML y en qué elemento está,
// para que sepas qué poner en selectorPrecio (scrapers/config.js).
// No necesita la base de datos.

const cheerio = require('cheerio');
const { descargarHtml, convertirPrecio } = require('../scrapers/utils');
const { extraerPrecio } = require('../scrapers');

// Construye un selector CSS aproximado para un elemento (ej: "div.producto > span.precio")
function selectorDe($, el) {
  const partes = [];
  let actual = $(el);
  for (let i = 0; i < 3 && actual.length && actual[0].tagName !== 'body'; i++) {
    const tag = actual[0].tagName;
    const id = actual.attr('id');
    const clases = (actual.attr('class') || '').trim().split(/\s+/).filter(Boolean);
    let parte = tag;
    if (id) parte += `#${id}`;
    else if (clases.length) parte += '.' + clases.join('.');
    partes.unshift(parte);
    if (id) break;
    actual = actual.parent();
  }
  return partes.join(' > ');
}

async function main() {
  const [url, slug] = process.argv.slice(2);
  if (!url) {
    console.log('Uso: npm run probar -- <url> [slug-del-super]');
    process.exit(1);
  }

  console.log(`\nDescargando ${url} ...`);
  const html = await descargarHtml(url);
  const $ = cheerio.load(html);
  console.log(`HTML recibido: ${html.length} caracteres`);
  console.log(`Título: ${$('title').text().trim()}\n`);

  // Buscamos los elementos "más pequeños" cuyo texto tiene C$
  $('script, style, noscript').remove();
  const candidatos = [];
  $('body *').each((_, el) => {
    const propio = $(el)
      .contents()
      .filter((__, n) => n.type === 'text')
      .text();
    if (/C\$\s*\.?\s*\d/.test(propio)) {
      candidatos.push({ texto: propio.trim().replace(/\s+/g, ' '), selector: selectorDe($, el) });
    }
  });

  if (candidatos.length === 0) {
    console.log('❌ No aparece ningún "C$" en el HTML.');
    console.log('   Probablemente el precio lo carga JavaScript después de abrir la página.');
    console.log('   Sigue el "Plan B" de GUIA_PRECIOS.md (pestaña Network/Red en Chrome).\n');
  } else {
    console.log(`✅ Encontré ${candidatos.length} texto(s) con "C$":\n`);
    candidatos.slice(0, 15).forEach((c, i) => {
      console.log(`${i + 1}. "${c.texto.slice(0, 80)}"  → ${convertirPrecio(c.texto)}`);
      console.log(`   selector sugerido: ${c.selector}\n`);
    });
    console.log('Copia el selector del precio correcto en scrapers/config.js (selectorPrecio).');
    console.log('Si la página muestra precio de Palí y de Maxi Palí, usa el selector de cada uno.\n');
  }

  if (slug) {
    const precio = extraerPrecio(html, slug);
    console.log(`Con la configuración actual de "${slug}", el scraper lee: ${precio ?? 'nada (null)'}\n`);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
