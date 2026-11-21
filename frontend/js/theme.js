/* ── TEMA: CLARO / OSCURO / AUTOMÁTICO ──
   Se guarda en el dispositivo (localStorage "misuper-theme"): 'light', 'dark' o 'auto'.
   'auto' sigue lo que diga el celular o la compu (y cambia solo si el sistema cambia).
   Cualquier botón con la clase "theme-toggle" alterna entre claro y oscuro.
   En la app, Ajustes usa  cambiarTema('light' | 'dark' | 'auto'). */
(function () {
  const raiz = document.documentElement;
  const sistemaOscuro = window.matchMedia('(prefers-color-scheme: dark)');

  function preferencia() {
    try {
      const s = localStorage.getItem('misuper-theme');
      if (s === 'light' || s === 'dark' || s === 'auto') return s;
    } catch (e) { }
    return 'dark';
  }
  const resolver = p => (p === 'auto' ? (sistemaOscuro.matches ? 'dark' : 'light') : p);

  function pintar(tema) {
    raiz.setAttribute('data-theme', tema);
    const oscuro = tema === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.setAttribute('aria-checked', String(oscuro));
      btn.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', oscuro ? '#0a1a2c' : '#eef7f2');
  }

  window.temaGuardado = preferencia;
  window.cambiarTema = function (p) {
    try { localStorage.setItem('misuper-theme', p); } catch (e) { }
    pintar(resolver(p));
  };

  pintar(resolver(preferencia()));
  sistemaOscuro.addEventListener('change', () => { if (preferencia() === 'auto') pintar(resolver('auto')); });

  document.addEventListener('click', e => {
    const btn = e.target.closest('.theme-toggle');
    if (!btn) return;
    window.cambiarTema(raiz.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
})();
