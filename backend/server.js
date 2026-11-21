require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const conectarDB = require('./config/db');
const { iniciarProgramador } = require('./jobs/programador');
const { noEncontrado, manejadorErrores } = require('./middleware/errores');
const ActualizacionLog = require('./models/ActualizacionLog');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // muestra en la consola cada petición que llega

// Página de inicio: confirma que la API funciona y cuándo se actualizaron los precios
app.get('/', async (req, res) => {
  const ultima = await ActualizacionLog.findOne({ fin: { $exists: true } }).sort({ fin: -1 });
  res.json({
    mensaje: 'Mi Súper API funcionando',
    ultimaActualizacionDePrecios: ultima ? ultima.fin : null,
    proximaActualizacion: `Todos los días según CRON_PRECIOS (${process.env.CRON_PRECIOS || '0 6 * * *'})`
  });
});

app.use('/api/supermercados', require('./routes/supermercados'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/precios', require('./routes/precios'));
app.use('/api/listas', require('./routes/listas'));
app.use('/api/actualizaciones', require('./routes/actualizaciones'));

// Estos dos siempre van al final
app.use(noEncontrado);
app.use(manejadorErrores);

async function iniciar() {
  await conectarDB(); // 1. primero la base de datos
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
  iniciarProgramador(); // 2. después node-cron (actualización diaria)
}

iniciar();
