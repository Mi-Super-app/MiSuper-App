/* ══════════════════════════════════════════════════════════
   MI SÚPER · PÁGINA DE INICIO (index.html)
   ══════════════════════════════════════════════════════════ */

/* ── PANTALLA DE CARGA ── */
(function () {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const inicio = Date.now();
  let listo = false;
  function ocultar() {
    if (listo) return;
    listo = true;
    setTimeout(() => {
      splash.classList.add('oculto');
      document.body.classList.remove('con-splash'); // arrancan las animaciones de la portada
      try { sessionStorage.setItem('misuper-splash-inicio', '1'); } catch (e) { }
      setTimeout(() => splash.remove(), 600);
    }, Math.max(0, 1000 - (Date.now() - inicio)));
  }
  if (document.readyState === 'complete') ocultar();
  else window.addEventListener('load', ocultar);
  setTimeout(ocultar, 3500); // por si alguna fuente o imagen tarda demasiado
})();

/* ── MENÚ DEL CELULAR ── */
const menuBtn = document.getElementById('menu-btn');
const menuMovil = document.getElementById('menu-movil');
function abrirMenu(abrir) {
  menuMovil.hidden = !abrir;
  menuBtn.classList.toggle('abierto', abrir);
  menuBtn.setAttribute('aria-expanded', String(abrir));
  menuBtn.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
  document.body.style.overflow = abrir ? 'hidden' : '';
}
menuBtn.addEventListener('click', () => abrirMenu(menuMovil.hidden));
menuMovil.addEventListener('click', e => { if (e.target.closest('a')) abrirMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menuMovil.hidden) abrirMenu(false); });

/* ── EFECTOS AL HACER SCROLL ── */
const navbar = document.getElementById('navbar');
const backTop = document.getElementById('back-top');
const progressBar = document.getElementById('progress-bar');
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY;
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  navbar.classList.toggle('scrolled', scrolled > 80);
  backTop.classList.toggle('visible', scrolled > 700);
  progressBar.style.transform = `scaleX(${maxScroll > 0 ? scrolled / maxScroll : 0})`;
  document.querySelectorAll('section[id]').forEach(sec => {
    const top = sec.offsetTop - 100;
    const bot = top + sec.offsetHeight;
    const link = document.querySelector(`.nav-links a[href="#${sec.id}"]`);
    if (link) link.classList.toggle('active', scrolled >= top && scrolled < bot);
  });
}, { passive: true });
backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ── APARECER AL HACER SCROLL ── */
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

/* ── PREGUNTAS FRECUENTES ── */
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const abierto = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
    });
    if (!abierto) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
  });
});

/* ── CALCULADORA (estimación ilustrativa) ── */
function updateSlider(slider) {
  const pct = ((+slider.value - +slider.min) / (+slider.max - +slider.min)) * 100;
  slider.style.setProperty('--pct', pct + '%');
}
function fmt(n) { return 'C$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function calcSim() {
  const gasto = +document.getElementById('slider-gasto').value;
  const visitas = +document.getElementById('slider-visitas').value;
  const impulso = +document.getElementById('slider-impulso').value;
  document.getElementById('gasto-val').textContent = fmt(gasto);
  document.getElementById('visitas-val').textContent = visitas + (visitas === 1 ? ' vez/mes' : ' veces/mes');
  document.getElementById('impulso-val').textContent = impulso + '%';
  const impulsoPct = impulso / 100;
  const dupPct = Math.max(0.05, impulso * 0.4 / 100);
  const totalPct = Math.min(0.55, impulsoPct * 0.7 + dupPct + 0.12);
  const ahorro = Math.round(gasto * totalPct / 100) * 100;
  document.getElementById('res-ahorro').textContent = fmt(ahorro);
  document.getElementById('res-anual').textContent = fmt(ahorro * 12);
  document.getElementById('res-gasto-nuevo').textContent = fmt(gasto - ahorro);
  document.getElementById('res-pct').textContent = Math.round(totalPct * 100) + '%';
  const barImpulso = Math.min(90, impulso);
  const barDup = Math.min(90, Math.round(impulso * 0.55));
  document.getElementById('bar-impulso').style.width = barImpulso + '%';
  document.getElementById('bar-impulso-pct').textContent = barImpulso + '%';
  document.getElementById('bar-dup').style.width = barDup + '%';
  document.getElementById('bar-dup-pct').textContent = barDup + '%';
  document.getElementById('bar-precio').style.width = '12%';
  document.getElementById('bar-precio-pct').textContent = '12%';
}
document.querySelectorAll('.sim-slider').forEach(s => {
  updateSlider(s);
  s.addEventListener('input', () => { updateSlider(s); calcSim(); });
});
calcSim();

/* ══════════════ PRECIOS REALES (desde el backend) ══════════════ */
let productos = [];

function minimo(p) {
  const vals = ORDEN_SUPERS.map(s => p.precios[s]).filter(v => v !== undefined);
  return vals.length ? Math.min(...vals) : null;
}

function renderTabs(cats, activa) {
  document.getElementById('comp-tabs').innerHTML = cats.map(c =>
    `<button class="comp-tab ${c === activa ? 'active' : ''}" data-cat="${c}" role="tab" aria-selected="${c === activa}">${ico(CATEGORIAS[c].icono)}${CATEGORIAS[c].nombre}</button>`
  ).join('');
}

function renderTabla(cat) {
  const filas = productos.filter(p => p.categoria === cat);
  const cabeza = `<div class="comp-head">
      <div class="comp-head-cell">Producto</div>
      ${ORDEN_SUPERS.map(s => `<div class="comp-head-cell">${puntoSuper(s)}${s}</div>`).join('')}
    </div>`;
  const cuerpo = filas.map(p => {
    const vals = ORDEN_SUPERS.map(s => p.precios[s]).filter(v => v !== undefined);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const celdas = ORDEN_SUPERS.map(s => {
      const v = p.precios[s];
      if (v === undefined) return `<div class="comp-cell" data-super="${s}"><span class="comp-price">—</span></div>`;
      const cls = v === min ? 'comp-price best' : (v === max && max !== min ? 'comp-price high' : 'comp-price');
      const badge = v === min ? '<span class="comp-best-badge">✓ Mejor</span>' : '';
      const antes = p.antes && p.antes[s] ? `<s class="comp-antes">${fmtC(p.antes[s])}</s>` : '';
      return `<div class="comp-cell" data-super="${s}">${antes}<span class="${cls}">${fmtC(v)}</span>${badge}</div>`;
    }).join('');
    return `<div class="comp-row"><div class="comp-cell comp-prod">${esc(p.nombre)}</div>${celdas}</div>`;
  }).join('');
  document.getElementById('comp-table').innerHTML = cabeza + cuerpo;
}

document.getElementById('comp-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.comp-tab');
  if (!btn) return;
  const cats = [...document.querySelectorAll('.comp-tab')].map(b => b.dataset.cat);
  renderTabs(cats, btn.dataset.cat);
  renderTabla(btn.dataset.cat);
});

/* Celular de muestra en la portada: 3 productos con su mejor precio */
function renderTelefono() {
  const elegidos = ['Leche entera Eskimo 1 L', 'Arroz Faisán 96% 2 kg', 'Aceite Clover de soya 900 ml']
    .map(n => productos.find(p => p.nombre === n)).filter(Boolean);
  if (elegidos.length < 3) return;
  const totales = ORDEN_SUPERS.map(s => ({ s, total: elegidos.reduce((a, p) => a + (p.precios[s] ?? Infinity), 0) }));
  const mejor = totales.reduce((a, b) => (b.total < a.total ? b : a));
  document.getElementById('ps-items').innerHTML = elegidos.map((p, i) => {
    const icono = ico(CATEGORIAS[p.categoria]?.icono || 'shopping-cart');
    const nombre = p.nombre.replace('entera ', '').replace(' de soya', '').replace(' 96%', '');
    return `<div class="ps-item"><span class="ps-item-name">${icono}${esc(nombre)}</span><span class="ps-item-price">${fmtC(p.precios[mejor.s])}</span><span class="ps-item-check" ${i === 2 ? 'style="border-color:rgba(255,255,255,0.2)"' : ''}>${i < 2 ? '✓' : ''}</span></div>`;
  }).join('');
  document.getElementById('ps-donde').textContent = mejor.s;
  document.getElementById('ps-total').textContent = fmtC(mejor.total);
}

/* Ejemplo: la misma canasta en los 3 supermercados */
const CANASTA = [
  ['Leche entera Eskimo 1 L', 4],
  ['Arroz Faisán 96% 2 kg', 1],
  ['Azúcar San Antonio refinada 2 kg', 1],
  ['Aceite Clover de soya 900 ml', 1],
  ['Huevos rojos El Granjero (30 und)', 1],
  ['Café Presto frasco 150 g', 1],
  ['Papel higiénico Scott Rindemax 6 rollos', 1],
  ['Fabuloso lavanda 900 ml', 1]
];
function renderEjemplo() {
  const items = CANASTA.map(([n, c]) => ({ p: productos.find(x => x.nombre === n), c })).filter(i => i.p);
  if (!items.length) return;
  const totales = ORDEN_SUPERS.map(s => {
    const completo = items.every(i => i.p.precios[s] !== undefined);
    const total = items.reduce((a, i) => a + (i.p.precios[s] ?? 0) * i.c, 0);
    return { s, total: Math.round(total * 100) / 100, completo };
  });
  const validos = totales.filter(t => t.completo);
  const min = Math.min(...validos.map(t => t.total));
  const max = Math.max(...validos.map(t => t.total));
  const combinado = items.reduce((a, i) => a + minimo(i.p) * i.c, 0);
  document.getElementById('ejemplo-grid').innerHTML = totales.map(t => {
    const info = SUPERS[t.s];
    const gana = t.completo && t.total === min;
    return `<div class="ejemplo-card reveal visible ${gana ? 'gana' : ''}">
      <div class="ej-cabeza">${logoSuper(t.s, 'ej-logo')}<span class="ej-nombre">${t.s}</span>${gana ? `<span class="ej-badge">${ico('trophy')}Más barato</span>` : ''}</div>
      <div class="ej-total" style="color:${info.color}">${t.completo ? fmtC(t.total) : 'Incompleta'}</div>
      <div class="ej-dif">${!t.completo ? 'Le faltan productos' : gana ? 'La opción más económica' : `${fmtC(t.total - min)} más que el más barato`}</div>
    </div>`;
  }).join('');
  document.getElementById('ejemplo-sub').innerHTML =
    `Con los precios de hoy, esta canasta de ${items.length} productos cuesta <strong>${fmtC(max - min)} más</strong> en el súper más caro que en el más barato. Y combinando supermercados te saldría en <strong>${fmtC(combinado)}</strong>.`;
  document.getElementById('ejemplo-lista').textContent =
    'Canasta: ' + items.map(i => `${i.p.nombre}${i.c > 1 ? ' ×' + i.c : ''}`).join(' · ');
}

async function cargarPrecios() {
  try {
    const [info, lista] = await Promise.all([api('/api/estado'), api('/api/productos')]);
    quitarSupersPausados(info.supermercadosPausados);
    productos = lista;
    document.getElementById('stat-productos').textContent = Math.max(info.productos || 0, productos.length).toLocaleString('es-NI');
    const cats = Object.keys(CATEGORIAS).filter(c => productos.some(p => p.categoria === c));
    renderTabs(cats, cats[0]);
    renderTabla(cats[0]);
    renderTelefono();
    renderEjemplo();
  } catch (error) {
    document.getElementById('comp-table').innerHTML =
      '<div class="comp-cargando">No se pudieron cargar los precios ahora. Probá de nuevo en un momento.</div>';
    document.getElementById('ejemplo-grid').innerHTML = '';
  }
}
cargarPrecios();

/* ── INSTALAR COMO APP (PWA) ── */
let eventoInstalar = null;
const btnInstalar = document.getElementById('btn-instalar');
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  eventoInstalar = e;
  btnInstalar.hidden = false;
});
btnInstalar.addEventListener('click', async () => {
  if (!eventoInstalar) return;
  eventoInstalar.prompt();
  await eventoInstalar.userChoice;
  eventoInstalar = null;
  btnInstalar.hidden = true;
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}
