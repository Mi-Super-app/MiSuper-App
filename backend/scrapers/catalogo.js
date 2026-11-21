// LECTOR DEL CATÁLOGO COMPLETO DE CADA SUPERMERCADO
// -------------------------------------------------
// En vez de pedir los productos uno por uno, se pide el catálogo por categorías:
// muchos productos (con su precio) en cada consulta. Así se pueden importar miles
// de productos en pocos minutos y sin saturar las tiendas.
//
//   leerCatalogo('walmart')  → [{ codigo, nombre, link, precio, precioNormal, disponible, seccion }]
//
// La Colonia: página pública de cada categoría (/categoria/...). Su robots.txt la
//   permite (solo prohíbe /api/ y /buscar, que aquí NO se usan).
// La Unión y Walmart (VTEX): servicio público de búsqueda por categoría, 50 por consulta.

const configuraciones = require('./config');
const secciones = require('./secciones');
const { esperar } = require('./utils');

const AGENTE = 'MiSuperApp/1.0 (comparador de precios; consulta 1 vez al dia)';
const POR_PAGINA = 50; //   VTEX entrega como máximo 50 productos por consulta
const MAXIMO_VTEX = 2500; // y no deja pasar del producto 2500 en una misma búsqueda

async function descargar(url, tipo) {
  const respuesta = await fetch(url, {
    headers: { 'User-Agent': AGENTE, Accept: tipo },
    signal: AbortSignal.timeout(90000)
  });
  if (!respuesta.ok) throw new Error(`La tienda respondió con error ${respuesta.status} (${url})`);
  return respuesta;
}

// ══════════════ LA UNIÓN Y WALMART (VTEX) ══════════════

function resumirVtex(p, origen) {
  const item = p.items && p.items[0];
  const oferta = item && item.sellers && item.sellers[0] && item.sellers[0].commertialOffer;
  const precio = oferta && oferta.Price > 0 ? oferta.Price : null;
  const normal = oferta && oferta.ListPrice > 0 ? oferta.ListPrice : null;
  return {
    codigo: String(p.productId),
    nombre: (p.productName || '').trim(),
    link: `${origen}/${p.linkText}/p`,
    precio,
    precioNormal: normal && precio && normal > precio ? normal : null,
    disponible: Boolean(oferta && oferta.IsAvailable && precio),
    seccion: secciones.seccionVtex(p.categoriesIds)
  };
}

// Pide una página de la búsqueda. Devuelve los productos y el total que dice la tienda.
async function paginaVtex(origen, ruta, desde) {
  const url = `${origen}/api/catalog_system/pub/products/search?fq=C:${ruta}&_from=${desde}&_to=${desde + POR_PAGINA - 1}`;
  const respuesta = await descargar(url, 'application/json');
  // Encabezado "resources: 0-49/2341" → 2341 productos en total
  const total = Number(((respuesta.headers.get('resources') || '').split('/')[1]) || 0);
  const datos = await respuesta.json();
  return { productos: Array.isArray(datos) ? datos : [], total };
}

async function catalogoVtex(slug, { aviso = () => {} } = {}) {
  const config = configuraciones[slug];
  const { origin } = new URL(config.sitio);
  const pausa = config.esperaEntreConsultasMs;

  const arbol = await (await descargar(`${origin}/api/catalog_system/pub/category/tree/2`, 'application/json')).json();
  const porId = new Map(); // productId → producto (un producto puede estar en varias categorías)

  // Recorre una categoría completa, de 50 en 50
  async function recorrer(ruta) {
    let desde = 0;
    let total = Infinity;
    while (desde < total && desde < MAXIMO_VTEX) {
      const pagina = await paginaVtex(origin, ruta, desde);
      total = pagina.total;
      for (const p of pagina.productos) {
        if (!porId.has(p.productId)) porId.set(p.productId, resumirVtex(p, origin));
      }
      if (pagina.productos.length < POR_PAGINA) break;
      desde += POR_PAGINA;
      await esperar(pausa);
    }
    await esperar(pausa);
    return total;
  }

  for (const idGrande of secciones.vtexRecorrer) {
    const categoria = arbol.find(c => c.id === idGrande);
    if (!categoria) {
      aviso(`La categoría ${idGrande} ya no existe en ${slug}`);
      continue;
    }
    const hijos = categoria.children || [];
    // "Artículos para el hogar" es enorme (muebles, etc.): solo se toman sus subcategorías con sección
    const soloHijosConSeccion = !Object.prototype.hasOwnProperty.call(secciones.vtex, idGrande);

    if (soloHijosConSeccion) {
      for (const h of hijos.filter(h => secciones.vtex[h.id])) await recorrer(`/${idGrande}/${h.id}/`);
      continue;
    }
    // Primero se intenta la categoría entera; si tiene más de 2500, se recorre por subcategorías
    const total = await recorrer(`/${idGrande}/`);
    if (total > MAXIMO_VTEX) {
      for (const h of hijos) await recorrer(`/${idGrande}/${h.id}/`);
    }
    aviso(`${slug}: ${categoria.name} listo (${porId.size} productos en total)`);
  }

  return [...porId.values()].filter(p => p.seccion && p.nombre);
}

// ══════════════ LA COLONIA ══════════════

// La página está hecha con Next.js: los datos vienen dentro de trozos
// self.__next_f.push([1,"..."]) que juntos forman un texto con los productos.
function textoDeLaPagina(html) {
  let texto = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      texto += JSON.parse(m[1]);
    } catch {
      // trozo raro: se ignora
    }
  }
  return texto;
}

// Saca la lista que viene después de "initialProducts": [ ... ]
function extraerLista(texto, clave) {
  const i = texto.indexOf(`"${clave}":`);
  if (i < 0) return null;
  const inicio = texto.indexOf('[', i);
  let nivel = 0;
  let enTexto = false;
  let escape = false;
  for (let j = inicio; j < texto.length; j++) {
    const c = texto[j];
    if (enTexto) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') enTexto = false;
      continue;
    }
    if (c === '"') enTexto = true;
    else if (c === '[') nivel++;
    else if (c === ']' && --nivel === 0) return JSON.parse(texto.slice(inicio, j + 1));
  }
  return null;
}

// "MANTEQUILLA BARRA 115 GRS     605048 - DOS PINOS" → "Mantequilla Barra 115 Grs - Dos Pinos"
function nombreBonito(nombre) {
  return String(nombre || '')
    .replace(/¥/g, 'Ñ') // la tienda guarda la Ñ y el apóstrofo con otra codificación
    .replace(/¦/g, "'")
    // códigos internos de la tienda: 6 dígitos sueltos, o 4-7 dígitos justo antes de " - MARCA"
    .replace(/(^|\s)\d{6}(?=\s|$)/g, ' ')
    .replace(/\s\d{4,7}(?=\s*-\s)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-záéíóúñü])/g, (t, antes, letra) => antes + letra.toUpperCase());
}

function resumirColonia(p, seccion) {
  const normal = Number(p.price) > 0 ? Number(p.price) : null;
  // Si hay rebaja, "price" es el precio normal y "discountValue" el precio YA rebajado
  // (es el mismo que muestra la página del producto)
  const rebajado = p.hasDiscount && Number(p.discountValue) > 0 && Number(p.discountValue) < normal ? Number(p.discountValue) : null;
  const precio = rebajado || normal;
  return {
    codigo: String(p.code),
    nombre: nombreBonito(p.name),
    link: `${configuraciones['la-colonia'].sitio}/producto/${p.code}`,
    precio,
    precioNormal: rebajado ? normal : null,
    disponible: Boolean(p.inStock && precio),
    seccion
  };
}

async function categoriaColonia(codigo) {
  const html = await (await descargar(`${configuraciones['la-colonia'].sitio}/categoria/${codigo}`, 'text/html')).text();
  const lista = extraerLista(textoDeLaPagina(html), 'initialProducts');
  if (!lista) throw new Error(`La página de la categoría ${codigo} de La Colonia no trae productos (quizá cambió de formato)`);
  return lista;
}

async function catalogoColonia({ aviso = () => {} } = {}) {
  const pausa = configuraciones['la-colonia'].esperaEntreConsultasMs;
  const porCodigo = new Map();
  const { principales, detalle } = secciones.laColonia;

  // Primero las categorías grandes, después las subcategorías que cambian de sección
  const pasos = [...Object.entries(principales), ...Object.entries(detalle)];
  let fallos = 0;
  for (const [codigo, seccion] of pasos) {
    try {
      const lista = await categoriaColonia(codigo);
      for (const p of lista) {
        // Las versiones "(Caja)" (código terminado en -C) son ventas al por mayor: se omiten
        if (!p.code || /-C$/i.test(p.code)) continue;
        porCodigo.set(String(p.code), resumirColonia(p, seccion));
      }
      aviso(`la-colonia: ${codigo} listo (${lista.length} productos)`);
    } catch (error) {
      fallos++;
      aviso(`la-colonia: ${codigo} falló: ${error.message}`);
    }
    await esperar(pausa);
  }
  if (fallos === pasos.length) throw new Error('No se pudo leer ninguna categoría de La Colonia');
  return [...porCodigo.values()].filter(p => p.nombre);
}

// ══════════════ PUNTO ÚNICO ══════════════

async function leerCatalogo(slug, opciones) {
  const config = configuraciones[slug];
  if (!config) throw new Error(`No hay lector de catálogo para "${slug}"`);
  if (config.tipo === 'lacolonia') return catalogoColonia(opciones);
  return catalogoVtex(slug, opciones);
}

module.exports = { leerCatalogo, textoDeLaPagina, extraerLista, nombreBonito, resumirColonia, seccionVtex: secciones.seccionVtex };
