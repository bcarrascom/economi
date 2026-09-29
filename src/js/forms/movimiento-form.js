// Formulario para crear/editar ingresos, gastos e inversiones.

import * as store from '../store.js';
import { state } from '../store.js';
import {
  openModal, segmented, bindSegmented, sw, bindMoney, tagPicker, toast, shake,
} from '../ui.js';
import { uid, today, esc, clp, regretColor, fechaCorta, num, parseMoney } from '../format.js';
import { aporteAhorro } from '../calc.js';
import { icon } from '../icons.js';

/**
 * @param {object|null} existing  movimiento a editar
 * @param {object} preset         { tipo, esInversion } para nuevos
 */
export function openMovimientoForm(existing = null, preset = {}) {
  const def = state.ajustes.aporteDefecto;
  const m = existing ? structuredClone(existing) : {
    id: uid(),
    tipo: preset.tipo || 'gasto',
    fecha: today(),
    nombre: '',
    descripcion: '',
    monto: 0,
    arrepentimiento: 0,
    tags: [],
    esSueldo: false,
    ahorro: { modo: def.modo, valor: 0 },
    esInversion: !!preset.esInversion,
    desdeAhorro: false,
    reembolso: 0,
    inversion: { ingresoId: null },
    creado: new Date().toISOString(),
  };

  const eraInversion = existing?.tipo === 'gasto' && existing.esInversion;
  const autoPrev = existing ? store.autoRetorno(existing) : null;
  let tipo = m.tipo;
  let invModo = !m.inversion.ingresoId ? 'pendiente' : autoPrev ? 'manual' : 'vincular';
  let amodo = m.ahorro.modo;
  let arrep = m.arrepentimiento;

  const deudaExistentes = existing ? store.deudasDeMov(existing.id) : [];
  const deudaPorId = new Map(deudaExistentes.map((d) => [d.id, d]));
  let esDeuda = !!deudaExistentes.length;
  let deudaPlazoModo = deudaExistentes[0]?.plazoModo || 'ninguno';

  const vinculables = store.ingresosVinculables(m.id);
  const origenNota = m.origen?.tipo === 'inversion'
    ? `<div class="note">Este ingreso es el retorno automático de una inversión.</div>`
    : m.origen?.tipo === 'compra' ? '<div class="note">Registrado desde la lista de compras.</div>' : '';

  const body = `
    ${origenNota}
    <div class="form-row center">${segmented('tipo', [['ingreso', 'Ingreso'], ['gasto', 'Gasto']], tipo)}</div>
    <div class="grid-2">
      <div class="field"><label>Fecha</label><input class="input" type="date" name="fecha" value="${m.fecha}"></div>
      <div class="field"><label>Monto</label><div class="money"><span>$</span><input class="input" name="monto" inputmode="numeric" placeholder="0" value="${m.monto || ''}"></div></div>
    </div>
    <div class="field"><label>Nombre</label><input class="input" name="nombre" maxlength="120" value="${esc(m.nombre)}" autofocus></div>
    <div class="field"><label>Descripción <span class="opt">opcional</span></label><textarea class="input" name="descripcion" rows="2">${esc(m.descripcion)}</textarea></div>
    <div class="field">
      <label>Arrepentimiento</label>
      <div class="regret-pick">${[0, 1, 2, 3, 4, 5].map((i) => `<button type="button" data-r="${i}" class="${i === arrep ? 'on' : ''}" style="--c:${regretColor(i)}" data-tip="${['Nada', 'Casi nada', 'Poco', 'Algo', 'Bastante', 'Mucho'][i]}">${i}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Tags</label><div data-el="tags"></div></div>

    <div class="collapse ${tipo === 'ingreso' ? 'open' : ''}" data-sec="ingreso"><div><div class="subform">
      <div class="row-line"><span>Es sueldo</span>${sw('esSueldo', m.esSueldo)}</div>
      <div class="row-line">
        <span>Aporte al ahorro</span>
        <div class="ahorro-ctl">
          ${segmented('amodo', [['pct', '%', 'Porcentaje del ingreso'], ['fijo', '$', 'Monto fijo']], amodo)}
          <input class="input sm num-input" name="aval" inputmode="numeric" placeholder="0" value="${m.ahorro.valor || ''}">
        </div>
      </div>
      <input type="range" name="arange" min="0" max="100" step="1" value="${amodo === 'pct' ? m.ahorro.valor : 0}" class="${amodo === 'pct' ? '' : 'is-hidden'}">
      <div class="hint" data-el="aporte"></div>
    </div></div></div>

    <div class="collapse ${tipo === 'gasto' ? 'open' : ''}" data-sec="gasto"><div><div class="subform">
      <div class="row-line"><span>Es inversión</span>${sw('esInversion', m.esInversion)}</div>
      <div class="row-line"><span>Pagado desde el ahorro</span>${sw('desdeAhorro', m.desdeAhorro)}</div>
      <div class="row-line"><span>Es deuda (otros me deben esto)</span>${sw('esDeuda', esDeuda)}</div>
      <div class="collapse ${esDeuda ? 'open' : ''}" data-sec="deuda"><div><div class="inv-box">
        <div class="hint">¿Quiénes te deben por este gasto? Puedes dividirlo entre varias personas.</div>
        <div data-el="splits"></div>
        <button type="button" class="ibtn-text" data-act="addSplit">${icon('plus', 'inline')} Agregar persona</button>
        <div class="hint" data-el="splitTotal"></div>
        <div class="row-line"><span>Plazo <span class="opt">opcional</span></span>${segmented('deudaPlazoModo', [['ninguno', 'Sin plazo'], ['dias', 'Días'], ['fecha', 'Fecha límite']], deudaPlazoModo)}</div>
        <div class="collapse ${deudaPlazoModo === 'dias' ? 'open' : ''}" data-sec="deudaDias"><div><div class="pad-top">
          <input class="input" name="deudaDias" inputmode="numeric" placeholder="30" value="${deudaExistentes[0]?.plazoDias ?? 30}">
        </div></div></div>
        <div class="collapse ${deudaPlazoModo === 'fecha' ? 'open' : ''}" data-sec="deudaFecha"><div><div class="pad-top">
          <input class="input" type="date" name="deudaFecha" value="${deudaExistentes[0]?.plazoFecha || ''}">
        </div></div></div>
      </div></div></div>
      <div class="collapse ${m.esInversion ? 'open' : ''}" data-sec="inv"><div><div class="inv-box">
        <div class="row-line"><span>Resultado</span>${segmented('invmodo', [['pendiente', 'Pendiente'], ['vincular', 'Vincular ingreso'], ['manual', 'Monto recuperado']], invModo)}</div>
        <div class="collapse ${invModo === 'vincular' ? 'open' : ''}" data-sec="vincular"><div><div class="pad-top">
          <select class="input" name="ingresoId">
            <option value="">${vinculables.length ? 'Elige el ingreso que devolvió esta inversión' : 'No hay ingresos disponibles'}</option>
            ${vinculables.map((i) => `<option value="${i.id}" ${i.id === m.inversion.ingresoId ? 'selected' : ''}>${fechaCorta(i.fecha)} — ${esc(i.nombre)} — ${clp(i.monto)}</option>`).join('')}
          </select>
        </div></div></div>
        <div class="collapse ${invModo === 'manual' ? 'open' : ''}" data-sec="manual"><div><div class="pad-top">
          <div class="grid-2">
            <div class="field"><label>Monto recuperado</label><div class="money"><span>$</span><input class="input" name="retMonto" inputmode="numeric" placeholder="0" value="${autoPrev?.monto || ''}"></div></div>
            <div class="field"><label>Fecha</label><input class="input" type="date" name="retFecha" value="${autoPrev?.fecha || today()}"></div>
          </div>
          <div class="hint">Se registrará automáticamente como un ingreso.</div>
        </div></div></div>
      </div></div></div>
    </div></div></div>`;

  let el;
  let picker;
  let getMonto;
  let getRet;
  let segAmodo;
  const q = (n) => el.querySelector(`[name="${n}"]`);
  const sec = (n) => el.querySelector(`[data-sec="${n}"]`);

  function splitRowHtml(s) {
    const locked = s.estado && s.estado !== 'pendiente';
    return `<div class="split-row" data-db-id="${s.id || ''}" data-estado="${s.estado || 'pendiente'}">
      <input class="input sm" data-f="contraparte" placeholder="Nombre" maxlength="80" value="${esc(s.contraparte || '')}" ${locked ? 'disabled' : ''}>
      <div class="money sm"><span>$</span><input class="input sm" data-f="monto" inputmode="numeric" placeholder="0" value="${s.monto || ''}" ${locked ? 'disabled' : ''}></div>
      ${locked
        ? `<span class="split-lock" data-tip="Ya fue liquidada, gestiónala desde Deudas">${icon('check', 'inline')}</span>`
        : `<button type="button" class="ibtn ghost xs danger" data-act="rmSplit" data-tip="Quitar">${icon('trash')}</button>`}
    </div>`;
  }

  function addSplitRow(s) {
    const cont = el.querySelector('[data-el="splits"]');
    cont.insertAdjacentHTML('beforeend', splitRowHtml(s));
    const row = cont.lastElementChild;
    bindMoney(row.querySelector('[data-f="monto"]'));
    const rm = row.querySelector('[data-act="rmSplit"]');
    if (rm) rm.onclick = () => { row.remove(); updateSplitTotal(); };
    row.addEventListener('input', updateSplitTotal);
  }

  function updateSplitTotal() {
    const totalEl = el.querySelector('[data-el="splitTotal"]');
    if (!totalEl) return;
    const rows = [...el.querySelectorAll('[data-el="splits"] .split-row')];
    const total = rows.reduce((a, row) => a + (parseMoney(row.querySelector('[data-f="monto"]').value) || 0), 0);
    totalEl.textContent = `Asignado: ${clp(total)} de ${clp(getMonto())} pagados`;
  }

  openModal({
    title: existing ? 'Editar movimiento' : 'Nuevo movimiento',
    width: 560,
    body,
    onMount: (el) => mount(el),
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (c) => c() },
      { icon: 'check', tip: 'Guardar (Enter)', kind: 'primary', primary: true, onClick: (c) => save(c) },
    ],
  });

  function mount(root) {
    el = root;
    picker = tagPicker(el.querySelector('[data-el="tags"]'), m.tags);
    getMonto = bindMoney(q('monto'));
    getRet = bindMoney(q('retMonto'));

    (deudaExistentes.length ? deudaExistentes : [{ id: null, contraparte: '', monto: m.monto || 0, estado: 'pendiente' }]).forEach(addSplitRow);
    updateSplitTotal();
    el.querySelector('[data-act="addSplit"]').onclick = () => {
      const filas = el.querySelectorAll('[data-el="splits"] .split-row');
      const ultima = filas[filas.length - 1];
      const montoPrevio = ultima ? parseMoney(ultima.querySelector('[data-f="monto"]').value) : (m.monto || 0);
      addSplitRow({ id: null, contraparte: '', monto: montoPrevio, estado: 'pendiente' });
      updateSplitTotal();
    };

    const relayoutAll = () => requestAnimationFrame(() => {
      el.querySelectorAll('[data-seg]').forEach((s) => {
        const on = s.querySelector('button.on');
        const th = s.querySelector('.thumb');
        if (on && th) { th.style.left = `${on.offsetLeft}px`; th.style.width = `${on.offsetWidth}px`; }
      });
    });

    bindSegmented(el, 'tipo', (v) => {
      tipo = v;
      sec('ingreso').classList.toggle('open', v === 'ingreso');
      sec('gasto').classList.toggle('open', v === 'gasto');
      relayoutAll();
      updateAporte();
    });
    segAmodo = bindSegmented(el, 'amodo', (v) => {
      amodo = v;
      q('arange').classList.toggle('is-hidden', v !== 'pct');
      if (v === 'pct' && Number(q('aval').value) > 100) q('aval').value = '100';
      if (v === 'fijo' && q('aval').value) q('aval').value = num(Number(String(q('aval').value).replace(/\D/g, '')));
      updateAporte();
    });
    bindSegmented(el, 'invmodo', (v) => {
      invModo = v;
      sec('vincular').classList.toggle('open', v === 'vincular');
      sec('manual').classList.toggle('open', v === 'manual');
    });
    bindSegmented(el, 'deudaPlazoModo', (v) => {
      deudaPlazoModo = v;
      sec('deudaDias')?.classList.toggle('open', v === 'dias');
      sec('deudaFecha')?.classList.toggle('open', v === 'fecha');
    });

    el.querySelector('.regret-pick').onclick = (e) => {
      const b = e.target.closest('button[data-r]');
      if (!b) return;
      arrep = Number(b.dataset.r);
      el.querySelectorAll('.regret-pick button').forEach((x) => x.classList.toggle('on', x === b));
    };

    q('esInversion').onchange = (e) => { sec('inv').classList.toggle('open', e.target.checked); relayoutAll(); };
    q('esDeuda').onchange = (e) => { esDeuda = e.target.checked; sec('deuda').classList.toggle('open', esDeuda); relayoutAll(); };
    q('esSueldo').onchange = (e) => {
      if (e.target.checked && !valorAhorro() && def.valor > 0) {
        amodo = def.modo;
        segAmodo.set(def.modo);
        q('aval').value = def.modo === 'fijo' ? num(def.valor) : def.valor;
        q('arange').classList.toggle('is-hidden', def.modo !== 'pct');
        if (def.modo === 'pct') q('arange').value = def.valor;
        updateAporte();
      }
    };
    q('aval').oninput = () => {
      if (amodo === 'fijo') {
        const d = String(q('aval').value).replace(/\D/g, '');
        q('aval').value = d ? num(Number(d)) : '';
      } else {
        const v = Math.min(100, Number(String(q('aval').value).replace(/[^\d.]/g, '')) || 0);
        q('arange').value = v;
      }
      updateAporte();
    };
    q('arange').oninput = () => { q('aval').value = q('arange').value; updateAporte(); };
    q('monto').addEventListener('input', () => { updateAporte(); updateSplitTotal(); });
    updateAporte();
  }

  function valorAhorro() {
    const raw = String(q('aval').value);
    if (amodo === 'fijo') return Number(raw.replace(/\D/g, '')) || 0;
    return Math.min(100, Number(raw.replace(/[^\d.]/g, '')) || 0);
  }

  function updateAporte() {
    const a = aporteAhorro({ tipo: 'ingreso', monto: getMonto(), ahorro: { modo: amodo, valor: valorAhorro() } });
    el.querySelector('[data-el="aporte"]').innerHTML = a > 0
      ? `Aporta <b class="pos">${clp(a)}</b> al presupuesto de ahorro.`
      : 'Este ingreso no aporta al ahorro.';
  }

  function save(close) {
    m.tipo = tipo;
    m.fecha = q('fecha').value || today();
    m.nombre = q('nombre').value.trim();
    m.descripcion = q('descripcion').value.trim();
    m.monto = getMonto();
    m.arrepentimiento = arrep;
    m.tags = picker.value();

    if (!m.nombre) { shake(q('nombre')); toast('Escribe un nombre', 'warn'); return; }
    if (!(m.monto > 0)) { shake(q('monto')); toast('El monto debe ser mayor a 0', 'warn'); return; }

    if (tipo === 'ingreso') {
      m.esSueldo = q('esSueldo').checked;
      m.ahorro = { modo: amodo, valor: valorAhorro() };
      m.esInversion = false;
      m.desdeAhorro = false;
      m.reembolso = 0;
    } else {
      m.esSueldo = false;
      m.ahorro = { modo: 'pct', valor: 0 };
      m.esInversion = q('esInversion').checked;
      m.desdeAhorro = q('desdeAhorro').checked;
      // El reembolso ya no se edita aquí: se gestiona con el botón dedicado en la tabla de Movimientos.
    }

    let spec = null;
    if (tipo === 'gasto' && m.esInversion) {
      if (invModo === 'vincular') {
        const id = q('ingresoId').value;
        if (!id) { shake(q('ingresoId')); toast('Elige el ingreso que devolvió la inversión', 'warn'); return; }
        spec = { modo: 'vincular', ingresoId: id };
      } else if (invModo === 'manual') {
        const monto = getRet();
        if (!(monto >= 0) || q('retMonto').value === '') { shake(q('retMonto')); toast('Escribe el monto recuperado', 'warn'); return; }
        spec = { modo: 'manual', monto, fecha: q('retFecha').value || today() };
      } else {
        spec = { modo: 'pendiente' };
      }
    }

    // Si dejó de ser inversión, se limpia su retorno automático antes de guardar.
    if (eraInversion && !(tipo === 'gasto' && m.esInversion)) {
      store.resolverInversion(m.id, { modo: 'pendiente' });
      m.inversion = { ingresoId: null };
    }

    let splits = null;
    const deudaMarcada = tipo === 'gasto' && q('esDeuda').checked;
    if (deudaMarcada) {
      const filas = [...el.querySelectorAll('[data-el="splits"] .split-row')].filter((row) => row.dataset.estado === 'pendiente');
      splits = [];
      for (const row of filas) {
        const contraparte = row.querySelector('[data-f="contraparte"]').value.trim();
        const monto = parseMoney(row.querySelector('[data-f="monto"]').value);
        if (!contraparte) { shake(row.querySelector('[data-f="contraparte"]')); toast('Escribe el nombre de quién debe', 'warn'); return; }
        if (!(monto > 0)) { shake(row.querySelector('[data-f="monto"]')); toast('Cada monto debe ser mayor a 0', 'warn'); return; }
        splits.push({ id: row.dataset.dbId || null, contraparte, monto });
      }
      if (deudaPlazoModo === 'fecha' && !q('deudaFecha').value) { shake(q('deudaFecha')); toast('Elige la fecha límite, o cambia el plazo a "Sin plazo"', 'warn'); return; }
    }

    store.saveMovimiento(m);
    if (spec) store.resolverInversion(m.id, spec);

    if (splits) {
      const plazoDias = Number(q('deudaDias').value) || 30;
      const plazoFecha = q('deudaFecha').value || null;
      const keptIds = new Set(splits.filter((s) => s.id).map((s) => s.id));
      for (const d of deudaExistentes) {
        if (d.estado === 'pendiente' && !keptIds.has(d.id)) store.deleteDeuda(d.id);
      }
      for (const s of splits) {
        store.saveDeuda({
          id: s.id || uid(),
          direccion: 'favor',
          nombre: m.nombre,
          contraparte: s.contraparte,
          descripcion: m.descripcion,
          monto: s.monto,
          fecha: m.fecha,
          plazoModo: deudaPlazoModo,
          plazoDias,
          plazoFecha,
          estado: 'pendiente',
          movId: m.id,
          creado: deudaPorId.get(s.id)?.creado,
        });
      }
    } else {
      for (const d of deudaExistentes) {
        if (d.estado === 'pendiente') store.deleteDeuda(d.id);
      }
    }

    toast(existing ? 'Movimiento actualizado' : 'Movimiento agregado');
    close();
  }
}
