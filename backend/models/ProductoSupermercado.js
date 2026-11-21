const mongoose = require('mongoose');

// ESTA ES LA "SECCIÓN DE CADA SUPERMERCADO".
// Un documento = un producto de tu app en UN supermercado.
// Ej: "Leche entera Eskimo 1 L" en Walmart, con su precio y el link de donde se lee.
const productoSupermercadoSchema = new mongoose.Schema(
  {
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    supermercado: { type: mongoose.Schema.Types.ObjectId, ref: 'Supermercado', required: true },

    // Cómo se llama el producto en la web del súper (solo informativo)
    nombreEnTienda: { type: String },
    // Página del producto en la web del súper. Sin esto, no se actualiza solo.
    urlExterna: { type: String },
    // Última vez que el producto apareció en el catálogo de la tienda (importación automática)
    vistoEnCatalogo: { type: Date },

    precioActual: { type: Number, min: 0 },   // lo que paga el cliente (con rebaja si hay)
    precioNormal: { type: Number, min: 0 },   // precio sin rebaja (para mostrar "antes C$...")
    precioAnterior: { type: Number, min: 0 }, // el precio del día anterior a un cambio
    precioPendiente: { type: Number, min: 0 }, // precio "sospechoso" esperando confirmación
    disponible: { type: Boolean, default: true },

    // 'automatica' = lo leyó el job; 'manual' = lo pusiste tú (o vino del seed)
    fuente: { type: String, enum: ['automatica', 'manual'], default: 'manual' },
    ultimaActualizacion: { type: Date },

    // Si el último intento falló, aquí queda el motivo
    ultimoError: { type: String, default: null },
    // true cuando el precio nuevo cambió demasiado y conviene revisarlo
    requiereRevision: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Un producto solo puede aparecer UNA vez por supermercado.
// Así, actualizar todos los días no crea precios repetidos.
productoSupermercadoSchema.index({ producto: 1, supermercado: 1 }, { unique: true });
// Para encontrar rápido un producto de la tienda por su link al importar
productoSupermercadoSchema.index({ supermercado: 1, urlExterna: 1 });

module.exports = mongoose.model('ProductoSupermercado', productoSupermercadoSchema);
