// Inversiones: tarjetas de las activas y de las completadas (en verde o rojo según el resultado).
// Es la segunda pestaña del módulo Progresión (no tiene entrada propia en la barra lateral).
// Cada tarjeta abre la página de la inversión (vista oculta "inversion").

import { state } from '../store.js';
import * as store from '../store.js';
import { clp, clpSigned, pct, esc, fechaCorta } from '../format.js';
import { icon } from '../icons.js';
import {
  statusBadge, colorInversion, runCounts, aplicarCensura, segmented, bindSegmented,
} from '../ui.js';
import { openInversionForm } from '../forms/inversion-form.js';
import { go, SECCIONES_PROGRESION } from '../app.js';

export const meta = { id: 'inversiones', title: 'Inversiones', icon: 'invest' };

/** Tarjeta de número simple (sin la escala rojo→verde de statCard): el color lo decide quien llama. */
export function invStat(key, label, ic, color, sub = '') {
  return `<div class="card stat" style="--c:${color}">
    <div class="stat-label">${icon(ic)}<span>${label}</span></div>
    <div class="stat-value censurable" data-count="${key}" style="color:${color}"></div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

export const colorResultado = (n) => (n > 0 ? 'var(--green)' : n < 0 ? 'var(--red)' : 'var(--text)');

export function render(root, { first } = {}) {
  const items = state.inversiones.map((inv) => ({ inv, r: store.resumenDe(inv) }));
  const activas = items.filter((x) => x.inv.estado === 'activa')
    .sort((a, b) => b.inv.creado.localeCompare(a.inv.creado));
  const completadas = items.filter((x) => x.inv.estado === 'completada')
    .sort((a, b) => (b.inv.fechaCompletada || '').localeCompare(a.inv.fechaCompletada || ''));

  const enExternas = activas.filter((x) => x.inv.tipo === 'externa').reduce((a, x) => a + x.r.saldo, 0);
  const resultadoActivas = activas.reduce((a, x) => a + x.r.resultado, 0);
  const resultadoCompletadas = completadas.reduce((a, x) => a + x.r.resultado, 0);

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Inversiones</h1><p class="subtitle">Lo que inviertes y cómo te fue</p></div>
      ${segmented('seccion', SECCIONES_PROGRESION, 'inversiones')}
      <div class="spacer"></div>
      <button class="ibtn primary" data-act="nueva" data-tip="Nueva inversión">${icon('plus')}</button>
    </header>
    <section class="dash-stats three">
      ${invStat('externas', 'Saldo en externas', 'wallet', 'var(--accent)', 'Plata que hoy está fuera de tu cuenta')}
      ${invStat('activas', 'Resultado de las activas', 'invest', colorResultado(resultadoActivas), `${activas.length} ${activas.length === 1 ? 'activa' : 'activas'}`)}
      ${invStat('completadas', 'Resultado de las completadas', 'check', colorResultado(resultadoCompletadas), `${completadas.length} ${completadas.length === 1 ? 'completada' : 'completadas'}`)}
    </section>
    ${seccion('Activas', 'invest', activas, first, 'No tienes inversiones activas.')}
    ${seccion('Completadas', 'check', completadas, first, 'Aún no completas ninguna inversión.')}`;

  runCounts(root, 'inv', { externas: enExternas, activas: resultadoActivas, completadas: resultadoCompletadas });
  aplicarCensura(root);
  bindSegmented(root, 'seccion', (v) => go(v));

  root.onclick = (e) => {
    if (e.target.closest('[data-act="nueva"]')) {
      openInversionForm(null, { onSaved: (n) => go('inversion', { id: n.id }) });
      return;
    }
    const c = e.target.closest('.inv-card');
    if (c) go('inversion', { id: c.dataset.id });
  };
}

function seccion(titulo, ic, lista, anim, vacio) {
  return `
    <section class="deuda-section">
      <div class="section-head">${icon(ic)}<h2>${titulo}</h2><span class="muted">${lista.length}</span></div>
      ${lista.length
        ? `<div class="deuda-grid">${lista.map((x, i) => card(x, i, anim)).join('')}</div>`
        : `<div class="card empty small">${vacio}</div>`}
    </section>`;
}

function card({ inv, r }, i, anim) {
  const completada = inv.estado === 'completada';
  const externa = inv.tipo === 'externa';
  const c = colorInversion(r.estado);
  // Activa externa: lo que hay dentro (saldo). Interna o completada: cuánto se ganó o perdió.
  const principal = !completada && externa
    ? `<div class="deuda-monto censurable">${clp(r.saldo)}</div>`
    : `<div class="deuda-monto censurable ${r.resultado > 0 ? 'pos' : r.resultado < 0 ? 'neg' : ''}">${clpSigned(r.resultado)}</div>`;
  const detalle = externa
    ? `Monto <b class="censurable">${clp(r.monto)}</b> · Aportado <b class="censurable">${clp(r.aportado)}</b>`
    : `Gastado <b class="censurable">${clp(r.perdidas)}</b> · Ingresado <b class="censurable">${clp(r.ganancias)}</b>`;

  return `
    <div class="card deuda-card inv-card ${anim ? 'anim' : ''} ${completada ? `completada ${r.estado}` : ''}" style="--c:${c};--i:${i}" data-id="${inv.id}">
      <div class="deuda-card-head">
        <span class="name-text">${esc(inv.nombre)}</span>
        <span class="chip">${externa ? 'Externa' : 'Interna'}</span>
      </div>
      ${inv.descripcion ? `<div class="deuda-desc">${esc(inv.descripcion)}</div>` : ''}
      ${principal}
      <div class="deuda-meta"><span>${detalle}</span></div>
      <div class="deuda-meta">
        ${statusBadge(r)}
        <span class="muted">${completada
          ? `${r.rentabilidad != null ? `${pct(r.rentabilidad)} · ` : ''}${fechaCorta(inv.fechaCompletada)}`
          : `${r.entradas.length} ${r.entradas.length === 1 ? 'movimiento' : 'movimientos'}`}</span>
      </div>
    </div>`;
}
