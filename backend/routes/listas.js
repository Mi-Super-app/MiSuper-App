const express = require('express');
const router = express.Router();
const Lista = require('../models/Lista');
const Producto = require('../models/Producto');
const Supermercado = require('../models/Supermercado');
const ProductoSupermercado = require('../models/ProductoSupermercado');

const mongoose = require('mongoose');

const redondear = n => Math.round(n * 100) / 100;

// GET /api/listas?ids=ID1,ID2 → solo las listas pedidas
// (cada celular/computadora guarda los ids de SUS listas y solo pide esas)
// GET /api/listas            → todas (útil para pruebas)
router.get('/', async (req, res) => {
  const filtro = {};
  if (req.query.ids !== undefined) {
    const ids = String(req.query.ids)
      .split(',')
      .filter(id => mongoose.Types.ObjectId.isValid(id));
    filtro._id = { $in: ids };
  }
  const listas = await Lista.find(filtro).sort('-updatedAt');
  res.json(listas);
});

// POST /api/listas  { nombre, presupuesto }
router.post('/', async (req, res) => {
  const { nombre, presupuesto } = req.body;
  const lista = await Lista.create({ nombre, presupuesto });
  res.status(201).json(lista);
});

// GET /api/listas/:id → una lista con los datos de sus productos
router.get('/:id', async (req, res) => {
  const lista = await Lista.findById(req.params.id).populate('items.producto');
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  res.json(lista);
});

// PUT /api/listas/:id  { nombre?, presupuesto?, desmarcarTodo? }
// desmarcarTodo: true → quita la marca de "comprado" a todos los productos
router.put('/:id', async (req, res) => {
  const { nombre, presupuesto, desmarcarTodo } = req.body;
  const lista = await Lista.findById(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  if (nombre !== undefined) lista.nombre = nombre;
  if (presupuesto !== undefined) lista.presupuesto = presupuesto;
  if (desmarcarTodo) lista.items.forEach(i => (i.comprado = false));
  await lista.save();
  res.json(await lista.populate('items.producto'));
});

// POST /api/listas/:id/duplicar  { nombre? } → copia la lista (para reutilizarla otra semana)
router.post('/:id/duplicar', async (req, res) => {
  const original = await Lista.findById(req.params.id);
  if (!original) return res.status(404).json({ error: 'Lista no encontrada' });
  const copia = await Lista.create({
    nombre: req.body.nombre || `${original.nombre} (copia)`,
    presupuesto: original.presupuesto,
    items: original.items.map(i => ({ producto: i.producto, cantidad: i.cantidad, comprado: false }))
  });
  res.status(201).json(copia);
});

// DELETE /api/listas/:id
router.delete('/:id', async (req, res) => {
  const lista = await Lista.findByIdAndDelete(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  res.json({ mensaje: 'Lista eliminada' });
});

// POST /api/listas/:id/items  { productoId, cantidad }
// Si el producto ya está en la lista, suma la cantidad.
router.post('/:id/items', async (req, res) => {
  const { productoId, cantidad = 1 } = req.body;
  const lista = await Lista.findById(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  const producto = await Producto.findById(productoId);
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

  const existente = lista.items.find(i => i.producto.equals(producto._id));
  if (existente) existente.cantidad += Number(cantidad);
  else lista.items.push({ producto: producto._id, cantidad: Number(cantidad) });

  await lista.save();
  res.status(201).json(await lista.populate('items.producto'));
});

// PUT /api/listas/:id/items/:productoId  { cantidad?, comprado? }
router.put('/:id/items/:productoId', async (req, res) => {
  const lista = await Lista.findById(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  const item = lista.items.find(i => i.producto.equals(req.params.productoId));
  if (!item) return res.status(404).json({ error: 'Ese producto no está en la lista' });

  if (req.body.cantidad !== undefined) item.cantidad = Number(req.body.cantidad);
  if (req.body.comprado !== undefined) item.comprado = Boolean(req.body.comprado);
  await lista.save();
  res.json(await lista.populate('items.producto'));
});

// DELETE /api/listas/:id/items/:productoId
router.delete('/:id/items/:productoId', async (req, res) => {
  const lista = await Lista.findById(req.params.id);
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });
  lista.items = lista.items.filter(i => !i.producto.equals(req.params.productoId));
  await lista.save();
  res.json(await lista.populate('items.producto'));
});

// GET /api/listas/:id/comparar
// LA FUNCIÓN PRINCIPAL DE LA APP: cuánto cuesta la lista en cada súper
// y si alcanza el presupuesto.
router.get('/:id/comparar', async (req, res) => {
  const lista = await Lista.findById(req.params.id).populate('items.producto');
  if (!lista) return res.status(404).json({ error: 'Lista no encontrada' });

  const items = lista.items.filter(i => i.producto); // por si se borró algún producto
  const supermercados = await Supermercado.find().sort('nombre');
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

module.exports = router;
