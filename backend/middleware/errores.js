// Ruta que no existe → 404
function noEncontrado(req, res) {
  res.status(404).json({ error: `No existe la ruta ${req.method} ${req.originalUrl}` });
}

// Cualquier error de las rutas termina aquí
// eslint-disable-next-line no-unused-vars
function manejadorErrores(error, req, res, next) {
  // Datos inválidos (campo obligatorio vacío, categoría que no existe, etc.)
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  }
  // Un id con formato incorrecto (ej: /api/listas/abc)
  if (error.name === 'CastError') {
    return res.status(400).json({ error: `Valor inválido para ${error.path}` });
  }
  // Algo repetido que debía ser único (ej: dos productos con el mismo nombre)
  if (error.code === 11000) {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  }
  console.error(error);
  res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { noEncontrado, manejadorErrores };
