// Componentes de interfaz reutilizables.

import { icon } from './icons.js';
import { esc, regretColor, clp, clpSigned, num, parseMoney, scaleColor } from './format.js';
import { estadoDeuda } from './calc.js';
import * as store from './store.js';

// ---------- Censura (modo privacidad) ----------
// Cualquier elemento con clase "censurable" queda "explotado" mientras el candado esté cerrado:
// cada carácter se parte en varias cuñas (vía clip-path, ver .frag-* en styles.css) dispersas en
// blanco, para que no se pueda leer ni el dígito individual (a diferencia de mover el carácter
// entero). Al revelarlo, las cuñas vuelven a su lugar y el color pasa de blanco al real, todas a
// la vez (sin desfase). El candado es una preferencia local; qué panel quedó revelado no se
// guarda: cada render vuelve a explotar todo.
const CENSURA_KEY = 'app:censura';
export const estaCensurado = () => document.body.classList.contains('censura');

const ENSAMBLE_MS = 600;

// Cuñas triangulares que, juntas, cubren el 100% del carácter (un "abanico" desde el centro
// hasta cada esquina/punto medio del cuadro del glifo) — por eso al "ensamblar" calzan perfecto.
const CUNAS = [
  'polygon(50% 50%, 50% 0%, 100% 0%)',
  'polygon(50% 50%, 100% 0%, 100% 50%)',
  'polygon(50% 50%, 100% 50%, 100% 100%)',
  'polygon(50% 50%, 100% 100%, 50% 100%)',
  'polygon(50% 50%, 50% 100%, 0% 100%)',
  'polygon(50% 50%, 0% 100%, 0% 50%)',
  'polygon(50% 50%, 0% 50%, 0% 0%)',
  'polygon(50% 50%, 0% 0%, 50% 0%)',
];

/** Reemplaza el texto de `el` por cuñas dispersas por carácter (ver CUNAS). Idempotente. */
function fragmentar(el) {
  if (el.classList.contains('fragmentado')) return;
  const texto = el.textContent;
  if (!texto) return;
  el.dataset.censuraTexto = texto;
  el.innerHTML = [...texto].map((ch) => {
    if (ch === ' ') return ' ';
    const chEsc = esc(ch);
    const shards = CUNAS.map((clip) => {
      const tx = (Math.random() * 2 - 1) * 9;
      const ty = (Math.random() * 2 - 1) * 9;
      const sc = 0.7 + Math.random() * 0.5;
      return `<span class="frag-shard" style="clip-path:${clip};--tx:${tx.toFixed(1)}px;--ty:${ty.toFixed(1)}px;--sc:${sc.toFixed(2)}">${chEsc}</span>`;
    }).join('');
    return `<span class="frag-char"><span class="frag-ghost">${chEsc}</span>${shards}</span>`;
  }).join('');
  el.classList.add('fragmentado');
}

/** Anima los fragmentos de vuelta a su lugar (en reversa) y el color de blanco al final; al terminar, restaura el texto plano. */
function ensamblar(el) {
  const real = el.dataset.censuraTexto;
  if (real == null) { el.classList.add('revelado'); return; }
  requestAnimationFrame(() => el.classList.add('revelado'));
  setTimeout(() => {
    el.textContent = real;
    delete el.dataset.censuraTexto;
  }, ENSAMBLE_MS);
}

/** Fragmenta (si corresponde) todo lo censurable dentro de `root` que no haya pasado por countUp. */
export function aplicarCensura(root) {
  if (!estaCensurado()) return;
  root.querySelectorAll('.censurable').forEach((el) => fragmentar(el));
}

/** Se llama una sola vez al arrancar: aplica la preferencia guardada y activa el click-para-mostrar. */
export function initCensura() {
  let on = false;
  try { on = localStorage.getItem(CENSURA_KEY) === '1'; } catch { /* usa el valor por defecto */ }
  document.body.classList.toggle('censura', on);

  // Captura (no burbujeo): un click en cualquier parte de un panel todavía censurado solo lo
  // revela y se consume acá — no llega a los handlers de click del panel (p.ej. la navegación
  // de las tarjetas del Dashboard). Recién el siguiente click, con el panel ya revelado, navega.
  document.addEventListener('click', (e) => {
    if (!estaCensurado()) return;
    const card = e.target.closest('.card');
    if (!card) return;
    const ocultos = card.querySelectorAll('.censurable:not(.revelado)');
    if (!ocultos.length) return;
    e.preventDefault();
    e.stopPropagation();
    ocultos.forEach((el) => ensamblar(el));
  }, true);
}

export function setCensurado(on) {
  document.body.classList.toggle('censura', on);
  try { localStorage.setItem(CENSURA_KEY, on ? '1' : '0'); } catch { /* ignorar */ }
}

// ---------- Tags ----------
export function tagPill(tag, { toggle = false, on = false } = {}) {
  if (!tag) return '';
  return `<span class="pill${toggle ? ' toggle' : ''}${on ? ' on' : ''}" style="--c:${esc(tag.color)}" data-tag="${esc(tag.id)}">${esc(tag.nombre)}</span>`;
}

export function tagList(ids = []) {
  const html = ids.map((id) => tagPill(store.tagById(id))).join('');
  return html ? `<span class="pills">${html}</span>` : '<span class="muted">—</span>';
}

/** Como tagList, pero en la grilla de 2 por fila (columna "Tags" de Movimientos). */
export function tagGrid(ids = []) {
  const html = ids.map((id) => tagPill(store.tagById(id))).join('');
  return html ? `<span class="pills-grid">${html}</span>` : '<span class="muted">—</span>';
}

/**
 * Pills especiales (no son tags reales) para la columna "Deudas": como el encabezado ya dice
 * "Deudas", el texto es solo "Pendiente/Atrasada/Cancelada - {deudor}", sin repetir la palabra.
 */
export function deudaPills(m) {
  const origenes = store.deudasDeMov(m.id);
  const liquidada = store.deudaLiquidadaPorMov(m.id);
  const targets = origenes.length ? origenes : (liquidada ? [liquidada] : []);
  return targets.map((t) => {
    if (t.estado === 'cancelada') {
      return `<span class="pill deuda cancelada" data-deuda="${t.id}" data-tip="Ir a Deudas">Cancelada - ${esc(t.contraparte)}</span>`;
    }
    const atrasada = estadoDeuda(t).atrasada;
    return `<span class="pill deuda${atrasada ? ' atrasada' : ''}" data-deuda="${t.id}" data-tip="Ir a Deudas">${atrasada ? 'Atrasada' : 'Pendiente'} - ${esc(t.contraparte)}</span>`;
  }).join('');
}

/** Celda de la columna "Deudas": grilla de 2 por fila (el texto largo se trunca), o un guion si no hay. */
export function deudaCell(m) {
  const html = deudaPills(m);
  return html ? `<span class="pills-grid">${html}</span>` : '<span class="muted">—</span>';
}

/** Barra de filtro por tags (toggle). */
export function tagFilter(container, selected, onChange) {
  if (!container) return;
  let sel = selected.filter((id) => store.tagById(id));
  const draw = () => {
    const tags = store.state.tags;
    container.innerHTML = tags.length
      ? `<div class="tag-filter">${icon('filter', 'dim')}<div class="pills wrap">${tags.map((t) => tagPill(t, { toggle: true, on: sel.includes(t.id) })).join('')}</div>${sel.length ? `<button class="ibtn ghost xs" data-clear data-tip="Quitar filtro">${icon('close')}</button>` : ''}</div>`
      : '';
  };
  container.onclick = (e) => {
    if (e.target.closest('[data-clear]')) { sel = []; draw(); onChange(sel); return; }
    const p = e.target.closest('.pill[data-tag]');
    if (!p) return;
    const id = p.dataset.tag;
    sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    draw();
    onChange(sel);
  };
  draw();
}

/** Selector de tags dentro de formularios, con creación rápida. */
export function tagPicker(container, selected = []) {
  let sel = [...selected];
  const draw = () => {
    const tags = store.state.tags;
    container.innerHTML = `
      <div class="picker">
        <div class="pills wrap">${tags.length ? tags.map((t) => tagPill(t, { toggle: true, on: sel.includes(t.id) })).join('') : '<span class="muted">Crea tu primer tag aquí abajo.</span>'}</div>
        <div class="picker-new">
          <input type="color" class="swatch-input" value="#ffffff" data-tip="Color del tag">
          <input class="input sm" placeholder="Nuevo tag" maxlength="32">
          <button type="button" class="ibtn sm" data-tip="Crear tag">${icon('plus')}</button>
        </div>
      </div>`;
    const input = container.querySelector('.picker-new .input');
    const color = container.querySelector('.swatch-input');
    const crear = () => {
      const nombre = input.value.trim();
      if (!nombre) { shake(input); return; }
      const t = store.saveTag({ nombre, color: color.value });
      sel.push(t.id);
      draw();
      container.querySelector('.picker-new .input')?.focus();
    };
    container.querySelector('.picker-new button').onclick = crear;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); crear(); } };
  };
  container.addEventListener('click', (e) => {
    const p = e.target.closest('.pill[data-tag]');
    if (!p) return;
    const id = p.dataset.tag;
    sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    p.classList.toggle('on', sel.includes(id));
  });
  draw();
  return { value: () => sel.filter((id) => store.tagById(id)) };
}

// ---------- Indicadores ----------
export function regret(r = 0) {
  const v = Number(r) || 0;
  const c = regretColor(v);
  let bars = '';
  for (let i = 1; i <= 5; i++) bars += `<i${i <= v ? ` style="background:${c}"` : ''}></i>`;
  return `<span class="regret" data-tip="Arrepentimiento ${v} de 5"><span class="bars">${bars}</span><b style="color:${c}">${v}</b></span>`;
}

const ESTADOS = {
  pendiente: ['var(--orange)', 'Pendiente'],
  ganancia: ['var(--green)', 'Ganancia'],
  perdida: ['var(--red)', 'Pérdida'],
};

export function statusBadge(est) {
  if (!est) return '<span class="muted">—</span>';
  const [c, label] = ESTADOS[est.estado];
  const diff = est.diferencia != null ? `<span class="status-diff">${clpSigned(est.diferencia)}</span>` : '';
  return `<span class="status" style="--c:${c}"><span class="dot${est.estado === 'pendiente' ? ' pulse' : ''}"></span>${label}${diff}</span>`;
}

export const yesNo = (v) => (v == null
  ? '<span class="muted">—</span>'
  : `<span class="yn ${v ? 'yes' : 'no'}" data-tip="${v ? 'Alcanza' : 'No alcanza'}">${icon(v ? 'check' : 'close')}</span>`);

export function pctCell(v) {
  if (v == null || !Number.isFinite(v)) return '<span class="muted">—</span>';
  return `<span class="pct-cell"><span class="pct-track"><i style="width:${Math.min(v, 100).toFixed(1)}%"></i></span>${v.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%</span>`;
}

// ---------- Controles ----------
export const sw = (name, checked) =>
  `<label class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span></span></label>`;

export function segmented(name, opts, value) {
  return `<div class="seg" data-seg="${name}"><span class="thumb"></span>${opts
    .map(([v, label, tip]) => `<button type="button" data-v="${v}" class="${v === value ? 'on' : ''}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${label}</button>`)
    .join('')}</div>`;
}

/** Activa un control segmentado con "thumb" deslizante. */
export function bindSegmented(root, name, onChange) {
  const el = root.querySelector(`[data-seg="${name}"]`);
  if (!el) return { set() {} };
  const thumb = el.querySelector('.thumb');
  const place = (instant) => {
    const on = el.querySelector('button.on');
    if (!on) return;
    if (instant) thumb.style.transition = 'none';
    thumb.style.left = `${on.offsetLeft}px`;
    thumb.style.width = `${on.offsetWidth}px`;
    if (instant) { void thumb.offsetWidth; thumb.style.transition = ''; }
  };
  const select = (v, notify) => {
    el.querySelectorAll('button[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    place(false);
    if (notify) onChange?.(v);
  };
  requestAnimationFrame(() => place(true));
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.classList.contains('on')) return;
    select(b.dataset.v, true);
  });
  return { set: (v) => select(v, false), relayout: () => place(true) };
}

/** Formatea un input de dinero en vivo (1.250.000). Devuelve un getter numérico. */
export function bindMoney(input, { allowNegative = false } = {}) {
  const fmt = () => {
    const raw = input.value;
    const v = parseMoney(raw);
    const neg = allowNegative && raw.trim().startsWith('-');
    const abs = Math.abs(v);
    input.value = (neg ? '-' : '') + (/\d/.test(raw) ? num(abs) : '');
  };
  input.addEventListener('input', fmt);
  fmt();
  return () => (allowNegative ? parseMoney(input.value) : Math.abs(parseMoney(input.value)));
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  el.focus?.();
}

// ---------- Números animados ----------
const ultimos = new Map();
export function countUp(el, key, to, fmt = clp) {
  const from = ultimos.has(key) ? ultimos.get(key) : 0;
  ultimos.set(key, to);
  if (estaCensurado()) { el.textContent = fmt(to); fragmentar(el); return; }
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
  const dur = 900;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - k) ** 4;
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = fmt(from);
  requestAnimationFrame(step);
}

/** Tarjeta de número grande con color según puntaje [-1, 1]. `nav`: clave opcional para navegar al hacer click. */
export function statCard(key, label, ic, score, sub = '', nav = null) {
  const c = scaleColor(score);
  return `<div class="card stat${nav ? ' clickable' : ''}" style="--c:${c}"${nav ? ` data-nav="${nav}"` : ''}>
    <div class="stat-label">${icon(ic)}<span>${label}</span></div>
    <div class="stat-value censurable" data-count="${key}" style="color:${c}"></div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

/** Anima todos los [data-count] de root con los valores dados. */
export function runCounts(root, prefix, values) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const k = el.dataset.count;
    if (k in values) countUp(el, `${prefix}:${k}`, values[k]);
  });
}

// ---------- Modales ----------
const stack = [];

export function openModal({ title, body, width, actions = [], onMount, onClose }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" ${width ? `style="width:min(${width}px, calc(100vw - 40px))"` : ''}>
      <div class="modal-head"><h3>${esc(title)}</h3><button class="ibtn ghost sm" data-close data-tip="Cerrar (Esc)">${icon('close')}</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot"></div>
    </div>`;
  document.body.appendChild(ov);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    stack.splice(stack.indexOf(close), 1);
    ov.classList.add('closing');
    setTimeout(() => ov.remove(), 220);
    onClose?.();
  };
  stack.push(close);

  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  ov.querySelector('[data-close]').onclick = close;

  const foot = ov.querySelector('.modal-foot');
  let primary = null;
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ibtn ${a.kind || ''}`;
    b.dataset.tip = a.tip;
    b.innerHTML = icon(a.icon);
    b.onclick = () => a.onClick(close);
    foot.appendChild(b);
    if (a.primary) primary = b;
  }

  const modal = ov.querySelector('.modal');
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && primary && e.target.tagName !== 'TEXTAREA' && !e.defaultPrevented
      && (e.ctrlKey || e.metaKey || e.target.tagName === 'INPUT')) {
      e.preventDefault();
      primary.click();
    }
  });
  onMount?.(modal, close);
  setTimeout(() => modal.querySelector('[autofocus]')?.focus(), 80);
  return close;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1]();
});

export function confirmDialog({ title, message, confirmIcon = 'check', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v, close) => { answered = true; resolve(v); close(); };
    openModal({
      title,
      width: 420,
      body: `<div class="confirm">${danger ? `<div class="confirm-ico">${icon('alert')}</div>` : ''}<div>${message}</div></div>`,
      actions: [
        { icon: 'close', tip: 'Cancelar', onClick: (c) => answer(false, c) },
        { icon: confirmIcon, tip: 'Confirmar', kind: danger ? 'danger-solid' : 'primary', primary: true, onClick: (c) => answer(true, c) },
      ],
      onMount: (m) => setTimeout(() => m.querySelector('.modal-foot .ibtn:last-child')?.focus(), 90),
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// ---------- Toasts ----------
export function toast(msg, kind = 'ok') {
  let c = document.querySelector('.toasts');
  if (!c) { c = document.createElement('div'); c.className = 'toasts'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<span class="dot"></span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 6000 : 2600);
}

// ---------- Transferencia de valor (deuda a favor cancelada) ----------
function animateValue(el, from, to, dur = 900) {
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - k) ** 4;
    el.textContent = clp(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = clp(from);
  requestAnimationFrame(step);
}

/**
 * Overlay flotante encima de toda la ventana: muestra "Saldo de deudas" bajando y "Neto" subiendo,
 * para que la transferencia se vea sin importar en qué módulo estabas cuando cancelaste la deuda.
 */
export function showTransferOverlay({ saldoAntes, saldoDespues, netoAntes, netoDespues }) {
  const ov = document.createElement('div');
  ov.className = 'transfer-overlay';
  ov.innerHTML = `
    <div class="transfer-stage">
      <div class="card stat transfer-card" style="--c:var(--green)">
        <div class="stat-label">${icon('debt')}<span>Saldo de deudas</span></div>
        <div class="stat-value" data-v="saldo"></div>
      </div>
      <div class="transfer-arrow">${icon('chevronRight')}</div>
      <div class="card hero transfer-card" style="--c:var(--green)">
        <div class="hero-glow"></div>
        <div class="stat-label">${icon('wallet')}<span>Neto</span></div>
        <div class="hero-value" data-v="neto"></div>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const close = () => {
    ov.classList.remove('on');
    ov.classList.add('out');
    setTimeout(() => ov.remove(), 400);
  };
  ov.addEventListener('click', close);

  requestAnimationFrame(() => {
    ov.classList.add('on');
    animateValue(ov.querySelector('[data-v="saldo"]'), saldoAntes, saldoDespues);
    animateValue(ov.querySelector('[data-v="neto"]'), netoAntes, netoDespues);
    setTimeout(() => ov.querySelectorAll('.transfer-card').forEach((c) => c.classList.add('transfer-glow')), 150);
  });

  setTimeout(close, 2400);
}

// ---------- Tooltips (uno global, no se corta dentro de tablas) ----------
export function initTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);
  let cur = null;
  const hide = () => { tip.classList.remove('on'); cur = null; };
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el === cur) return;
    cur = el;
    if (!el || !el.dataset.tip) { tip.classList.remove('on'); return; }
    tip.textContent = el.dataset.tip;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let x; let y;
    if (el.dataset.tipPos === 'right') { x = r.right + 10; y = r.top + r.height / 2 - th / 2; }
    else {
      x = r.left + r.width / 2 - tw / 2;
      y = r.bottom + 7;
      if (y + th > innerHeight - 6) y = r.top - th - 7;
    }
    x = Math.max(6, Math.min(innerWidth - tw - 6, x));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.classList.add('on');
  });
  document.addEventListener('mousedown', hide);
  document.addEventListener('scroll', hide, true);
}

export { clp };
