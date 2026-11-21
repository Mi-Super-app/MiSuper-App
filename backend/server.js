require('dotenv').config();
const express = require('express');
const cors = require('cors');
const conectarDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

conectarDB();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensaje: 'Mi Súper API funcionando' });
});

app.use('/api/supermercados', require('./routes/supermercados'));
app.use('/api/precios', require('./routes/precios'));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});