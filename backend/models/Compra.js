const mongoose = require('mongoose');

// UNA COMPRA YA HECHA (para el historial de gastos por mes).
// Se guarda cuando la persona toca "Terminé mi compra" en su lista.
// Guardamos el nombre de la lista y del súper como texto: así el historial
// no cambia aunque después se borre o renombre la lista.
const compraSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    supermercado: { type: String, required: true, trim: true, maxlength: 40 }, // 'Walmart', 'Varios'…
    total: { type: Number, required: true, min: 0, max: 10000000 },
    presupuesto: { type: Number, min: 0 },
    cantidadProductos: { type: Number, min: 0, default: 0 },
    // Cuánto se ahorró comprando ahí en vez de en el súper más caro (con los precios de ese día).
    // Ej: la lista costaba C$1,200 en Walmart y C$1,050 en La Unión → ahorro: 150, comparadoCon: 'Walmart'.
    // Las compras guardadas antes de esto no lo tienen.
    ahorro: { type: Number, min: 0, max: 10000000 },
    comparadoCon: { type: String, trim: true, maxlength: 40 },
    fecha: { type: Date, default: Date.now, index: true },
    lista: { type: mongoose.Schema.Types.ObjectId, ref: 'Lista' },

    // Dueño: igual que las listas (cuenta, o dispositivo si no tiene cuenta)
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', index: true },
    dispositivo: { type: String, index: true }
  },
  { timestamps: true }
);

compraSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.dispositivo;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Compra', compraSchema);
