# Guía paso a paso · Backend de Mi Súper

Backend de Mi Súper con precios **reales** de **La Colonia**, **La Unión** y
**Walmart** que se actualizan solos todos los días.

Haz los pasos en orden. No avances al siguiente hasta que el anterior te salga
igual que en la guía.

---

## ¿Qué hace este backend?

1. Tiene un **catálogo base de 26 productos** (leche, arroz, azúcar, café, limpieza,
   higiene…). Cada uno es el **mismo producto** (misma marca y tamaño) en las tres
   tiendas, con su link en cada una.
2. Además **importa solo el catálogo completo de cada súper** (unos 8.000 productos
   de La Colonia y 10.000 de La Unión y de Walmart) y pone cada producto en su sección
   (lácteos, carnes, limpieza, bebés, mascotas…). Los productos nuevos de las tiendas
   aparecen solos. Walmart y La Unión comparten catálogo, así que esos productos sí se
   comparan entre las dos; los de La Colonia aparecen con su propio precio.
3. **Todos los días a las 6:00 a.m.**, node-cron lee el catálogo de las tres tiendas
   y guarda los precios. Si hay rebaja, guarda el precio rebajado.
4. Tu app puede:
   - mostrar productos con el precio en cada súper y cuál es el más barato
   - crear **listas de compras con presupuesto**
   - decir **cuánto cuesta la lista en cada súper** y si alcanza el presupuesto

Si una tienda falla un día, **se conserva el último precio bueno**. Si un
producto se agota, se marca como "no disponible".

El backend respeta las reglas para programas (robots.txt) de cada tienda, consulta
**una sola vez al día** con pausas entre productos y solo guarda nombre y precio
(no copia fotos, descripciones ni logos).

---

## Las carpetas del proyecto

| Carpeta / archivo | Qué hay ahí |
|---|---|
| `data/productos.js` | **El catálogo base**: los productos comparados en las 3 tiendas y sus links |
| `scrapers/catalogo.js` | Lee el catálogo completo de cada súper (importación automática) |
| `scrapers/secciones.js` | En qué sección de Mi Súper va cada categoría de cada tienda |
| `data/supermercados.js` | Los 3 supermercados |
| `models/` | Cómo se guardan los datos en MongoDB |
| `routes/` | Las direcciones (rutas) de la API que usará el frontend |
| `scrapers/` | Cómo se piden los precios a cada tienda |
| `jobs/actualizarPrecios.js` | El trabajo que actualiza los precios |
| `jobs/programador.js` | **node-cron**: ejecuta la actualización todos los días |
| `scripts/` | Herramientas: `probar` y `buscar` |
| `seed.js` | Carga el catálogo en MongoDB y trae los precios |
| `server.js` | Arranca todo |
| `.env` | Tus datos privados (contraseña de MongoDB). **No se sube a GitHub** |

---

## Paso 1 · Reemplaza tu carpeta backend

Esta versión quita archivos de las versiones anteriores, así que hay que **limpiar** primero.

1. Abre tu carpeta `C:\Proyecto\MiSuperApp\backend` en el Explorador de Windows.
2. **Copia tu archivo `.env` al Escritorio** (es tu respaldo de la conexión a MongoDB).
3. Borra **todo** lo que hay dentro de `backend`, **menos** el archivo `.env`.
   (Si no ves el `.env`, en el Explorador ve a **Vista → Mostrar → Elementos ocultos**.)
4. Descomprime el zip y abre la carpeta `backend` que viene adentro.
5. Selecciona todo (**Ctrl + A**), copia (**Ctrl + C**) y pégalo (**Ctrl + V**) dentro de tu carpeta `backend`.

Al final, tu carpeta `backend` debe tener: `config`, `data`, `helpers`, `jobs`,
`middleware`, `models`, `routes`, `scrapers`, `scripts`, `.env`, `.env.example`,
`GUIA.md`, `package.json`, `package-lock.json`, `seed.js`, `server.js`.

---

## Paso 2 · Instala los paquetes

En VS Code: **Terminal → Nueva terminal**. La línea debe terminar en `backend>`.

```
npm install
```

Espera a que termine. Los avisos amarillos (`WARN`) no importan.

---

## Paso 3 · Revisa tu `.env`

Abre `.env` en VS Code. Debe tener al menos tu `MONGODB_URI`. Compáralo con
`.env.example` y agrega las líneas que falten. Debe quedar parecido a esto:

```
MONGODB_URI=tu-conexion-de-siempre
PORT=3000
CRON_PRECIOS=0 6 * * *
ACTUALIZACION_AUTOMATICA=true
CAMBIO_MAXIMO_PRECIO=0.5
ADMIN_CLAVE=
```

Guarda con **Ctrl + S**.

---

## Paso 4 · Prueba que las tiendas responden

Este paso no usa la base de datos. Solo comprueba que tu compu puede pedir precios a las tiendas.

```
npm run probar
```

Debe salir algo así (los precios pueden variar):

```
✅ la-colonia: LECHE UHT ENTERA 3% GRASA TETRA 1 LT - ESKIMO → C$52.2
✅ la-union: Leche Entera Eskimo Ultrapasteurizada 3% Grasa - 1 L → C$50
✅ walmart: Leche Entera Eskimo Ultrapasteurizada 3% Grasa - 1 L → C$50

Todo bien. Las tres tiendas responden.
```

Si sale ❌, revisa tu internet y vuelve a probar.

---

## Paso 5 · Carga el catálogo y los precios reales

```
npm run seed
```

Tarda **unos 10 minutos**, porque lee el catálogo completo de las 3 tiendas con una
pausa entre cada consulta para no saturarlas. Al final verás algo como:

```
✅ Catálogo listo: 3 supermercados, 26 productos, 78 links

Importando el catálogo de las tiendas con sus precios (tarda unos minutos)...

[precios] La Colonia: 7992 en el catálogo, 7970 productos nuevos, ...
[precios] La Unión: 9965 en el catálogo, ...
[precios] Walmart: 11008 en el catálogo, ...
[precios] Listo: 28965 revisados, 25000 nuevos, ...
```

> ¿Solo quieres ver cuántos productos se importarían, sin tocar la base de datos?
> `npm run catalogo`  (muestra cuántos hay en cada sección de cada tienda).
>
> ¿Quieres que se actualicen los precios pero que NO se agreguen productos nuevos?
> Pon `IMPORTAR_CATALOGO=false` en tu `.env`.

> También verás "Eliminado supermercado que ya no se usa: Palí" y "Maxi Palí", y que
> se borraron los productos de ejemplo viejos. Es normal: eran de la versión anterior.

Puedes ejecutar `npm run seed` **las veces que quieras**: no duplica nada y no borra
tus listas de compras.

---

## Paso 6 · Enciende el servidor

```
npm run dev
```

Debe salir:

```
MongoDB conectado
Servidor corriendo en http://localhost:3000
[precios] Programado con node-cron: "0 6 * * *" (America/Managua)
```

La última línea quiere decir que **la actualización automática ya está activa**.
Mientras el servidor esté encendido, todos los días a las 6:00 a.m. se actualizan
los precios solos.

> Si el servidor estaba apagado a las 6:00 a.m., cuando lo enciendas revisa si la
> última actualización tiene más de 24 horas. Si es así, actualiza en ese momento.

Deja esta terminal abierta. Para apagar el servidor: clic en la terminal y **Ctrl + C**.

---

## Paso 7 · Mira los datos en el navegador

Con el servidor encendido, abre estas direcciones en Chrome:

| Dirección | Qué vas a ver |
|---|---|
| http://localhost:3000 | Que la API funciona y cuándo se actualizaron los precios |
| http://localhost:3000/api/productos | Los 26 productos con su precio en cada súper y el más barato |
| http://localhost:3000/api/productos?q=leche | Buscar productos |
| http://localhost:3000/api/precios/limpieza | Productos de una categoría |
| http://localhost:3000/api/supermercados/walmart/productos | La sección de Walmart |
| http://localhost:3000/api/supermercados/la-colonia/productos | La sección de La Colonia |
| http://localhost:3000/api/supermercados/la-union/productos | La sección de La Unión |
| http://localhost:3000/api/actualizaciones | Historial de actualizaciones (¿hubo errores?) |

> Tip: instala en Chrome la extensión **JSON Viewer** para ver estos datos más ordenados.

---

## Paso 8 · Prueba una lista de compras con presupuesto

Las listas se crean con peticiones POST, que no se pueden hacer escribiendo en el
navegador. Usaremos PowerShell, en una **segunda terminal**: en VS Code, clic en
el **+** del panel de la terminal. El servidor sigue corriendo en la primera.

**8a. Crea una lista con presupuesto de C$1,000:**

```powershell
$lista = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/listas -ContentType 'application/json' -Body '{"nombre":"Compra de la semana","presupuesto":1000}'
$lista
```

**8b. Busca dos productos y agrégalos:**

```powershell
$leche = (Invoke-RestMethod "http://localhost:3000/api/productos?q=eskimo")[0]
$arroz = (Invoke-RestMethod "http://localhost:3000/api/productos?q=arroz")[0]

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/listas/$($lista._id)/items" -ContentType 'application/json' -Body (@{ productoId = $leche.id; cantidad = 4 } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/listas/$($lista._id)/items" -ContentType 'application/json' -Body (@{ productoId = $arroz.id; cantidad = 1 } | ConvertTo-Json)
```

**8c. Compara la lista en los tres supermercados:**

```powershell
Invoke-RestMethod "http://localhost:3000/api/listas/$($lista._id)/comparar" | ConvertTo-Json -Depth 5
```

Verás el total en cada súper, cuál es el más barato (`mejorSupermercado`), cuánto
te sobra o te falta del presupuesto (`diferencia`) y la opción **combinada**:
comprar cada producto donde está más barato.

---

## Paso 9 · Comprueba que node-cron funciona (opcional)

Para no esperar hasta las 6:00 a.m.:

1. En `.env`, cambia a `CRON_PRECIOS=*/5 * * * *` (= cada 5 minutos) y guarda.
2. Reinicia el servidor: en la primera terminal, **Ctrl + C** y luego `npm run dev`.
3. Espera 5 minutos. Verás aparecer `[precios] Iniciando: ...` sin que hagas nada.
4. **Vuelve a poner** `CRON_PRECIOS=0 6 * * *` y reinicia. Así no consultas las tiendas a cada rato.

Cómo se lee el horario de cron:

```
 ┌──────── minuto (0-59)
 │ ┌────── hora (0-23)
 │ │ ┌──── día del mes
 │ │ │ ┌── mes
 │ │ │ │ ┌ día de la semana (0 = domingo)
 0 6 * * *   → todos los días a las 6:00 a.m. (hora de Nicaragua)
```

---

## Paso 10 · Sube tu trabajo a GitHub

En la terminal (con el servidor apagado, o en la segunda terminal):

```
git add .
git commit -m "Backend con precios automáticos de La Colonia, La Unión y Walmart"
git push
```

El `.env` no se sube porque está en `.gitignore`. Así debe ser: ahí está tu contraseña de MongoDB.

---

## Cómo agregar un producto nuevo

1. Búscalo en La Unión y Walmart (con el servidor apagado o en la segunda terminal):
   ```
   npm run buscar -- la-union "pasta dental colgate"
   npm run buscar -- walmart "pasta dental colgate"
   ```
   En **La Colonia** búscalo tú en https://lacolonia.com.ni con Chrome y abre el
   producto: el número al final del link es su código. (La Colonia pide en su
   robots.txt que los programas no usen su buscador, por eso no hay `buscar` para ella.)
   Elige el **mismo** producto (misma marca y tamaño) en las tres.
2. Abre `data/productos.js` y agrega una línea como las otras:
   ```js
   p('Nombre que verá el usuario', 'categoria', 'CODIGO-LA-COLONIA', 'parte-final-del-link-de-la-union'),
   ```
   - El **código de La Colonia** es el número al final de su link (`.../producto/4100108` → `'4100108'`).
   - La **parte final del link de La Unión** es lo que va entre `launion.com.ni/` y `/p`.
     Walmart usa la misma, así que no hay que escribirla dos veces.
   - Categorías válidas: `carnes`, `lacteos`, `limpieza`, `higiene`, `granos`,
     `abarrotes`, `bebidas`, `frutas-verduras`, `panaderia`, `congelados`, `licores`,
     `bebes`, `mascotas`, `farmacia`, `hogar`, `otros`.
3. Ejecuta `npm run seed`.

> Esto es solo para el **catálogo base** (el mismo producto comparado en las tres
> tiendas). Los demás productos de cada súper ya se importan solos todos los días.
> Si quieres cambiar a qué sección va una categoría de una tienda, o importar otra
> categoría, edita `scrapers/secciones.js`.

---

## Si algo sale mal

| Mensaje | Qué significa | Solución |
|---|---|---|
| `Cannot find module…` | Falta instalar, o la terminal no está en `backend` | Ejecuta `npm install` dentro de `backend` |
| `uri parameter… must be a string` | No encuentra tu `.env` | Revisa que `.env` esté dentro de `backend` (tienes la copia en el Escritorio) |
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB no está encendido | Enciende MongoDB o usa tu conexión de Atlas |
| `El producto ya no existe en la tienda` | La tienda cambió o quitó ese producto | Búscalo de nuevo con `npm run buscar` y actualiza su link en `data/productos.js` |
| `La tienda respondió con error 429` | Hiciste demasiadas consultas seguidas | Espera unos minutos; la actualización diaria es solo una vez |
| `Cambio sospechoso` en `/api/actualizaciones/revisar` | Un precio cambió más de 50 % de un día a otro | No hay que hacer nada: si el mismo precio se repite en la siguiente actualización, se acepta solo. Mientras tanto se muestra el precio anterior |

---

## Importante para cuando publiques la app

node-cron **solo funciona mientras el servidor está encendido**. En tu compu funciona
mientras tengas `npm run dev` abierto. Cuando publiques la API en internet, elige un
servicio de hosting que **no apague** el servidor cuando no hay visitas (algunos
planes gratuitos lo "duermen"). Así la actualización de las 6:00 a.m. corre sola,
sin que tengas que hacer nada.

---

## Precio por kilo, litro o unidad

- El tamaño de cada producto se lee de su **nombre** (`helpers/tamano.js`): "2 kg", "900 ml",
  "3 x 90 g", "40 uds", "Precio indicado por libra"… y se guarda en `Producto.tamano`.
- Se calcula solo al encender el servidor y al final de cada actualización de precios.
  A mano: `npm run tamanos`.
- Si no se puede saber el tamaño (más o menos 1 de cada 6 productos), no se muestra nada.
- Si mejoras las reglas, sube `VERSION_TAMANO` en `helpers/tamano.js`: se vuelven a leer todos.

---

## Cómo se cuida a los supermercados (actualización diaria)

- **Pocas consultas:** el catálogo se pide por categorías (hasta 50 productos por
  consulta en La Unión y Walmart; una página por categoría en La Colonia), con una
  pausa de 1.5 a 3 segundos entre cada consulta.
- **robots.txt:** antes de cada consulta, `scrapers/robots.js` revisa el robots.txt de
  la tienda. Si la ruta está prohibida (La Colonia prohíbe `/api/` y `/buscar`), la
  consulta no se hace y queda anotada como error.
- **User-Agent honesto:** todas las consultas dicen quiénes somos
  (`MiSuperApp/1.0 (comparador de precios; consulta 1 vez al dia)`).
- **Historial:** `HistorialPrecio` solo guarda una fila cuando un precio cambia.
- **Si Render se reinicia a medias:** cada categoría guardada queda anotada en
  `progreso` (se ve en `GET /api/actualizaciones`). Al volver a arrancar, el servidor
  continúa donde se quedó. El trabajo de GitHub Actions visita el servidor cada 4
  minutos hasta que termina, para que Render no lo duerma.
- **Pausar un supermercado:** en Render → Environment, agrega
  `SUPERS_PAUSADOS=walmart` (o varios: `walmart,la-union`). Ese súper deja de
  consultarse y desaparece de la app. Sus datos no se borran: si quitas la variable,
  vuelve a aparecer.

---

## "Olvidé mi contraseña": configurar el correo

Para que la app pueda mandar el correo de recuperación, agrega estas variables en tu
`.env` y en Render (**Environment**):

| Variable | Qué poner |
|---|---|
| `APP_URL` | La dirección de tu app, ej: `https://misuper.onrender.com` (sin `/` al final). **Obligatoria en Render.** En tu compu se puede dejar vacía |
| `CORREO_REMITENTE` | El correo que envía, ej: `misupernicaragua@gmail.com` |
| `BREVO_API_KEY` | Recomendado. Crea una cuenta gratis en https://www.brevo.com, verifica tu correo remitente y copia la clave en **SMTP & API → API Keys** |

Render gratis bloquea el envío de correo por SMTP, por eso se recomienda Brevo (que
manda los correos por HTTPS). Si tu hosting sí permite SMTP, puedes usar en su lugar
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASS` (por ejemplo Gmail con una
"contraseña de aplicación").

Si no configuras ningún servicio, el correo **no se envía**: el link aparece en la
consola del servidor (útil para probar en tu compu).

El link del correo sirve **1 hora** y **una sola vez**. Al usarlo, la persona pone su
contraseña nueva y queda dentro de su cuenta.

---

## Referencia de la API (para el frontend)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/` | Estado de la API y última actualización de precios |
| GET | `/api/supermercados` | Los 3 supermercados |
| GET | `/api/supermercados/:slug/productos` | Sección de un súper (`la-colonia`, `la-union`, `walmart`). Filtros: `?categoria=lacteos&pagina=2&limite=200` |
| GET | `/api/productos` | Sin filtros: los productos del catálogo base. Con filtros busca en **todos**: `?q=texto`, `?categoria=lacteos`, `?supermercado=walmart,la-union`, `?ids=ID1,ID2`, `?orden=precio` (más barato primero), `?orden=unidad` (más barato por kilo, litro o unidad; agrupado por medida), `?pagina=2&limite=60` (total en el encabezado `X-Total`) |
| GET | `/api/productos/resumen` | Cuántos productos hay en cada sección |
| GET | `/api/productos/categorias` | Categorías válidas |
| GET | `/api/productos/:id` | Un producto con sus precios |
| GET | `/api/productos/:id/historial` | Cómo ha cambiado su precio |
| GET | `/api/ofertas` | **Ofertas de hoy**: precio de hoy menor que el normal, del mayor al menor descuento. Filtros: `?supermercado=walmart,la-union`, `?categoria=lacteos`, `?pagina=2&limite=30`. Trae `categorias` (cuántas ofertas por sección) |
| GET | `/api/precios/:categoria` | Productos de una categoría (de 200 en 200: `?pagina=2`) |
| GET | `/api/listas` | Todas las listas |
| POST | `/api/listas` | Crear lista `{ "nombre": "...", "presupuesto": 1000 }` |
| GET | `/api/listas/:id` | Ver una lista |
| PUT | `/api/listas/:id` | Cambiar nombre o presupuesto |
| DELETE | `/api/listas/:id` | Borrar lista |
| POST | `/api/listas/:id/items` | Agregar producto `{ "productoId": "...", "cantidad": 2 }` |
| PUT | `/api/listas/:id/items/:productoId` | Cambiar cantidad `{ "cantidad": 3 }` |
| DELETE | `/api/listas/:id/items/:productoId` | Quitar producto |
| GET | `/api/listas/:id/comparar` | **Total en cada súper vs. presupuesto**. Solo algunos súper: `?supermercados=la-colonia,walmart` |
| POST | `/api/auth/registro` | Crear cuenta `{ "nombre", "email", "password", "aceptaTerminos": true }` (sin `aceptaTerminos` responde 400; guarda la fecha y la versión aceptada, ver `helpers/legal.js`) |
| GET | `/api/listas/:id/alternativas` | **¿Hay algo más barato?**: para cada producto (no comprado), uno equivalente de otra marca que cueste al menos 5 % menos por kilo, litro o unidad. Opcional: `?supermercados=la-colonia,walmart` (ver `helpers/alternativas.js`) |
| POST | `/api/listas/:id/items/:productoId/cambiar` | Cambia un producto de la lista por otro, con la misma cantidad `{ "productoId": "el nuevo" }` |
| PUT | `/api/auth/yo` | Cambiar mi nombre `{ "nombre": "..." }` |
| PUT | `/api/auth/password` | Cambiar contraseña `{ "actual": "...", "nueva": "..." }` |
| DELETE | `/api/auth/yo` | Eliminar mi cuenta, listas y gastos `{ "actual": "..." }` |
| POST | `/api/reportes` | Reportar un precio incorrecto `{ "mensaje", "producto"?, "contacto"? }` |
| GET | `/api/actualizaciones/reportes` | Ver los reportes de precios incorrectos (pide `x-admin-clave`) |
| POST | `/api/auth/olvide` | Manda el correo para cambiar la contraseña `{ "email": "..." }` |
| POST | `/api/auth/restablecer` | Pone la contraseña nueva `{ "token": "...", "password": "..." }` |
| GET | `/api/compras` | Historial de gastos: mis compras y el total de cada mes |
| POST | `/api/compras` | Guardar una compra `{ "nombre", "supermercado", "total", "fecha"? }` |
| DELETE | `/api/compras/:id` | Borrar una compra del historial |
| GET | `/api/actualizaciones` | Últimas 10 actualizaciones |
| GET | `/api/actualizaciones/revisar` | Precios con error o cambio sospechoso |
| POST | `/api/actualizaciones/ejecutar` | Actualizar precios ahora |

Formato de un producto en `/api/productos`:

```json
{
  "id": "…",
  "nombre": "Leche entera Eskimo 1 L",
  "categoria": "lacteos",
  "precios": { "La Colonia": 52.2, "La Unión": 50, "Walmart": 50 },
  "antes": { "La Colonia": 60 },
  "actualizado": { "La Colonia": "2026-11-21T12:00:05.000Z", "…": "…" },
  "mejor": "La Unión"
}
```

`antes` solo aparece cuando un súper tiene ese producto en rebaja.
