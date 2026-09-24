// Dashboard: menú principal con números clave y todos los gráficos.

import { state } from '../store.js';
import {
  resumen, puntajes, serieTemporal, porMes, porTag, porArrepentimiento,
  filtrarPorTags, enPeriodo, estadoInversion, saldoDeudas,
} from '../calc.js';
import {
  clp, pct, monthLabel, currentMonthKey, scaleColor, regretColor, fechaCorta,
  ultimosMeses, currentYear, hexToRgba, clamp, esc,
} from '../format.js';
import { icon } from '../icons.js';
import {
  segmented, bindSegmented, statCard, runCounts, tagFilter, countUp, estaCensurado, setCensurado, aplicarCensura,
} from '../ui.js';
import { chart, lineConfig, moneyScale, catScale, moneyTooltip, tagDoughnutConfig, COLORS } from '../charts.js';
import { openMovimientoForm } from '../forms/movimiento-form.js';
import { go } from '../app.js';

let periodo = 'mes';
let filtro = [];

export const meta = { id: 'dashboard', title: 'Dashboard', icon: 'dashboard' };

// Navegación al hacer click en una tarjeta (data-nav="clave" en el statCard correspondiente).
const NAV = {
  ingresosTot: () => go('movimientos', { tab: 'ingreso', mes: '' }),
  gastosTot: () => go('movimientos', { tab: 'gasto', mes: '' }),
  ingresosP: () => go('movimientos', { tab: 'ingreso', mes: currentMonthKey() }),
  gastosP: () => go('movimientos', { tab: 'gasto', mes: currentMonthKey() }),
  coef: () => go('movimientos', { tab: 'todos', mes: currentMonthKey() }),
  objetivo: () => go('compras'),
  deudas: () => go('deudas'),
};

export function render(root, { first }) {
  const censurado = estaCensurado();
  root.innerHTML = `
    <header class="page-head">
      <div><h1>Dashboard</h1><p class="subtitle" data-el="sub"></p></div>
      <div class="spacer"></div>
      <button class="ibtn ${censurado ? 'on' : ''}" data-act="censura" data-tip="${censurado ? 'Mostrar valores' : 'Ocultar valores'}">${icon(censurado ? 'lockClosed' : 'lockOpen')}</button>
      ${segmented('periodo', [['mes', 'Mes'], ['anio', 'Año']], periodo)}
      <button class="ibtn primary" data-act="nuevo" data-tip="Nuevo movimiento">${icon('plus')}</button>
    </header>
    <div data-el="body"></div>`;
  bindSegmented(root, 'periodo', (v) => { periodo = v; body(root, false); });
  root.querySelector('[data-act="nuevo"]').onclick = () => openMovimientoForm();
  root.querySelector('[data-act="censura"]').onclick = () => { setCensurado(!censurado); render(root, { first: false }); };
  body(root, first);
}

function body(root, anim) {
  const r = resumen(state);
  const s = puntajes(r, periodo);
  const p = r[periodo];
  const nombreP = periodo === 'mes' ? 'este mes' : 'este año';
  root.querySelector('[data-el="sub"]').textContent = periodo === 'mes'
    ? monthLabel(currentMonthKey()) : `Año ${currentYear()}`;

  const cNeto = scaleColor(s.neto);
  const partAhorro = r.neto > 0 ? clamp((r.ahorro / r.neto) * 100, 0, 100) : 0;
  const deudasPend = state.deudas.filter((d) => d.estado === 'pendiente');
  const saldoD = saldoDeudas(state.deudas);

  const b = root.querySelector('[data-el="body"]');
  b.innerHTML = `
    <section class="dash-top">
      <div class="stack">
        ${statCard('ahorro', 'Presupuesto de ahorro', 'piggy', s.ahorro, r.neto > 0 ? `${pct((r.ahorro / r.neto) * 100)} del neto` : '')}
        ${statCard('objetivo', 'Objetivo', 'flag', s.objetivo, r.objetivo > 0 ? `${pct((r.ahorro / r.objetivo) * 100, 0)} cubierto por el ahorro` : 'Sin ítems de ahorro en la lista', 'objetivo')}
      </div>
      <div class="card hero" style="--c:${cNeto}">
        <div class="hero-glow"></div>
        <div class="stat-label">${icon('wallet')}<span>Neto</span></div>
        <div class="hero-value censurable" data-count="neto" style="color:${cNeto}"></div>
        <div class="hero-split">
          <div class="split-bar"><i class="a" style="--w:${partAhorro}%"></i></div>
          <div class="split-legend">
            <span><i class="sw-a"></i>Ahorro <b class="censurable">${clp(r.ahorro)}</b></span>
            <span><i class="sw-b"></i>Bolsillo <b class="censurable">${clp(r.bolsillo)}</b></span>
          </div>
        </div>
      </div>
      <div class="stack">
        ${statCard('bolsillo', 'Bolsillo', 'wallet', s.bolsillo, 'Libre para gastar')}
        ${statCard('deudas', 'Saldo de deudas', 'debt', saldoD < 0 ? -1 : 1, `${deudasPend.length} ${deudasPend.length === 1 ? 'pendiente' : 'pendientes'}`, 'deudas')}
      </div>
    </section>

    <section class="dash-stats">
      ${statCard('ingresosTot', 'Ingresos totales', 'income', s.ingresosTot, '', 'ingresosTot')}
      ${statCard('gastosTot', 'Gastos totales', 'expense', s.gastosTot, '', 'gastosTot')}
      ${statCard('coef', `Coeficiente ${nombreP}`, 'invest', s.coef, p.ingresos > 0 ? `${pct((p.coef / p.ingresos) * 100, 0)} de los ingresos` : '', 'coef')}
      ${statCard('gastosP', `Gastos ${nombreP}`, 'expense', s.gastosP, '', 'gastosP')}
      ${statCard('ingresosP', `Ingresos ${nombreP}`, 'income', s.ingresosP, '', 'ingresosP')}
    </section>

    <div class="section-head">
      <h2>Gráficos</h2>
      <div class="spacer"></div>
      <div data-el="filter"></div>
    </div>

    <section class="charts">
      <div class="card chart-card span-2"><div class="chart-title"><h4>Neto en el tiempo</h4></div><div class="chart-box tall"><canvas data-c="neto"></canvas></div></div>
      <div class="card chart-card"><div class="chart-title"><h4>Últimos movimientos</h4></div><div class="recent" data-el="recent"></div></div>
      <div class="card chart-card span-2"><div class="chart-title"><h4>Ingresos y gastos por mes</h4><span class="legend-inline"><i style="--c:${COLORS.green}"></i>Ingresos<i style="--c:${COLORS.red}"></i>Gastos<i class="ln" style="--c:${COLORS.accent}"></i>Coeficiente</span></div><div class="chart-box"><canvas data-c="mensual"></canvas></div></div>
      <div class="card chart-card"><div class="chart-title"><h4>Gastos por tag</h4><span class="muted">${nombreP}</span></div><div class="chart-box"><canvas data-c="tags"></canvas></div></div>
      <div class="card chart-card"><div class="chart-title"><h4>Gasto según arrepentimiento</h4></div><div class="chart-box"><canvas data-c="arrep"></canvas></div></div>
      <div class="card chart-card"><div class="chart-title"><h4>Inversiones</h4></div><div class="chart-box"><canvas data-c="inv"></canvas></div></div>
      <div class="card chart-card"><div class="chart-title"><h4>Presupuesto de ahorro</h4></div><div class="chart-box tall"><canvas data-c="ahorro"></canvas></div></div>
    </section>`;

  runCounts(b, 'dash', {
    ahorro: r.ahorro, objetivo: r.objetivo, bolsillo: r.bolsillo, deudas: saldoD,
    ingresosTot: r.ingresosTot, gastosTot: r.gastosTot,
    ingresosP: p.ingresos, gastosP: p.gastos, coef: p.coef,
  });
  countUp(b.querySelector('[data-count="neto"]'), 'dash:neto', r.neto);
  aplicarCensura(b);
  requestAnimationFrame(() => b.querySelector('.split-bar i')?.classList.add('in'));
  b.onclick = (e) => NAV[e.target.closest('[data-nav]')?.dataset.nav]?.();

  tagFilter(b.querySelector('[data-el="filter"]'), filtro, (v) => { filtro = v; charts(b, false); });
  charts(b, anim);
  recientes(b);
}

function empty(canvas, msg = 'Aún no hay datos') {
  canvas.parentElement.classList.add('is-empty');
  canvas.parentElement.dataset.empty = msg;
}

function charts(b, anim) {
  const cv = (k) => {
    const c = b.querySelector(`[data-c="${k}"]`);
    c.parentElement.classList.remove('is-empty');
    return c;
  };
  const serie = serieTemporal(state);
  const labels = serie.map((x) => fechaCorta(x.fecha));

  // Neto y ahorro en el tiempo (no se filtran: son totales globales)
  const cN = cv('neto');
  if (serie.length) chart(cN, 'd-neto', lineConfig(labels, serie.map((x) => x.neto), COLORS.accent, 'Neto'), anim);
  else empty(cN, 'Agrega movimientos para ver la evolución del neto');
  const cA = cv('ahorro');
  if (serie.length) chart(cA, 'd-ahorro', lineConfig(labels, serie.map((x) => x.ahorro), COLORS.green, 'Ahorro'), anim);
  else empty(cA);

  const movsF = filtrarPorTags(state.movimientos, filtro);

  // Ingresos vs gastos por mes (últimos 12)
  const meses = ultimosMeses(12);
  const pm = porMes(movsF);
  const cM = cv('mensual');
  if (movsF.length) {
    chart(cM, 'd-mensual', {
      type: 'bar',
      data: {
        labels: meses.map((k) => monthLabel(k, true)),
        datasets: [
          { type: 'line', label: 'Coeficiente', data: meses.map((k) => pm.get(k)?.coef || 0), borderColor: COLORS.accent, backgroundColor: COLORS.accent, borderWidth: 1.6, tension: 0.35, pointRadius: 2, pointHoverRadius: 4, order: 0 },
          { label: 'Ingresos', data: meses.map((k) => pm.get(k)?.ingresos || 0), backgroundColor: hexToRgba(COLORS.green, 0.55), hoverBackgroundColor: COLORS.green, borderRadius: 5, maxBarThickness: 18, order: 1 },
          { label: 'Gastos', data: meses.map((k) => pm.get(k)?.gastos || 0), backgroundColor: hexToRgba(COLORS.red, 0.5), hoverBackgroundColor: COLORS.red, borderRadius: 5, maxBarThickness: 18, order: 1 },
        ],
      },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: moneyTooltip }, scales: { x: catScale(), y: moneyScale() } },
    }, anim);
  } else empty(cM, filtro.length ? 'Sin movimientos con esos tags' : 'Aún no hay datos');

  // Gastos por tag en el periodo
  const enP = movsF.filter((m) => enPeriodo(m, periodo));
  const pt = porTag(enP, filtro.length ? state.tags.filter((t) => filtro.includes(t.id)) : state.tags);
  const cT = cv('tags');
  if (pt.length) {
    chart(cT, 'd-tags', tagDoughnutConfig(pt), anim);
  } else empty(cT, 'Sin gastos en el periodo');

  // Arrepentimiento
  const ar = porArrepentimiento(movsF);
  const cR = cv('arrep');
  if (ar.some((v) => v > 0)) {
    chart(cR, 'd-arrep', {
      type: 'bar',
      data: {
        labels: ['0', '1', '2', '3', '4', '5'],
        datasets: [{
          label: 'Gastado',
          data: ar,
          backgroundColor: [0, 1, 2, 3, 4, 5].map((i) => regretColor(i).replace(')', ' / 0.6)')),
          hoverBackgroundColor: [0, 1, 2, 3, 4, 5].map((i) => regretColor(i)),
          borderRadius: 5,
          maxBarThickness: 26,
        }],
      },
      options: { plugins: { tooltip: moneyTooltip }, scales: { x: catScale(), y: moneyScale() } },
    }, anim);
  } else empty(cR, 'Sin gastos registrados');

  // Inversiones
  const inv = movsF.filter((m) => m.tipo === 'gasto' && m.esInversion).map((g) => estadoInversion(g, state.movimientos));
  const cI = cv('inv');
  if (inv.length) {
    const count = (e) => inv.filter((x) => x.estado === e).length;
    chart(cI, 'd-inv', {
      type: 'doughnut',
      data: {
        labels: ['Ganancia', 'Pérdida', 'Pendiente'],
        datasets: [{
          data: [count('ganancia'), count('perdida'), count('pendiente')],
          backgroundColor: [hexToRgba(COLORS.green, 0.7), hexToRgba(COLORS.red, 0.7), hexToRgba(COLORS.orange, 0.7)],
          borderColor: 'rgba(10, 12, 20, 0.9)',
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: { cutout: '70%', plugins: { legend: { display: true, position: 'right' } } },
    }, anim);
  } else empty(cI, 'Sin inversiones registradas');
}

function recientes(b) {
  const list = [...state.movimientos]
    .sort((x, y) => y.fecha.localeCompare(x.fecha) || y.creado.localeCompare(x.creado))
    .slice(0, 6);
  const el = b.querySelector('[data-el="recent"]');
  el.innerHTML = list.length
    ? list.map((m) => `
        <div class="recent-row">
          <span class="recent-ico ${m.tipo}">${icon(m.tipo === 'ingreso' ? 'income' : m.esInversion ? 'invest' : 'expense')}</span>
          <span class="recent-name">${esc(m.nombre)}<small>${fechaCorta(m.fecha)}</small></span>
          <span class="${m.tipo === 'ingreso' ? 'pos' : 'neg'}">${m.tipo === 'ingreso' ? '+' : '−'}${clp(m.monto)}</span>
        </div>`).join('')
    : '<div class="empty small">Aún no hay movimientos.</div>';
}
