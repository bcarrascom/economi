// Página de una inversión: sus números, gráficos y movimientos. Vista oculta (no está en la
// barra lateral): se llega desde Inversiones o desde la pill de inversión en Movimientos.

import * as store from '../store.js';
import { ENTRADA_LABEL, afectaCuenta, serieInversion } from '../calc.js';
import { clp, pct, esc, fechaCorta, monthLabel, hexToRgba } from '../format.js';
import { icon } from '../icons.js';
import { statusBadge, colorInversion, runCounts, aplicarCensura, confirmDialog, toast } from '../ui.js';
import { chart, lineConfig, moneyScale, catScale, moneyTooltip, COLORS } from '../charts.js';
import { openInversionForm, openEntradaForm, openCompletarForm } from '../forms/inversion-form.js';
import { invStat, colorResultado } from './inversiones.js';
import { go } from '../app.js';

export const meta = { id: 'inversion', title: 'Inversión', icon: 'invest' };

// La navegación solo pasa el id en el primer render; los re-render (al guardar algo) lo reutilizan.
let invId = null;

const SIGNO = { aporte: 1, ganancia: 1, retiro: -1, perdida: -1 };
const COLOR_ENTRADA = { aporte: 'var(--accent)', retiro: 'var(--orange)', ganancia: 'var(--green)', perdida: 'var(--red)' };

export function render(root, { first, id } = {}) {
  if (id) invId = id;
  const inv = store.getInversion(invId);
  if (!inv) {
    root.innerHTML = `
      <header class="page-head">
        <button class="ibtn ghost" data-act="volver" data-tip="Volver a Inversiones">${icon('chevronLeft')}</button>
        <div><h1>Inversión</h1><p class="subtitle">No existe (quizás se eliminó)</p></div>
      </header>`;
    root.onclick = (e) => { if (e.target.closest('[data-act="volver"]')) go('inversiones'); };
    return;
  }

  const r = store.resumenDe(inv);
  const externa = inv.tipo === 'externa';
  const completada = inv.estado === 'completada';

  root.innerHTML = `
    <header class="page-head">
      <button class="ibtn ghost" data-act="volver" data-tip="Volver a Inversiones">${icon('chevronLeft')}</button>
      <div><h1>${esc(inv.nombre)}</h1><p class="subtitle">${externa ? 'Externa' : 'Interna'} · ${statusBadge(r)}${completada ? ` <span class="muted">el ${fechaCorta(inv.fechaCompletada)}</span>` : ''}</p></div>
      <div class="spacer"></div>
      <button class="ibtn" data-act="editar" data-tip="Editar">${icon('edit')}</button>
      <button class="ibtn danger" data-act="eliminar" data-tip="Eliminar inversión">${icon('trash')}</button>
      ${completada
        ? `<button class="ibtn" data-act="reabrir" data-tip="Reabrir">${icon('refresh')}</button>`
        : `<button class="ibtn ok" data-act="completar" data-tip="Completar">${icon('check')}</button>
           <button class="ibtn primary" data-act="nuevo" data-tip="Nuevo movimiento">${icon('plus')}</button>`}
    </header>
    ${inv.descripcion ? `<div class="card inv-desc desc">${esc(inv.descripcion).replace(/\n/g, '<br>')}</div>` : ''}
    <section class="dash-stats ${externa ? '' : 'three'}">
      ${externa ? `
        ${invStat('saldo', 'Saldo', 'wallet', 'var(--accent)', 'Lo que realmente hay dentro')}
        ${invStat('monto', 'Monto', 'invest', 'var(--text)', 'Lo que vale en teoría')}
        ${invStat('aportado', 'Aportado', 'expense', 'var(--text)', 'Salió de tu cuenta')}
        ${invStat('retirado', 'Retirado', 'income', 'var(--text)', 'Volvió a tu cuenta')}` : `
        ${invStat('perdidas', 'Gastado', 'expense', 'var(--text)', 'Pérdidas desde tu cuenta')}
        ${invStat('ganancias', 'Ingresado', 'income', 'var(--text)', 'Ganancias a tu cuenta')}`}
      ${invStat('resultado', 'Resultado', 'flag', colorResultado(r.resultado), r.rentabilidad != null ? `${pct(r.rentabilidad)} de rentabilidad` : 'Ganancias − pérdidas')}
    </section>

    <section class="charts inv-charts">
      <div class="card chart-card span-2"><div class="chart-title"><h4>Evolución</h4>${externa
        ? `<span class="legend-inline"><i class="ln" style="--c:${COLORS.accent}"></i>Saldo<i class="ln dash" style="--c:${COLORS.green}"></i>Monto</span>`
        : `<span class="legend-inline"><i class="ln" style="--c:${COLORS.accent}"></i>Resultado acumulado</span>`}</div><div class="chart-box tall"><canvas data-c="evol"></canvas></div></div>
      <div class="card chart-card"><div class="chart-title"><h4>Por mes</h4><span class="legend-inline">${(externa ? ['aporte', 'retiro', 'ganancia', 'perdida'] : ['ganancia', 'perdida'])
        .map((t) => `<i style="--c:${COLOR_ENTRADA[t]}"></i>${ENTRADA_LABEL[t]}`).join('')}</span></div><div class="chart-box tall"><canvas data-c="mes"></canvas></div></div>
    </section>

    <div class="section-head"><h2>Movimientos</h2><span class="muted">${r.entradas.length}</span></div>
    <div data-el="tabla"></div>`;

  runCounts(root, `inv-${inv.id}`, {
    saldo: r.saldo, monto: r.monto, aportado: r.aportado, retirado: r.retirado,
    perdidas: r.perdidas, ganancias: r.ganancias, resultado: r.resultado,
  });
  tabla(root, inv, r, first);
  charts(root, inv, r, first);
  aplicarCensura(root);
  root.onclick = (e) => onClick(e, inv);
}

function tabla(root, inv, r, anim) {
  const el = root.querySelector('[data-el="tabla"]');
  if (!r.entradas.length) {
    el.innerHTML = `<div class="card empty">Aún no hay movimientos. ${inv.estado === 'activa' ? `Usa ${icon('plus', 'inline')} para registrar el primero.` : ''}</div>`;
    return;
  }
  const externa = inv.tipo === 'externa';
  const editable = inv.estado === 'activa';
  // Saldo después de cada entrada (en orden cronológico), para la columna "Saldo".
  let saldo = 0;
  const saldos = new Map(r.entradas.map((e) => { saldo += SIGNO[e.tipo] * e.monto; return [e.id, saldo]; }));
  const filas = [...r.entradas].reverse();

  el.innerHTML = `
    <div class="table-wrap">
      <table class="t t-head-static">
        <thead><tr>
          <th>Fecha</th><th>Tipo</th><th class="grow">Detalle</th><th>En tu cuenta</th>
          ${externa ? '<th class="num">Saldo</th>' : ''}<th class="num">Monto</th><th class="w-act"></th>
        </tr></thead>
        <tbody>
          ${filas.map((e, i) => {
            const cuenta = afectaCuenta(inv.tipo, e.tipo);
            const signoCuenta = e.tipo === 'aporte' || e.tipo === 'perdida' ? '−' : '+';
            return `
            <tr class="row ${anim ? 'anim' : ''}" data-id="${e.id}" style="--i:${Math.min(i, 24)}">
              <td><span class="dim">${fechaCorta(e.fecha)}</span></td>
              <td><span class="status" style="--c:${COLOR_ENTRADA[e.tipo]}"><span class="dot"></span>${ENTRADA_LABEL[e.tipo]}</span></td>
              <td><span class="inv-detalle">${e.movId ? `<span>${esc(e.nombre)}</span>` : ''}${e.descripcion ? `<span class="muted">${esc(e.descripcion)}</span>` : e.movId ? '' : '<span class="muted">—</span>'}</span></td>
              <td>${cuenta
                ? `<span class="${signoCuenta === '+' ? 'pos' : 'neg'}" data-tip="${signoCuenta === '+' ? 'Ingreso' : 'Gasto'} en Movimientos">${signoCuenta}${clp(e.monto)}</span>`
                : '<span class="muted" data-tip="No toca tu cuenta">—</span>'}</td>
              ${externa ? `<td class="num"><span class="dim censurable">${clp(saldos.get(e.id))}</span></td>` : ''}
              <td class="num"><span class="amount ${SIGNO[e.tipo] > 0 ? 'pos' : 'neg'}">${SIGNO[e.tipo] > 0 ? '+' : '−'}${clp(e.monto)}</span></td>
              <td class="w-act"><div class="acts">${editable ? `
                <button class="ibtn ghost xs" data-act="editEntrada" data-tip="Editar">${icon('edit')}</button>
                <button class="ibtn ghost xs danger" data-act="delEntrada" data-tip="Eliminar">${icon('trash')}</button>` : ''}
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function charts(root, inv, r, anim) {
  const externa = inv.tipo === 'externa';
  const cE = root.querySelector('[data-c="evol"]');
  const cM = root.querySelector('[data-c="mes"]');
  if (!r.entradas.length) {
    for (const c of [cE, cM]) { c.parentElement.classList.add('is-empty'); c.parentElement.dataset.empty = 'Aún no hay movimientos'; }
    return;
  }

  const serie = serieInversion(r.entradas);
  const labels = serie.map((x) => fechaCorta(x.fecha));
  if (externa) {
    const cfg = lineConfig(labels, serie.map((x) => x.saldo), COLORS.accent, 'Saldo');
    cfg.data.datasets.push({
      label: 'Monto', data: serie.map((x) => x.monto), borderColor: COLORS.green, borderDash: [5, 4],
      borderWidth: 1.6, fill: false, tension: 0.35, pointRadius: serie.length <= 1 ? 3 : 0, pointHoverRadius: 4, pointBackgroundColor: COLORS.green,
    });
    chart(cE, 'inv-evol', cfg, anim);
  } else {
    chart(cE, 'inv-evol', lineConfig(labels, serie.map((x) => x.resultado), COLORS.accent, 'Resultado'), anim);
  }

  // Totales por mes de cada tipo de entrada, desde el primer mes con movimientos hasta el último.
  const tipos = externa ? ['aporte', 'retiro', 'ganancia', 'perdida'] : ['ganancia', 'perdida'];
  const porMes = new Map();
  for (const e of r.entradas) {
    const k = e.fecha.slice(0, 7);
    if (!porMes.has(k)) porMes.set(k, Object.fromEntries(tipos.map((t) => [t, 0])));
    porMes.get(k)[e.tipo] += e.monto;
  }
  const meses = [...porMes.keys()].sort();
  const HEX = { aporte: COLORS.accent, retiro: COLORS.orange, ganancia: COLORS.green, perdida: COLORS.red };
  chart(cM, 'inv-mes', {
    type: 'bar',
    data: {
      labels: meses.map((k) => monthLabel(k, true)),
      datasets: tipos.map((t) => ({
        label: ENTRADA_LABEL[t],
        data: meses.map((k) => porMes.get(k)[t]),
        backgroundColor: hexToRgba(HEX[t], 0.55),
        hoverBackgroundColor: HEX[t],
        borderRadius: 5,
        maxBarThickness: 18,
      })),
    },
    options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: moneyTooltip }, scales: { x: catScale(), y: moneyScale() } },
  }, anim);
}

async function onClick(e, inv) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'volver') { go('inversiones'); return; }
  if (act === 'editar') { openInversionForm(inv); return; }
  if (act === 'nuevo') { openEntradaForm(inv); return; }
  if (act === 'completar') { openCompletarForm(inv); return; }
  if (act === 'reabrir') {
    store.reabrirInversion(inv.id);
    toast('Inversión reabierta');
    return;
  }
  if (act === 'eliminar') {
    const movs = store.state.movimientos.filter((m) => m.inversionId === inv.id).length;
    const ok = await confirmDialog({
      title: 'Eliminar inversión',
      message: `Se eliminará <b>${esc(inv.nombre)}</b>${movs ? ` junto con sus <b>${movs}</b> ${movs === 1 ? 'movimiento' : 'movimientos'} en tu cuenta (tu neto cambiará como si nunca hubieran existido)` : ''}.`,
      confirmIcon: 'trash',
      danger: true,
    });
    if (ok) { store.deleteInversion(inv.id); toast('Inversión eliminada'); go('inversiones'); }
    return;
  }

  const id = e.target.closest('tr.row')?.dataset.id;
  const entrada = id ? store.entradasDe(inv).find((x) => x.id === id) : null;
  if (!entrada) return;
  if (act === 'editEntrada') { openEntradaForm(inv, entrada); return; }
  if (act === 'delEntrada') {
    const { error } = store.revisarEntrada(inv, { quitar: entrada.id });
    if (error) { toast(error, 'warn'); return; }
    const ok = await confirmDialog({
      title: 'Eliminar movimiento',
      message: `Se eliminará ${entrada.tipo === 'aporte' || entrada.tipo === 'retiro' ? 'el' : 'la'} ${ENTRADA_LABEL[entrada.tipo].toLowerCase()} de <b>${clp(entrada.monto)}</b> (${fechaCorta(entrada.fecha)})${entrada.movId ? ', también de tus Movimientos' : ''}.`,
      confirmIcon: 'trash',
      danger: true,
    });
    if (ok) { store.deleteEntrada(inv.id, entrada.id); toast('Movimiento eliminado'); }
  }
}
