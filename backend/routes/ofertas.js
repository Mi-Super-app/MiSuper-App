// OFERTAS DE HOY
// --------------
// GET /api/ofertas → productos cuyo precio de hoy es MENOR que su precio normal,
//                    del mayor al menor descuento.
//
// Filtros (opcionales):
//   ?supermercado=walmart,la-union   → solo en esos súper
//   ?categoria=lacteos               → solo una sección
//   ?pagina=2&limite=30              → de 30 en 30 (máx. 100)
//
// Respuesta:
//   {
//     total, pagina, paginas,
//     categorias: { lacteos: 12, bebidas: 30, ... },   ← cuántas ofertas hay en cada sección
//     ofertas: [ { ...producto con sus precios,
//                  oferta: { supermercado: 'Walmart', precio: 85, antes: 100, descuento: 15 } } ]
//   }
// Si el mismo producto está en oferta en dos súper, se muestra una vez, con el mayor descuento.

const express = require('express');
const router = express.Router();
const Supermercado = require('../models/Supermercado');
const ProductoSupermercado = require('../models/ProductoSupermercado');
const Producto = require('../models/Producto');
const { productosConPrecios } = require('../helpers/precios');
const { pausados } = require('../helpers/pausados');

const LIMITE_NORMAL = 30;
const LIMITE_MAXIMO = 100;
const DESCUENTO_MINIMO = 0.01; // menos del 1 % no es una oferta de verdad
const DESCUENTO_MAXIMO = 0.9; //  más del 90 % seguramente es un error de la tienda
const DIAS_VIGENTE = 3; //        precios revisados en los últimos 3 días (si no, la oferta pudo terminar)

router.get('/', async (req, res) => {
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || LIMITE_NORMAL, 1), LIMITE_MAXIMO);
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
  const categoria = req.query.categoria ? String(req.query.categoria) : null;

  // Los supermercados donde buscar (sin los pausados)
  const { slugs: slugsPausados } = await pausados();
  const pedidos = req.query.supermercado ? String(req.query.supermercado).split(',').filter(Boolean) : null;
  const filtroSuper = pedidos ? { slug: { $in: pedidos, $nin: slugsPausados } } : { slug: { $nin: slugsPausados } };
  const supers = await Supermercado.find(filtroSuper).select('_id nombre').lean();
  if (!supers.length) return res.json({ total: 0, pagina, paginas: 0, categorias: {}, ofertas: [] });
  const nombreDe = new Map(supers.map(s => [String(s._id), s.nombre]));

  const desde = new Date(Date.now() - DIAS_VIGENTE * 24 * 60 * 60 * 1000);
  const soloCategoria = categoria ? [{ $match: { 'p.categoria': categoria } }] : [];
  const [resultado] = await ProductoSupermercado.aggregate([
    {
      $match: {
        supermercado: { $in: supers.map(s => s._id) },
        disponible: true,
        precioActual: { $gt: 0 },
        precioNormal: { $gt: 0 },
        ultimaActualizacion: { $gte: desde },
        $expr: { $lt: ['$precioActual', '$precioNormal'] }
      }
    },
    { $addFields: { descuento: { $subtract: [1, { $divide: ['$precioActual', '$precioNormal'] }] } } },
    { $match: { descuento: { $gte: DESCUENTO_MINIMO, $lte: DESCUENTO_MAXIMO } } },
    // Un producto una sola vez: el súper donde tiene el mayor descuento
    { $sort: { descuento: -1 } },
    {
      $group: {
        _id: '$producto',
        descuento: { $first: '$descuento' },
        supermercado: { $first: '$supermercado' },
        precio: { $first: '$precioActual' },
        antes: { $first: '$precioNormal' }
      }
    },
    { $lookup: { from: Producto.collection.name, localField: '_id', foreignField: '_id', as: 'p', pipeline: [{ $project: { categoria: 1 } }] } },
    { $unwind: '$p' },
    {
      $facet: {
        // cuántas ofertas hay en cada sección (para los botones de filtro)
        categorias: [{ $group: { _id: '$p.categoria', n: { $sum: 1 } } }],
        // la página pedida
        pagina: [
          ...soloCategoria,
          { $sort: { descuento: -1, _id: 1 } },
          { $skip: (pagina - 1) * limite },
          { $limit: limite }
        ],
        // cuántas hay en total (con el filtro de sección)
        total: [...soloCategoria, { $count: 'n' }]
      }
    }
  ]);

  const categorias = Object.fromEntries(resultado.categorias.map(c => [c._id, c.n]));
  const filas = resultado.pagina;
  const total = resultado.total[0] ? resultado.total[0].n : 0;

  const productos = await Producto.find({ _id: { $in: filas.map(f => f._id) } }).lean();
  const conPrecios = new Map((await productosConPrecios(productos)).map(p => [String(p.id), p]));
  const ofertas = filas
    .map(f => {
      const p = conPrecios.get(String(f._id));
      if (!p) return null;
      return {
        ...p,
        oferta: {
          supermercado: nombreDe.get(String(f.supermercado)),
          precio: f.precio,
          antes: f.antes,
          descuento: Math.round(f.descuento * 100)
        }
      };
    })
    .filter(Boolean);

  res.json({ total, pagina, paginas: Math.ceil(total / limite), categorias, ofertas });
});

module.exports = router;
