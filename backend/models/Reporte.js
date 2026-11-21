const mongoose = require('mongoose');

// "Reportar un precio incorrecto" (Ajustes → Acerca de, en la app).
// Los ves en GET /api/actualizaciones/reportes (protegido con ADMIN_CLAVE).
const reporteSchema = new mongoose.Schema(
  {
    mensaje: { type: String, required: true, trim: true, maxlength: 1000 },
    producto: { type: String, trim: true, maxlength: 200 }, //   qué producto (texto libre)
    contacto: { type: String, trim: true, maxlength: 120 }, //   correo o teléfono, si lo deja
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    revisado: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reporte', reporteSchema);
