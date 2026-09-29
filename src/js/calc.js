// Lógica financiera pura (sin DOM). Todas las definiciones del glosario viven aquí.
//
//  Neto                 = saldo inicial + Σ ingresos − Σ gastos   (inversiones cuentan como gasto)
//  Presupuesto ahorro   = ahorro inicial + Σ aportes de ingresos + Σ ajustes manuales − Σ gastos pagados desde ahorro
//  Bolsillo             = Neto − Presupuesto de ahorro
//  Objetivo             = Σ costo de ítems de la lista de compras marcados como ahorro
//  Ideal teórico        = Σ costo de todos los ítems de la lista de compras
//  Coeficiente (periodo)= ingresos − gastos del periodo (mes o año)
//  Reembolso            = un gasto con reembolso cuenta como (monto − reembolso); si el reembolso
//                          supera el monto, la diferencia cuenta como ingreso (gastoEfectivo / ingresoEfectivo)

import { today, clamp, claveDe, sumarDias, nowHHMM } from './format.js';

export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
export const esIngreso = (m) => m.tipo === 'ingreso';
export const esGasto = (m) => m.tipo === 'gasto';

/** Cuánto de un ingreso se destina al presupuesto de ahorro. */
export function aporteAhorro(m) {
  if (!esIngreso(m) || !m.ahorro) return 0;
  const v = Math.max(0, Number(m.ahorro.valor) || 0);
  if (m.ahorro.modo === 'fijo') return Math.min(v, m.monto);
  return Math.round((m.monto * Math.min(v, 100)) / 100);
}

/**
 * Un gasto reembolsado deja de contar (total o parcialmente) como gasto; si lo reembolsado
 * supera lo gastado, la diferencia pasa a contar como ingreso (ver ingresoEfectivo).
 */
export function gastoEfectivo(m) {
  if (!esGasto(m)) return 0;
  return Math.max(0, m.monto - (m.reembolso || 0));
}

/** Ingreso "real" de un movimiento: su monto si es ingreso, o el excedente de un reembolso sobre lo gastado. */
export function ingresoEfectivo(m) {
  if (esIngreso(m)) return m.monto;
  return Math.max(0, (m.reembolso || 0) - m.monto);
}

/** Efecto de un movimiento sobre el presupuesto de ahorro. */
export function efectoAhorro(m) {
  if (esIngreso(m)) return aporteAhorro(m);
  if (esGasto(m) && m.desdeAhorro) return efectoNeto(m);
  return 0;
}

export const efectoNeto = (m) => (esIngreso(m) ? m.monto : (m.reembolso || 0) - m.monto);

/** periodo: 'semana' | 'mes' | 'anio' | 'todo' */
export function enPeriodo(m, periodo, ref = today()) {
  if (periodo === 'semana') return claveDe(m.fecha, 'semana') === claveDe(ref, 'semana');
  if (periodo === 'mes') return m.fecha.slice(0, 7) === ref.slice(0, 7);
  if (periodo === 'anio') return m.fecha.slice(0, 4) === ref.slice(0, 4);
  return true;
}

export function totalesDe(movs) {
  const ingresos = sum(movs, ingresoEfectivo);
  const gastos = sum(movs, gastoEfectivo);
  return { ingresos, gastos, coef: ingresos - gastos };
}

function agrupar(movs, claveDeMov) {
  const map = new Map();
  for (const m of movs) {
    const k = claveDeMov(m.fecha);
    if (!map.has(k)) map.set(k, { key: k, ingresos: 0, gastos: 0, coef: 0, ahorro: 0, count: 0, arrepSum: 0, arrepN: 0 });
    const e = map.get(k);
    e.ingresos += ingresoEfectivo(m);
    e.gastos += gastoEfectivo(m);
    if (esGasto(m)) {
      e.arrepSum += m.arrepentimiento || 0;
      e.arrepN += 1;
    }
    e.ahorro += efectoAhorro(m);
    e.count += 1;
    e.coef = e.ingresos - e.gastos;
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Agrupa por mes 'YYYY-MM' (ordenado ascendente). */
export function porMes(movs) {
  return agrupar(movs, (f) => f.slice(0, 7));
}

/** Agrupa por periodo ('mes' | 'semana' | 'dia'), ordenado ascendente. */
export function porPeriodo(movs, gran) {
  return agrupar(movs, (f) => claveDe(f, gran));
}

export function resumen(state, ref = today()) {
  const { movimientos: movs, compras, ajustes } = state;
  const t = totalesDe(movs);
  const neto = (ajustes.saldoInicial || 0) + t.ingresos - t.gastos;
  const ahorro = (ajustes.ahorroInicial || 0)
    + sum(movs, efectoAhorro)
    + sum(ajustes.ajustesAhorro || [], (a) => a.monto);
  const objetivo = sum(compras.filter((c) => c.esAhorro), (c) => c.costo);
  const ideal = sum(compras, (c) => c.costo);
  const nMeses = Math.max(porMes(movs).size, 1);

  return {
    neto,
    ahorro,
    bolsillo: neto - ahorro,
    objetivo,
    ideal,
    ingresosTot: t.ingresos,
    gastosTot: t.gastos,
    mes: totalesDe(movs.filter((m) => enPeriodo(m, 'mes', ref))),
    anio: totalesDe(movs.filter((m) => enPeriodo(m, 'anio', ref))),
    promIngresoMensual: t.ingresos / nMeses,
    promGastoMensual: t.gastos / nMeses,
  };
}

/**
 * Puntajes [-1, 1] para colorear los números del dashboard (rojo → verde).
 * Ajusta aquí si quieres otra sensibilidad.
 */
export function puntajes(r, periodo) {
  const p = r[periodo];
  const ref = Math.max(r.promGastoMensual, 1);
  const cobertura = r.objetivo > 0 ? (r.ahorro / r.objetivo) * 2 - 1 : Math.sign(r.ahorro);
  const ratio = (a, b) => (b > 0 ? a / b : (a > 0 ? 2 : 0));
  return {
    neto: r.neto / (ref * 3),                 // ~3 meses de gasto = verde pleno
    ahorro: cobertura,
    objetivo: cobertura,
    bolsillo: r.bolsillo / ref,               // 1 mes de gasto libre = verde pleno
    ingresosTot: ratio(r.ingresosTot, r.gastosTot) - 1,
    gastosTot: r.ingresosTot > 0 ? 1 - 2 * (r.gastosTot / r.ingresosTot) : (r.gastosTot > 0 ? -1 : 0),
    ingresosP: p.ingresos === 0 && p.gastos === 0 ? 0 : ratio(p.ingresos, p.gastos) - 1,
    gastosP: p.ingresos > 0 ? 1 - 2 * (p.gastos / p.ingresos) : (p.gastos > 0 ? -1 : 0),
    coef: p.ingresos > 0 ? (p.coef / p.ingresos) * 2 : Math.sign(p.coef),
  };
}

/** Serie diaria acumulada de neto y presupuesto de ahorro. */
export function serieTemporal(state) {
  const { movimientos: movs, ajustes } = state;
  const eventos = movs
    .map((m) => ({ fecha: m.fecha, neto: efectoNeto(m), ahorro: efectoAhorro(m) }))
    .concat((ajustes.ajustesAhorro || []).map((a) => ({ fecha: a.fecha, neto: 0, ahorro: a.monto })))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  let neto = ajustes.saldoInicial || 0;
  let ahorro = ajustes.ahorroInicial || 0;
  const out = [];
  for (const e of eventos) {
    neto += e.neto;
    ahorro += e.ahorro;
    const last = out[out.length - 1];
    if (last && last.fecha === e.fecha) { last.neto = neto; last.ahorro = ahorro; }
    else out.push({ fecha: e.fecha, neto, ahorro });
  }
  return out;
}

/** Estado de una inversión: pendiente | ganancia | perdida */
export function estadoInversion(g, movs) {
  if (!esGasto(g) || !g.esInversion) return null;
  const id = g.inversion?.ingresoId;
  const ing = id ? movs.find((m) => m.id === id) : null;
  if (!ing) return { estado: 'pendiente', retorno: null, diferencia: null, rentabilidad: null };
  const diferencia = ing.monto - g.monto;
  return {
    estado: diferencia > 0 ? 'ganancia' : 'perdida',
    retorno: ing.monto,
    diferencia,
    rentabilidad: g.monto > 0 ? (diferencia / g.monto) * 100 : null,
    ingreso: ing,
  };
}

/** Totales por tag. Un movimiento con varios tags suma en cada uno. Los gastos usan su monto ya neto de reembolsos. */
export function porTag(movs, tags, tipo = 'gasto') {
  const rows = tags.map((t) => ({ tag: t, total: 0, count: 0 }));
  const idx = new Map(rows.map((r) => [r.tag.id, r]));
  const sinTag = { tag: null, total: 0, count: 0 };
  for (const m of movs) {
    if (m.tipo !== tipo) continue;
    const monto = tipo === 'gasto' ? gastoEfectivo(m) : m.monto;
    const ids = (m.tags || []).filter((id) => idx.has(id));
    if (!ids.length) { sinTag.total += monto; sinTag.count += 1; }
    for (const id of ids) { const r = idx.get(id); r.total += monto; r.count += 1; }
  }
  const out = rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  if (sinTag.total > 0) out.push(sinTag);
  return out;
}

/** % de arrepentimiento promedio por tag (0 = nada, 100 = el máximo). Solo considera gastos. */
export function arrepentimientoPorTag(movs, tags) {
  const rows = tags.map((t) => ({ tag: t, sum: 0, count: 0 }));
  const idx = new Map(rows.map((r) => [r.tag.id, r]));
  for (const m of movs) {
    if (!esGasto(m)) continue;
    for (const id of (m.tags || [])) {
      const r = idx.get(id);
      if (r) { r.sum += m.arrepentimiento || 0; r.count += 1; }
    }
  }
  return rows
    .filter((r) => r.count > 0)
    .map((r) => ({ tag: r.tag, pct: (r.sum / r.count / 5) * 100, count: r.count }))
    .sort((a, b) => b.pct - a.pct);
}

/** Monto gastado (neto de reembolsos) por nivel de arrepentimiento [0..5]. */
export function porArrepentimiento(movs) {
  const arr = [0, 0, 0, 0, 0, 0];
  for (const m of movs) if (esGasto(m)) arr[clamp(m.arrepentimiento || 0, 0, 5)] += gastoEfectivo(m);
  return arr;
}

/**
 * Signo y monto final a mostrar para un movimiento, considerando reembolsos:
 * un gasto reembolsado en exceso se muestra como ingreso (signo +1).
 */
export function montoMostrado(m) {
  if (esIngreso(m)) return { signo: 1, monto: m.monto };
  const ef = efectoNeto(m); // reembolso - monto
  return ef >= 0 ? { signo: 1, monto: ef } : { signo: -1, monto: -ef };
}

/** Filtro por tags: coincide si el ítem tiene al menos uno de los seleccionados. */
export function filtrarPorTags(items, tagIds) {
  if (!tagIds?.length) return items;
  return items.filter((i) => (i.tags || []).some((t) => tagIds.includes(t)));
}

/** Fecha límite absoluta de una deuda, según su plazo (fecha fija, días desde su origen, o ninguno). */
export function fechaLimiteDeuda(d) {
  if (d.plazoModo === 'fecha') return d.plazoFecha || null;
  if (d.plazoModo === 'dias') return d.fecha ? sumarDias(d.fecha, d.plazoDias) : null;
  return null;
}

/** Estado temporal de una deuda: su fecha límite y si ya está atrasada. */
export function estadoDeuda(d, ref = today()) {
  const limite = fechaLimiteDeuda(d);
  return { limite, atrasada: d.estado === 'pendiente' && !!limite && limite < ref };
}

/** Saldo neto de deudas pendientes: lo que te deben menos lo que debes. */
export function saldoDeudas(deudas) {
  return sum(deudas.filter((d) => d.estado === 'pendiente'), (d) => (d.direccion === 'favor' ? d.monto : -d.monto));
}

/** ¿Ya le toca a este sueldo? Si su fecha programada ya pasó, sí; si es hoy, solo tras la hora fijada. */
export function sueldoVencido(s, ref = today(), hora = nowHHMM()) {
  if (!s.activo) return false;
  if (s.proxima > ref) return false;
  if (s.proxima === ref) return hora >= s.hora;
  return true;
}

const UNIDAD_TXT = {
  dia: ['día', 'días'], semana: ['semana', 'semanas'], mes: ['mes', 'meses'], anio: ['año', 'años'],
};

/** "Cada 3 días" / "Cada mes" (sin "1" cuando la cantidad es 1). */
export function frecuenciaTexto(s) {
  const [uno, varios] = UNIDAD_TXT[s.frecuenciaUnidad] || UNIDAD_TXT.mes;
  return s.frecuenciaCantidad === 1 ? `Cada ${uno}` : `Cada ${s.frecuenciaCantidad} ${varios}`;
}

/** Métricas de un ítem de la lista de compras. */
export function metricasCompra(item, r) {
  return {
    pctObjetivo: item.esAhorro && r.objetivo > 0 ? (item.costo / r.objetivo) * 100 : null,
    pctTotal: r.ideal > 0 ? (item.costo / r.ideal) * 100 : null,
    comprableAhorro: item.esAhorro ? item.costo <= r.ahorro : null,
    comprableNeto: item.costo <= r.neto,
  };
}
