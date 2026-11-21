require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const conectarDB = require('./config/db');
const { iniciarProgramador } = require('./jobs/programador');
const { completarTamanos } = require('./jobs/tamanos');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');
const { leerUsuario, leerDispositivo } = require('./middleware/auth');
const ActualizacionLog = require('./models/ActualizacionLog');
const Producto = require('./models/Producto');
const Supermercado = require('./models/Supermercado');
const { pausados } = require('./helpers/pausados');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // en Render hay un "proxy" delante: así req.ip es la IP real
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev')); // muestra en la consola cada petición que llega

// Estado de la API: cuándo se actualizaron los precios y cuántos datos hay
app.get('/api/estado', async (req, res) => {
  const ultima = await ActualizacionLog.findOne({ fin: { $exists: true } }).sort({ fin: -1 });
  const { slugs, nombres } = await pausados();
  res.json({
    mensaje: 'Mi Súper API funcionando',
    ultimaActualizacionDePrecios: ultima ? ultima.fin : null,
    productos: await Producto.countDocuments(),
    supermercados: await Supermercado.countDocuments({ slug: { $nin: slugs } }),
    supermercadosPausados: nombres, // la app los oculta (ver helpers/pausados.js)
    horario: process.env.CRON_PRECIOS || '0 6 * * *'
  });
});

// En todas las rutas /api: ¿quién es? (cuenta con sesión y/o dispositivo)
app.use('/api', leerUsuario, leerDispositivo);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/supermercados', require('./routes/supermercados'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/precios', require('./routes/precios'));
app.use('/api/listas', require('./routes/listas'));
app.use('/api/compras', require('./routes/compras'));
app.use('/api/actualizaciones', require('./routes/actualizaciones'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/ofertas', require('./routes/ofertas'));

// LA PÁGINA WEB: el mismo servidor entrega la carpeta "frontend".
//   http://localhost:3000          → página de inicio (index.html)
//   http://localhost:3000/app.html → la app
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Estos dos siempre van al final
app.use(noEncontrado);
app.use(manejadorErrores);

async function iniciar() {
  await conectarDB(); // 1. primero la base de datos
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Página web:  http://localhost:${PORT}`);
    console.log(`La app:      http://localhost:${PORT}/app.html`);
  });
  iniciarProgramador(); // 2. después node-cron (actualización diaria)
  // 3. el tamaño de los productos que no lo tienen (precio por kilo, litro o unidad)
  completarTamanos().catch(error => console.error('[tamaños] Error:', error.message));
}

iniciar();
