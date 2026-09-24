// Historial: deudas ya canceladas. Página oculta (no aparece en la barra lateral),
// solo se llega vía el botón "Historial" del módulo de Deudas.

import * as store from '../store.js';
import { state } from '../store.js';
import { esc } from '../format.js';
import { icon } from '../icons.js';
import { confirmDialog, toast, aplicarCensura } from '../ui.js';
import { openMovimientoForm } from '../forms/movimiento-form.js';
import { card, destacar } from './deudas.js';
import { go } from '../app.js';

export const meta = { id: 'historial', title: 'Historial de deudas', icon: 'history' };

export function render(root, { first, highlight } = {}) {
  const canceladas = state.deudas.filter((d) => d.estado === 'cancelada')
    .sort((a, b) => (b.fechaLiquidacion || '').localeCompare(a.fechaLiquidacion || ''));
  const favor = canceladas.filter((d) => d.direccion === 'favor');
  const contra = canceladas.filter((d) => d.direccion === 'contra');

  root.innerHTML = `
    <header class="page-head">
      <button class="ibtn ghost" data-act="volver" data-tip="Volver a Deudas">${icon('chevronLeft')}</button>
      <div><h1>Historial</h1><p class="subtitle">Deudas ya canceladas</p></div>
    </header>
    ${seccion('Te debían', 'income', favor, first)}
    ${seccion('Debías', 'expense', contra, first)}`;

  aplicarCensura(root);
  root.onclick = (e) => onClick(e, root);
  if (highlight) destacar(root, highlight);
}

function seccion(titulo, ic, lista, anim) {
  return `
    <section class="deuda-section">
      <div class="section-head">${icon(ic)}<h2>${titulo}</h2><span class="muted">${lista.length}</span></div>
      ${lista.length
        ? `<div class="deuda-grid">${lista.map((d, i) => card(d, i, anim)).join('')}</div>`
        : `<div class="card empty small">Sin historial todavía.</div>`}
    </section>`;
}

async function onClick(e, root) {
  if (e.target.closest('[data-act="volver"]')) { go('deudas'); return; }

  const cardEl = e.target.closest('.deuda-card');
  if (!cardEl) return;
  const d = state.deudas.find((x) => x.id === cardEl.dataset.id);
  if (!d) return;
  const act = e.target.closest('[data-act]')?.dataset.act;

  if (act === 'mov') { if (d.movId) openMovimientoForm(store.getMov(d.movId)); return; }
  if (act === 'eliminar') {
    const ok = await confirmDialog({
      title: 'Eliminar del historial',
      message: `Se eliminará el registro de la deuda con <b>${esc(d.contraparte)}</b>.`,
      confirmIcon: 'trash',
      danger: true,
    });
    if (ok) { store.deleteDeuda(d.id); toast('Registro eliminado'); }
  }
}
