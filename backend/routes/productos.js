const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const Supermercado = require('../models/Supermercado');
const ProductoSupermercado = require('../models/ProductoSupermercado');
const HistorialPrecio = require('../models/HistorialPrecio');
const { productosConPrecios } = require('../helpers/precios');

// Escapa caracteres especiales para usar el texto del usuario en una búsqueda
function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "cafe" también encuentra "Café" y "CAFÉ"; "pina" encuentra "piña"
const VARIANTES = { a: '[aáàä]', e: '[eéèë]', i: '[iíìï]', o: '[oóòö]', u: '[uúùü]', n: '[nñ]' };
function regexSinTildes(palabra) {
  const limpia = palabra.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return escaparRegex(limpia)
    .split('')
    .map(c => VARIANTES[c] || c)
    .join('');
}

const LIMITE_NORMAL = 60;
const LIMITE_MAXIMO = 200;

// GET /api/productos                      → los productos del catálogo base (data/productos.js):
//                                            el mismo producto revisado en las 3 tiendas
// GET /api/productos?q=leche              → busca en TODOS los productos (también los importados)
// GET /api/productos?categoria=lacteos    → una sección completa
// GET /api/productos?supermercado=walmart → solo los que tienen precio en ese súper
//                   ?supermercado=walmart,la-union → en cualquiera de esos
// GET /api/productos?ids=ID1,ID2          → productos exactos (ej: los de una lista de compras)
// GET /api/productos?todos=1              → todos, por páginas
// GET /api/productos?...&orden=precio     → el más barato primero (en los súper de "supermercado")
// Páginas: &pagina=2&limite=60 (máx. 200). El total viene en el encabezado X-Total.
router.get('/', async (req, res) => {
  const { q, categoria, supermercado, ids, pagina: paginaTxt, limite: limiteTxt, todos, orden } = req.query;
  const filtro = {};
  const buscaTodo = Boolean(q || categoria || supermercado || ids || paginaTxt || limiteTxt || todos);
  if (!buscaTodo) filtro.origen = { $ne: 'importado' };

  if (q) {
    const palabras = String(q).trim().split(/\s+/).filter(Boolean).slice(0, 8);
    if (palabras.length) filtro.$and = palabras.map(p => ({ nombre: { $regex: regexSinTildes(p), $options: 'i' } }));
  }
  if (categoria) filtro.categoria = String(categoria);

  let soloIds = null;
  if (ids) soloIds = String(ids).split(',').filter(id => mongoose.isValidObjectId(id)).slice(0, LIMITE_MAXIMO);

  // Los supermercados donde buscar precios (todos si no se dice)
  let supers = null;
  if (supermercado) {
    supers = await Supermercado.find({ slug: { $in: String(supermercado).split(',') } }).select('_id').lean();
    if (!supers.length) return res.status(404).json({ error: 'Supermercado no encontrado' });
    const conPrecio = await ProductoSupermercado.distinct('producto', {
      supermercado: { $in: supers.map(s => s._id) },
      precioActual: { $gt: 0 },
      disponible: true
    });
    const conjunto = new Set(conPrecio.map(String));
    soloIds = soloIds ? soloIds.filter(id => conjunto.has(String(id))) : conPrecio;
  }
  if (soloIds) filtro._id = { $in: soloIds };

  const limite = Math.min(Math.max(parseInt(limiteTxt, 10) || (buscaTodo ? LIMITE_NORMAL : LIMITE_MAXIMO), 1), LIMITE_MAXIMO);
  const pagina = Math.max(parseInt(paginaTxt, 10) || 1, 1);

  // Más barato primero: se ordena por el precio más bajo entre los supermercados elegidos
  if (orden === 'precio') {
    const candidatos = await Producto.find(filtro).distinct('_id');
    const coincide = { producto: { $in: candidatos }, precioActual: { $gt: 0 }, disponible: true };
    if (supers) coincide.supermercado = { $in: supers.map(s => s._id) };
    const [resultado] = await ProductoSupermercado.aggregate([
      { $match: coincide },
      { $group: { _id: '$producto', minimo: { $min: '$precioActual' } } },
      { $sort: { minimo: 1, _id: 1 } },
      { $facet: { pagina: [{ $skip: (pagina - 1) * limite }, { $limit: limite }], total: [{ $count: 'n' }] } }
    ]);
    const orden_ = resultado.pagina.map(r => String(r._id));
    const encontrados = await Producto.find({ _id: { $in: resultado.pagina.map(r => r._id) } }).lean();
    encontrados.sort((a, b) => orden_.indexOf(String(a._id)) - orden_.indexOf(String(b._id)));
    res.set('X-Total', String(resultado.total[0] ? resultado.total[0].n : 0));
    res.set('Access-Control-Expose-Headers', 'X-Total');
    return res.json(await productosConPrecios(encontrados));
  }

  const [productos, total] = await Promise.all([
    // Primero los del catálogo base (se comparan en las 3 tiendas), después los importados
    Producto.find(filtro).sort({ origen: 1, nombre: 1 }).skip((pagina - 1) * limite).limit(limite).lean(),
    Producto.countDocuments(filtro)
  ]);
  res.set('X-Total', String(total));
  res.set('Access-Control-Expose-Headers', 'X-Total');
  res.json(await productosConPrecios(productos));
});

// GET /api/productos/categorias → lista de categorías válidas (útil para el frontend)
router.get('/categorias', (req, res) => {
  res.json(Producto.CATEGORIAS);
});

// GET /api/productos/resumen → cuántos productos hay en cada sección
router.get('/resumen', async (req, res) => {
  const filas = await Producto.aggregate([{ $group: { _id: '$categoria', total: { $sum: 1 } } }]);
  res.json(Object.fromEntries(filas.map(f => [f._id, f.total])));
});

// GET /api/productos/:id → un producto con sus precios
router.get('/:id', async (req, res) => {
  const producto = await Producto.findById(req.params.id);
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
  const [resultado] = await productosConPrecios([producto]);
  res.json(resultado);
});

// GET /api/productos/:id/historial → cómo ha cambiado su precio en cada súper
router.get('/:id/historial', async (req, res) => {
  const historial = await HistorialPrecio.find({ producto: req.params.id })
    .populate('supermercado', 'nombre')
    .sort('fecha');
  res.json(
    historial.map(h => ({ supermercado: h.supermercado ? h.supermercado.nombre : null, valor: h.valor, fecha: h.fecha }))
  );
});

module.exports = router;
