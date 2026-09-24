// Tags: crear, editar y eliminar las categorías, más gráficos relacionados.

import * as store from '../store.js';
import { state } from '../store.js';
import { porTag, arrepentimientoPorTag, enPeriodo } from '../calc.js';
import { clp, esc, hexToRgba } from '../format.js';
import { icon } from '../icons.js';
import {
  tagPill, confirmDialog, toast, segmented, bindSegmented,
} from '../ui.js';
import { openTagForm } from '../forms/tag-form.js';
import { chart, tagDoughnutConfig, rankingConfig } from '../charts.js';

const TOP_COLAPSADO = 6;

let rankPeriodo = 'todo';
let comboMetrica = 'monto'; // 'monto' | 'usos'
let comboExpandido = false;

export const meta = { id: 'tags', title: 'Tags', icon: 'tag' };

export function render(root, { first }) {
  const tags = [...state.tags].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  root.innerHTML = `
    <header class="page-head">
      <div><h1>Tags</h1><p class="subtitle">Etiquetas para organizar, filtrar y graficar</p></div>
      <div class="spacer"></div>
      <button class="ibtn primary" data-act="nuevo" data-tip="Nuevo tag">${icon('plus')}</button>
    </header>
    ${tags.length ? `<section class="tag-grid">${tags.map((t, i) => {
      const u = store.usoTag(t.id);
      return `
        <div class="card tag-card ${first ? 'anim' : ''}" style="--c:${esc(t.color)};--i:${i}" data-id="${t.id}">
          <div class="tag-card-head">${tagPill(t)}<span class="spacer"></span>
            <button class="ibtn ghost xs" data-act="edit" data-tip="Editar">${icon('edit')}</button>
            <button class="ibtn ghost xs danger" data-act="del" data-tip="Eliminar">${icon('trash')}</button>
          </div>
          <dl class="tag-stats">
            <div><dt>Gastado</dt><dd>${clp(u.gastado)}</dd></div>
            <div><dt>Ingresado</dt><dd>${clp(u.ingresado)}</dd></div>
            <div><dt>En lista</dt><dd>${clp(u.enLista)}</dd></div>
            <div><dt>Usos</dt><dd>${u.usos}</dd></div>
          </dl>
        </div>`;
    }).join('')}</section>`
    : `<div class="card empty">Aún no tienes tags. Crea el primero con ${icon('plus', 'inline')}; también puedes crearlos al registrar un movimiento.</div>`}

    ${tags.length ? `
    <div class="section-head">
      <h2>Gráficos</h2>
      <div class="spacer"></div>
      ${segmented('rankPeriodo', [['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['todo', 'Siempre']], rankPeriodo)}
    </div>
    <section class="charts">
      <div class="card chart-card"><div class="chart-title"><h4>Gastos por tag</h4></div><div class="chart-box"><canvas data-c="gastosTag"></canvas></div></div>
      <div class="card chart-card"><div class="chart-title"><h4>% de arrepentimiento por tag</h4></div><div class="chart-box"><canvas data-c="arrepTag"></canvas></div></div>
      <div class="card chart-card"><div class="chart-title"><h4>Ranking de ingresos</h4></div><div class="chart-box"><canvas data-c="rankIngresos"></canvas></div></div>
      <div class="card chart-card span-3">
        <div class="chart-title">
          <h4 data-el="comboTitle"></h4>
          <span class="spacer"></span>
          ${segmented('comboMetrica', [['monto', '$'], ['usos', '#']], comboMetrica)}
          <button class="ibtn ghost sm" data-act="expandir" data-tip="${comboExpandido ? 'Ver menos' : 'Ver todos'}">${icon('chevronDown', `chev-toggle${comboExpandido ? ' on' : ''}`)}</button>
        </div>
        <div class="chart-box tall" data-el="comboBox"><canvas data-c="combo"></canvas></div>
      </div>
    </section>` : ''}`;

  root.querySelector('[data-act="nuevo"]').onclick = () => openTagForm();
  root.querySelector('.tag-grid')?.addEventListener('click', async (e) => {
    const card = e.target.closest('.tag-card');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!card || !act) return;
    const t = store.tagById(card.dataset.id);
    if (act === 'edit') openTagForm(t);
    if (act === 'del') {
      const u = store.usoTag(t.id);
      const ok = await confirmDialog({
        title: 'Eliminar tag',
        message: `Se eliminará ${tagPill(t)}${u.usos ? ` y se quitará de <b>${u.usos}</b> ${u.usos === 1 ? 'elemento' : 'elementos'}` : ''}.`,
        confirmIcon: 'trash',
        danger: true,
      });
      if (ok) { store.deleteTag(t.id); toast('Tag eliminado'); }
    }
  });

  if (!tags.length) return;

  bindSegmented(root, 'rankPeriodo', (v) => { rankPeriodo = v; graficos(root, false); });
  bindSegmented(root, 'comboMetrica', (v) => { comboMetrica = v; graficos(root, false); });
  root.querySelector('[data-act="expandir"]').onclick = () => { comboExpandido = !comboExpandido; graficos(root, false); };
  graficos(root, first);
}

function empty(canvas, msg = 'Aún no hay datos') {
  canvas.parentElement.classList.add('is-empty');
  canvas.parentElement.dataset.empty = msg;
}

function graficos(root, anim) {
  const cv = (k) => {
    const c = root.querySelector(`[data-c="${k}"]`);
    c.parentElement.classList.remove('is-empty');
    return c;
  };
  const movs = state.movimientos;
  const movsPeriodo = movs.filter((m) => enPeriodo(m, rankPeriodo));

  // Gastos por tag (histórico completo)
  const pt = porTag(movs, state.tags, 'gasto');
  const cG = cv('gastosTag');
  if (pt.length) chart(cG, 'tg-gastos', tagDoughnutConfig(pt), anim);
  else empty(cG, 'Sin gastos con tags');

  // % de arrepentimiento por tag
  const ar = arrepentimientoPorTag(movs, state.tags);
  const cA = cv('arrepTag');
  if (ar.length) {
    chart(cA, 'tg-arrep', rankingConfig(
      ar.map((r) => r.tag.nombre),
      ar.map((r) => r.pct),
      ar.map((r) => hexToRgba(r.tag.color, 0.7)),
      { tickFmt: (v) => `${v.toFixed(0)}%`, tooltipFmt: (v) => `${v.toFixed(1)}%` },
    ), anim);
  } else empty(cA, 'Sin gastos con tags');

  // Ranking de ingresos por tag
  const ri = porTag(movsPeriodo, state.tags, 'ingreso');
  const cI = cv('rankIngresos');
  if (ri.length) {
    chart(cI, 'tg-rankIngresos', rankingConfig(
      ri.map((r) => r.tag?.nombre || 'Sin tag'),
      ri.map((r) => r.total),
      ri.map((r) => hexToRgba(r.tag?.color || '#6b7080', 0.7)),
    ), anim);
  } else empty(cI, 'Sin ingresos en el periodo');

  // Ranking de gastos + usos combinado
  const base = porTag(movsPeriodo, state.tags, 'gasto'); // ya viene ordenado por total desc
  const rg = comboMetrica === 'usos' ? [...base].sort((a, b) => b.count - a.count) : base;
  root.querySelector('[data-el="comboTitle"]').textContent = comboMetrica === 'usos' ? 'Ranking de tags más usados' : 'Ranking de gastos';
  const expandBtn = root.querySelector('[data-act="expandir"]');
  expandBtn.disabled = rg.length <= TOP_COLAPSADO;
  expandBtn.dataset.tip = comboExpandido ? 'Ver menos' : 'Ver todos';
  expandBtn.querySelector('.ico').classList.toggle('on', comboExpandido);
  const visibles = comboExpandido ? rg : rg.slice(0, TOP_COLAPSADO);
  const box = root.querySelector('[data-el="comboBox"]');
  box.style.height = comboExpandido ? `${Math.max(240, visibles.length * 28 + 50)}px` : '';
  const cC = cv('combo');
  if (visibles.length) {
    chart(cC, 'tg-combo', comboMetrica === 'usos'
      ? rankingConfig(
        visibles.map((r) => r.tag?.nombre || 'Sin tag'),
        visibles.map((r) => r.count),
        visibles.map((r) => hexToRgba(r.tag?.color || '#6b7080', 0.7)),
        { tickFmt: (v) => String(Math.round(v)), tooltipFmt: (v) => `${Math.round(v)} ${Math.round(v) === 1 ? 'uso' : 'usos'}` },
      )
      : rankingConfig(
        visibles.map((r) => r.tag?.nombre || 'Sin tag'),
        visibles.map((r) => r.total),
        visibles.map((r) => hexToRgba(r.tag?.color || '#6b7080', 0.7)),
      ), anim);
  } else empty(cC, 'Sin gastos en el periodo');
}
