<div align="center">

<img src="frontend/img/icono.svg" alt="Mi Súper" width="96">

# Mi Súper

**Tu supermercado inteligente.**
Compará precios de La Colonia, La Unión y Walmart, armá tu lista de compras con un presupuesto y sabé dónde te conviene comprar antes de salir de tu casa.

[**🛒 Abrir Mi Súper**](https://misuperapp-p75g.onrender.com) · [Abrir la app](https://misuperapp-p75g.onrender.com/app.html) · [Términos de uso](https://misuperapp-p75g.onrender.com/terminos.html) · [Privacidad](https://misuperapp-p75g.onrender.com/privacidad.html)

![Versión](https://img.shields.io/badge/versión-2.2.0-2ec4a6)
![Node](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-instalable-5A0FC8?logo=pwa&logoColor=white)

</div>

---

## ¿Qué es Mi Súper?

Mi Súper es una aplicación web gratuita que ayuda a las familias nicaragüenses a **planear sus compras según su presupuesto**. Muestra los precios de más de 18,000 productos de tres supermercados, se actualiza sola todos los días y te dice en qué súper sale más barata tu lista completa.

Funciona en celular y computadora, y se puede **instalar como app** desde el navegador (PWA).

> **Aviso:** Mi Súper es un proyecto independiente. No está afiliado a La Colonia, La Unión, Walmart ni a las empresas propietarias de esas tiendas. Los precios son **referenciales**; el precio válido siempre es el de la tienda.

<!--
## Capturas

Agregá aquí capturas de la app (guardalas en docs/capturas/):

| Inicio | Productos | Comparar |
|---|---|---|
| ![Inicio](docs/capturas/inicio.png) | ![Productos](docs/capturas/productos.png) | ![Comparar](docs/capturas/comparar.png) |
-->

## Funciones

### 🛒 Productos y precios
- Catálogo de **La Colonia, La Unión y Walmart**, organizado por secciones.
- Precios **actualizados automáticamente todos los días** a las 6:00 a.m.
- Búsqueda y filtros por sección.
- Precio de cada producto en cada súper, con el más barato marcado.
- **Precio por unidad** (C$/kg, C$/L, C$/und) para comparar tamaños distintos.
- **Historial de precios** con gráfico de 30 o 90 días.
- **Ofertas de hoy**: descuentos ordenados por porcentaje, con filtros por súper y sección.

### 📝 Listas de compras
- Varias listas, cada una con su **presupuesto**.
- Marcás los productos mientras comprás y la lista avisa si te pasás del presupuesto.
- Duplicar, renombrar y desmarcar listas para reutilizarlas.
- **"¿Hay algo más barato?"**: sugiere un producto equivalente de otra marca, al menos 5 % más barato.
- Compartir la lista por **WhatsApp**, con precios y el súper más barato.

### 📊 Comparar y gastos
- Total de la lista en cada súper y cuál conviene más.
- Aviso cuando a un súper le faltan productos.
- **Mis gastos**: total del mes, comparación con el mes anterior, cuánto ahorraste y gráfico de los últimos 6 meses.

### 👤 Cuenta (opcional)
- Sin cuenta, las listas quedan guardadas en ese dispositivo.
- Con cuenta, ves tus listas en el celular y en la computadora.
- Cambiar nombre y contraseña, recuperar la contraseña por correo y eliminar la cuenta.

### ⚙️ Ajustes
- Idioma **español o inglés**.
- Tema claro, oscuro o automático, y letra grande.
- Elegir qué supermercados comparar, presupuesto inicial y orden de los productos.
- Efecto de vidrio y animaciones reducidas.
- Reportar un precio incorrecto.

## Tecnología

| Parte | Herramientas |
|---|---|
| Backend | Node.js 22, Express 5, Mongoose 9 |
| Base de datos | MongoDB Atlas |
| Precios | Lectura de las páginas públicas de cada tienda (VTEX y JSON-LD), respetando su `robots.txt` |
| Tareas automáticas | node-cron y GitHub Actions |
| Cuentas | bcryptjs (contraseñas cifradas) y JSON Web Tokens |
| Correo | Brevo (recuperación de contraseña) |
| Frontend | HTML, CSS y JavaScript sin frameworks, PWA con service worker |
| Alojamiento | Render |

## Cómo funciona la actualización de precios

1. Todos los días a las **6:00 a.m. (hora de Nicaragua)**, GitHub Actions despierta el servidor y le pide actualizar los precios ([`.github/workflows/precios-diarios.yml`](.github/workflows/precios-diarios.yml)).
2. El servidor consulta las páginas públicas de los productos, con **pausas entre consultas** y un identificador honesto que explica qué es la app.
3. Nunca consulta rutas que el `robots.txt` de una tienda prohíba.
4. Si el servidor se reinicia a medias, la actualización **sigue donde se quedó**.
5. El historial solo guarda los **cambios** de precio, para ahorrar espacio.
6. Un supermercado se puede pausar con la variable `SUPERS_PAUSADOS`: deja de consultarse y de mostrarse en la app.

## Estructura del proyecto

```
├── .github/workflows/      Actualización diaria de precios (GitHub Actions)
├── backend/
│   ├── config/             Conexión a MongoDB
│   ├── data/               Supermercados y productos base
│   ├── helpers/            Precios, tamaños, marcas, alternativas, correo
│   ├── jobs/               Actualización de precios y programador (node-cron)
│   ├── middleware/         Autenticación y manejo de errores
│   ├── models/             Modelos de Mongoose
│   ├── routes/             Rutas de la API
│   ├── scrapers/           Lectura de precios de cada tienda
│   ├── scripts/            Herramientas de línea de comandos
│   ├── seed.js             Carga y sincroniza el catálogo
│   ├── server.js           Servidor Express (API + sitio web)
│   └── GUIA.md             Guía detallada del backend y de la API
└── frontend/
    ├── index.html          Página de inicio
    ├── app.html            La aplicación
    ├── terminos.html       Términos de uso
    ├── privacidad.html     Política de privacidad
    ├── css/  js/  img/
    ├── manifest.webmanifest
    └── sw.js               Service worker (PWA)
```

## Instalarlo en tu computadora

**Necesitás:** [Node.js 20.19 o más nuevo](https://nodejs.org) y una base de datos MongoDB (local o [Atlas](https://www.mongodb.com/atlas), que es gratis).

```bash
# 1. Descargar el proyecto
git clone https://github.com/Mi-Super-app/MiSuper-App.git
cd MiSuper-App/backend

# 2. Instalar las dependencias
npm install

# 3. Crear tu archivo de configuración
cp .env.example .env        # en Windows: copy .env.example .env
# Abrí .env y poné al menos MONGODB_URI y JWT_SECRET

# 4. Cargar el catálogo y los primeros precios
npm run seed

# 5. Encender el servidor
npm run dev
```

Abrí **http://localhost:3000** en tu navegador.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | Enciende el servidor |
| `npm run dev` | Enciende el servidor y lo reinicia solo al guardar cambios |
| `npm run seed` | Sincroniza supermercados y productos, y actualiza los precios (`-- --sin-precios` para saltarlo) |
| `npm run precios` | Actualiza los precios una vez, a mano |
| `npm run probar` | Revisa que la lectura de precios funcione en las 3 tiendas |
| `npm run buscar -- walmart "texto"` | Busca un producto en La Unión o Walmart |
| `npm run catalogo` | Muestra cuántos productos se importarían de cada tienda, sin tocar la base de datos |
| `npm run tamanos` | Calcula el tamaño de los productos para el precio por unidad |

### Variables de entorno

| Variable | Para qué sirve |
|---|---|
| `MONGODB_URI` | Conexión a MongoDB **(obligatoria)** |
| `JWT_SECRET` | Clave secreta de las sesiones **(obligatoria en internet)** |
| `ADMIN_CLAVE` | Protege las rutas de administración y la actualización manual |
| `PORT` | Puerto del servidor (por defecto `3000`) |
| `CRON_PRECIOS` | Horario de la actualización (por defecto `0 6 * * *`) |
| `ACTUALIZACION_AUTOMATICA` | `false` para apagar la actualización automática |
| `CAMBIO_MAXIMO_PRECIO` | Cambio de precio que se marca para revisión (`0.5` = 50 %) |
| `SUPERS_PAUSADOS` | Supermercados que no se consultan ni se muestran (ej. `walmart`) |
| `APP_URL` | Dirección pública de la app, para el link del correo |
| `CORREO_REMITENTE` | Correo desde el que se envían los mensajes |
| `BREVO_API_KEY` | Clave de Brevo para enviar correos |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Alternativa a Brevo para enviar correos |

Todas están explicadas en [`backend/.env.example`](backend/.env.example). **Nunca subas tu archivo `.env` a GitHub.**

La lista completa de rutas de la API está en [`backend/GUIA.md`](backend/GUIA.md).

## Publicarlo en internet

La app está publicada gratis en **Render**, con la base de datos en **MongoDB Atlas**:

1. En Render, creá un **Web Service** conectado a este repositorio:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
2. Agregá las variables de entorno: `MONGODB_URI`, `JWT_SECRET`, `ADMIN_CLAVE`, `APP_URL`, `CORREO_REMITENTE`, `BREVO_API_KEY` y `NODE_VERSION=22`.
3. En MongoDB Atlas → **Network Access**, permití el acceso desde `0.0.0.0/0`, porque Render no tiene una IP fija.
4. En GitHub → **Settings → Secrets and variables → Actions**, creá los secretos `MISUPER_URL` (la dirección de Render) y `ADMIN_CLAVE`.

Cada `git push` vuelve a publicar la app automáticamente.

## Privacidad y uso responsable

- Las contraseñas se guardan **cifradas** y nadie puede leerlas.
- La app pide solo los datos necesarios y no usa publicidad ni rastreadores.
- La cuenta y todos sus datos se pueden **eliminar desde la app**.
- La política de privacidad se basa en la **Ley No. 787, Ley de Protección de Datos Personales** de Nicaragua.
- Los precios se consultan **una vez al día**, con pausas, respetando el `robots.txt` de cada tienda.

¿Sos de uno de los supermercados y querés que cambiemos algo o dejemos de mostrar sus precios? Escribinos y lo hacemos de inmediato.

## Autores

**Equipo Mi Súper** · Managua, Nicaragua

- Jaime Francisco López Márquez
- Loammy José Ramírez Maltez

📧 [misupernicaragua@gmail.com](mailto:misupernicaragua@gmail.com)

## Licencia

© 2026 Equipo Mi Súper. Todos los derechos reservados.
