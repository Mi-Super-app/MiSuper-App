// TAMAÑO DE UN PRODUCTO (para el precio por kilo, por litro o por unidad)
// ----------------------------------------------------------------------
// Lee el tamaño desde el NOMBRE del producto:
//
//   leerTamano('Frijol Rojo Bolsa 4 Lb - El Norteño')    → { cantidad: 1.814, unidad: 'kg' }
//   leerTamano('Vino Chardonay 750 Ml - Finca Las Moras') → { cantidad: 0.75,  unidad: 'l' }
//   leerTamano('Galleta Soda 3 x 90 g')                  → { cantidad: 0.27,  unidad: 'kg' }
//   leerTamano('Miel De Abeja Sachets 14 Gr 36s')        → { cantidad: 0.504, unidad: 'kg' }  (36 de 14 g)
//   leerTamano('Pañales talla 7 - 40 uds')               → { cantidad: 40,    unidad: 'u' }
//   leerTamano('Carne De Res - Precio indicado por libra') → { cantidad: 0.4536, unidad: 'kg' }
//   leerTamano('Fibra P/Trastos Mommy')                  → null  (no se sabe: no se muestra nada)
//
// Siempre se guarda en kilos ('kg'), litros ('l') o unidades ('u').
// Precio por unidad = precio ÷ cantidad   (ej: C$130 ÷ 2 kg = C$65/kg)
//
// Si mejoras estas reglas, sube VERSION_TAMANO: la próxima actualización de
// precios vuelve a leer el tamaño de todos los productos.

const VERSION_TAMANO = 2; // 2: entiende fracciones ("1/2 Galón")

// Cuánto vale cada unidad escrita en el nombre, en kg o en litros
const PESO = { kg: 1, kilo: 1, kilos: 1, g: 0.001, gr: 0.001, grs: 0.001, gramo: 0.001, gramos: 0.001, lb: 0.45359, lbs: 0.45359, libra: 0.45359, libras: 0.45359 };
const VOLUMEN = { l: 1, lt: 1, lts: 1, litro: 1, litros: 1, ml: 0.001, cc: 0.001, gal: 3.78541, gl: 3.78541, gln: 3.78541, galon: 3.78541, galones: 3.78541 };
const ONZA_PESO = 0.0283495; //   onza de peso, en kg
const ONZA_LIQUIDA = 0.0295735; // onza líquida, en litros

// Si dice "oz": ¿es onza líquida? (bebidas, aceites, champús…) o de peso (chocolates, cereales…)
const SECCIONES_LIQUIDAS = new Set(['bebidas', 'licores']);
const PALABRAS_LIQUIDAS = /\b(fl|aceite|shampoo|champu|shamp|acondicionador|jugo|leche|bebida|refresco|agua|vinagre|enjuague|liquido|jarabe|locion|gel|soda|cerveza|vino|ron|vodka|whisky|tequila|ginebra|limpiador|desinfectante|cloro|suavizante)\b/;

const NUM = '(\\d+(?:[.,]\\d+)?)';
const UNIDAD_MEDIDA = '(kg|kilos?|grs|gr|gramos?|g|lbs|lb|libras?|onzas?|onz|oz|z|ml|cc|lts|lt|litros?|l|galon(?:es)?|gal|gln|gl)';
// Antes del número no puede haber letra, número, punto, coma ni "/" (así "80/20" no se lee como 20)
const ANTES = '(?:^|[^a-z0-9.,/])';
const MEDIDA = new RegExp(`${ANTES}${NUM}\\s*${UNIDAD_MEDIDA}(?![a-z0-9])`, 'g');
const VARIOS_IGUALES = new RegExp(`${ANTES}(\\d{1,3})\\s*(?:x|×|pack de|pack|pk)\\s*${NUM}\\s*${UNIDAD_MEDIDA}(?![a-z0-9])`);
// Cuántas piezas trae: "36s", "40 S", "Pk 120", "3pk", "12 sobres", "20 sticks"
const PIEZAS = /(?:^|[^a-z0-9.,/])(?:(\d{1,4})\s*(?:s|pk|pack|sobres|sticks?|bolsitas|unidades|uds|und)\b|(?:pk|pack|paquete con|caja con)\s*(\d{1,4})\b)/;
// Contar unidades cuando no hay peso ni volumen: "40 uds", "15 Unidades", "Bolsa 10s", "2 pack", "100Tab"
const CONTEO = /^(und|unds|unid|unids|unidad|unidades|ud|uds|u|pack|pk|piezas|pzas|pz|rollos|sobres|tabletas|tab|tabs|capsulas|s)$/;

const MAXIMO = { kg: 60, l: 60, u: 1000 }; // más que esto, seguramente se leyó mal
const MINIMO = { kg: 0.02, l: 0.02, u: 1 }; // menos de 20 g o 20 ml: el precio por kilo no ayuda (C$135,000/L)
const PIEZA_CHICA = 0.05; // una pieza de hasta 50 g/ml con "36s" al lado = son 36 piezas de ese tamaño

function numero(texto) {
  let t = String(texto);
  if (/^\d{1,3},\d{3}$/.test(t)) t = t.replace(',', ''); // "1,000" = mil
  return Number(t.replace(',', '.'));
}

function sinTildes(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Convierte 4 + "lb" → { cantidad: 1.814, unidad: 'kg' }
function convertir(valor, unidadEscrita, liquido) {
  const u = unidadEscrita;
  if (PESO[u]) return { cantidad: valor * PESO[u], unidad: 'kg' };
  if (VOLUMEN[u]) return { cantidad: valor * VOLUMEN[u], unidad: 'l' };
  if (/^(oz|onz|onza|onzas|z)$/.test(u)) {
    return liquido ? { cantidad: valor * ONZA_LIQUIDA, unidad: 'l' } : { cantidad: valor * ONZA_PESO, unidad: 'kg' };
  }
  return null;
}

function leerTamano(nombre, categoria = '') {
  // "1/2 Galon" → "0.5 Galon" (solo medios, cuartos y octavos: "80/20 Libra" NO es una fracción)
  const texto = sinTildes(nombre).replace(/(^|[^0-9.,/])([1357])\/([248])(?=\s*[a-z])/g, (m, antes, a, b) => (Number(a) < Number(b) ? antes + Number(a) / Number(b) : m));
  const liquido = SECCIONES_LIQUIDAS.has(categoria) || PALABRAS_LIQUIDAS.test(texto);

  // 1. Se vende por peso o por unidad: "Precio indicado por libra", "Costilla De Cerdo Lb"
  if (/precio (indicado )?por (libra|lb)\b/.test(texto)) return redondear({ cantidad: PESO.lb, unidad: 'kg' });
  if (/precio (indicado )?por (kilo|kg)\b/.test(texto)) return { cantidad: 1, unidad: 'kg' };
  if (/precio (indicado )?por unidad\b/.test(texto)) return { cantidad: 1, unidad: 'u' };
  // "Lb" o "Libra" sin número delante (ej: "Azucar Sulfitada Lb (50 Kg)" = precio de 1 libra)
  const libraConNumero = new RegExp(`${ANTES}${NUM}\\s*(lb|lbs|libras?)(?![a-z0-9])`).test(texto);
  if (/(?:^|\s)(lb|libra)\b/.test(texto) && !libraConNumero) {
    return redondear({ cantidad: PESO.lb, unidad: 'kg' });
  }

  // 2. Varios iguales escritos con "x": "3 x 90 g", "6x355ml", "12 pack 355 ml"
  const varios = texto.match(VARIOS_IGUALES);
  if (varios) {
    const una = convertir(numero(varios[2]), varios[3], liquido);
    if (una) return validar({ cantidad: una.cantidad * Number(varios[1]), unidad: una.unidad });
  }

  // 3. Peso o volumen: se usa el ÚLTIMO que aparece ("Caramelo 100s 400 Gr" → 400 g).
  // En artículos del hogar (vasos, platos…) el volumen no es lo que se compra: se cuentan unidades.
  if (categoria !== 'hogar') {
    const medidas = [...texto.matchAll(MEDIDA)];
    for (let i = medidas.length - 1; i >= 0; i--) {
      const medida = convertir(numero(medidas[i][1]), medidas[i][2], liquido);
      if (!medida) continue;
      // "Miel Sachets 14 Gr 36s": piezas chicas con la cantidad al lado → 36 × 14 g
      const piezas = texto.match(PIEZAS);
      const cuantas = piezas ? Number(piezas[1] || piezas[2]) : 0;
      if (cuantas >= 2 && medida.cantidad <= PIEZA_CHICA) medida.cantidad *= cuantas;
      return validar(medida);
    }
    // "Vodka Finlandia Litro" = 1 litro
    if (/\blitro\b/.test(texto)) return { cantidad: 1, unidad: 'l' };
    if (/\bgalon\b/.test(texto)) return redondear({ cantidad: VOLUMEN.galon, unidad: 'l' });
  }

  // 4. Cantidad de unidades
  const conteos = [...texto.matchAll(/(?:^|[^a-z0-9.,/])(\d{1,4})\s*([a-z]+)/g)].filter(m => CONTEO.test(m[2]));
  if (conteos.length) return validar({ cantidad: Number(conteos[conteos.length - 1][1]), unidad: 'u' });

  return null;
}

function redondear(t) {
  return { cantidad: Math.round(t.cantidad * 1e6) / 1e6, unidad: t.unidad };
}

function validar(t) {
  if (!t || !(t.cantidad >= MINIMO[t.unidad]) || t.cantidad > MAXIMO[t.unidad]) return null;
  return redondear(t);
}

// Precio por unidad: C$130 y { cantidad: 2, unidad: 'kg' } → 65
function precioPorUnidad(precio, tamano) {
  if (!precio || !tamano || !(tamano.cantidad > 0)) return null;
  return precio / tamano.cantidad;
}

module.exports = { leerTamano, precioPorUnidad, VERSION_TAMANO };
