// LECTOR DEL CATÁLOGO COMPLETO DE CADA SUPERMERCADO
// -------------------------------------------------
// En vez de pedir los productos uno por uno, se pide el catálogo por categorías:
// muchos productos (con su precio) en cada consulta. Así se lee todo el catálogo
// con pocas consultas y sin saturar las tiendas.
//
//   leerCatalogo('walmart', { alPaso, hechos })
//     → [{ codigo, nombre, link, precio, precioNormal, disponible, seccion }]
//
// La lectura va por PASOS (un paso = una categoría). Al terminar cada paso se llama
// alPaso(clave, productos), que los guarda en la base y anota el paso como hecho.
// Si el servidor se reinicia a medias, se vuelve a llamar con hechos = los pasos
// ya terminados, y esos se saltan: así se continúa donde se quedó.
//
// La Colonia: página pública de cada categoría (/categoria/...). Su robots.txt la
//   permite (solo prohíbe /api/ y /buscar, que aquí NO se usan).
// La Unión y Walmart (VTEX): servicio público de búsqueda por categoría, 50 por consulta.
// Todas las consultas pasan por pedir() (scrapers/utils.js), que revisa el robots.txt.

const configuraciones = require('./config');
const secciones = require('./secciones');
const { esperar, pedir } = require('./utils');
const { marcaDeNombre } = require('../helpers/marca');

const POR_PAGINA = 50; //   VTEX entrega como máximo 50 productos por consulta
const MAXIMO_VTEX = 2500; // y no deja pasar del producto 2500 en una misma búsqueda

async function descargar(url, tipo) {
  try {
    return await pedir(url, { tipo, tiempoMs: 90000 });
  } catch (error) {
    error.message += ` (${url})`;
    throw error;
  }
}

// Ejecuta un paso de la lectura, salvo que ya se haya hecho antes.
// Si el paso falla, se avisa y se sigue con los demás.
async function hacerPaso(clave, opciones, fn) {
  const { hechos = new Set(), alPaso = async () => {}, alFallar = () => {} } = opciones;
  if (hechos.has(clave)) return { saltado: true };
  try {
    const { productos, ...extra } = await fn();
    await alPaso(clave, productos);
    return { ok: true, ...extra };
  } catch (error) {
    alFallar(clave, error);
    return { ok: false };
  }
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
    seccion: secciones.seccionVtex(p.categoriesIds),
    marca: String(p.brand || '').trim() || null // la tienda dice la marca
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

async function catalogoVtex(slug, opciones = {}) {
  const { aviso = () => {}, hechos = new Set(), alPaso = async () => {}, alFallar = () => {} } = opciones;
  const config = configuraciones[slug];
  const { origin } = new URL(config.sitio);
  const pausa = config.esperaEntreConsultasMs;

  const arbol = await (await descargar(`${origin}/api/catalog_system/pub/category/tree/2`, 'application/json')).json();
  const porId = new Map(); // productId → producto (un producto puede estar en varias categorías)
  const todos = [];

  // Recorre una categoría completa, de 50 en 50.
  // Devuelve solo los productos que no habían salido en otra categoría.
  async function recorrer(ruta) {
    const productos = [];
    let desde = 0;
    let total = Infinity;
    while (desde < total && desde < MAXIMO_VTEX) {
      const pagina = await paginaVtex(origin, ruta, desde);
      total = pagina.total;
      for (const p of pagina.productos) {
        if (porId.has(p.productId)) continue;
        const resumen = resumirVtex(p, origin);
        porId.set(p.productId, resumen);
        if (resumen.seccion && resumen.nombre) productos.push(resumen);
      }
      if (pagina.productos.length < POR_PAGINA) break;
      desde += POR_PAGINA;
      await esperar(pausa);
    }
    await esperar(pausa);
    todos.push(...productos);
    return { productos, total };
  }

  for (const idGrande of secciones.vtexRecorrer) {
    const categoria = arbol.find(c => c.id === idGrande);
    if (!categoria) {
      aviso(`La categoría ${idGrande} ya no existe en ${slug}`);
      continue;
    }
    const clave = `/${idGrande}/`;
    if (hechos.has(clave)) continue; // la categoría entera ya se leyó antes

    const hijos = categoria.children || [];
    // "Artículos para el hogar" es enorme (muebles, etc.): solo se toman sus subcategorías con sección
    const soloHijosConSeccion = !Object.prototype.hasOwnProperty.call(secciones.vtex, idGrande);

    let porSubcategorias = soloHijosConSeccion ? hijos.filter(h => secciones.vtex[h.id]) : null;
    if (!porSubcategorias) {
      // Primero se intenta la categoría entera; si tiene más de 2500, se recorre por subcategorías.
      // La marca "+sub" recuerda que la entera ya se leyó y que faltan sus subcategorías.
      if (hechos.has(clave + '+sub')) porSubcategorias = hijos;
      else {
        try {
          const { productos, total } = await recorrer(clave);
          const faltanSubcategorias = total > MAXIMO_VTEX;
          await alPaso(faltanSubcategorias ? clave + '+sub' : clave, productos);
          if (faltanSubcategorias) porSubcategorias = hijos;
        } catch (error) {
          alFallar(clave, error);
        }
      }
    }

    if (porSubcategorias) {
      let todosBien = true;
      for (const h of porSubcategorias) {
        const paso = await hacerPaso(`/${idGrande}/${h.id}/`, opciones, () => recorrer(`/${idGrande}/${h.id}/`));
        if (paso.ok === false) todosBien = false;
      }
      // Toda la categoría quedó lista: se anota para no repetir nada si hay que reanudar
      if (todosBien) await alPaso(clave, []);
    }
    aviso(`${slug}: ${categoria.name} listo (${porId.size} productos leídos en esta vuelta)`);
  }

  return todos;
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
    seccion,
    marca: marcaDeNombre(nombreBonito(p.name)) // "Frijol Rojo 4 Lb - El Norteño" → "El Norteño"
  };
}

async function categoriaColonia(codigo) {
  const html = await (await descargar(`${configuraciones['la-colonia'].sitio}/categoria/${codigo}`, 'text/html')).text();
  const lista = extraerLista(textoDeLaPagina(html), 'initialProducts');
  if (!lista) throw new Error(`La página de la categoría ${codigo} de La Colonia no trae productos (quizá cambió de formato)`);
  return lista;
}

async function catalogoColonia(opciones = {}) {
  const { aviso = () => {} } = opciones;
  const pausa = configuraciones['la-colonia'].esperaEntreConsultasMs;
  const vistos = new Set();
  const todos = [];
  const { principales, detalle } = secciones.laColonia;

  // Primero las subcategorías que cambian de sección y después las categorías grandes:
  // así un producto nuevo queda en la sección más precisa (la primera vez que sale).
  const pasos = [...Object.entries(detalle), ...Object.entries(principales)];
  let fallos = 0;
  let saltados = 0;
  for (const [codigo, seccion] of pasos) {
    const paso = await hacerPaso(`/categoria/${codigo}`, opciones, async () => {
      const lista = await categoriaColonia(codigo);
      const productos = [];
      for (const p of lista) {
        // Las versiones "(Caja)" (código terminado en -C) son ventas al por mayor: se omiten
        if (!p.code || /-C$/i.test(p.code) || vistos.has(String(p.code))) continue;
        vistos.add(String(p.code));
        const resumen = resumirColonia(p, seccion);
        if (resumen.nombre) productos.push(resumen);
      }
      todos.push(...productos);
      aviso(`la-colonia: ${codigo} listo (${lista.length} productos)`);
      return { productos };
    });
    if (paso.saltado) {
      saltados++;
      continue;
    }
    if (!paso.ok) fallos++;
    await esperar(pausa);
  }
  if (fallos && fallos === pasos.length - saltados) throw new Error('No se pudo leer ninguna categoría de La Colonia');
  return todos;
}

// ══════════════ PUNTO ÚNICO ══════════════

async function leerCatalogo(slug, opciones) {
  const config = configuraciones[slug];
  if (!config) throw new Error(`No hay lector de catálogo para "${slug}"`);
  if (config.tipo === 'lacolonia') return catalogoColonia(opciones);
  return catalogoVtex(slug, opciones);
}

module.exports = { leerCatalogo, textoDeLaPagina, extraerLista, nombreBonito, resumirColonia, seccionVtex: secciones.seccionVtex };
