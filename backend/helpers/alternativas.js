// "¿HAY ALGO MÁS BARATO?"
// ----------------------
// Para un producto de la lista, busca otro EQUIVALENTE de OTRA MARCA que salga más barato:
//   - misma sección (categoría)
//   - mismo tipo de producto: el nombre empieza con la misma palabra ("Aceite…", "Frijol…")
//     y su palabra principal coincide ("Frijol BLANCO" solo con otro "blanco", "Aceite de SOYA"
//     solo con otro de soya). La marca NO cuenta como palabra que describe el producto.
//   - otra marca (si se sabe la marca de los dos)
//   - tamaño parecido (hasta 25 % más grande o más chico) y la misma medida (kg, litros o unidades)
//   - al menos 5 % más barato POR KILO, LITRO O UNIDAD (así se compara justo aunque el tamaño cambie un poco)
// Se compara con el precio más bajo de cada producto en los supermercados elegidos.

const Producto = require('../models/Producto');
const ProductoSupermercado = require('../models/ProductoSupermercado');
const { marcaDeNombre } = require('./marca');

const AHORRO_MINIMO = 0.05; //    5 %
const TAMANO_PARECIDO = 0.25; //  ±25 %
const MAX_CANDIDATOS = 300;

// Palabras que no dicen qué producto es (empaques, unión, unidades…)
const SIN_SIGNIFICADO = new Set(
  ('de del la las el los con sin para por y e en a al x p c s n no un una ' +
    'bolsa bol botella lata caja paquete pack pk unidad unidades und uds ud sobre sobres frasco envase tarro bandeja ' +
    'granel mini grande gde pequeno mediano familiar economico promo oferta precio indicado libra lb kg g gr grs ml l lt ' +
    'oz onz litro litros galon gl gln cc tetra brick pet plastico vidrio rep repuesto doypack empacado').split(/\s+/)
);

function sinTildes(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// "Aceite Ambar de soya 1.89 L" → ['aceite', 'ambar', 'soya']
function palabras(texto) {
  return sinTildes(texto)
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !/\d/.test(w) && !SIN_SIGNIFICADO.has(w));
}

// Variedades que cambian el producto: si uno las tiene, el otro también ("integral" ≠ normal)
const VARIEDADES = new Set(
  ('integral light diet zero deslactosada deslactosado descremada descremado semidescremada semidescremado entera entero ' +
    'organico organica picante pic sinalcohol vegano vegana proteina gluten glut kids bebe infantil ' +
    'rallado rallada rebanado rebanada rebanadas tajado tajadas molido molida polvo liquido liquida barra grano hojuelas ' +
    'instantaneo instantanea descafeinado crunchy').split(/\s+/)
);
// Sabores y aromas: si los dos dicen uno, tiene que ser el mismo ("Yogurt Fresa" ≠ "Yogurt Durazno")
const SABORES = new Set(
  ('fresa durazno melocoton mango vainilla chocolate cacao natural banano banana pina coco manzana uva naranja limon ' +
    'cereza arandano mora moras frutas fruta tropical maracuya guayaba sandia melon kiwi caramelo dulce leche miel canela ' +
    'menta cafe capuchino pollo res carne cerdo camaron mariscos pescado queso jamon tocino ajo cebolla tomate chile ' +
    'barbacoa bbq ranch original clasico clasica floral lavanda rosas aloe avena almendra almendras mani nuez').split(/\s+/)
);

const marcaDe = p => p.marca || marcaDeNombre(p.nombre);

// Calidad del arroz y similares: "96/4", "80/20" (los dos números suman 100)
function grados(nombre) {
  return [...String(nombre).matchAll(/(?:^|[^\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g)]
    .filter(m => Number(m[1]) + Number(m[2]) === 100)
    .map(m => `${m[1]}/${m[2]}`);
}

const mismoConjunto = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

// Lo que se compara de un producto: su tipo (primera palabra), las palabras que lo describen
// (sin la marca) y la marca
function describir(p) {
  const marca = marcaDe(p);
  const deMarca = new Set(marca ? palabras(marca) : []);
  const todas = palabras(p.nombre);
  if (/(^|[^\d.,])0[.,]0(?![\d])/.test(p.nombre) || /sin alcohol/i.test(p.nombre)) todas.push('sinalcohol'); // cerveza 0.0
  const descripcion = todas.slice(1).filter(w => !deMarca.has(w));
  return {
    tipo: todas[0],
    todas: new Set(todas),
    descripcion,
    variedades: new Set([...descripcion.filter(w => VARIEDADES.has(w)), ...grados(p.nombre)]),
    sabores: new Set(descripcion.filter(w => SABORES.has(w))),
    marca: marca ? sinTildes(marca).replace(/[^a-z0-9]/g, '') : null,
    palabrasMarca: [...deMarca]
  };
}

// ¿Es la misma marca? Por la marca guardada, o porque la marca de uno aparece en el nombre del
// otro ("Aceite Ambar De Soya" y "Aceite De Soya - Ambar"), por si alguno todavía no tiene marca.
function mismaMarca(a, b) {
  if (a.marca && b.marca) return a.marca === b.marca;
  const dentro = (x, y) => x.palabrasMarca.length > 0 && x.palabrasMarca.every(w => y.todas.has(w));
  if (dentro(a, b) || dentro(b, a)) return true;
  // Ninguno tiene marca todavía: en La Unión y Walmart la marca suele ir en segundo lugar
  // ("Jabón Bex Multi Limpieza", "Jabón Bex Con Suavizante"). Si coincide, se toma como la misma.
  // (las palabras de variedad o sabor, como "polvo" o "fresa", no son marcas)
  if (!a.marca && !b.marca) {
    const posibleMarca = x => x.descripcion.find(w => !VARIEDADES.has(w) && !SABORES.has(w));
    const ma = posibleMarca(a);
    return Boolean(ma) && ma === posibleMarca(b);
  }
  return false;
}

// ¿Son el mismo tipo de producto, de otra marca?
function equivalentes(a, b) {
  if (!a.tipo || a.tipo !== b.tipo) return false;
  if (mismaMarca(a, b)) return false; // misma marca: no es "otra marca"
  if (!mismoConjunto(a.variedades, b.variedades)) return false; // "integral", "descremada", "96/4"…
  if ((a.sabores.size || b.sabores.size) && ![...a.sabores].some(s => b.sabores.has(s))) return false; // otro sabor
  // "Azúcar 2 kg" (sin más descripción) solo se cambia por otro igual de simple
  // (o si los dos tienen la misma variedad o calidad: "Arroz 96/4" con "Arroz Blanco 96/4")
  if (!a.descripcion.length) return !b.descripcion.length || a.variedades.size > 0;
  // La palabra principal de cada uno tiene que estar en el otro ("Frijol Blanco" ≠ "Frijol Negro")
  if (!b.todas.has(a.descripcion[0])) return false;
  if (b.descripcion.length && !a.todas.has(b.descripcion[0])) return false;
  return true;
}

// Precio más bajo de cada producto en esos supermercados → Map(id → { precio, supermercado })
async function preciosMinimos(ids, supermercados) {
  const enlaces = await ProductoSupermercado.find({
    producto: { $in: ids },
    supermercado: { $in: supermercados },
    disponible: true,
    precioActual: { $gt: 0 }
  })
    .select('producto supermercado precioActual')
    .lean();
  const minimos = new Map();
  for (const e of enlaces) {
    const clave = String(e.producto);
    const actual = minimos.get(clave);
    if (!actual || e.precioActual < actual.precio) minimos.set(clave, { precio: e.precioActual, supermercado: e.supermercado });
  }
  return minimos;
}

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const VARIANTES = { a: '[aáàä]', e: '[eéèë]', i: '[iíìï]', o: '[oóòö]', u: '[uúùü]', n: '[nñ]' };
const regexInicio = palabra => new RegExp('^\\W*' + escaparRegex(palabra).split('').map(c => VARIANTES[c] || c).join('') + '(?![a-zñ])', 'i');

// Busca la mejor alternativa para un producto. Devuelve null si no hay una que ahorre al menos 5 %.
async function buscarAlternativa(producto, supermercados, precioActual) {
  const t = producto.tamano;
  if (!t || !(t.cantidad > 0) || !precioActual) return null;
  const propio = describir(producto);
  if (!propio.tipo) return null;

  const candidatos = await Producto.find({
    _id: { $ne: producto._id },
    categoria: producto.categoria,
    'tamano.unidad': t.unidad,
    'tamano.cantidad': { $gte: t.cantidad * (1 - TAMANO_PARECIDO), $lte: t.cantidad * (1 + TAMANO_PARECIDO) },
    nombre: regexInicio(propio.tipo)
  })
    .select('nombre categoria tamano marca')
    .limit(MAX_CANDIDATOS)
    .lean();
  const parecidos = candidatos.filter(c => equivalentes(propio, describir(c)));
  if (!parecidos.length) return null;

  const precios = await preciosMinimos(parecidos.map(c => c._id), supermercados);
  const porUnidadActual = precioActual / t.cantidad;
  let mejor = null;
  for (const c of parecidos) {
    const p = precios.get(String(c._id));
    if (!p) continue;
    const porUnidad = p.precio / c.tamano.cantidad;
    const ahorro = 1 - porUnidad / porUnidadActual;
    if (ahorro >= AHORRO_MINIMO && (!mejor || ahorro > mejor.ahorro)) mejor = { producto: c, ...p, porUnidad, ahorro };
  }
  return mejor;
}

module.exports = { buscarAlternativa, preciosMinimos, palabras, describir, equivalentes, AHORRO_MINIMO };
