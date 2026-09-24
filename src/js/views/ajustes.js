// Ajustes: carpeta de datos, saldos iniciales, aporte por defecto y ajustes manuales al ahorro.

import * as store from '../store.js';
import { state } from '../store.js';
import { clp, clpSigned, esc, fechaCorta, today, num } from '../format.js';
import { icon } from '../icons.js';
import { sw, segmented, bindSegmented, bindMoney, confirmDialog, toast, shake } from '../ui.js';

export const meta = { id: 'ajustes', title: 'Ajustes', icon: 'settings' };

export function render(root) {
  const a = state.ajustes;
  const ajustes = [...a.ajustesAhorro].sort((x, y) => y.fecha.localeCompare(x.fecha));

  root.innerHTML = `
    <header class="page-head">
      <div><h1>Ajustes</h1><p class="subtitle">Datos, saldos de partida y preferencias</p></div>
    </header>

    <section class="settings">
      <div class="card setting-card">
        <h3>Carpeta de datos</h3>
        <p class="muted">Los datos se guardan como archivos JSON en esta carpeta. Usa la misma carpeta de OneDrive en tus dos equipos.</p>
        <div class="path-row">
          <span class="mono path">${esc(state.dataDir || 'Sin carpeta')}</span>
          <button class="ibtn sm" data-act="open" data-tip="Abrir carpeta">${icon('external')}</button>
          <button class="ibtn sm" data-act="reload" data-tip="Recargar desde disco">${icon('refresh')}</button>
          <button class="ibtn sm" data-act="folder" data-tip="Cambiar carpeta">${icon('folder')}</button>
        </div>
        <p class="hint">Cada día se guarda un respaldo en <span class="mono">respaldos/</span> (se conservan 14 días).</p>
      </div>

      <div class="card setting-card">
        <h3>Saldos de partida</h3>
        <p class="muted">Lo que ya tenías antes de empezar a registrar.</p>
        <div class="grid-2">
          <div class="field"><label>Saldo inicial</label><div class="money"><span>$</span><input class="input" name="saldoInicial" inputmode="numeric" value="${a.saldoInicial || ''}" placeholder="0"></div></div>
          <div class="field"><label>Ahorro inicial</label><div class="money"><span>$</span><input class="input" name="ahorroInicial" inputmode="numeric" value="${a.ahorroInicial || ''}" placeholder="0"></div></div>
        </div>
      </div>

      <div class="card setting-card">
        <h3>Aporte al ahorro por defecto</h3>
        <p class="muted">Se propone al marcar un ingreso como sueldo. Puedes cambiarlo en cada ingreso.</p>
        <div class="row-line">
          ${segmented('adef', [['pct', '%', 'Porcentaje'], ['fijo', '$', 'Monto fijo']], a.aporteDefecto.modo)}
          <input class="input sm num-input wide" name="adefValor" inputmode="numeric" value="${a.aporteDefecto.valor ? (a.aporteDefecto.modo === 'fijo' ? num(a.aporteDefecto.valor) : a.aporteDefecto.valor) : ''}" placeholder="0">
        </div>
      </div>

      <div class="card setting-card">
        <h3>Tablas</h3>
        <div class="row-line"><span>Mostrar columna de ID</span>${sw('mostrarIds', a.mostrarIds)}</div>
      </div>

      <div class="card setting-card span-2">
        <h3>Ajustes manuales al ahorro</h3>
        <p class="muted">Para mover dinero entre bolsillo y ahorro sin registrar un ingreso o gasto. Usa un monto negativo para retirar del ahorro.</p>
        <div class="adj-form">
          <input class="input sm" type="date" name="adjFecha" value="${today()}">
          <div class="money sm"><span>$</span><input class="input sm" name="adjMonto" inputmode="numeric" placeholder="-50.000 o 50.000"></div>
          <input class="input sm grow" name="adjNota" placeholder="Nota (opcional)" maxlength="80">
          <button class="ibtn sm primary" data-act="adj-add" data-tip="Agregar ajuste">${icon('plus')}</button>
        </div>
        ${ajustes.length ? `<div class="adj-list">${ajustes.map((x) => `
          <div class="adj-row"><span class="dim">${fechaCorta(x.fecha)}</span><span class="grow">${esc(x.nota) || '<span class="muted">Sin nota</span>'}</span>
            <b class="${x.monto >= 0 ? 'pos' : 'neg'}">${clpSigned(x.monto)}</b>
            <button class="ibtn ghost xs danger" data-del="${x.id}" data-tip="Eliminar">${icon('trash')}</button></div>`).join('')}</div>`
    : ''}
      </div>
    </section>`;

  const q = (n) => root.querySelector(`[name="${n}"]`);

  root.querySelector('[data-act="open"]').onclick = () => window.api.openFolder();
  root.querySelector('[data-act="reload"]').onclick = async () => { await store.reload(); toast('Datos recargados'); };
  root.querySelector('[data-act="folder"]').onclick = async () => {
    if (await store.chooseFolder()) toast('Carpeta cambiada');
  };

  const getSaldo = bindMoney(q('saldoInicial'), { allowNegative: true });
  const getAhorro = bindMoney(q('ahorroInicial'));
  q('saldoInicial').onchange = () => { store.updateAjustes({ saldoInicial: getSaldo() }); toast('Saldo inicial guardado'); };
  q('ahorroInicial').onchange = () => { store.updateAjustes({ ahorroInicial: getAhorro() }); toast('Ahorro inicial guardado'); };

  let modo = a.aporteDefecto.modo;
  const valorDef = () => {
    const raw = String(q('adefValor').value);
    return modo === 'fijo' ? Number(raw.replace(/\D/g, '')) || 0 : Math.min(100, Number(raw.replace(/[^\d.]/g, '')) || 0);
  };
  bindSegmented(root, 'adef', (v) => {
    modo = v;
    store.updateAjustes({ aporteDefecto: { modo, valor: valorDef() } });
  });
  q('adefValor').oninput = () => {
    if (modo === 'fijo') { const d = q('adefValor').value.replace(/\D/g, ''); q('adefValor').value = d ? num(Number(d)) : ''; }
  };
  q('adefValor').onchange = () => { store.updateAjustes({ aporteDefecto: { modo, valor: valorDef() } }); toast('Aporte por defecto guardado'); };

  q('mostrarIds').onchange = (e) => store.updateAjustes({ mostrarIds: e.target.checked });

  const getAdj = bindMoney(q('adjMonto'), { allowNegative: true });
  const addAdj = () => {
    const monto = getAdj();
    if (!monto) { shake(q('adjMonto')); toast('Escribe un monto distinto de 0', 'warn'); return; }
    store.addAjusteAhorro({ fecha: q('adjFecha').value || today(), monto, nota: q('adjNota').value.trim() });
    toast(`Ajuste de ${clpSigned(monto)} agregado al ahorro`);
  };
  root.querySelector('[data-act="adj-add"]').onclick = addAdj;
  q('adjNota').onkeydown = (e) => { if (e.key === 'Enter') addAdj(); };

  root.querySelector('.adj-list')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const x = state.ajustes.ajustesAhorro.find((y) => y.id === b.dataset.del);
    const ok = await confirmDialog({ title: 'Eliminar ajuste', message: `Se eliminará el ajuste de <b>${clpSigned(x.monto)}</b>.`, confirmIcon: 'trash', danger: true });
    if (ok) store.deleteAjusteAhorro(x.id);
  });
}

export { clp };
