// Deudas: lo que te deben y lo que debes, en tarjetas agrupadas por dirección.

import * as store from '../store.js';
import { state } from '../store.js';
import { estadoDeuda, saldoDeudas, montoPendiente } from '../calc.js';
import { clp, esc, fechaCorta, today } from '../format.js';
import { icon } from '../icons.js';
import {
  openModal, bindMoney, confirmDialog, toast, shake, statCard, runCounts, aplicarCensura, sw,
} from '../ui.js';
import { openDeudaForm } from '../forms/deuda-form.js';
import { openMovimientoForm } from '../forms/movimiento-form.js';
import { go } from '../app.js';

export const meta = { id: 'deudas', title: 'Deudas', icon: 'debt' };

export function render(root, { first, highlight } = {}) {
  const favor = state.deudas.filter((d) => d.direccion === 'favor' && d.estado !== 'cancelada');
  const contra = state.deudas.filter((d) => d.direccion === 'contra' && d.estado !== 'cancelada');
  const saldo = saldoDeudas(state.deudas);
  const pendientes = state.deudas.filter((d) => d.estado === 'pendiente');
  const canceladas = state.deudas.filter((d) => d.estado === 'cancelada');

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Deudas</h1><p class="subtitle">Lo que te deben y lo que debes</p></div>
    </header>
    <section class="deudas-top">
      ${statCard('saldo', 'Saldo de deudas', 'debt', saldo < 0 ? -1 : 1, `${pendientes.length} ${pendientes.length === 1 ? 'pendiente' : 'pendientes'}`)}
      <button class="card stat clickable historial-btn" data-act="historial" data-tip="Ver deudas canceladas">
        <div class="stat-label">${icon('history')}<span>Historial</span></div>
        <div class="stat-value">${canceladas.length}</div>
        <div class="stat-sub">${canceladas.length === 1 ? 'deuda cancelada' : 'deudas canceladas'}</div>
      </button>
    </section>
    ${seccion('favor', 'Te deben', 'income', favor, first)}
    ${seccion('contra', 'Debes', 'expense', contra, first)}`;

  runCounts(root, 'deudas', { saldo });
  aplicarCensura(root);
  root.onclick = (e) => onClick(e, root);

  if (highlight) destacar(root, highlight);
}

function seccion(dir, titulo, ic, lista, anim) {
  const pendientes = lista.filter((d) => d.estado === 'pendiente');
  const totalPendiente = pendientes.reduce((a, d) => a + montoPendiente(d), 0);
  const ordenada = [...lista].sort((a, b) => {
    const pa = prioridad(a);
    const pb = prioridad(b);
    if (pa !== pb) return pa - pb;
    const la = estadoDeuda(a).limite || '9999-99-99';
    const lb = estadoDeuda(b).limite || '9999-99-99';
    return la.localeCompare(lb) || b.creado.localeCompare(a.creado);
  });
  return `
    <section class="deuda-section">
      <div class="section-head">
        ${icon(ic)}<h2>${titulo}</h2>
        <span class="muted">${pendientes.length} ${pendientes.length === 1 ? 'pendiente' : 'pendientes'} · ${clp(totalPendiente)}</span>
        <span class="spacer"></span>
        <button class="ibtn ghost sm" data-add="${dir}" data-tip="Agregar deuda">${icon('plus')}</button>
      </div>
      ${ordenada.length
        ? `<div class="deuda-grid">${ordenada.map((d, i) => card(d, i, anim)).join('')}</div>`
        : `<div class="card empty small">Sin deudas ${dir === 'favor' ? 'a tu favor' : 'en contra'} registradas.</div>`}
    </section>`;
}

function prioridad(d) {
  return estadoDeuda(d).atrasada ? 0 : 1;
}

/** Tarjeta de una deuda. También la usa historial.js para las ya canceladas. */
export function card(d, i, anim) {
  const est = estadoDeuda(d);
  const cancelada = d.estado === 'cancelada';
  const c = cancelada ? 'var(--green)' : est.atrasada ? 'var(--red)' : d.direccion === 'favor' ? 'var(--green)' : 'var(--red)';
  const plazoTxt = est.limite ? `${est.atrasada ? 'Venció' : 'Vence'} ${fechaCorta(est.limite)}` : 'Sin plazo';

  return `
    <div class="card deuda-card ${anim ? 'anim' : ''} ${cancelada ? 'cancelada' : ''} ${est.atrasada ? 'atrasada' : ''}" style="--c:${c};--i:${i}" data-id="${d.id}">
      <div class="deuda-card-head">
        <span class="name-text">${d.nombre ? esc(d.nombre) : '<span class="muted">Sin nombre</span>'}</span>
        ${d.movId ? `<span class="badge-link" data-act="mov" data-tip="Vinculada a un movimiento">${icon('link')}</span>` : ''}
      </div>
      <div class="deuda-contraparte">${icon(d.direccion === 'favor' ? 'income' : 'expense')}<span>${d.contraparte ? esc(d.contraparte) : '<span class="muted">Sin nombre</span>'}</span></div>
      ${d.descripcion ? `<div class="deuda-desc">${esc(d.descripcion)}</div>` : ''}
      <div class="deuda-monto censurable ${d.direccion === 'favor' ? 'pos' : 'neg'}">${clp(cancelada ? d.montoLiquidado : montoPendiente(d))}${!cancelada && d.abonos.length ? ` <span class="muted small">de ${clp(d.monto)}</span>` : ''}</div>
      <div class="deuda-meta">
        <span>${fechaCorta(d.fecha)}</span>
        <span class="${est.atrasada ? 'neg' : 'muted'}">${cancelada ? `Devuelto ${fechaCorta(d.fechaLiquidacion)}` : plazoTxt}</span>
      </div>
      ${!cancelada && d.abonos.length ? `<div class="deuda-meta"><span class="muted">${d.abonos.length === 1 ? '1 abono' : `${d.abonos.length} abonos`} · ${clp(d.abonos.reduce((a, x) => a + x.monto, 0))} pagado</span></div>` : ''}
      <div class="deuda-acts">
        ${!cancelada ? `
        <button class="ibtn ghost xs" data-act="perdonar" data-tip="Perdonar (queda como movimiento normal)">${icon('heart')}</button>
        <button class="ibtn xs primary" data-act="cancelar" data-tip="Marcar como pagada">${icon('check')}</button>
        ${!d.movId ? `
        <button class="ibtn ghost xs" data-act="editar" data-tip="Editar">${icon('edit')}</button>
        <button class="ibtn ghost xs danger" data-act="eliminar" data-tip="Eliminar">${icon('trash')}</button>` : ''}` : `
        <button class="ibtn ghost xs danger" data-act="eliminar" data-tip="Eliminar del historial">${icon('trash')}</button>`}
      </div>
    </div>`;
}

async function onClick(e, root) {
  const add = e.target.closest('[data-add]');
  if (add) { openDeudaForm(null, { direccion: add.dataset.add }); return; }
  if (e.target.closest('[data-act="historial"]')) { go('historial'); return; }

  const cardEl = e.target.closest('.deuda-card');
  if (!cardEl) return;
  const d = state.deudas.find((x) => x.id === cardEl.dataset.id);
  if (!d) return;
  const act = e.target.closest('[data-act]')?.dataset.act;

  if (act === 'mov') { if (d.movId) openMovimientoForm(store.getMov(d.movId)); return; }
  if (act === 'editar') { openDeudaForm(d); return; }
  if (act === 'eliminar') {
    const ok = await confirmDialog({
      title: 'Eliminar deuda',
      message: `Se eliminará el registro de la deuda con <b>${esc(d.contraparte)}</b>.`,
      confirmIcon: 'trash',
      danger: true,
    });
    if (ok) { store.deleteDeuda(d.id); toast('Deuda eliminada'); }
    return;
  }
  if (act === 'perdonar') {
    const hermanas = d.movId ? store.deudasDeMov(d.movId) : [];
    const notaMov = hermanas.length > 1
      ? 'Las demás personas vinculadas a ese mismo gasto seguirán apareciendo como deuda.'
      : 'El movimiento original quedará como uno normal, sin marca de deuda.';
    const ok = await confirmDialog({
      title: 'Perdonar deuda',
      message: `<b>${esc(d.contraparte)}</b> ya no te deberá ${clp(montoPendiente(d))}. ${d.movId ? notaMov : 'Se eliminará el registro de esta deuda.'}`,
      confirmIcon: 'heart',
    });
    if (ok) { store.perdonarDeuda(d.id); toast('Deuda perdonada'); }
    return;
  }
  if (act === 'cancelar') { openLiquidarForm(d); return; }
}

function openLiquidarForm(d) {
  const favor = d.direccion === 'favor';
  const restante = montoPendiente(d);
  let el;
  let getMonto;

  openModal({
    title: 'Marcar como pagada',
    width: 420,
    body: `
      <div class="note">Se creará ${favor ? 'un ingreso' : 'un gasto'} automático${d.movId ? ', heredando los tags del movimiento original' : ''}.</div>
      <div class="grid-2">
        <div class="field"><label>${favor ? '¿Cuánto te devolvieron?' : '¿Cuánto pagaste?'}</label><div class="money"><span>$</span><input class="input" name="monto" inputmode="numeric" value="${restante || ''}" autofocus></div></div>
        <div class="field"><label>Fecha</label><input class="input" type="date" name="fecha" value="${today()}"></div>
      </div>
      <div class="row-line"><span>Pago parcial</span>${sw('parcial', false)}</div>
      <div class="hint" data-el="parcialHint"></div>`,
    onMount: (rootEl) => {
      el = rootEl;
      getMonto = bindMoney(el.querySelector('[name="monto"]'));
      const chk = el.querySelector('[name="parcial"]');
      const hint = el.querySelector('[data-el="parcialHint"]');
      const update = () => {
        const puedeParcial = getMonto() > 0 && getMonto() < restante;
        chk.disabled = !puedeParcial;
        if (!puedeParcial) chk.checked = false;
        hint.innerHTML = puedeParcial
          ? `Quedarán pendientes <b>${clp(restante - getMonto())}</b> de la deuda.`
          : 'Disponible solo si el monto es menor a lo que queda pendiente.';
      };
      el.querySelector('[name="monto"]').addEventListener('input', update);
      update();
    },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (c) => c() },
      {
        icon: 'check', tip: 'Confirmar (Enter)', kind: 'primary', primary: true,
        onClick: (close) => {
          const monto = getMonto();
          const fecha = el.querySelector('[name="fecha"]').value || today();
          if (!(monto >= 0)) { shake(el.querySelector('[name="monto"]')); toast('Escribe un monto válido', 'warn'); return; }
          const parcial = el.querySelector('[name="parcial"]').checked && monto < restante;
          if (parcial) {
            store.abonarDeuda(d.id, { monto, fecha });
            toast('Abono registrado');
          } else {
            store.cancelarDeuda(d.id, { monto, fecha });
            toast('Deuda liquidada');
          }
          close();
        },
      },
    ],
  });
}

/** Hace scroll hasta la tarjeta y la destaca un momento. También la usa historial.js. */
export function destacar(root, id) {
  const cardEl = root.querySelector(`.deuda-card[data-id="${id}"]`);
  if (!cardEl) return;
  requestAnimationFrame(() => {
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    cardEl.classList.add('flash');
    setTimeout(() => cardEl.classList.remove('flash'), 2200);
  });
}
