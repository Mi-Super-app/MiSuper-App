// RESPETAR EL robots.txt DE CADA TIENDA
// -------------------------------------
// Cada sitio web publica en /robots.txt qué partes NO quiere que consulten los
// programas automáticos. Por ejemplo, La Colonia tiene:
//     Disallow: /api/
//     Disallow: /buscar
//
// Antes de CADA consulta a una tienda, revisarRobots(url) mira esas reglas.
// Si la ruta está prohibida, lanza un error y la consulta NO se hace.
//
// Reglas que seguimos (las del estándar RFC 9309):
//   - Se usan las reglas de "User-agent: MiSuperApp" si existen; si no, las de "User-agent: *".
//   - Gana la regla más larga que coincida. Si empatan, gana "Allow".
//   - "*" coincide con cualquier texto y "$" marca el final de la ruta.
//   - Si robots.txt no existe (error 4xx) → todo permitido.
//   - Si el sitio no responde o da error 5xx → por precaución NO se consulta nada.

// Nos identificamos con honestidad: qué programa somos y para qué consultamos
const AGENTE = 'MiSuperApp/1.0 (comparador de precios; consulta 1 vez al dia)';
const NOMBRE_ROBOT = 'misuperapp';
const VIGENCIA_MS = 6 * 60 * 60 * 1000; // se vuelve a leer el robots.txt cada 6 horas

const memoria = new Map(); // origen → { reglas, bloqueado, leido }

// Convierte el texto de robots.txt en la lista de reglas que nos tocan
function leerReglas(texto) {
  const grupos = [];
  let actual = null;
  let anteriorFueAgente = false;

  for (let linea of String(texto).split(/\r?\n/)) {
    linea = linea.replace(/#.*/, '').trim();
    const i = linea.indexOf(':');
    if (!linea || i < 0) continue;
    const campo = linea.slice(0, i).trim().toLowerCase();
    const valor = linea.slice(i + 1).trim();

    if (campo === 'user-agent') {
      // Varias líneas "User-agent" seguidas forman un solo grupo
      if (!actual || !anteriorFueAgente) {
        actual = { agentes: [], reglas: [] };
        grupos.push(actual);
      }
      actual.agentes.push(valor.toLowerCase());
      anteriorFueAgente = true;
      continue;
    }
    anteriorFueAgente = false;
    if (actual && (campo === 'allow' || campo === 'disallow') && valor) {
      actual.reglas.push({ permite: campo === 'allow', patron: valor });
    }
  }

  const propios = grupos.filter(g => g.agentes.includes(NOMBRE_ROBOT));
  const elegidos = propios.length ? propios : grupos.filter(g => g.agentes.includes('*'));
  return elegidos.flatMap(g => g.reglas);
}

// "/*?*returnUrl=" → expresión regular que se compara desde el inicio de la ruta
function aRegex(patron) {
  const alFinal = patron.endsWith('$');
  const cuerpo = (alFinal ? patron.slice(0, -1) : patron)
    .split('*')
    .map(parte => parte.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + cuerpo + (alFinal ? '$' : ''));
}

// ¿Las reglas permiten esta ruta? (ruta = path + "?" + parámetros)
function permitido(reglas, ruta) {
  let mejor = null;
  for (const regla of reglas) {
    if (!aRegex(regla.patron).test(ruta)) continue;
    const largo = regla.patron.length;
    if (!mejor || largo > mejor.largo || (largo === mejor.largo && regla.permite)) {
      mejor = { largo, permite: regla.permite };
    }
  }
  return mejor ? mejor.permite : true;
}

async function reglasDe(origen) {
  const guardado = memoria.get(origen);
  if (guardado && Date.now() - guardado.leido < VIGENCIA_MS) return guardado;

  let resultado;
  try {
    const respuesta = await fetch(`${origen}/robots.txt`, {
      headers: { 'User-Agent': AGENTE, Accept: 'text/plain' },
      signal: AbortSignal.timeout(20000)
    });
    if (respuesta.ok) resultado = { reglas: leerReglas(await respuesta.text()), bloqueado: false };
    else if (respuesta.status >= 400 && respuesta.status < 500) resultado = { reglas: [], bloqueado: false };
    else resultado = { reglas: [], bloqueado: `robots.txt respondió con error ${respuesta.status}` };
  } catch (error) {
    // Si no se pudo leer ahora, se vuelve a intentar en la próxima consulta (no se guarda)
    throw new Error(`No se pudo leer ${origen}/robots.txt (${error.message}); por precaución no se consulta la tienda.`);
  }
  resultado.leido = Date.now();
  memoria.set(origen, resultado);
  return resultado;
}

// Lanza un error si robots.txt no permite consultar esta dirección
async function revisarRobots(url) {
  const { origin, pathname, search } = new URL(url);
  const { reglas, bloqueado } = await reglasDe(origin);
  if (bloqueado) throw new Error(`${origin}: ${bloqueado}; por precaución no se consulta la tienda.`);
  if (!permitido(reglas, pathname + search)) {
    throw new Error(`El robots.txt de ${origin} no permite consultar ${pathname}; no se hizo la consulta.`);
  }
}

module.exports = { AGENTE, revisarRobots, leerReglas, permitido };
