// PROBAR LA CONEXIÓN CON LAS TIENDAS
// ----------------------------------
// Uso:  npm run probar
//
// Pide a cada tienda el precio del primer producto del catálogo y muestra el
// resultado. Sirve para comprobar que las tiendas responden.
// No necesita la base de datos.

const productos = require('../data/productos');
const configuraciones = require('../scrapers/config');
const { obtenerDatos } = require('../scrapers');

async function main() {
  console.log('\nProbando conexión con las tiendas...\n');
  let fallos = 0;

  for (const slug of Object.keys(configuraciones)) {
    const producto = productos.find(p => p.links[slug]);
    if (!producto) {
      console.log(`${slug}: no hay productos con link para probar`);
      continue;
    }
    try {
      const datos = await obtenerDatos(slug, producto.links[slug]);
      const rebaja = datos.precioNormal && datos.precioNormal > datos.precio ? ` (antes C$${datos.precioNormal})` : '';
      console.log(`✅ ${slug}: ${datos.nombre} → C$${datos.precio}${rebaja}`);
    } catch (error) {
      fallos++;
      console.log(`❌ ${slug}: ${error.message}`);
    }
  }

  console.log(fallos === 0 ? '\nTodo bien. Las tres tiendas responden.\n' : '\nAlguna tienda no respondió. Revisa tu internet y vuelve a probar.\n');
}

main();
