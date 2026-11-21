require('dotenv').config();
const mongoose = require('mongoose');
const Supermercado = require('./models/Supermercado');
const Producto = require('./models/Producto');
const Precio = require('./models/Precio');

// Orden de precios: [La Colonia, La Unión, Maxi Palí, Palí]
const supermercados = [
  { nombre: 'La Colonia', tipo: 'Premium' },
  { nombre: 'La Unión', tipo: 'Nacional' },
  { nombre: 'Maxi Palí', tipo: 'Mayoreo' },
  { nombre: 'Palí', tipo: 'Descuentos' }
];

const productos = [
  { nombre: 'Pollo entero (kg)', categoria: 'carnes', precios: [180, 195, 165, 158] },
  { nombre: 'Carne molida (lb)', categoria: 'carnes', precios: [110, 105, 98, 102] },
  { nombre: 'Chuleta cerdo (lb)', categoria: 'carnes', precios: [145, 138, 130, 135] },
  { nombre: 'Salchicha Dino (12un)', categoria: 'carnes', precios: [82, 78, 72, 75] },
  { nombre: 'Filete tilapia (lb)', categoria: 'carnes', precios: [125, 118, 110, 115] },

  { nombre: 'Leche Eskimo (lt)', categoria: 'lacteos', precios: [52, 50, 46, 48] },
  { nombre: 'Queso seco (lb)', categoria: 'lacteos', precios: [95, 90, 82, 86] },
  { nombre: 'Crema (500ml)', categoria: 'lacteos', precios: [68, 65, 60, 62] },
  { nombre: 'Yogurt Dos Pinos', categoria: 'lacteos', precios: [38, 36, 34, 35] },
  { nombre: 'Mantequilla (200g)', categoria: 'lacteos', precios: [72, 68, 63, 66] },

  { nombre: 'Ajax multiusos (750ml)', categoria: 'limpieza', precios: [55, 52, 48, 50] },
  { nombre: 'Detergente Xtra (1kg)', categoria: 'limpieza', precios: [88, 84, 78, 80] },
  { nombre: 'Suavitel (500ml)', categoria: 'limpieza', precios: [42, 40, 37, 38] },
  { nombre: 'Esponja Scotch-Brite', categoria: 'limpieza', precios: [28, 26, 23, 25] },
  { nombre: 'Fabuloso (1lt)', categoria: 'limpieza', precios: [65, 62, 57, 59] },

  { nombre: 'Shampoo H&S (400ml)', categoria: 'higiene', precios: [148, 140, 132, 138] },
  { nombre: 'Jabón Dove (3un)', categoria: 'higiene', precios: [95, 90, 84, 88] },
  { nombre: 'Pasta dental Colgate', categoria: 'higiene', precios: [58, 55, 50, 52] },
  { nombre: 'Papel higiénico (4r)', categoria: 'higiene', precios: [72, 68, 63, 65] },
  { nombre: 'Desodorante Rexona', categoria: 'higiene', precios: [118, 112, 104, 108] }
];

async function cargar() {
  await mongoose.connect(process.env.MONGODB_URI);

  await Precio.deleteMany({});
  await Producto.deleteMany({});
  await Supermercado.deleteMany({});

  const supers = await Supermercado.insertMany(supermercados);

  for (const p of productos) {
    const prod = await Producto.create({ nombre: p.nombre, categoria: p.categoria });
    const docs = p.precios.map((valor, i) => ({
      producto: prod._id,
      supermercado: supers[i]._id,
      valor
    }));
    await Precio.insertMany(docs);
  }

  console.log('Datos cargados: 4 supermercados, 20 productos, 80 precios');
  await mongoose.disconnect();
}

cargar().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});