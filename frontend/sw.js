/* ══════════════════════════════════════════════════════════
   SERVICE WORKER de Mi Súper
   Permite instalar la app y abrirla aunque no haya internet
   (muestra lo último que se cargó).
   Estrategia "primero la red": siempre intenta traer lo más nuevo;
   solo usa la copia guardada si no hay conexión. Así nunca ves
   precios ni archivos viejos cuando sí tenés internet.

   Si cambiás archivos y querés forzar que todos los teléfonos
   descarguen la versión nueva, subí el número de VERSION.
   ══════════════════════════════════════════════════════════ */
const VERSION = 'misuper-v19';
const ARCHIVOS = [
  './', 'index.html', 'app.html', 'terminos.html', 'privacidad.html',
  'css/style.css', 'css/app.css', 'css/theme.css', 'css/animaciones.css', 'css/legal.css', 'css/vidrio.css',
  'js/config.js', 'js/i18n.js', 'js/theme.js', 'js/app.js', 'js/miapp.js', 'js/legal.js',
  'img/icono.svg', 'img/icono-192.png', 'img/icono-512.png',
  'manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  // Solo GET de nuestro propio sitio (las fuentes de Google y otros sitios pasan directo)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Las búsquedas de productos no se guardan (son miles distintas y llenarían el teléfono)
  if (url.pathname.startsWith('/api/') && url.search) return;

  e.respondWith(
    fetch(request)
      .then(respuesta => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then(c => c.put(request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(request).then(guardada => guardada || caches.match('app.html')))
  );
});
