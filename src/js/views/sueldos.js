// Sueldos: ingresos recurrentes (sueldo mensual, remuneración diaria, etc.).

import * as store from '../store.js';
import { state } from '../store.js';
import { sueldoVencido, frecuenciaTexto } from '../calc.js';
import { clp, esc, fechaCorta, today } from '../format.js';
import { icon } from '../icons.js';
import {
  openModal, bindMoney, confirmDialog, toast, shake, aplicarCensura,
} from '../ui.js';
import { openSueldoForm } from '../forms/sueldo-form.js';

export const meta = { id: 'sueldos', title: 'Sueldos', icon: 'refresh' };

export function render(root, { first } = {}) {
  if (first) store.revisarSueldos();

  const lista = [...state.sueldos].sort((a, b) => {
    const va = sueldoVencido(a) ? 0 : 1;
    const vb = sueldoVencido(b) ? 0 : 1;
    return va - vb || a.proxima.localeCompare(b.proxima);
  });

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Sueldos</h1><p class="subtitle">Ingresos recurrentes: sueldo, remuneraciones, etc.</p></div>
      <div class="spacer"></div>
      <button class="ibtn primary" data-act="nuevo" data-tip="Nuevo sueldo">${icon('plus')}</button>
    </header>
    ${lista.length
      ? `<div class="deuda-grid">${lista.map((s, i) => card(s, i, first)).join('')}</div>`
      : `<div class="card empty">Aún no tienes sueldos programados. Crea el primero con ${icon('plus', 'inline')} — por ejemplo tu sueldo mensual o una remuneración diaria.</div>`}`;

  root.querySelector('[data-act="nuevo"]').onclick = () => openSueldoForm();
  aplicarCensura(root);
  root.onclick = (e) => onClick(e, root);
}

function card(s, i, anim) {
  const vencido = sueldoVencido(s);
  const c = !s.activo ? 'var(--text-3)' : vencido ? 'var(--orange)' : 'var(--green)';
  return `
    <div class="card deuda-card ${anim ? 'anim' : ''} ${!s.activo ? 'cancelada' : ''} ${vencido ? 'atrasada' : ''}" style="--c:${c};--i:${i}" data-id="${s.id}">
      <div class="deuda-card-head">
        <span class="name-text">${esc(s.nombre) || '<span class="muted">Sin nombre</span>'}</span>
        <span class="chip">${s.modo === 'auto' ? 'Automático' : 'Sugerido'}</span>
      </div>
      <div class="deuda-contraparte">${icon('refresh')}<span>${frecuenciaTexto(s)} · ${s.hora}</span></div>
      <div class="deuda-monto censurable pos">${s.monto != null ? clp(s.monto) : '<span class="muted">Sin monto fijo</span>'}</div>
      <div class="deuda-meta">
        <span>${s.activo ? '' : 'Pausado'}</span>
        <span class="${vencido ? 'neg' : 'muted'}">${vencido ? 'Atrasado desde' : 'Próximo'} ${fechaCorta(s.proxima)}</span>
      </div>
      <div class="deuda-acts">
        <button class="ibtn ghost xs" data-act="pausar" data-tip="${s.activo ? 'Pausar' : 'Reanudar'}">${icon(s.activo ? 'close' : 'check')}</button>
        <button class="ibtn xs primary" data-act="aplicar" data-tip="Aplicar ahora">${icon('check')}</button>
        <button class="ibtn ghost xs" data-act="editar" data-tip="Editar">${icon('edit')}</button>
        <button class="ibtn ghost xs danger" data-act="eliminar" data-tip="Eliminar">${icon('trash')}</button>
      </div>
    </div>`;
}

async function onClick(e, root) {
  const cardEl = e.target.closest('.deuda-card');
  if (!cardEl) return;
  const s = state.sueldos.find((x) => x.id === cardEl.dataset.id);
  if (!s) return;
  const act = e.target.closest('[data-act]')?.dataset.act;

  if (act === 'editar') { openSueldoForm(s); return; }
  if (act === 'pausar') { store.saveSueldo({ ...s, activo: !s.activo }); toast(s.activo ? 'Sueldo pausado' : 'Sueldo reanudado'); return; }
  if (act === 'aplicar') { openAplicarForm(s); return; }
  if (act === 'eliminar') {
    const ok = await confirmDialog({
      title: 'Eliminar sueldo',
      message: `Se eliminará <b>${esc(s.nombre)}</b>. Los ingresos que ya generó no se tocan.`,
      confirmIcon: 'trash',
      danger: true,
    });
    if (ok) { store.deleteSueldo(s.id); toast('Sueldo eliminado'); }
  }
}

/** Panel de confirmación antes de aplicar: el monto viene precargado pero siempre editable. */
export function openAplicarForm(s, { fecha } = {}) {
  let el;
  let getMonto;
  const fechaDefecto = fecha || (sueldoVencido(s) ? s.proxima : today());

  openModal({
    title: `Aplicar «${s.nombre}»`,
    width: 400,
    body: `
      <div class="grid-2">
        <div class="field"><label>Monto</label><div class="money"><span>$</span><input class="input" name="monto" inputmode="numeric" placeholder="0" value="${s.monto || ''}" autofocus></div></div>
        <div class="field"><label>Fecha</label><input class="input" type="date" name="fecha" value="${fechaDefecto}"></div>
      </div>`,
    onMount: (rootEl) => { el = rootEl; getMonto = bindMoney(el.querySelector('[name="monto"]')); },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (c) => c() },
      {
        icon: 'check', tip: 'Aplicar (Enter)', kind: 'primary', primary: true,
        onClick: (close) => {
          const monto = getMonto();
          const fechaEl = el.querySelector('[name="fecha"]');
          if (!(monto > 0)) { shake(el.querySelector('[name="monto"]')); toast('El monto debe ser mayor a 0', 'warn'); return; }
          if (!fechaEl.value) { shake(fechaEl); toast('Elige una fecha', 'warn'); return; }
          store.aplicarSueldo(s.id, { monto, fecha: fechaEl.value });
          toast(`${s.nombre} aplicado`);
          close();
        },
      },
    ],
  });
}
