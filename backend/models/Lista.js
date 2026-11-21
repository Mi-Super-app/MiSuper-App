const mongoose = require('mongoose');

// Un renglón de la lista: qué producto, cuántos y si ya se echó al carrito
const itemSchema = new mongoose.Schema(
  {
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    cantidad: { type: Number, min: 1, default: 1 },
    comprado: { type: Boolean, default: false }
  },
  { _id: false }
);

// La lista de compras con su presupuesto (en córdobas)
const listaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    presupuesto: { type: Number, required: true, min: 0 },
    items: { type: [itemSchema], default: [] },
    // Dueño de la lista (solo si la persona tiene cuenta). Sin dueño = lista "de dispositivo".
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },
    // Clave del dispositivo que la creó (solo para listas sin cuenta). No se manda al navegador.
    dispositivo: { type: String, index: true }
  },
  { timestamps: true }
);

listaSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.dispositivo;
    return ret;
  }
});

module.exports = mongoose.model('Lista', listaSchema);
