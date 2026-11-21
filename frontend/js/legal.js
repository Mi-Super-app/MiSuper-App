/* ══════════════════════════════════════════════════════════
   PÁGINAS LEGALES: botón para cambiar entre español e inglés.
   Usa el mismo ajuste de idioma que la app ("misuper-ajustes"),
   así si cambiás aquí, la app también queda en ese idioma.
   ══════════════════════════════════════════════════════════ */
(function () {
  const raiz = document.documentElement;
  const boton = document.querySelector('[data-cambiar-idioma]');

  function leerAjustes() {
    try { return JSON.parse(localStorage.getItem('misuper-ajustes') || '{}') || {}; } catch (e) { return {}; }
  }

  function pintar(idioma) {
    raiz.setAttribute('lang', idioma);
    const titulo = document.querySelector(`[data-idioma="${idioma}"] h1`);
    if (titulo) document.title = 'Mi Súper · ' + titulo.textContent;
    if (boton) boton.textContent = idioma === 'en' ? 'Español' : 'English';
    document.querySelectorAll('[data-texto-es]').forEach(el => {
      el.textContent = idioma === 'en' ? el.dataset.textoEn : el.dataset.textoEs;
    });
  }

  if (boton) {
    boton.addEventListener('click', () => {
      const nuevo = raiz.getAttribute('lang') === 'en' ? 'es' : 'en';
      try { localStorage.setItem('misuper-ajustes', JSON.stringify({ ...leerAjustes(), idioma: nuevo })); } catch (e) { }
      pintar(nuevo);
    });
  }
  pintar(raiz.getAttribute('lang') === 'en' ? 'en' : 'es');
})();
