// Punto de entrada del renderer: shell, navegación y bienvenida.

import * as store from './store.js';
import { state } from './store.js';
import { icon } from './icons.js';
import { esc } from './format.js';
import { initTooltips, toast, showTransferOverlay, initCensura } from './ui.js';
import { setupCharts, destroyAll } from './charts.js';
import { openMovimientoForm } from './forms/movimiento-form.js';
import { openCompraForm } from './forms/compra-form.js';

import * as dashboard from './views/dashboard.js';
import * as movimientos from './views/movimientos.js';
import * as sueldos from './views/sueldos.js';
import * as deudas from './views/deudas.js';
import * as mensual from './views/mensual.js';
import * as compras from './views/compras.js';
import * as tags from './views/tags.js';
import * as ajustes from './views/ajustes.js';
import * as historial from './views/historial.js';

// VIEWS: aparecen en la barra lateral. HIDDEN_VIEWS: solo se llega por navegación directa
// (por ejemplo el botón "Historial" dentro de Deudas), nunca se listan en el nav.
const VIEWS = [dashboard, movimientos, sueldos, deudas, mensual, compras, tags, ajustes];
const HIDDEN_VIEWS = [historial];
const ALL_VIEWS = [...VIEWS, ...HIDDEN_VIEWS];
let current = 'dashboard';
let navOpts = {};
const app = document.getElementById('app');

function shell() {
  app.innerHTML = `
    <div class="titlebar"></div>
    <aside class="sidebar card">
      <div class="brand" data-tip="App Finanzas" data-tip-pos="right">${icon('logo')}</div>
      <nav class="nav">
        <span class="nav-ind"></span>
        ${VIEWS.map((v, i) => `<button class="nav-btn ${v.meta.id === current ? 'on' : ''}" data-view="${v.meta.id}" data-tip="${v.meta.title} (Ctrl+${i + 1})" data-tip-pos="right">${icon(v.meta.icon)}</button>`).join('')}
      </nav>
      <span class="spacer"></span>
      <button class="nav-btn add" data-act="add" data-tip="Nuevo movimiento (Ctrl+Enter)" data-tip-pos="right">${icon('plus')}</button>
    </aside>
    <main class="main">
      <div data-el="banner"></div>
      <div id="view"></div>
    </main>`;

  app.querySelector('.nav').onclick = (e) => {
    const b = e.target.closest('[data-view]');
    if (b && b.dataset.view !== current) go(b.dataset.view);
  };
  app.querySelector('[data-act="add"]').onclick = () => nuevoMovimiento();
  requestAnimationFrame(() => moveIndicator(true));
}

function moveIndicator(instant = false) {
  const ind = app.querySelector('.nav-ind');
  const on = app.querySelector('.nav-btn.on');
  if (!ind || !on) return;
  if (instant) ind.style.transition = 'none';
  ind.style.transform = `translateY(${on.offsetTop + on.offsetHeight / 2 - 9}px)`;
  if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
}

function banner() {
  const el = app.querySelector('[data-el="banner"]');
  el.innerHTML = state.error
    ? `<div class="banner">${icon('alert')}<div><b>No se pudieron leer algunos archivos.</b> No se sobrescribirán hasta que los revises y recargues.<pre>${esc(state.error)}</pre></div></div>`
    : '';
}

export function go(id, opts = {}) {
  current = id;
  navOpts = opts;
  app.querySelectorAll('.nav-btn[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === id));
  moveIndicator();
  const main = app.querySelector('.main');
  main.scrollTop = 0;
  renderView(true);
}

function renderView(first) {
  const view = ALL_VIEWS.find((v) => v.meta.id === current);
  const root = document.getElementById('view');
  const main = app.querySelector('.main');
  const scroll = main.scrollTop;
  destroyAll();
  view.render(root, { first, ...navOpts });
  if (first) navOpts = {};
  banner();
  if (first) {
    root.classList.remove('view-enter');
    void root.offsetWidth;
    root.classList.add('view-enter');
  } else {
    main.scrollTop = scroll;
  }
}

function welcome() {
  app.innerHTML = `
    <div class="titlebar"></div>
    <div class="welcome">
      <div class="card welcome-card">
        <div class="welcome-logo">${icon('logo')}</div>
        <h1>App Finanzas</h1>
        <p>Elige la carpeta donde se guardarán tus datos, por ejemplo <span class="mono">OneDrive/app-finanzas</span>. Si ya contiene datos de otro equipo, se cargarán.</p>
        <button class="ibtn primary lg" data-act="folder" data-tip="Elegir carpeta">${icon('folder')}</button>
      </div>
    </div>`;
  app.querySelector('[data-act="folder"]').onclick = async () => {
    if (await store.chooseFolder()) start();
  };
}

let started = false;
function start() {
  store.revisarSueldos();
  shell();
  renderView(true);
  if (started) return;
  started = true;
  store.subscribe(() => renderView(false));
  window.api.onExternalChange(async () => {
    await store.reload();
    toast('Datos actualizados desde otro equipo');
  });
}

/** Tipo ('ingreso' | 'gasto') del movimiento agregado más recientemente, para precargar el formulario. */
function tipoUltimoMovimiento() {
  let ultimo = null;
  for (const m of state.movimientos) if (!ultimo || m.creado > ultimo.creado) ultimo = m;
  return ultimo?.tipo;
}

function nuevoMovimiento(tipoForzado) {
  openMovimientoForm(null, { tipo: tipoForzado || tipoUltimoMovimiento() });
}

/** El "+" por defecto (Ctrl+Enter/N): un movimiento en general, salvo en Compras, donde es un ítem de la lista. */
function nuevoPorDefecto() {
  if (current === 'compras') { openCompraForm(); return; }
  nuevoMovimiento();
}

// Ctrl/Cmd + Enter (o N): nuevo elemento por defecto según el módulo activo (ver nuevoPorDefecto).
// Ctrl/Cmd + G / I: nuevo movimiento forzando gasto/ingreso. Ctrl/Cmd + 1..9: salta al módulo en
// esa posición de VIEWS (el 1 siempre es el dashboard, que no es reordenable; el resto sí a futuro).
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || !state.dataDir || document.querySelector('.overlay')) return;

  const key = e.key.toLowerCase();
  if (key === 'n' || e.key === 'Enter') {
    e.preventDefault();
    nuevoPorDefecto();
    return;
  }
  if (key === 'g') {
    e.preventDefault();
    nuevoMovimiento('gasto');
    return;
  }
  if (key === 'i') {
    e.preventDefault();
    nuevoMovimiento('ingreso');
    return;
  }

  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= VIEWS.length) {
    e.preventDefault();
    go(VIEWS[n - 1].meta.id);
    return;
  }

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const i = VIEWS.findIndex((v) => v.meta.id === current);
    const dir = e.key === 'ArrowUp' ? -1 : 1;
    const next = i < 0 ? 0 : (i + dir + VIEWS.length) % VIEWS.length;
    go(VIEWS[next].meta.id);
  }
});

async function boot() {
  document.body.classList.add(`os-${window.api.platform}`);
  initTooltips();
  initCensura();
  setupCharts();
  store.onError((e) => toast(e.message || String(e), 'error'));
  // El overlay de transferencia flota encima de toda la ventana, así que se ve sin importar
  // en qué módulo estabas cuando se canceló la deuda (normalmente, el de Deudas).
  store.onTransferencia((payload) => showTransferOverlay(payload));
  // Previsualizarla sin tocar datos reales: abre las herramientas de desarrollador
  // (Ctrl+Shift+I) y ejecuta previewTransferencia() en la consola, desde cualquier módulo.
  window.previewTransferencia = () => store.previsualizarTransferencia();
  const ok = await store.load();
  if (ok) start(); else welcome();
}

boot();
