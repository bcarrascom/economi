// Lista de compras (wishlist). Una sola tabla con dos secciones: ahorro y otras compras.

import * as store from '../store.js';
import { state } from '../store.js';
import { resumen, metricasCompra, filtrarPorTags } from '../calc.js';
import { clp, esc, fechaHora, shortId, pct, scaleColor, clamp } from '../format.js';
import { icon } from '../icons.js';
import {
  statCard, runCounts, tagList, tagFilter, yesNo, pctCell, confirmDialog, toast, openModal, bindMoney, shake,
} from '../ui.js';
import { openCompraForm } from '../forms/compra-form.js';

let filtro = [];
const abiertos = new Set();

export const meta = { id: 'compras', title: 'Lista de compras', icon: 'cart' };

export function render(root, { first }) {
  const r = resumen(state);
  const cobertura = r.objetivo > 0 ? r.ahorro / r.objetivo : 0;

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Lista de compras</h1><p class="subtitle">Lo que quieres comprar y lo que estás ahorrando para comprar</p></div>
      <div class="spacer"></div>
      <button class="ibtn primary" data-act="nuevo" data-tip="Agregar a la lista">${icon('plus')}</button>
    </header>

    <section class="dash-stats four">
      ${statCard('ideal', 'Ideal teórico', 'cart', r.ideal > 0 ? (r.neto / r.ideal) * 2 - 1 : 1, 'Suma de toda la lista')}
      ${statCard('objetivo', 'Objetivo', 'flag', cobertura * 2 - 1, 'Suma de los ítems de ahorro')}
      ${statCard('ahorro', 'Presupuesto de ahorro', 'piggy', cobertura * 2 - 1)}
      ${statCard('neto', 'Neto', 'wallet', r.neto / Math.max(r.promGastoMensual * 3, 1))}
    </section>

    <div class="card progress-card">
      <div class="progress-head"><span>Ahorro frente al objetivo</span><b style="color:${scaleColor(cobertura * 2 - 1)}">${r.objetivo > 0 ? pct(cobertura * 100, 0) : '—'}</b></div>
      <div class="bar"><i style="--w:${clamp(cobertura * 100, 0, 100)}%;--c:${scaleColor(cobertura * 2 - 1)}"></i></div>
    </div>

    <div class="toolbar" data-el="filter"></div>
    <div data-el="table"></div>`;

  runCounts(root, 'compras', { ideal: r.ideal, objetivo: r.objetivo, ahorro: r.ahorro, neto: r.neto });
  requestAnimationFrame(() => root.querySelector('.progress-card .bar i')?.classList.add('in'));
  root.querySelector('[data-act="nuevo"]').onclick = () => openCompraForm();
  tagFilter(root.querySelector('[data-el="filter"]'), filtro, (v) => { filtro = v; table(root, r, true); });
  root.querySelector('[data-el="table"]').addEventListener('click', (e) => onClick(e));
  table(root, r, first);
}

function table(root, r, anim) {
  const el = root.querySelector('[data-el="table"]');
  const items = filtrarPorTags(state.compras, filtro);
  if (!state.compras.length) {
    el.innerHTML = `<div class="card empty">Tu lista está vacía. Agrega lo que quieres comprar con ${icon('plus', 'inline')}.</div>`;
    return;
  }
  const ids = state.ajustes.mostrarIds;
  const ahorro = items.filter((c) => c.esAhorro).sort((a, b) => a.costo - b.costo);
  const otros = items.filter((c) => !c.esAhorro).sort((a, b) => a.costo - b.costo);
  const n = 9 + (ids ? 1 : 0);
  let i = 0;

  const seccion = (titulo, ic, lista, total, extra) => `
    <tr class="section"><td colspan="${n}"><div class="section-row">
      ${icon(ic)}<b>${titulo}</b><span class="muted">${lista.length} ${lista.length === 1 ? 'ítem' : 'ítems'}</span>
      <span class="spacer"></span>${extra}<b>${clp(total)}</b>
    </div></td></tr>
    ${lista.length ? lista.map((c) => fila(c, r, i++, anim, ids, n)).join('') : `<tr class="section-empty"><td colspan="${n}"><span class="muted">Nada en esta sección${filtro.length ? ' con estos filtros' : ''}.</span></td></tr>`}`;

  el.innerHTML = `
    <div class="table-wrap">
      <table class="t t-head-static">
        <thead><tr>
          <th class="w-exp"></th>
          ${ids ? '<th>ID</th>' : ''}
          <th class="grow">Producto o servicio</th>
          <th>Tags</th>
          <th class="num">Costo</th>
          <th>% del objetivo</th>
          <th>% del total</th>
          <th class="c">Alcanza el ahorro</th>
          <th class="c">Alcanza el neto</th>
          <th class="w-act"></th>
        </tr></thead>
        <tbody>
          ${seccion('Ahorro', 'piggy', ahorro, r.objetivo, '<span class="muted">Objetivo</span>')}
          ${seccion('Otras compras', 'bag', otros, r.ideal - r.objetivo, '<span class="muted">Subtotal</span>')}
        </tbody>
      </table>
    </div>`;
}

function fila(c, r, i, anim, ids, n) {
  const mt = metricasCompra(c, r);
  return `
    <tr class="row ${anim ? 'anim' : ''} ${abiertos.has(c.id) ? 'is-open' : ''}" data-id="${c.id}" style="--i:${Math.min(i, 24)}">
      <td class="w-exp">${icon('chevronRight', 'chev')}</td>
      ${ids ? `<td><span class="mono dim">${shortId(c.id)}</span></td>` : ''}
      <td class="grow"><span class="name"><span class="name-text">${esc(c.nombre)}</span>${c.descripcion ? '<span class="has-desc" data-tip="Tiene descripción"></span>' : ''}</span></td>
      <td>${tagList(c.tags)}</td>
      <td class="num">${clp(c.costo)}</td>
      <td>${pctCell(mt.pctObjetivo)}</td>
      <td>${pctCell(mt.pctTotal)}</td>
      <td class="c">${yesNo(mt.comprableAhorro)}</td>
      <td class="c">${yesNo(mt.comprableNeto)}</td>
      <td class="w-act"><div class="acts">
        <button class="ibtn ghost xs" data-act="edit" data-tip="Editar">${icon('edit')}</button>
        <button class="ibtn ghost xs danger" data-act="del" data-tip="Quitar de la lista">${icon('trash')}</button>
        <button class="ibtn xs buy" data-act="buy" data-tip="Comprar">${icon('bag')}</button>
      </div></td>
    </tr>
    <tr class="detail ${abiertos.has(c.id) ? 'open' : ''}"><td colspan="${n}"><div class="detail-inner"><div>
      <div class="detail-body">
        <div class="desc">${c.descripcion ? esc(c.descripcion).replace(/\n/g, '<br>') : '<span class="muted">Sin descripción.</span>'}</div>
        <dl class="meta"><dt>ID</dt><dd class="mono">${c.id}</dd><dt>Agregado</dt><dd>${fechaHora(c.creado)}</dd>
          <dt>Tipo</dt><dd>${c.esAhorro ? 'Ahorro (se descuenta del presupuesto de ahorro al comprar)' : 'Compra normal (se descuenta del bolsillo)'}</dd></dl>
      </div>
    </div></div></td></tr>`;
}

async function onClick(e) {
  const tr = e.target.closest('tr.row');
  if (!tr) return;
  const c = state.compras.find((x) => x.id === tr.dataset.id);
  if (!c) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  const r = resumen(state);

  if (act === 'edit') { openCompraForm(c); return; }
  if (act === 'del') {
    const ok = await confirmDialog({ title: 'Quitar de la lista', message: `Se quitará <b>${esc(c.nombre)}</b> de la lista sin registrar un gasto.`, confirmIcon: 'trash', danger: true });
    if (ok) { store.deleteCompra(c.id); toast('Ítem quitado de la lista'); }
    return;
  }
  if (act === 'buy') { openComprarForm(c, r); return; }
  const open = !abiertos.has(c.id);
  if (open) abiertos.add(c.id); else abiertos.delete(c.id);
  tr.classList.toggle('is-open', open);
  tr.nextElementSibling?.classList.toggle('open', open);
}

/** Pide confirmar (y ajustar si hace falta) el precio final antes de registrar la compra como gasto. */
function openComprarForm(c, r) {
  let el;
  let getMonto;
  const avisosHtml = (monto) => {
    const mt = metricasCompra({ ...c, costo: monto }, r);
    const avisos = [];
    if (mt.comprableNeto === false) avisos.push('El costo supera tu neto actual.');
    if (mt.comprableAhorro === false) avisos.push('El costo supera tu presupuesto de ahorro.');
    return avisos.length ? `<div class="warn-list">${avisos.map((a) => `<div>${icon('alert')}${a}</div>`).join('')}</div>` : '';
  };

  openModal({
    title: 'Comprar',
    width: 440,
    body: `
      <p>Se registrará <b>${esc(c.nombre)}</b> como gasto con fecha de hoy${c.esAhorro ? ', descontado del presupuesto de ahorro' : ''}, y saldrá de la lista.</p>
      <div class="field"><label>Precio final</label><div class="money"><span>$</span><input class="input" name="monto" inputmode="numeric" placeholder="0" value="${c.costo || ''}" autofocus></div></div>
      <div data-el="avisos">${avisosHtml(c.costo)}</div>
      <p class="muted small">Esta acción no se puede deshacer directamente.</p>`,
    onMount: (root) => {
      el = root;
      const input = el.querySelector('[name="monto"]');
      getMonto = bindMoney(input);
      input.addEventListener('input', () => {
        el.querySelector('[data-el="avisos"]').innerHTML = avisosHtml(getMonto());
      });
    },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (close) => close() },
      {
        icon: 'bag', tip: 'Comprar (Enter)', kind: 'danger-solid', primary: true,
        onClick: (close) => {
          const monto = getMonto();
          if (!(monto > 0)) { shake(el.querySelector('[name="monto"]')); toast('El precio debe ser mayor a 0', 'warn'); return; }
          store.comprar(c.id, { monto });
          toast(`${c.nombre} registrado como gasto`);
          close();
        },
      },
    ],
  });
}
