// EN QUÉ SECCIÓN DE MI SÚPER VA CADA PRODUCTO IMPORTADO
// -----------------------------------------------------
// Cada tienda ordena sus productos a su manera. Aquí decimos, para cada
// categoría de la tienda, en qué sección (categoría) de Mi Súper va.
// Las secciones válidas están en models/Producto.js (CATEGORIAS).
//
// Si una categoría de la tienda NO aparece aquí, sus productos no se importan
// (por ejemplo: electrónica, ropa o muebles, que no son de supermercado).

// ---------- La Colonia ----------
// Se lee la página pública de cada categoría (https://lacolonia.com.ni/categoria/CODIGO),
// que trae todos sus productos con precio en una sola carga.
//   principales: categoría grande → sección
//   detalle:     subcategorías que van a OTRA sección distinta a la de su categoría grande
//                (se leen después, y su sección gana)
const laColonia = {
  principales: {
    Abarrotes: 'abarrotes',
    Bebes: 'bebes',
    BebidasAlcoholicas: 'licores',
    BebidasYGaseosas: 'bebidas',
    Carnes: 'carnes',
    Congelado: 'congelados',
    CuidadoDelHogar: 'limpieza',
    CuidadoPersonal: 'higiene',
    Embutidos: 'carnes',
    FrutasVerduras: 'frutas-verduras',
    LacteosHuevo: 'lacteos',
    Mascotas: 'mascotas',
    Medicamentos: 'farmacia',
    Panaderia: 'panaderia',
    PapelHigienicoYDesechables: 'hogar',
    CocinaVajilla: 'hogar'
  },
  detalle: {
    ArrozyGranos: 'granos',
    Frijol: 'granos',
    Congelados: 'congelados',
    Helados: 'congelados',
    Hielo: 'bebidas',
    PapelHigienico: 'higiene'
  }
};

// ---------- La Unión y Walmart (VTEX, mismo árbol de categorías) ----------
// Número de categoría de la tienda → sección. Se usa la más específica que aparezca.
// (Los números salen de /api/catalog_system/pub/category/tree/2)
const vtex = {
  // Categorías grandes
  1: 'abarrotes',
  2: 'bebidas',
  3: 'licores',
  4: 'congelados',
  5: 'panaderia',
  6: 'lacteos',
  7: 'carnes',
  8: 'frutas-verduras',
  9: 'carnes',
  10: 'limpieza',
  11: 'bebes',
  12: 'higiene',
  15: 'farmacia',
  815: 'mascotas',
  // Subcategorías que van a otra sección
  30: 'granos', //       Arroz, Frijol y Semillas
  73: 'higiene', //      Papel Higiénico
  74: 'hogar', //        Desechables
  89: null, //           Cunas, coches y accesorios (no es de súper)
  91: null, //           Juguetes para bebé
  94: null, //           Artículos para fiesta
  113: 'hogar', //       Accesorios para cocina
  120: 'hogar' //        Accesorios para mesa
};

// Categorías grandes de VTEX que se recorren (todas las que tienen sección arriba,
// más "Artículos para el hogar" (14), de la que solo se toman cocina y mesa)
const vtexRecorrer = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 815, 14];

// Recibe los categoriesIds de VTEX (ej: ["/6/56/296/", "/6/56/", "/6/"]) y
// devuelve la sección, o null si el producto no es de supermercado.
function seccionVtex(categoriesIds = []) {
  let mejor; // la ruta más larga (más específica) que tenga sección definida
  let profundidad = -1;
  for (const ruta of categoriesIds) {
    const ids = ruta.split('/').filter(Boolean).map(Number);
    for (let i = ids.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(vtex, ids[i])) {
        if (i > profundidad) {
          profundidad = i;
          mejor = vtex[ids[i]];
        }
        break;
      }
    }
  }
  return mejor === undefined ? null : mejor;
}

module.exports = { laColonia, vtex, vtexRecorrer, seccionVtex };
