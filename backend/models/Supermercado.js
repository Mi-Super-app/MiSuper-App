const mongoose = require('mongoose');

// Cada supermercado tiene un "slug": un nombre corto, sin tildes ni espacios,
// que usamos en las URLs y en el código (ej: 'la-colonia').
const supermercadoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true },   // 'La Colonia'
    slug: { type: String, required: true, unique: true },     // 'la-colonia'
    tipo: { type: String },
    sitioWeb: { type: String },
    // Si es true, la actualización diaria lee sus precios de internet
    actualizacionAutomatica: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Supermercado', supermercadoSchema);
