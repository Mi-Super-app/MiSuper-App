const mongoose = require('mongoose');

// Un renglón de la lista: qué producto y cuántos
const itemSchema = new mongoose.Schema(
  {
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    cantidad: { type: Number, min: 1, default: 1 }
  },
  { _id: false }
);

// La lista de compras del usuario con su presupuesto (en córdobas)
const listaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    presupuesto: { type: Number, required: true, min: 0 },
    items: { type: [itemSchema], default: [] }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lista', listaSchema);
