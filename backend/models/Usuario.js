const mongoose = require('mongoose');

// Una cuenta de Mi Súper (opcional: la app también se usa sin cuenta).
// La contraseña NUNCA se guarda tal cual: se guarda "cifrada" (hash con bcrypt).
const usuarioSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

// Al convertir a JSON (para mandarlo al navegador) quitamos el hash
usuarioSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Usuario', usuarioSchema);
