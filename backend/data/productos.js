// CATÁLOGO DE PRODUCTOS DE MI SÚPER
// ---------------------------------
// Cada producto tiene su link en cada supermercado (la "sección" de cada súper).
// Son el MISMO producto (misma marca y tamaño) en las tres tiendas, para que la
// comparación de precios sea justa. Revisado en las tiendas en línea el 20/11/2026.
//
// ¿Quieres agregar un producto?
//   1. Busca su link en cada tienda:   npm run buscar -- la-union "nombre"
//                                      npm run buscar -- walmart "nombre"
//      En La Colonia búscalo tú en https://lacolonia.com.ni con tu navegador
//      (su robots.txt no permite búsquedas automáticas) y copia el número del link.
//   2. Agrégalo abajo con el mismo formato.
//   3. Ejecuta:                        npm run seed
//
// Si un producto no existe en alguna tienda, simplemente no pongas ese link.

const COLONIA = 'https://lacolonia.com.ni/producto/';
const UNION = 'https://www.launion.com.ni/';
const WALMART = 'https://www.walmart.com.ni/';

// La Unión y Walmart usan el mismo sistema y la misma dirección para cada producto,
// así que basta con escribir la parte final del link una sola vez.
function p(nombre, categoria, codigoColonia, slugWalmartUnion) {
  const links = {};
  if (codigoColonia) links['la-colonia'] = COLONIA + codigoColonia;
  if (slugWalmartUnion) {
    links['la-union'] = `${UNION}${slugWalmartUnion}/p`;
    links.walmart = `${WALMART}${slugWalmartUnion}/p`;
  }
  return { nombre, categoria, links };
}

module.exports = [
  // ---------- Lácteos y huevos ----------
  p('Leche entera Eskimo 1 L', 'lacteos', '4100108', 'leche-eskimo-uht-entera-3-grasa-1-litro'),
  p('Leche entera Dos Pinos 1 L', 'lacteos', '4100224', 'leche-dos-pinos-entera-uht-3-porc-1000ml'),
  p('Mantequilla Dos Pinos 115 g', 'lacteos', '1370094', 'mantequilla-dos-pinos-en-barra-115-g-8'),
  p('Crema dulce Dos Pinos 1 L', 'lacteos', '1511193', 'crema-dulce-dos-pinos-para-batir-1000ml'),
  p('Huevos rojos El Granjero (30 und)', 'lacteos', '4150029', 'cajilla-huevo-rojo-granjero-30-und-ni2336-2-1'),

  // ---------- Granos básicos ----------
  p('Arroz Faisán 96% 2 kg', 'granos', '1520122', 'arroz-el-faisan-96-4-2-kg'),
  p('Harina de maíz Maseca extra suave 820 g', 'granos', '4090039', 'harina-maseca-extra-suave-y-libre-de-gluten-820-g'),

  // ---------- Abarrotes ----------
  p('Azúcar San Antonio refinada 2 kg', 'abarrotes', '4040013', 'azucar-san-antonio-refinada-2000gr'),
  p('Azúcar Monte Rosa sulfitada 2 kg', 'abarrotes', '4040018', 'azucar-mote-rosa-sulfitada-2kg'),
  p('Aceite Clover de soya 900 ml', 'abarrotes', '4020184', 'aceite-clover-soya-900ml'),
  p('Café Presto frasco 150 g', 'abarrotes', '1180046', 'presto-cafe-instantaneo-frasco-150-gr-6'),
  p('Pasta Ina espagueti 200 g', 'abarrotes', '1300899', 'pasta-larga-ina-espagueti-200-g-ni-0'),
  p('Salsa de tomate Naturas 385 g', 'abarrotes', '1010014', 'naturas-salsa-tomate-ketchup-dp-385gr'),
  p('Atún Calvo en agua 3 x 105 g', 'abarrotes', '1320727', 'atun-calvo-trozos-agua-3pack-105g-ni9926-2-3'),
  p('Sopa Maggi pollo con fideos 55 g', 'abarrotes', '1310366', 'sopa-maggi-de-pollo-con-fideos-sobre-55g'),
  p('Galleta Club Social original 216 g', 'abarrotes', '1247213', 'galleta-club-social-regular-216gr'),
  p('Galleta Oreo 432 g', 'abarrotes', '1241375', 'galleta-nabisco-oreo-regular-432gr'),

  // ---------- Limpieza ----------
  p('Fabuloso lavanda 900 ml', 'limpieza', '2080050', 'desinfectante-multiusos-fabuloso-lavanda-900ml'),
  p('Cloro Magia Blanca 1.895 L', 'limpieza', '2081058', 'cloro-magia-blanca-regular-1785-ml'),
  p('Suavitel Complete Aqua 720 ml', 'limpieza', '2130362', 'suav-suavitel-complete-acqua-dp-720ml'),
  p('Lavaplatos Axion limón 3 x 425 g', 'limpieza', '2120289', 'lavaplatos-axion-limon-pasta-425-g-3-pack-0'),

  // ---------- Higiene ----------
  p('Papel higiénico Scott Rindemax 6 rollos', 'higiene', '4300280', 'papel-higenico-scott-rindemax-2p-6r-420h'),
  p('Jabón Dove original 3 x 90 g', 'higiene', '4170537', '3-pack-jabon-dove-blanco-original-270gr'),
  p('Shampoo Head & Shoulders protección caída 375 ml', 'higiene', '7032802', 'shampoo-head-shoulders-proteccion-caida-control-caspa-375-ml-ni107'),
  p('Pasta dental Colgate Triple Acción 150 ml', 'higiene', '4210856', 'crema-dental-colgate-triple-accion-150-ml'),
  p('Desodorante Speed Stick clásico 50 g', 'higiene', '4400378', 'desodorante-speed-stick-antitranspirante-classic-barra-50g')
];
