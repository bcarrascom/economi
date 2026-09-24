// Movimientos: tabla combinada + tablas separadas de ingresos, gastos e inversiones.

import * as store from '../store.js';
import { state } from '../store.js';
import { aporteAhorro, estadoInversion, filtrarPorTags, totalesDe } from '../calc.js';
import {
  clp, clpSigned, pct, esc, fechaCorta, fechaHora, monthLabel, shortId, normalize,
} from '../format.js';
import { icon } from '../icons.js';
import {
  segmented, bindSegmented, tagGrid, deudaCell, tagFilter, regret, statusBadge, confirmDialog, toast,
} from '../ui.js';
import { openMovimientoForm } from '../forms/movimiento-form.js';
import { openAplicarForm } from './sueldos.js';
import { go } from '../app.js';

let tab = 'todos';
let busqueda = '';
let mes = '';
let filtro = [];
let orden = { k: 'fecha', d: -1 };
let filtroDeudas = 'todos'; // 'todos' | 'deudas' | 'pendientes' — se cicla clickeando el header "Deudas"
const abiertos = new Set();

export const meta = { id: 'movimientos', title: 'Movimientos', icon: 'list' };

const DEUDAS_LABEL = { todos: 'Deudas', deudas: 'Deudas: todas', pendientes: 'Deudas: pendientes' };
const DEUDAS_SIGUIENTE = { todos: 'deudas', deudas: 'pendientes', pendientes: 'todos' };

/** ¿El movimiento tiene alguna deuda asociada (como origen o como liquidación automática)? */
const tieneDeuda = (m) => store.deudasDeMov(m.id).length > 0 || !!store.deudaLiquidadaPorMov(m.id);
/** ¿Tiene una deuda (como origen) todavía sin cancelar? */
const tieneDeudaPendiente = (m) => store.deudasDeMov(m.id).some((d) => d.estado !== 'cancelada');

const typeIcon = (m) => `<span class="type-ico ${m.tipo}">${icon(m.tipo === 'ingreso' ? 'income' : m.esInversion ? 'invest' : 'expense')}</span>`;

const COL = {
  fecha: { k: 'fecha', l: 'Fecha', sort: (m) => m.fecha, cell: (m) => `<span class="dim">${fechaCorta(m.fecha)}</span>` },
  nombre: {
    k: 'nombre', l: 'Nombre', cls: 'grow', sort: (m) => normalize(m.nombre),
    cell: (m) => `<span class="name">${typeIcon(m)}<span class="name-text">${esc(m.nombre)}</span>${m.tipo === 'ingreso' && m.esSueldo ? '<span class="chip">Sueldo</span>' : ''}${m.desdeAhorro ? '<span class="chip">Desde ahorro</span>' : ''}${m.descripcion ? `<span class="has-desc" data-tip="Tiene descripción"></span>` : ''}</span>`,
  },
  deudas: { k: 'deudas', l: 'Deudas', cell: (m) => deudaCell(m) },
  tags: { k: 'tags', l: 'Tags', cell: (m) => tagGrid(m.tags) },
  arrep: { k: 'arrep', l: 'Arrep.', sort: (m) => m.arrepentimiento, cell: (m) => regret(m.arrepentimiento) },
  aporte: {
    k: 'aporte', l: 'Al ahorro', cls: 'num', sort: aporteAhorro,
    cell: (m) => {
      const a = aporteAhorro(m);
      return a ? `<span class="pos">${clp(a)}</span>${m.ahorro.modo === 'pct' ? ` <span class="muted">${pct(m.ahorro.valor, 1)}</span>` : ''}` : '<span class="muted">—</span>';
    },
  },
  estado: {
    k: 'estado', l: 'Estado',
    sort: (m) => ({ pendiente: 0, perdida: 1, ganancia: 2 }[estadoInversion(m, state.movimientos)?.estado] ?? -1),
    cell: (m) => `<span data-act="estado">${statusBadge(estadoInversion(m, state.movimientos))}</span>`,
  },
  retorno: {
    k: 'retorno', l: 'Retorno', cls: 'num', sort: (m) => estadoInversion(m, state.movimientos)?.retorno ?? -1,
    cell: (m) => { const e = estadoInversion(m, state.movimientos); return e?.retorno != null ? clp(e.retorno) : '<span class="muted">—</span>'; },
  },
  monto: {
    k: 'monto', l: 'Monto', cls: 'num', sort: (m) => (m.tipo === 'ingreso' ? m.monto : -m.monto),
    cell: (m) => `<span class="amount ${m.tipo === 'ingreso' ? 'pos' : 'neg'}">${m.tipo === 'ingreso' ? '+' : '−'}${clp(m.monto)}</span>`,
  },
};

const COLS = {
  todos: ['fecha', 'nombre', 'deudas', 'tags', 'arrep', 'monto'],
  ingreso: ['fecha', 'nombre', 'deudas', 'tags', 'arrep', 'aporte', 'monto'],
  gasto: ['fecha', 'nombre', 'deudas', 'tags', 'arrep', 'estado', 'monto'],
  inversion: ['fecha', 'nombre', 'deudas', 'tags', 'arrep', 'estado', 'retorno', 'monto'],
};

export function render(root, { first, tab: presetTab, mes: presetMes }) {
  if (presetTab !== undefined) tab = presetTab;
  if (presetMes !== undefined) mes = presetMes;
  const meses = [...new Set(state.movimientos.map((m) => m.fecha.slice(0, 7)))].sort().reverse();
  if (mes && !meses.includes(mes)) mes = '';

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Movimientos</h1><p class="subtitle">Todo lo que entra y sale</p></div>
      <div class="spacer"></div>
      <button class="ibtn primary" data-act="nuevo" data-tip="Nuevo movimiento">${icon('plus')}</button>
    </header>
    <div data-el="sueldos"></div>
    <div class="toolbar">
      ${segmented('tab', [['todos', 'Todos'], ['ingreso', 'Ingresos'], ['gasto', 'Gastos'], ['inversion', 'Inversiones']], tab)}
      <label class="search">${icon('search')}<input class="input sm" data-el="q" placeholder="Buscar" value="${esc(busqueda)}"></label>
      <select class="input sm select" data-el="mes">
        <option value="">Todos los meses</option>
        ${meses.map((k) => `<option value="${k}" ${k === mes ? 'selected' : ''}>${monthLabel(k)}</option>`).join('')}
      </select>
      <div class="spacer"></div>
      <button class="ibtn ${state.ajustes.mostrarIds ? 'on' : ''}" data-act="ids" data-tip="${state.ajustes.mostrarIds ? 'Ocultar IDs' : 'Mostrar IDs'}">${icon('hash')}</button>
    </div>
    <div class="toolbar" data-el="filter"></div>
    <div class="summary" data-el="sum"></div>
    <div data-el="table"></div>`;

  bindSegmented(root, 'tab', (v) => { tab = v; table(root, true); });
  root.querySelector('[data-act="nuevo"]').onclick = () => openMovimientoForm(null, {
    tipo: tab === 'ingreso' ? 'ingreso' : 'gasto', esInversion: tab === 'inversion',
  });
  root.querySelector('[data-act="ids"]').onclick = () => store.updateAjustes({ mostrarIds: !state.ajustes.mostrarIds });
  root.querySelector('[data-el="q"]').oninput = (e) => { busqueda = e.target.value; table(root, false); };
  root.querySelector('[data-el="mes"]').onchange = (e) => { mes = e.target.value; table(root, true); };
  tagFilter(root.querySelector('[data-el="filter"]'), filtro, (v) => { filtro = v; table(root, true); });

  root.querySelector('[data-el="table"]').addEventListener('click', (e) => onTableClick(e, root));
  sueldosBanner(root, first);
  table(root, first);
}

/** Sugerencias de sueldos/remuneraciones que ya les toca (modo "sugerido"), con Aplicar/Posponer. */
function sueldosBanner(root, first) {
  if (first) store.revisarSueldos();
  const pendientes = store.sueldosSugeridosPendientes();
  const el = root.querySelector('[data-el="sueldos"]');
  if (!pendientes.length) { el.innerHTML = ''; return; }

  el.innerHTML = pendientes.map((s) => `
    <div class="card sueldo-notif" data-id="${s.id}">
      ${icon('refresh')}
      <div class="sueldo-notif-info">
        <b>${esc(s.nombre)}</b>
        <span class="muted">${s.monto != null ? clp(s.monto) : 'Sin monto fijo'} · ${fechaCorta(s.proxima)}</span>
      </div>
      <span class="spacer"></span>
      <button class="ibtn ghost sm" data-act="posponer" data-tip="Posponer hasta la próxima">${icon('close')}</button>
      <button class="ibtn sm ok" data-act="aplicar" data-tip="Aplicar">${icon('check')}</button>
    </div>`).join('');

  el.onclick = (e) => {
    const notif = e.target.closest('.sueldo-notif');
    if (!notif) return;
    const s = state.sueldos.find((x) => x.id === notif.dataset.id);
    if (!s) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'aplicar') { openAplicarForm(s); return; }
    if (act === 'posponer') { store.posponerSueldo(s.id); toast('Pospuesto hasta la próxima'); }
  };
}

function lista() {
  const q = normalize(busqueda.trim());
  let list = state.movimientos.filter((m) => {
    if (tab === 'ingreso' && m.tipo !== 'ingreso') return false;
    if (tab === 'gasto' && m.tipo !== 'gasto') return false;
    if (tab === 'inversion' && !(m.tipo === 'gasto' && m.esInversion)) return false;
    if (mes && !m.fecha.startsWith(mes)) return false;
    if (q && !normalize(`${m.nombre} ${m.descripcion}`).includes(q)) return false;
    if (filtroDeudas === 'deudas' && !tieneDeuda(m)) return false;
    if (filtroDeudas === 'pendientes' && !tieneDeudaPendiente(m)) return false;
    return true;
  });
  list = filtrarPorTags(list, filtro);
  const col = COL[orden.k] || COL.fecha;
  const key = col.sort || ((m) => m.fecha);
  return list.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const c = x < y ? -1 : x > y ? 1 : 0;
    return c * orden.d || b.creado.localeCompare(a.creado);
  });
}

/** Header normal (ordenable) salvo para "Deudas", que en vez de ordenar cicla su propio filtro. */
function headerCell(c) {
  if (c.k === 'deudas') {
    const tip = { todos: 'Filtrar: solo con deuda', deudas: 'Filtrar: solo pendientes', pendientes: 'Quitar filtro' }[filtroDeudas];
    return `<th class="sortable" data-filtro-deudas data-tip="${tip}">${DEUDAS_LABEL[filtroDeudas]}${filtroDeudas !== 'todos' ? `<span class="sort-ind">${icon('filter')}</span>` : ''}</th>`;
  }
  return `<th class="${c.cls || ''} ${c.sort ? 'sortable' : ''}" ${c.sort ? `data-sort="${c.k}"` : ''}>${c.l}${orden.k === c.k ? `<span class="sort-ind">${icon(orden.d > 0 ? 'chevronUp' : 'chevronDown')}</span>` : ''}</th>`;
}

function table(root, anim) {
  const list = lista();
  const ids = state.ajustes.mostrarIds;
  const cols = COLS[tab].map((k) => COL[k]);
  const t = totalesDe(list);

  root.querySelector('[data-el="sum"]').innerHTML = `
    <span><b>${list.length}</b> ${list.length === 1 ? 'movimiento' : 'movimientos'}</span>
    ${tab !== 'gasto' && tab !== 'inversion' ? `<span>Ingresos <b class="pos">${clp(t.ingresos)}</b></span>` : ''}
    ${tab !== 'ingreso' ? `<span>Gastos <b class="neg">${clp(t.gastos)}</b></span>` : ''}
    ${tab === 'todos' ? `<span>Balance <b class="${t.coef >= 0 ? 'pos' : 'neg'}">${clpSigned(t.coef)}</b></span>` : ''}`;

  const el = root.querySelector('[data-el="table"]');
  if (!list.length) {
    el.innerHTML = `<div class="card empty">${state.movimientos.length
      ? 'No hay movimientos con estos filtros.'
      : `Aún no registras movimientos. Usa ${icon('plus', 'inline')} para agregar el primero.`}</div>`;
    return;
  }
  const n = cols.length + 2 + (ids ? 1 : 0);

  el.innerHTML = `
    <div class="table-wrap">
      <table class="t">
        <thead><tr>
          <th class="w-exp"></th>
          ${ids ? '<th>ID</th>' : ''}
          ${cols.map((c) => headerCell(c)).join('')}
          <th class="w-act"></th>
        </tr></thead>
        <tbody>
          ${list.map((m, i) => `
            <tr class="row ${anim ? 'anim' : ''} ${abiertos.has(m.id) ? 'is-open' : ''}" data-id="${m.id}" style="--i:${Math.min(i, 24)}">
              <td class="w-exp">${icon('chevronRight', 'chev')}</td>
              ${ids ? `<td><span class="mono dim">${shortId(m.id)}</span></td>` : ''}
              ${cols.map((c) => `<td class="${c.cls || ''}">${c.cell(m)}</td>`).join('')}
              <td class="w-act"><div class="acts">
                <button class="ibtn ghost xs" data-act="edit" data-tip="Editar">${icon('edit')}</button>
                <button class="ibtn ghost xs danger" data-act="del" data-tip="Eliminar">${icon('trash')}</button>
              </div></td>
            </tr>
            <tr class="detail ${abiertos.has(m.id) ? 'open' : ''}" data-for="${m.id}"><td colspan="${n}"><div class="detail-inner"><div>${detalle(m)}</div></div></td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function detalle(m) {
  const est = estadoInversion(m, state.movimientos);
  const origen = m.origen?.tipo === 'compra'
    ? `<dt>Origen</dt><dd>Comprado desde la lista de compras${m.origen.esAhorro ? ' (ahorro)' : ''}${m.origen.costoLista != null && m.origen.costoLista !== m.monto ? ` <span class="muted">· precio en lista: ${clp(m.origen.costoLista)}</span>` : ''}</dd>`
    : m.origen?.tipo === 'inversion'
      ? `<dt>Origen</dt><dd>Retorno de la inversión «${esc(store.getMov(m.origen.gastoId)?.nombre || 'eliminada')}»</dd>`
      : '';
  return `
    <div class="detail-body">
      <div class="desc">${m.descripcion ? esc(m.descripcion).replace(/\n/g, '<br>') : '<span class="muted">Sin descripción.</span>'}</div>
      <dl class="meta">
        <dt>ID</dt><dd class="mono">${m.id}</dd>
        <dt>Registrado</dt><dd>${fechaHora(m.creado)}${m.editado ? ` <span class="muted">· editado ${fechaHora(m.editado)}</span>` : ''}</dd>
        ${origen}
        ${m.tipo === 'ingreso' ? `<dt>Aporte al ahorro</dt><dd>${clp(aporteAhorro(m))} ${m.ahorro.modo === 'pct' ? `(${pct(m.ahorro.valor)})` : '(monto fijo)'}</dd>` : ''}
        ${est ? `<dt>Invertido</dt><dd>${clp(m.monto)}</dd>
          <dt>Retorno</dt><dd>${est.retorno != null ? `${clp(est.retorno)} <span class="${est.diferencia > 0 ? 'pos' : 'neg'}">${clpSigned(est.diferencia)} (${pct(est.rentabilidad)})</span>` : 'Pendiente'}</dd>` : ''}
      </dl>
    </div>`;
}

async function onTableClick(e, root) {
  const dp = e.target.closest('[data-deuda]');
  if (dp) {
    const d = state.deudas.find((x) => x.id === dp.dataset.deuda);
    go(d?.estado === 'cancelada' ? 'historial' : 'deudas', { highlight: dp.dataset.deuda });
    return;
  }
  const filtroBtn = e.target.closest('[data-filtro-deudas]');
  if (filtroBtn) {
    filtroDeudas = DEUDAS_SIGUIENTE[filtroDeudas];
    table(root, true);
    return;
  }
  const th = e.target.closest('th[data-sort]');
  if (th) {
    const k = th.dataset.sort;
    orden = orden.k === k ? { k, d: -orden.d } : { k, d: k === 'nombre' ? 1 : -1 };
    table(root, false);
    return;
  }
  const tr = e.target.closest('tr.row');
  if (!tr) return;
  const m = store.getMov(tr.dataset.id);
  if (!m) return;
  const act = e.target.closest('[data-act]')?.dataset.act;

  if (act === 'edit' || act === 'estado') { openMovimientoForm(m); return; }
  if (act === 'del') {
    const auto = store.autoRetorno(m);
    const ok = await confirmDialog({
      title: 'Eliminar movimiento',
      message: `Se eliminará <b>${esc(m.nombre)}</b> (${clp(m.monto)}).${auto ? '<br>También se eliminará su ingreso de retorno automático.' : ''}`,
      confirmIcon: 'trash',
      danger: true,
    });
    if (ok) { store.deleteMovimiento(m.id); toast('Movimiento eliminado'); }
    return;
  }
  // Expandir / contraer descripción
  const open = !abiertos.has(m.id);
  if (open) abiertos.add(m.id); else abiertos.delete(m.id);
  tr.classList.toggle('is-open', open);
  tr.nextElementSibling?.classList.toggle('open', open);
}
