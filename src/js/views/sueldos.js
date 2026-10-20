// Sueldos y subscripciones: movimientos recurrentes. Los sueldos generan ingresos (sueldo mensual,
// remuneración diaria…); las subscripciones, gastos (cobros recurrentes: streaming, arriendo…).

import * as store from '../store.js';
import { state } from '../store.js';
import { sueldoVencido, frecuenciaTexto } from '../calc.js';
import { clp, esc, fechaCorta, today } from '../format.js';
import { icon } from '../icons.js';
import {
  openModal, bindMoney, confirmDialog, toast, shake, aplicarCensura, sw,
} from '../ui.js';
import { openSueldoForm } from '../forms/sueldo-form.js';
import { destacar } from './deudas.js';

export const meta = { id: 'sueldos', title: 'Sueldos y subscripciones', icon: 'refresh' };

// Textos por clase; `o` es la terminación de género (encendido/encendida).
export const CLASE_TXT = {
  sueldo: { uno: 'Sueldo', varios: 'Sueldos', o: 'o' },
  subscripcion: { uno: 'Subscripción', varios: 'Subscripciones', o: 'a' },
};

export function render(root, { first, highlight } = {}) {
  if (first) store.revisarSueldos();

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Sueldos y subscripciones</h1><p class="subtitle">Ingresos y cobros recurrentes</p></div>
    </header>
    ${seccion('sueldo', 'income', 'Ingresos recurrentes: sueldo, remuneraciones, etc.', first)}
    ${seccion('subscripcion', 'expense', 'Cobros recurrentes: streaming, arriendo, gimnasio, etc.', first)}`;

  aplicarCensura(root);
  root.onclick = (e) => onClick(e);
  // El switch de encendido: se maneja por "change" para no depender del click sobre el label.
  root.onchange = (e) => {
    if (e.target.name !== 'activo') return;
    const s = store.getSueldo(e.target.closest('.deuda-card')?.dataset.id);
    if (!s) return;
    const t = CLASE_TXT[s.clase];
    store.setSueldoActivo(s.id, e.target.checked);
    toast(`${t.uno} ${e.target.checked ? 'encendid' : 'apagad'}${t.o}`);
  };

  if (highlight) destacar(root, highlight);
}

function seccion(clase, ic, sub, anim) {
  const t = CLASE_TXT[clase];
  // Primero los que ya les toca, después por próxima fecha; los apagados al final.
  const lista = state.sueldos.filter((s) => s.clase === clase).sort((a, b) => (
    (b.activo - a.activo) || ((sueldoVencido(a) ? 0 : 1) - (sueldoVencido(b) ? 0 : 1)) || a.proxima.localeCompare(b.proxima)
  ));
  const activos = lista.filter((s) => s.activo);
  const fijos = activos.filter((s) => s.monto != null);
  return `
    <section class="deuda-section">
      <div class="section-head">
        ${icon(ic)}<h2>${t.varios}</h2>
        <span class="muted">${activos.length} ${activos.length === 1 ? 'activo' : 'activos'}${fijos.length ? ` · ${clp(fijos.reduce((a, s) => a + mensualizado(s), 0))} al mes aprox.` : ''}</span>
        <span class="spacer"></span>
        <button class="ibtn ghost sm" data-add="${clase}" data-tip="Agregar ${t.uno.toLowerCase()}">${icon('plus')}</button>
      </div>
      ${lista.length
        ? `<div class="deuda-grid">${lista.map((s, i) => card(s, i, anim)).join('')}</div>`
        : `<div class="card empty small">${sub}</div>`}
    </section>`;
}

/** Monto aproximado por mes de un recurrente con monto fijo (para el resumen de cada sección). */
function mensualizado(s) {
  const porMes = { dia: 30.44, semana: 30.44 / 7, mes: 1, anio: 1 / 12 }[s.frecuenciaUnidad];
  return (s.monto * porMes) / s.frecuenciaCantidad;
}

function card(s, i, anim) {
  const vencido = sueldoVencido(s);
  const esSueldo = s.clase === 'sueldo';
  const c = !s.activo ? 'var(--text-3)' : vencido ? 'var(--orange)' : esSueldo ? 'var(--green)' : 'var(--red)';
  return `
    <div class="card deuda-card ${anim ? 'anim' : ''} ${!s.activo ? 'cancelada' : ''} ${vencido ? 'atrasada' : ''}" style="--c:${c};--i:${i}" data-id="${s.id}">
      <div class="deuda-card-head">
        <span class="name-text">${esc(s.nombre) || '<span class="muted">Sin nombre</span>'}</span>
        <span data-tip="${s.activo ? 'Apagar' : 'Encender'}">${sw('activo', s.activo)}</span>
      </div>
      <div class="deuda-contraparte">${icon('refresh')}<span>${frecuenciaTexto(s)} · ${s.hora}</span><span class="chip">${s.modo === 'auto' ? 'Automático' : 'Sugerido'}</span></div>
      <div class="deuda-monto censurable ${esSueldo ? 'pos' : 'neg'}">${s.monto != null ? `${esSueldo ? '+' : '−'}${clp(s.monto)}` : '<span class="muted">Sin monto fijo</span>'}</div>
      <div class="deuda-meta">
        <span>${s.activo ? '' : esSueldo ? 'Apagado' : 'Apagada'}</span>
        <span class="${vencido ? 'neg' : 'muted'}">${s.activo ? `${vencido ? `${esSueldo ? 'Atrasado' : 'Atrasada'} desde` : 'Próximo'} ${fechaCorta(s.proxima)}` : ''}</span>
      </div>
      <div class="deuda-acts">
        <button class="ibtn xs primary" data-act="aplicar" data-tip="Aplicar ahora" ${s.activo ? '' : 'disabled'}>${icon('check')}</button>
        <button class="ibtn ghost xs" data-act="editar" data-tip="Editar">${icon('edit')}</button>
        <button class="ibtn ghost xs danger" data-act="eliminar" data-tip="Eliminar">${icon('trash')}</button>
      </div>
    </div>`;
}

async function onClick(e) {
  const add = e.target.closest('[data-add]');
  if (add) { openSueldoForm(null, { clase: add.dataset.add }); return; }

  const cardEl = e.target.closest('.deuda-card');
  if (!cardEl) return;
  const s = store.getSueldo(cardEl.dataset.id);
  if (!s) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  const t = CLASE_TXT[s.clase];

  if (act === 'editar') { openSueldoForm(s); return; }
  if (act === 'aplicar') { openAplicarForm(s); return; }
  if (act === 'eliminar') {
    const ok = await confirmDialog({
      title: `Eliminar ${t.uno.toLowerCase()}`,
      message: `Se eliminará <b>${esc(s.nombre)}</b>. Los movimientos que ya generó no se tocan (quedan como movimientos normales).<br>Si solo quieres pausarl${t.o}, usa el switch.`,
      confirmIcon: 'trash',
      danger: true,
    });
    if (ok) { store.deleteSueldo(s.id); toast(`${t.uno} eliminad${t.o}`); }
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
      <div class="hint">Se registrará como ${s.clase === 'sueldo' ? 'un ingreso' : 'un gasto'}.</div>
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
