// BUSCAR UN PRODUCTO EN UNA TIENDA (para agregar productos al catálogo)
// ---------------------------------------------------------------------
// Uso:  npm run buscar -- la-union "leche eskimo"
//       npm run buscar -- walmart "leche eskimo"
// (La Colonia no permite búsquedas automáticas: búscalo en su web con tu navegador.)
//
// Muestra nombre, precio y link. No necesita la base de datos.
// Con el link correcto, agrega el producto en data/productos.js

const configuraciones = require('../scrapers/config');
const { buscar } = require('../scrapers');

async function main() {
  const [slug, ...palabras] = process.argv.slice(2);
  const texto = palabras.join(' ');
  if (!configuraciones[slug] || !texto) {
    console.log(`Uso: npm run buscar -- <${Object.keys(configuraciones).join('|')}> "texto a buscar"`);
    process.exit(1);
  }

  const resultados = await buscar(slug, texto, 10);
  if (resultados.length === 0) {
    console.log('No encontré productos. Prueba con menos palabras (ej: "eskimo").');
    return;
  }

  console.log(`\nResultados en ${slug} para "${texto}":\n`);
  resultados.forEach((p, i) => {
    const rebaja = p.precioNormal && p.precio && p.precioNormal > p.precio ? ` (antes C$${p.precioNormal})` : '';
    const estado = p.disponible ? '' : '  ⚠️ agotado';
    console.log(`${i + 1}. ${p.nombre}`);
    console.log(`   C$${p.precio ?? '-'}${rebaja}${estado}`);
    console.log(`   ${p.link}\n`);
  });
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
