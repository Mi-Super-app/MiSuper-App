// VER CUÁNTOS PRODUCTOS SE IMPORTARÍAN DE CADA TIENDA (sin tocar la base de datos)
// ------------------------------------------------------------------------------
// Uso:  npm run catalogo                 → las 3 tiendas
//       npm run catalogo -- la-colonia   → solo una
//
// Lee el catálogo completo y muestra cuántos productos hay en cada sección.
// Sirve para revisar que la importación funciona antes de correr  npm run precios

const configuraciones = require('../scrapers/config');
const { leerCatalogo } = require('../scrapers/catalogo');

async function main() {
  const pedidos = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const slugs = pedidos.length ? pedidos : Object.keys(configuraciones);
  const inicio = Date.now();

  const resultados = await Promise.allSettled(
    slugs.map(slug => leerCatalogo(slug, { aviso: texto => console.log(`  ${texto}`) }))
  );

  let fallos = 0;
  resultados.forEach((r, i) => {
    const slug = slugs[i];
    console.log(`\n=== ${slug} ===`);
    if (r.status === 'rejected') {
      fallos++;
      console.log(`❌ ${r.reason.message}`);
      return;
    }
    const lista = r.value;
    const porSeccion = {};
    for (const p of lista) porSeccion[p.seccion] = (porSeccion[p.seccion] || 0) + 1;
    console.log(`✅ ${lista.length} productos (${lista.filter(p => p.disponible).length} disponibles)`);
    for (const [seccion, n] of Object.entries(porSeccion).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${seccion.padEnd(16)} ${n}`);
    }
    console.log('   Ejemplos:');
    for (const p of lista.filter((_, j) => j % Math.max(1, Math.floor(lista.length / 5)) === 0).slice(0, 5)) {
      const rebaja = p.precioNormal ? ` (antes C$${p.precioNormal})` : '';
      console.log(`   - [${p.seccion}] ${p.nombre} → C$${p.precio}${rebaja}`);
    }
  });

  console.log(`\nTardó ${Math.round((Date.now() - inicio) / 1000)} segundos.`);
  process.exit(fallos ? 1 : 0);
}

main();
