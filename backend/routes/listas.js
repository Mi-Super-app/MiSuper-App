const express = require('express');
const router = express.Router();
const Lista = require('../models/Lista');
const Producto = require('../models/Producto');
const Supermercado = require('../models/Supermercado');
const ProductoSupermercado = require('../models/ProductoSupermercado');
const { pausados } = require('../helpers/pausados');
const { buscarAlternativa, preciosMinimos } = require('../helpers/alternativas');
const { productosConPrecios } = require('../helpers/precios');
const mongoose = require('mongoose');

const redondear = n => Math.round(n * 100) / 100;

/* ── ¿QUIÉN PUEDE VER UNA LISTA? ──
   - Si la lista tiene dueño (cuenta): solo ese usuario (con su sesión).
   - Si no tiene dueño: solo el dispositivo que la creó (encabezado x-dispositivo,
     una clave al azar que cada celular/compu genera y guarda).
   Si no tiene permiso, respondemos "no encontrada" (no damos pistas de que existe). */
function puedeVer(lista, req) {
  if (lista.usuario) return Boolean(req.usuarioId) && lista.usuario.equals(req.usuarioId);
  return Boolean(req.dispositivo) && lista.dispositivo === req.dispositivo;
}

// Busca la lista de la URL y revisa el permiso. La deja en req.lista
async function cargarLista(req, res, next) {
  const lista = await Lista.findById(req.params.id);
  if (!lista || !puedeVer(lista, req)) return res.status(404).json({ error: 'Lista no encontrada' });
  req.lista = lista;
  next();
}

// El dueño de las listas nuevas: la cuenta (si hay sesión) o el dispositivo
function dueno(req) {
  if (req.usuarioId) return { usuario: req.usuarioId };
  if (req.dispositivo) return { dispositivo: req.dispositivo };
  return null;
}

// GET /api/listas → MIS listas (de mi cuenta, o de este dispositivo si no tengo cuenta)
router.get('/', async (req, res) => {
  let filtro;
  if (req.usuarioId) filtro = { usuario: req.usuarioId };
  else if (req.dispositivo) filtro = { dispositivo: req.dispositivo, usuario: { $exists: false } };
  else return res.json([]);
  const listas = await Lista.find(filtro).sort('-updatedAt');
  res.json(listas);
});

// POST /api/listas  { nombre, presupuesto }
router.post('/', async (req, res) => {
  const quien = dueno(req);
  if (!quien) return res.status(400).json({ error: 'Falta el identificador del dispositivo' });
  const { nombre, presupuesto } = req.body;
  const lista = await Lista.create({ nombre, presupuesto, ...quien });
  res.status(201).json(lista);
});

// GET /api/listas/:id → una lista con los datos de sus productos
router.get('/:id', cargarLista, async (req, res) => {
  res.json(await req.lista.populate('items.producto'));
});

// PUT /api/listas/:id  { nombre?, presupuesto?, desmarcarTodo? }
// desmarcarTodo: true → quita la marca de "comprado" a todos los productos
router.put('/:id', cargarLista, async (req, res) => {
  const { nombre, presupuesto, desmarcarTodo } = req.body;
  const lista = req.lista;
  if (nombre !== undefined) lista.nombre = nombre;
  if (presupuesto !== undefined) lista.presupuesto = presupuesto;
  if (desmarcarTodo) lista.items.forEach(i => (i.comprado = false));
  await lista.save();
  res.json(await lista.populate('items.producto'));
});

// POST /api/listas/:id/duplicar  { nombre? } → copia la lista (para reutilizarla otra semana)
router.post('/:id/duplicar', cargarLista, async (req, res) => {
  const original = req.lista;
  const copia = await Lista.create({
    nombre: req.body.nombre || `${original.nombre} (copia)`,
    presupuesto: original.presupuesto,
    items: original.items.map(i => ({ producto: i.producto, cantidad: i.cantidad, comprado: false })),
    ...dueno(req)
  });
  res.status(201).json(copia);
});

// DELETE /api/listas/:id
router.delete('/:id', cargarLista, async (req, res) => {
  await req.lista.deleteOne();
  res.json({ mensaje: 'Lista eliminada' });
});

// POST /api/listas/:id/items  { productoId, cantidad }
// Si el producto ya está en la lista, suma la cantidad.
router.post('/:id/items', cargarLista, async (req, res) => {
  const { productoId, cantidad = 1 } = req.body;
  const lista = req.lista;
  const producto = await Producto.findById(productoId);
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

  const existente = lista.items.find(i => i.producto.equals(producto._id));
  if (existente) existente.cantidad += Number(cantidad);
  else lista.items.push({ producto: producto._id, cantidad: Number(cantidad) });

  await lista.save();
  res.status(201).json(await lista.populate('items.producto'));
});

// PUT /api/listas/:id/items/:productoId  { cantidad?, comprado? }
router.put('/:id/items/:productoId', cargarLista, async (req, res) => {
  const lista = req.lista;
  const item = lista.items.find(i => i.producto.equals(req.params.productoId));
  if (!item) return res.status(404).json({ error: 'Ese producto no está en la lista' });

  if (req.body.cantidad !== undefined) item.cantidad = Number(req.body.cantidad);
  if (req.body.comprado !== undefined) item.comprado = Boolean(req.body.comprado);
  await lista.save();
  res.json(await lista.populate('items.producto'));
});

// DELETE /api/listas/:id/items/:productoId
router.delete('/:id/items/:productoId', cargarLista, async (req, res) => {
  const lista = req.lista;
  lista.items = lista.items.filter(i => !i.producto.equals(req.params.productoId));
  await lista.save();
  res.json(await lista.populate('items.producto'));
});

// GET /api/listas/:id/comparar   (opcional: ?supermercados=la-colonia,walmart)
// LA FUNCIÓN PRINCIPAL DE LA APP: cuánto cuesta la lista en cada súper
// y si alcanza el presupuesto.
router.get('/:id/comparar', cargarLista, async (req, res) => {
  const lista = await req.lista.populate('items.producto');

  const items = lista.items.filter(i => i.producto); // por si se borró algún producto
  // ?supermercados=la-colonia,walmart → comparar solo en "mis supermercados" (Ajustes de la app)
  const elegidos = String(req.query.supermercados || '').split(',').filter(Boolean);
  const { slugs: slugsPausados } = await pausados();
  const visibles = elegidos.length ? elegidos.filter(s => !slugsPausados.includes(s)) : null;
  const supermercados = await Supermercado.find(visibles ? { slug: { $in: visibles } } : { slug: { $nin: slugsPausados } }).sort('nombre');
  const enlaces = await ProductoSupermercado.find({
    producto: { $in: items.map(i => i.producto._id) },
    precioActual: { $gt: 0 },
    disponible: true
  });

  // Busca el precio de un producto en un súper (o null si no hay)
  const precioDe = (productoId, superId) => {
    const e = enlaces.find(x => x.producto.equals(productoId) && x.supermercado.equals(superId));
    return e ? e.precioActual : null;
  };

  // 1) Comprando TODO en un mismo súper
  const porSupermercado = supermercados.map(s => {
    let total = 0;
    const faltantes = [];
    for (const item of items) {
      const precio = precioDe(item.producto._id, s._id);
      if (precio === null) faltantes.push(item.producto.nombre);
      else total += precio * item.cantidad;
    }
    total = redondear(total);
    return {
      supermercado: s.nombre,
      slug: s.slug,
      total,
      completo: faltantes.length === 0, // false si algún producto no tiene precio ahí
      faltantes,
      // Solo cuenta como "dentro del presupuesto" si se pueden comprar TODOS los productos ahí
      dentroDelPresupuesto: faltantes.length === 0 && total <= lista.presupuesto,
      diferencia: redondear(lista.presupuesto - total) // positivo = te sobra; negativo = te falta
    };
  });

  const completos = porSupermercado.filter(s => s.completo);
  const mejorSupermercado = completos.length
    ? completos.reduce((a, b) => (b.total < a.total ? b : a)).supermercado
    : null;

  // 2) Comprando cada producto donde está más barato
  let totalCombinado = 0;
  const detalleCombinado = items.map(item => {
    const opciones = supermercados
      .map(s => ({ supermercado: s.nombre, precio: precioDe(item.producto._id, s._id) }))
      .filter(o => o.precio !== null);
    if (opciones.length === 0) {
      return { producto: item.producto.nombre, cantidad: item.cantidad, supermercado: null, precio: null, subtotal: 0 };
    }
    const mejor = opciones.reduce((a, b) => (b.precio < a.precio ? b : a));
    const subtotal = redondear(mejor.precio * item.cantidad);
    totalCombinado += subtotal;
    return { producto: item.producto.nombre, cantidad: item.cantidad, ...mejor, subtotal };
  });
  totalCombinado = redondear(totalCombinado);

  res.json({
    lista: { id: lista._id, nombre: lista.nombre, presupuesto: lista.presupuesto, cantidadProductos: items.length },
    porSupermercado,
    mejorSupermercado,
    combinado: {
      total: totalCombinado,
      dentroDelPresupuesto: totalCombinado <= lista.presupuesto,
      diferencia: redondear(lista.presupuesto - totalCombinado),
      detalle: detalleCombinado
    }
  });
});

// Los supermercados donde comparar: ?supermercados=la-colonia,walmart (o todos), sin los pausados
async function supersElegidos(req) {
  const { slugs: slugsPausados } = await pausados();
  const elegidos = String(req.query.supermercados || '').split(',').filter(Boolean);
  const filtro = elegidos.length ? { slug: { $in: elegidos, $nin: slugsPausados } } : { slug: { $nin: slugsPausados } };
  return Supermercado.find(filtro).select('_id nombre').lean();
}

// GET /api/listas/:id/alternativas   (opcional: ?supermercados=la-colonia,walmart)
// "¿Hay algo más barato?": para cada producto de la lista (que no esté marcado como comprado)
// busca uno equivalente que cueste al menos 5 % menos por kilo, litro o unidad.
// Responde { [productoId]: { producto (con sus precios), supermercado, precio, antes, ahorro } }
router.get('/:id/alternativas', cargarLista, async (req, res) => {
  const lista = await req.lista.populate('items.producto');
  const supers = await supersElegidos(req);
  const ids = supers.map(s => s._id);
  const nombreDe = new Map(supers.map(s => [String(s._id), s.nombre]));
  const items = lista.items.filter(i => i.producto && !i.comprado);
  const actuales = await preciosMinimos(items.map(i => i.producto._id), ids);

  const respuesta = {};
  for (const item of items) {
    const actual = actuales.get(String(item.producto._id));
    if (!actual) continue;
    const alternativa = await buscarAlternativa(item.producto, ids, actual.precio);
    if (!alternativa) continue;
    const [conPrecios] = await productosConPrecios([alternativa.producto]);
    respuesta[item.producto._id] = {
      producto: conPrecios,
      supermercado: nombreDe.get(String(alternativa.supermercado)),
      precio: alternativa.precio, //   precio de la alternativa
      antes: actual.precio, //          precio más bajo del producto que está en la lista
      ahorro: Math.round(alternativa.ahorro * 100) // % más barato por kilo, litro o unidad
    };
  }
  res.json(respuesta);
});

// POST /api/listas/:id/items/:productoId/cambiar  { productoId: 'el nuevo' }
// Cambia un producto de la lista por otro, con la misma cantidad.
// Si el nuevo ya estaba en la lista, se suman las cantidades.
router.post('/:id/items/:productoId/cambiar', cargarLista, async (req, res) => {
  const lista = req.lista;
  const item = lista.items.find(i => i.producto.equals(req.params.productoId));
  if (!item) return res.status(404).json({ error: 'Ese producto no está en la lista' });
  const nuevo = mongoose.isValidObjectId(req.body.productoId) ? await Producto.findById(req.body.productoId) : null;
  if (!nuevo) return res.status(404).json({ error: 'Producto no encontrado' });

  const yaEsta = lista.items.find(i => i.producto.equals(nuevo._id));
  if (yaEsta && yaEsta !== item) {
    yaEsta.cantidad += item.cantidad;
    lista.items = lista.items.filter(i => i !== item);
  } else {
    item.producto = nuevo._id;
    item.comprado = false;
  }
  await lista.save();
  res.json(await lista.populate('items.producto'));
});

module.exports = router;
