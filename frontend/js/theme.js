/* ── MODO OSCURO / CLARO ──
   Funciona con cualquier botón que tenga la clase "theme-toggle".
   El tema se guarda en el dispositivo (localStorage "misuper-theme"). */
(function () {
  const raiz = document.documentElement;

  function aplicar(tema) {
    raiz.setAttribute('data-theme', tema);
    try { localStorage.setItem('misuper-theme', tema); } catch (e) { }
    const oscuro = tema === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.setAttribute('aria-checked', String(oscuro));
      btn.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', oscuro ? '#0a1a2c' : '#eef7f2');
  }

  aplicar(raiz.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

  document.addEventListener('click', e => {
    const btn = e.target.closest('.theme-toggle');
    if (!btn) return;
    aplicar(raiz.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
})();
