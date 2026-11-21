// MARCA DE UN PRODUCTO
// --------------------
// La Unión y Walmart (VTEX) dicen la marca en sus datos (campo "brand").
// La Colonia la pone al final del nombre: "Frijol Rojo Bolsa 4 Lb - El Norteño" → "El Norteño".
// Si lo que va después del " - " tiene números, es el tamaño ("Arroz Faisan - 400 g"), no la marca.
function marcaDeNombre(nombre) {
  const texto = String(nombre || '');
  const i = texto.lastIndexOf(' - ');
  if (i < 0) return null;
  const marca = texto.slice(i + 3).trim();
  if (!marca || /\d/.test(marca) || marca.length > 40) return null;
  return marca;
}

module.exports = { marcaDeNombre };
