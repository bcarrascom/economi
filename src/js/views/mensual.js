// Progresión: evolución de ingresos, gastos y coeficiente en el tiempo, más el detalle mes a mes.

import { state } from '../store.js';
import {
  porMes, porPeriodo, porTag, totalesDe, montoMostrado,
} from '../calc.js';
import {
  clp, clpSigned, pct, esc, monthName, pad, currentYear, currentMonthKey, fechaCorta, regretColor, hexToRgba,
  periodoLabel, ultimosPeriodos,
} from '../format.js';
import { icon } from '../icons.js';
import {
  tagPill, segmented, bindSegmented, aplicarCensura,
} from '../ui.js';
import { chart, moneyScale, catScale, moneyTooltip, COLORS } from '../charts.js';

let anio = currentYear();
const abiertos = new Set();

const VENTANAS = { dia: [14, 30, 60, 120, 250], semana: [8, 13, 26, 52, 104], mes: [6, 12, 24, 36, 60] };
const UNIDAD = { dia: ['día', 'días'], semana: ['semana', 'semanas'], mes: ['mes', 'meses'] };
const PREF_KEY = 'progresion:controles';

let gran = 'mes';
const zoomIdx = { dia: 1, semana: 1, mes: 1 };

// Recuerda la granularidad y el zoom elegidos, por dispositivo.
(function cargarPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY));
    if (p?.gran in VENTANAS) gran = p.gran;
    for (const g of Object.keys(zoomIdx)) {
      const i = p?.zoomIdx?.[g];
      if (Number.isInteger(i) && i >= 0 && i < VENTANAS[g].length) zoomIdx[g] = i;
    }
  } catch { /* localStorage no disponible o dato corrupto: se usan los valores por defecto */ }
})();

function guardarPrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ gran, zoomIdx })); } catch { /* ignorar */ }
}

export const meta = { id: 'progresion', title: 'Progresión', icon: 'invest' };

export function render(root, { first }) {
  const years = [...new Set([currentYear(), ...state.movimientos.map((m) => Number(m.fecha.slice(0, 4)))])].sort();
  const minY = years[0];
  const maxY = Math.max(years[years.length - 1], currentYear());

  const pm = porMes(state.movimientos);
  const hastaMes = anio === currentYear() ? Number(currentMonthKey().slice(5)) : 12;
  const keys = Array.from({ length: hastaMes }, (_, i) => `${anio}-${pad(i + 1)}`);
  const rows = keys.map((k) => pm.get(k) || { key: k, ingresos: 0, gastos: 0, coef: 0, ahorro: 0, count: 0, arrepSum: 0, arrepN: 0 });
  const conDatos = rows.filter((r) => r.count > 0);
  const totAnio = totalesDe(state.movimientos.filter((m) => m.fecha.startsWith(String(anio))));
  const ahorroAnio = rows.reduce((a, r) => a + r.ahorro, 0);
  const nProm = Math.max(conDatos.length, 1);
  const promGasto = conDatos.reduce((a, r) => a + r.gastos, 0) / nProm;

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Progresión</h1><p class="subtitle">Visualiza tus finanzas en el tiempo y compara meses</p></div>
      <div class="spacer"></div>
      <div class="year-nav">
        <button class="ibtn ghost sm" data-y="-1" ${anio <= minY ? 'disabled' : ''} data-tip="Año anterior">${icon('chevronLeft')}</button>
        <span class="year">${anio}</span>
        <button class="ibtn ghost sm" data-y="1" ${anio >= maxY ? 'disabled' : ''} data-tip="Año siguiente">${icon('chevronRight')}</button>
      </div>
    </header>

    <section class="mini-stats">
      <div class="card mini"><span>Ingresos ${anio}</span><b class="censurable pos">${clp(totAnio.ingresos)}</b></div>
      <div class="card mini"><span>Gastos ${anio}</span><b class="censurable neg">${clp(totAnio.gastos)}</b></div>
      <div class="card mini"><span>Coeficiente ${anio}</span><b class="censurable ${totAnio.coef >= 0 ? 'pos' : 'neg'}">${clpSigned(totAnio.coef)}</b></div>
      <div class="card mini"><span>Gasto mensual promedio</span><b class="censurable">${clp(promGasto)}</b></div>
      <div class="card mini"><span>Aportado al ahorro</span><b class="censurable">${clp(ahorroAnio)}</b></div>
    </section>

    <div class="card chart-card">
      <div class="chart-title">
        <h4>Progresión</h4>
        ${segmented('gran', [['mes', 'Mes'], ['semana', 'Semana'], ['dia', 'Día']], gran)}
        <div class="year-nav" data-el="zoom">
          <button class="ibtn ghost sm" data-zoom="-1" data-tip="Acercar">${icon('minus')}</button>
          <span class="zoom-label" data-el="zoomLabel"></span>
          <button class="ibtn ghost sm" data-zoom="1" data-tip="Alejar">${icon('plus')}</button>
        </div>
        <span class="legend-inline"><i style="--c:${COLORS.green}"></i>Ingresos<i style="--c:${COLORS.red}"></i>Gastos<i class="ln" style="--c:${COLORS.accent}"></i>Coeficiente<i class="ln dash" style="--c:${COLORS.orange}"></i>Promedio</span>
      </div>
      <div class="chart-box"><canvas data-c="prog"></canvas></div>
    </div>

    <div class="section-head"><h2>Detalle mensual</h2></div>

    <div class="table-wrap">
      <table class="t">
        <thead><tr>
          <th class="w-exp"></th><th class="grow">Mes</th><th class="num">Ingresos</th><th class="num">Gastos</th>
          <th class="num">Coeficiente</th><th class="num">Al ahorro</th><th class="num">Gastos vs mes anterior</th>
          <th>Arrep. prom.</th><th class="num">Movs.</th>
        </tr></thead>
        <tbody>
          ${[...rows].reverse().map((r, i) => fila(r, pm, i, first)).join('')}
        </tbody>
        <tfoot>
          <tr><td></td><td>Promedio mensual</td>
            <td class="num">${clp(conDatos.reduce((a, r) => a + r.ingresos, 0) / nProm)}</td>
            <td class="num">${clp(promGasto)}</td>
            <td class="num">${clpSigned(conDatos.reduce((a, r) => a + r.coef, 0) / nProm)}</td>
            <td class="num">${clp(ahorroAnio / nProm)}</td><td></td><td></td><td></td></tr>
        </tfoot>
      </table>
    </div>`;

  aplicarCensura(root);
  root.querySelectorAll('[data-y]').forEach((b) => {
    b.onclick = () => { anio += Number(b.dataset.y); render(root, { first: true }); };
  });
  root.querySelector('tbody').onclick = (e) => {
    const tr = e.target.closest('tr.row');
    if (!tr) return;
    const k = tr.dataset.key;
    const open = !abiertos.has(k);
    if (open) abiertos.add(k); else abiertos.delete(k);
    tr.classList.toggle('is-open', open);
    tr.nextElementSibling?.classList.toggle('open', open);
  };

  bindSegmented(root, 'gran', (v) => { gran = v; guardarPrefs(); zoomInfo(root); progresoChart(root, false); });
  root.querySelector('[data-el="zoom"]').onclick = (e) => {
    const b = e.target.closest('[data-zoom]');
    if (!b || b.disabled) return;
    const max = VENTANAS[gran].length - 1;
    zoomIdx[gran] = Math.min(max, Math.max(0, zoomIdx[gran] + Number(b.dataset.zoom)));
    guardarPrefs();
    zoomInfo(root);
    progresoChart(root, false);
  };

  zoomInfo(root);
  progresoChart(root, first);
}

/** Actualiza la etiqueta y el estado habilitado/deshabilitado de los botones de zoom. */
function zoomInfo(root) {
  const idx = zoomIdx[gran];
  const n = VENTANAS[gran][idx];
  const [uno, varios] = UNIDAD[gran];
  root.querySelector('[data-el="zoomLabel"]').textContent = `${n} ${n === 1 ? uno : varios}`;
  root.querySelector('[data-zoom="-1"]').disabled = idx <= 0;
  root.querySelector('[data-zoom="1"]').disabled = idx >= VENTANAS[gran].length - 1;
}

/** Gráfico principal: ingresos, gastos y coeficiente por periodo, con zoom horizontal. */
function progresoChart(root, anim) {
  const n = VENTANAS[gran][zoomIdx[gran]];
  const keysP = ultimosPeriodos(n, gran);
  const pp = porPeriodo(state.movimientos, gran);
  const rowsP = keysP.map((k) => pp.get(k) || { ingresos: 0, gastos: 0, coef: 0, count: 0 });
  const conDatosP = rowsP.filter((r) => r.count > 0);
  const promGastoP = conDatosP.length ? conDatosP.reduce((a, r) => a + r.gastos, 0) / conDatosP.length : 0;

  chart(root.querySelector('[data-c="prog"]'), 'm-prog', {
    type: 'bar',
    data: {
      labels: keysP.map((k) => periodoLabel(k, gran)),
      datasets: [
        { type: 'line', label: 'Coeficiente', data: rowsP.map((r) => r.coef), borderColor: COLORS.accent, backgroundColor: COLORS.accent, borderWidth: 1.6, tension: 0.35, pointRadius: n > 40 ? 0 : 2, order: 0 },
        { type: 'line', label: 'Promedio', data: rowsP.map(() => promGastoP), borderColor: COLORS.orange, borderDash: [4, 4], borderWidth: 1.2, pointRadius: 0, order: 0 },
        { label: 'Ingresos', data: rowsP.map((r) => r.ingresos), backgroundColor: hexToRgba(COLORS.green, 0.55), hoverBackgroundColor: COLORS.green, borderRadius: 4, maxBarThickness: 22, order: 1 },
        { label: 'Gastos', data: rowsP.map((r) => r.gastos), backgroundColor: hexToRgba(COLORS.red, 0.5), hoverBackgroundColor: COLORS.red, borderRadius: 4, maxBarThickness: 22, order: 1 },
      ],
    },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: moneyTooltip }, scales: { x: catScale(), y: moneyScale() } },
  }, anim);
}

function prevKey(k) {
  let [y, m] = k.split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return `${y}-${pad(m)}`;
}

function fila(r, pm, i, anim) {
  const prev = pm.get(prevKey(r.key));
  let delta = '<span class="muted">—</span>';
  if (prev && prev.gastos > 0) {
    const d = ((r.gastos - prev.gastos) / prev.gastos) * 100;
    delta = `<span class="${d > 0 ? 'neg' : 'pos'}">${d > 0 ? '▲' : '▼'} ${pct(Math.abs(d), 0)}</span>`;
  }
  const arrep = r.arrepN ? r.arrepSum / r.arrepN : null;
  const esActual = r.key === currentMonthKey();
  return `
    <tr class="row ${anim ? 'anim' : ''} ${r.count ? '' : 'is-zero'} ${abiertos.has(r.key) ? 'is-open' : ''}" data-key="${r.key}" style="--i:${i}">
      <td class="w-exp">${icon('chevronRight', 'chev')}</td>
      <td class="grow"><span class="name">${monthName(Number(r.key.slice(5)))}${esActual ? '<span class="chip">Actual</span>' : ''}</span></td>
      <td class="num pos">${r.ingresos ? clp(r.ingresos) : '<span class="muted">—</span>'}</td>
      <td class="num neg">${r.gastos ? clp(r.gastos) : '<span class="muted">—</span>'}</td>
      <td class="num"><b class="${r.coef >= 0 ? 'pos' : 'neg'}">${r.count ? clpSigned(r.coef) : '<span class="muted">—</span>'}</b></td>
      <td class="num">${r.ahorro ? clp(r.ahorro) : '<span class="muted">—</span>'}</td>
      <td class="num">${delta}</td>
      <td>${arrep != null ? `<span style="color:${regretColor(arrep)}">${arrep.toLocaleString('es-CL', { maximumFractionDigits: 1 })}</span>` : '<span class="muted">—</span>'}</td>
      <td class="num dim">${r.count || ''}</td>
    </tr>
    <tr class="detail ${abiertos.has(r.key) ? 'open' : ''}"><td colspan="9"><div class="detail-inner"><div>${detalleMes(r.key)}</div></div></td></tr>`;
}

function detalleMes(key) {
  const movs = state.movimientos.filter((m) => m.fecha.startsWith(key)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (!movs.length) return '<div class="detail-body"><span class="muted">Sin movimientos este mes.</span></div>';
  const tags = porTag(movs, state.tags);
  return `
    <div class="detail-body month-detail">
      <div>
        <h5>Gastos por tag</h5>
        <div class="tag-totals">${tags.length ? tags.map((t) => `<span class="tag-total">${t.tag ? tagPill(t.tag) : '<span class="muted">Sin tag</span>'}<b>${clp(t.total)}</b></span>`).join('') : '<span class="muted">Sin gastos.</span>'}</div>
      </div>
      <div>
        <h5>Movimientos</h5>
        <div class="mini-list">${movs.map((m) => {
          const d = montoMostrado(m);
          return `<div class="mini-row"><span class="dim">${fechaCorta(m.fecha)}</span><span class="grow">${esc(m.nombre)}</span><span class="${d.signo > 0 ? 'pos' : 'neg'}">${d.signo > 0 ? '+' : '−'}${clp(d.monto)}</span></div>`;
        }).join('')}
        </div>
      </div>
    </div>`;
}
