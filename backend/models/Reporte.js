const mongoose = require('mongoose');

// "Reportar un precio incorrecto" (Ajustes → Acerca de, en la app).
// Los ves en GET /api/actualizaciones/reportes (protegido con ADMIN_CLAVE).
const reporteSchema = new mongoose.Schema(
  {
    mensaje: { type: String, required: true, trim: true, maxlength: 1000 },
    producto: { type: String, trim: true, maxlength: 200 }, //   qué producto (texto libre)
    contacto: { type: String, trim: true, maxlength: 120 }, //   correo, si lo deja (no se piden teléfonos)
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    revisado: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Se borran solos a los 6 meses de recibidos (MongoDB los elimina automáticamente).
// Este plazo está escrito en la Política de privacidad (frontend/privacidad.html):
// si lo cambias aquí, cámbialo también allá.
const SEIS_MESES = 182 * 24 * 60 * 60; // en segundos
reporteSchema.index({ createdAt: 1 }, { expireAfterSeconds: SEIS_MESES });

module.exports = mongoose.model('Reporte', reporteSchema);
