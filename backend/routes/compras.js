// HISTORIAL DE GASTOS
//   GET    /api/compras         → mis compras de los últimos 2 años + total de cada mes
//   POST   /api/compras         { nombre, supermercado, total, presupuesto?, cantidadProductos?, fecha?, listaId? }
//   DELETE /api/compras/:id
//
// Igual que las listas: son de la cuenta (si hay sesión) o de este dispositivo.

const express = require('express');
const router = express.Router();
const Compra = require('../models/Compra');

function filtroDueno(req) {
  if (req.usuarioId) return { usuario: req.usuarioId };
  if (req.dispositivo) return { dispositivo: req.dispositivo, usuario: { $exists: false } };
  return null;
}

// "2026-11" según la hora de Nicaragua (UTC-6, sin horario de verano)
function claveMes(fecha) {
  const local = new Date(fecha.getTime() - 6 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

router.get('/', async (req, res) => {
  const filtro = filtroDueno(req);
  if (!filtro) return res.json({ meses: [], compras: [] });

  const desde = new Date();
  desde.setMonth(desde.getMonth() - 24);
  const compras = await Compra.find({ ...filtro, fecha: { $gte: desde } }).sort('-fecha').limit(1000);

  const porMes = new Map();
  for (const c of compras) {
    const mes = claveMes(c.fecha);
    const m = porMes.get(mes) || { mes, total: 0, compras: 0 };
    m.total = Math.round((m.total + c.total) * 100) / 100;
    m.compras++;
    porMes.set(mes, m);
  }
  res.json({ meses: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)), compras });
});

router.post('/', async (req, res) => {
  const filtro = filtroDueno(req);
  if (!filtro) return res.status(400).json({ error: 'Falta el identificador del dispositivo' });

  const total = Number(req.body.total);
  if (!(total > 0)) return res.status(400).json({ error: 'Escribí cuánto pagaste' });

  let fecha = req.body.fecha ? new Date(req.body.fecha) : new Date();
  if (isNaN(fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  if (fecha > new Date(Date.now() + 24 * 60 * 60 * 1000)) return res.status(400).json({ error: 'La fecha no puede ser futura' });

  const compra = await Compra.create({
    nombre: String(req.body.nombre || 'Compra').slice(0, 60),
    supermercado: String(req.body.supermercado || 'Varios').slice(0, 40),
    total,
    presupuesto: Number(req.body.presupuesto) || undefined,
    cantidadProductos: Number(req.body.cantidadProductos) || 0,
    fecha,
    lista: req.body.listaId || undefined,
    ...(req.usuarioId ? { usuario: req.usuarioId } : { dispositivo: req.dispositivo })
  });
  res.status(201).json(compra);
});

router.delete('/:id', async (req, res) => {
  const filtro = filtroDueno(req);
  const r = filtro ? await Compra.deleteOne({ _id: req.params.id, ...filtro }) : { deletedCount: 0 };
  if (!r.deletedCount) return res.status(404).json({ error: 'Compra no encontrada' });
  res.json({ mensaje: 'Compra eliminada' });
});

module.exports = router;
