// Estado de la app + persistencia en archivos JSON dentro de la carpeta elegida.
// Cada colección vive en su propio archivo:
//   movimientos.json · compras.json · tags.json · ajustes.json
// Formato: { app, version, actualizado, data }

import { uid, today, clamp, avanzarFecha } from './format.js';
import { resumen, saldoDeudas, sueldoVencido } from './calc.js';

const FILES = {
  movimientos: 'movimientos.json',
  compras: 'compras.json',
  tags: 'tags.json',
  deudas: 'deudas.json',
  sueldos: 'sueldos.json',
  ajustes: 'ajustes.json',
};
const VERSION = 1;

export const DEFAULT_AJUSTES = {
  saldoInicial: 0,
  ahorroInicial: 0,
  aporteDefecto: { modo: 'pct', valor: 0 }, // se propone al marcar un ingreso como sueldo
  mostrarIds: false,
  ajustesAhorro: [], // { id, fecha, monto (+/-), nota }
};

export const state = {
  dataDir: null,
  movimientos: [],
  compras: [],
  tags: [],
  deudas: [],
  sueldos: [],
  ajustes: structuredClone(DEFAULT_AJUSTES),
  error: null,
};

// Archivos que no se pudieron leer: no se sobrescriben para no perder datos.
const bloqueados = new Set();

// ---------- Suscripciones ----------
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
function emit() { for (const fn of subs) fn(); }

// ---------- Transferencia de valor (deuda a favor cancelada) ----------
// Evento aparte de subscribe(): lleva los montos antes/después para que la UI
// muestre una animación flotante encima de toda la ventana, sin importar qué vista esté activa.
const transferSubs = new Set();
export const onTransferencia = (fn) => { transferSubs.add(fn); return () => transferSubs.delete(fn); };
const emitTransferencia = (payload) => { for (const fn of transferSubs) fn(payload); };

/** Dispara la animación con montos de ejemplo, sin tocar datos reales (para previsualizarla). */
export function previsualizarTransferencia() {
  const netoAntes = resumen(state).neto;
  const saldoAntes = saldoDeudas(state.deudas);
  const monto = 10000;
  emitTransferencia({ saldoAntes, saldoDespues: saldoAntes - monto, netoAntes, netoDespues: netoAntes + monto });
}

let errorHandler = (e) => console.error(e);
export const onError = (fn) => { errorHandler = fn; };

// ---------- Normalización (conserva campos extra que agregues a mano) ----------
const int = (v) => Math.round(Number(v) || 0);

export function normMov(m = {}) {
  return {
    ...m,
    id: m.id || uid(),
    tipo: m.tipo === 'ingreso' ? 'ingreso' : 'gasto',
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(m.fecha || '') ? m.fecha : today(),
    nombre: String(m.nombre ?? ''),
    descripcion: String(m.descripcion ?? ''),
    monto: Math.max(0, int(m.monto)),
    arrepentimiento: clamp(int(m.arrepentimiento), 0, 5),
    tags: Array.isArray(m.tags) ? [...new Set(m.tags)] : [],
    esSueldo: !!m.esSueldo,
    ahorro: {
      modo: m.ahorro?.modo === 'fijo' ? 'fijo' : 'pct',
      valor: Math.max(0, Number(m.ahorro?.valor) || 0),
    },
    esInversion: !!m.esInversion,
    desdeAhorro: !!m.desdeAhorro,
    inversion: { ingresoId: m.inversion?.ingresoId || null },
    origen: m.origen || null,
    creado: m.creado || new Date().toISOString(),
    editado: m.editado || null,
  };
}

export function normCompra(c = {}) {
  return {
    ...c,
    id: c.id || uid(),
    nombre: String(c.nombre ?? ''),
    descripcion: String(c.descripcion ?? ''),
    costo: Math.max(0, int(c.costo)),
    tags: Array.isArray(c.tags) ? [...new Set(c.tags)] : [],
    esAhorro: !!c.esAhorro,
    creado: c.creado || new Date().toISOString(),
  };
}

export function normTag(t = {}) {
  return {
    ...t,
    id: t.id || uid(),
    nombre: String(t.nombre ?? '').trim() || 'Sin nombre',
    color: /^#[0-9a-f]{3,8}$/i.test(t.color || '') ? t.color : '#ffffff',
  };
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/**
 * Deuda: dinero que otra persona le debe al usuario ('favor') o que el usuario le debe
 * a otra persona ('contra'). Puede nacer de un movimiento (gasto → favor) o crearse a mano.
 */
export function normDeuda(d = {}) {
  return {
    ...d,
    id: d.id || uid(),
    direccion: d.direccion === 'contra' ? 'contra' : 'favor',
    nombre: String(d.nombre ?? ''),
    contraparte: String(d.contraparte ?? ''),
    descripcion: String(d.descripcion ?? ''),
    monto: Math.max(0, int(d.monto)),
    fecha: isDate(d.fecha) ? d.fecha : today(),
    plazoModo: ['fecha', 'dias', 'ninguno'].includes(d.plazoModo) ? d.plazoModo : 'dias',
    plazoFecha: isDate(d.plazoFecha) ? d.plazoFecha : null,
    plazoDias: d.plazoDias != null ? Math.max(0, int(d.plazoDias)) : 30,
    estado: d.estado === 'cancelada' ? 'cancelada' : 'pendiente',
    montoLiquidado: d.montoLiquidado != null ? Math.max(0, int(d.montoLiquidado)) : null,
    fechaLiquidacion: isDate(d.fechaLiquidacion) ? d.fechaLiquidacion : null,
    movId: d.movId || null,
    movAutoId: d.movAutoId || null,
    creado: d.creado || new Date().toISOString(),
    editado: d.editado || null,
  };
}

/**
 * Sueldo/remuneración recurrente: cada cierto tiempo genera (o sugiere) un ingreso.
 * `monto: null` = sin monto programado, el usuario lo escribe cada vez (ej. remuneración variable).
 * `proxima` es el puntero de la próxima ocurrencia pendiente; avanza al aplicar o posponer.
 */
export function normSueldo(s = {}) {
  return {
    ...s,
    id: s.id || uid(),
    nombre: String(s.nombre ?? ''),
    monto: s.monto != null && s.monto !== '' ? Math.max(0, int(s.monto)) : null,
    frecuenciaCantidad: Math.max(1, int(s.frecuenciaCantidad) || 1),
    frecuenciaUnidad: ['dia', 'semana', 'mes', 'anio'].includes(s.frecuenciaUnidad) ? s.frecuenciaUnidad : 'mes',
    hora: /^\d{2}:\d{2}$/.test(s.hora || '') ? s.hora : '09:00',
    modo: s.modo === 'auto' ? 'auto' : 'sugerido',
    tags: Array.isArray(s.tags) ? [...new Set(s.tags)] : [],
    proxima: isDate(s.proxima) ? s.proxima : today(),
    activo: s.activo !== false,
    creado: s.creado || new Date().toISOString(),
    editado: s.editado || null,
  };
}

// ---------- Índices ----------
let tagIdx = new Map();
const rebuild = () => { tagIdx = new Map(state.tags.map((t) => [t.id, t])); };
export const tagById = (id) => tagIdx.get(id);
export const getMov = (id) => state.movimientos.find((m) => m.id === id);

// ---------- Carga ----------
const itemsOf = (d) => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);

async function readAll() {
  const raw = {};
  const faltantes = [];
  const errores = [];
  bloqueados.clear();

  for (const [key, file] of Object.entries(FILES)) {
    const r = await window.api.read(file);
    if (!r.ok) {
      errores.push(`${file}: ${r.error}`);
      bloqueados.add(key);
    } else if (r.missing) {
      faltantes.push(key);
    }
    raw[key] = r.ok ? r.data : null;
  }

  state.error = errores.length ? errores.join('\n') : null;
  state.movimientos = itemsOf(raw.movimientos).map(normMov);
  state.compras = itemsOf(raw.compras).map(normCompra);
  state.tags = itemsOf(raw.tags).map(normTag);
  state.deudas = itemsOf(raw.deudas).map(normDeuda);
  state.sueldos = itemsOf(raw.sueldos).map(normSueldo);

  const aj = raw.ajustes?.data ?? raw.ajustes ?? {};
  state.ajustes = {
    ...structuredClone(DEFAULT_AJUSTES),
    ...aj,
    aporteDefecto: { ...DEFAULT_AJUSTES.aporteDefecto, ...(aj.aporteDefecto || {}) },
    ajustesAhorro: Array.isArray(aj.ajustesAhorro) ? aj.ajustesAhorro : [],
  };
  rebuild();
  return faltantes;
}

/** Devuelve false si todavía no hay carpeta elegida. */
export async function load() {
  const cfg = await window.api.getConfig();
  state.dataDir = cfg.dataDir;
  if (!state.dataDir) return false;
  const faltantes = await readAll();
  if (faltantes.length) persist(...faltantes); // inicializa archivos nuevos
  if (!state.error) window.api.backup().catch(() => {});
  return true;
}

export async function reload() {
  await readAll();
  emit();
}

export async function chooseFolder() {
  const dir = await window.api.chooseFolder();
  if (!dir) return false;
  state.dataDir = dir;
  const faltantes = await readAll();
  if (faltantes.length) persist(...faltantes);
  emit();
  return true;
}

// ---------- Persistencia (cola secuencial) ----------
let cola = Promise.resolve();

function persist(...keys) {
  const aGuardar = keys.filter((k) => {
    if (bloqueados.has(k)) {
      errorHandler(new Error(`${FILES[k]} no se pudo leer al abrir; no se sobrescribirá. Revisa el archivo y recarga.`));
      return false;
    }
    return true;
  });
  cola = cola.then(async () => {
    for (const k of aGuardar) {
      const payload = { app: 'app-finanzas', version: VERSION, actualizado: new Date().toISOString(), data: state[k] };
      const r = await window.api.write(FILES[k], payload);
      if (!r.ok) throw new Error(`No se pudo guardar ${FILES[k]}: ${r.error}`);
    }
  }).catch((e) => errorHandler(e));
  return cola;
}

const upsert = (arr, item) => {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.push(item);
};

// ---------- Movimientos ----------
export function saveMovimiento(m) {
  const existe = state.movimientos.some((x) => x.id === m.id);
  const n = normMov({ ...m, editado: existe ? new Date().toISOString() : m.editado });
  upsert(state.movimientos, n);
  persist('movimientos');
  emit();
  return n;
}

/** Ingreso creado automáticamente como retorno de esta inversión (si existe). */
export function autoRetorno(g) {
  const id = g?.inversion?.ingresoId;
  const ing = id ? getMov(id) : null;
  return ing && ing.origen?.tipo === 'inversion' && ing.origen.gastoId === g.id ? ing : null;
}

/** Ingresos disponibles para vincular a una inversión. */
export function ingresosVinculables(gastoId) {
  const usados = new Set(state.movimientos
    .filter((g) => g.id !== gastoId && g.inversion?.ingresoId)
    .map((g) => g.inversion.ingresoId));
  return state.movimientos
    .filter((m) => m.tipo === 'ingreso' && !usados.has(m.id)
      && !(m.origen?.tipo === 'inversion' && m.origen.gastoId !== gastoId))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * Define el resultado de una inversión.
 * spec: { modo: 'pendiente' } | { modo: 'vincular', ingresoId } | { modo: 'manual', monto, fecha }
 * "manual" crea (o actualiza) un ingreso automático con el monto recuperado.
 */
export function resolverInversion(gastoId, spec) {
  const g = getMov(gastoId);
  if (!g) return;
  const auto = autoRetorno(g);

  if (spec.modo === 'manual') {
    if (auto) {
      auto.monto = Math.max(0, int(spec.monto));
      auto.fecha = spec.fecha || today();
      auto.editado = new Date().toISOString();
    } else {
      const ing = normMov({
        tipo: 'ingreso',
        fecha: spec.fecha || today(),
        nombre: `Retorno: ${g.nombre}`,
        monto: spec.monto,
        tags: [...g.tags],
        origen: { tipo: 'inversion', gastoId: g.id },
      });
      state.movimientos.push(ing);
      g.inversion.ingresoId = ing.id;
    }
  } else {
    if (auto) state.movimientos = state.movimientos.filter((x) => x.id !== auto.id);
    g.inversion.ingresoId = spec.modo === 'vincular' ? spec.ingresoId : null;
  }
  persist('movimientos');
  emit();
}

export function deleteMovimiento(id) {
  const m = getMov(id);
  if (!m) return;
  const ids = new Set([id]);
  const auto = autoRetorno(m);
  if (auto) ids.add(auto.id);
  // Si se borra un ingreso usado como retorno, la inversión vuelve a "pendiente".
  for (const g of state.movimientos) {
    if (g.inversion?.ingresoId && ids.has(g.inversion.ingresoId) && !ids.has(g.id)) g.inversion.ingresoId = null;
  }
  // Deudas: si se borra el movimiento de origen, la deuda queda suelta (editable a mano);
  // si se borra el movimiento de liquidación automática, la deuda vuelve a pendiente.
  for (const d of state.deudas) {
    if (d.movId === id) d.movId = null;
    if (d.movAutoId === id) { d.movAutoId = null; d.estado = 'pendiente'; d.montoLiquidado = null; d.fechaLiquidacion = null; }
  }
  state.movimientos = state.movimientos.filter((x) => !ids.has(x.id));
  persist('movimientos', 'deudas');
  emit();
}

// ---------- Deudas ----------
export function saveDeuda(d) {
  const existe = state.deudas.some((x) => x.id === d.id);
  const n = normDeuda({ ...d, editado: existe ? new Date().toISOString() : d.editado });
  upsert(state.deudas, n);
  persist('deudas');
  emit();
  return n;
}

export function deleteDeuda(id) {
  state.deudas = state.deudas.filter((d) => d.id !== id);
  persist('deudas');
  emit();
}

/** Deudas de las que este movimiento es el origen (un gasto puede dividirse entre varias personas). */
export const deudasDeMov = (movId) => state.deudas.filter((d) => d.movId === movId);

/** Deuda que este movimiento liquidó automáticamente (el ingreso/gasto creado al cancelarla). */
export const deudaLiquidadaPorMov = (movId) => state.deudas.find((d) => d.movAutoId === movId) || null;

/** Perdona la deuda: se descarta el seguimiento y el movimiento de origen (si existe) queda como uno normal. */
export function perdonarDeuda(id) {
  state.deudas = state.deudas.filter((d) => d.id !== id);
  persist('deudas');
  emit();
}

/** Cancela (liquida) una deuda, creando el movimiento automático correspondiente. */
export function cancelarDeuda(id, { monto, fecha } = {}) {
  const d = state.deudas.find((x) => x.id === id);
  if (!d) return;
  const esFavor = d.direccion === 'favor';
  const saldoAntes = esFavor ? saldoDeudas(state.deudas) : 0;
  const netoAntes = esFavor ? resumen(state).neto : 0;

  const origenMov = d.movId ? getMov(d.movId) : null;
  const nombreBase = origenMov?.nombre || d.nombre;
  const montoFinal = Math.max(0, int(monto ?? d.monto));
  const fechaFinal = isDate(fecha) ? fecha : today();

  const auto = normMov({
    tipo: esFavor ? 'ingreso' : 'gasto',
    fecha: fechaFinal,
    nombre: `Deuda ${d.contraparte} ${nombreBase} cancelada`,
    monto: montoFinal,
    tags: origenMov ? [...origenMov.tags] : [],
    origen: { tipo: 'deuda', deudaId: d.id },
  });
  state.movimientos.push(auto);

  d.estado = 'cancelada';
  d.montoLiquidado = montoFinal;
  d.fechaLiquidacion = fechaFinal;
  d.movAutoId = auto.id;
  d.editado = new Date().toISOString();

  persist('movimientos', 'deudas');
  emit();

  // Se te devolvió plata: anima cómo ese valor pasa de "Saldo de deudas" a "Neto",
  // encima de la ventana entera (la cancelación suele hacerse desde el módulo de Deudas, no el Dashboard).
  if (esFavor) {
    emitTransferencia({ saldoAntes, saldoDespues: saldoDeudas(state.deudas), netoAntes, netoDespues: resumen(state).neto });
  }
}

// ---------- Sueldos ----------
export function saveSueldo(s) {
  const existe = state.sueldos.some((x) => x.id === s.id);
  const n = normSueldo({ ...s, editado: existe ? new Date().toISOString() : s.editado });
  upsert(state.sueldos, n);
  persist('sueldos');
  emit();
  return n;
}

export function deleteSueldo(id) {
  state.sueldos = state.sueldos.filter((s) => s.id !== id);
  persist('sueldos');
  emit();
}

/** Crea el ingreso de una ocurrencia y avanza el puntero a la próxima. Usa la fecha dada, o la programada, o hoy. */
export function aplicarSueldo(id, { monto, fecha } = {}) {
  const s = state.sueldos.find((x) => x.id === id);
  if (!s) return null;
  const def = state.ajustes.aporteDefecto;
  const fechaUsada = isDate(fecha) ? fecha : (s.proxima || today());

  const mov = normMov({
    tipo: 'ingreso',
    fecha: fechaUsada,
    nombre: s.nombre,
    monto: monto != null ? monto : (s.monto || 0),
    tags: [...s.tags],
    esSueldo: true,
    ahorro: { modo: def.modo, valor: def.valor },
    origen: { tipo: 'sueldo', sueldoId: s.id },
  });
  state.movimientos.push(mov);
  s.proxima = avanzarFecha(fechaUsada, s.frecuenciaCantidad, s.frecuenciaUnidad);
  s.editado = new Date().toISOString();

  persist('movimientos', 'sueldos');
  emit();
  return mov;
}

/** Salta esta ocurrencia sin registrar ingreso: la sugerencia no vuelve a aparecer hasta la siguiente. */
export function posponerSueldo(id) {
  const s = state.sueldos.find((x) => x.id === id);
  if (!s) return;
  s.proxima = avanzarFecha(s.proxima, s.frecuenciaCantidad, s.frecuenciaUnidad);
  s.editado = new Date().toISOString();
  persist('sueldos');
  emit();
}

/**
 * Al abrir la app (y de nuevo al entrar a Movimientos o Sueldos) se revisan los sueldos:
 * los "automáticos" atrasados se aplican solos (uno por cada ocurrencia perdida, en orden);
 * los "sugeridos" se dejan tal cual — su sugerencia la calcula la UI con sueldoVencido().
 */
export function revisarSueldos() {
  let aplicados = 0;
  for (const s of state.sueldos) {
    let guard = 0;
    // Un sueldo "automático" sin monto fijo no tiene quién le escriba el monto: se ignora
    // (no debería poder guardarse así desde el formulario, pero por si acaso).
    while (s.modo === 'auto' && s.monto != null && sueldoVencido(s) && guard++ < 60) {
      aplicarSueldo(s.id, { monto: s.monto, fecha: s.proxima });
      aplicados++;
    }
  }
  return aplicados;
}

/** Sueldos "sugeridos" que ya les toca y todavía no se resolvieron (para la notificación en Movimientos). */
export function sueldosSugeridosPendientes() {
  return state.sueldos.filter((s) => s.modo === 'sugerido' && sueldoVencido(s));
}

// ---------- Tags ----------
export function saveTag(t) {
  const n = normTag(t);
  upsert(state.tags, n);
  rebuild();
  persist('tags');
  emit();
  return n;
}

export function deleteTag(id) {
  state.tags = state.tags.filter((t) => t.id !== id);
  for (const m of state.movimientos) m.tags = m.tags.filter((x) => x !== id);
  for (const c of state.compras) c.tags = c.tags.filter((x) => x !== id);
  rebuild();
  persist('tags', 'movimientos', 'compras');
  emit();
}

export function usoTag(id) {
  const movs = state.movimientos.filter((m) => m.tags.includes(id));
  return {
    usos: movs.length + state.compras.filter((c) => c.tags.includes(id)).length,
    gastado: movs.filter((m) => m.tipo === 'gasto').reduce((a, m) => a + m.monto, 0),
    ingresado: movs.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0),
    enLista: state.compras.filter((c) => c.tags.includes(id)).reduce((a, c) => a + c.costo, 0),
  };
}

// ---------- Lista de compras ----------
export function saveCompra(c) {
  const n = normCompra(c);
  upsert(state.compras, n);
  persist('compras');
  emit();
  return n;
}

export function deleteCompra(id) {
  state.compras = state.compras.filter((c) => c.id !== id);
  persist('compras');
  emit();
}

/** Pasa un ítem de la lista a gastos. No se puede deshacer directamente. */
export function comprar(id, { fecha = today(), monto } = {}) {
  const c = state.compras.find((x) => x.id === id);
  if (!c) return null;
  const g = normMov({
    tipo: 'gasto',
    fecha,
    nombre: c.nombre,
    descripcion: c.descripcion,
    monto: monto != null ? monto : c.costo,
    tags: [...c.tags],
    desdeAhorro: c.esAhorro,
    origen: { tipo: 'compra', compraId: c.id, esAhorro: c.esAhorro, agregadoALista: c.creado, costoLista: c.costo },
  });
  state.movimientos.push(g);
  state.compras = state.compras.filter((x) => x.id !== id);
  persist('movimientos', 'compras');
  emit();
  return g;
}

// ---------- Ajustes ----------
export function updateAjustes(patch) {
  state.ajustes = { ...state.ajustes, ...patch };
  persist('ajustes');
  emit();
}

export function addAjusteAhorro({ fecha, monto, nota }) {
  state.ajustes.ajustesAhorro.push({ id: uid(), fecha: fecha || today(), monto: int(monto), nota: nota || '' });
  persist('ajustes');
  emit();
}

export function deleteAjusteAhorro(id) {
  state.ajustes.ajustesAhorro = state.ajustes.ajustesAhorro.filter((a) => a.id !== id);
  persist('ajustes');
  emit();
}
