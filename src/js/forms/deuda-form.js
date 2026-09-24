// Formulario para crear o editar una deuda a mano (no ligada a un movimiento).

import * as store from '../store.js';
import {
  openModal, segmented, bindSegmented, bindMoney, toast, shake,
} from '../ui.js';
import { uid, today, esc } from '../format.js';

/**
 * @param {object|null} existing  deuda a editar
 * @param {object} preset         { direccion } para deudas nuevas
 */
export function openDeudaForm(existing = null, preset = {}) {
  const d = existing ? { ...existing } : {
    id: uid(),
    direccion: preset.direccion === 'contra' ? 'contra' : 'favor',
    nombre: '',
    contraparte: '',
    descripcion: '',
    monto: 0,
    fecha: today(),
    plazoModo: 'ninguno',
    plazoFecha: '',
    plazoDias: 30,
    estado: 'pendiente',
    montoLiquidado: null,
    fechaLiquidacion: null,
    movId: null,
    movAutoId: null,
    creado: new Date().toISOString(),
  };
  const favor = d.direccion === 'favor';
  let plazoModo = d.plazoModo;
  let el;
  let getMonto;
  const q = (n) => el.querySelector(`[name="${n}"]`);
  const sec = (n) => el.querySelector(`[data-sec="${n}"]`);

  const body = `
    <div class="grid-2">
      <div class="field"><label>Fecha</label><input class="input" type="date" name="fecha" value="${d.fecha}"></div>
      <div class="field"><label>Monto</label><div class="money"><span>$</span><input class="input" name="monto" inputmode="numeric" placeholder="0" value="${d.monto || ''}"></div></div>
    </div>
    <div class="field"><label>Nombre</label><input class="input" name="nombre" maxlength="120" value="${esc(d.nombre)}" autofocus></div>
    <div class="field"><label>${favor ? '¿Quién te debe?' : '¿A quién le debes?'}</label><input class="input" name="contraparte" maxlength="80" value="${esc(d.contraparte)}"></div>
    <div class="field"><label>Descripción <span class="opt">opcional</span></label><textarea class="input" name="descripcion" rows="2">${esc(d.descripcion)}</textarea></div>
    <div class="row-line"><span>Plazo <span class="opt">opcional</span></span>${segmented('plazoModo', [['ninguno', 'Sin plazo'], ['dias', 'Días'], ['fecha', 'Fecha límite']], plazoModo)}</div>
    <div class="collapse ${plazoModo === 'dias' ? 'open' : ''}" data-sec="dias"><div><div class="pad-top">
      <input class="input" name="plazoDias" inputmode="numeric" placeholder="30" value="${d.plazoDias ?? 30}">
    </div></div></div>
    <div class="collapse ${plazoModo === 'fecha' ? 'open' : ''}" data-sec="fecha"><div><div class="pad-top">
      <input class="input" type="date" name="plazoFecha" value="${d.plazoFecha || ''}">
    </div></div></div>`;

  openModal({
    title: existing ? 'Editar deuda' : favor ? 'Nueva deuda a favor' : 'Nueva deuda',
    width: 480,
    body,
    onMount: (root) => {
      el = root;
      getMonto = bindMoney(q('monto'));
      bindSegmented(el, 'plazoModo', (v) => {
        plazoModo = v;
        sec('dias').classList.toggle('open', v === 'dias');
        sec('fecha').classList.toggle('open', v === 'fecha');
      });
    },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (c) => c() },
      {
        icon: 'check', tip: 'Guardar (Enter)', kind: 'primary', primary: true,
        onClick: (close) => {
          d.nombre = q('nombre').value.trim();
          d.contraparte = q('contraparte').value.trim();
          d.descripcion = q('descripcion').value.trim();
          d.fecha = q('fecha').value || today();
          d.monto = getMonto();
          d.plazoModo = plazoModo;
          d.plazoDias = Number(q('plazoDias').value) || 30;
          d.plazoFecha = q('plazoFecha').value || null;

          if (!d.nombre) { shake(q('nombre')); toast('Escribe un nombre', 'warn'); return; }
          if (!d.contraparte) { shake(q('contraparte')); toast(favor ? 'Escribe quién te debe' : 'Escribe a quién le debes', 'warn'); return; }
          if (!(d.monto > 0)) { shake(q('monto')); toast('El monto debe ser mayor a 0', 'warn'); return; }
          if (plazoModo === 'fecha' && !d.plazoFecha) { shake(q('plazoFecha')); toast('Elige la fecha límite, o cambia el plazo a "Sin plazo"', 'warn'); return; }

          store.saveDeuda(d);
          toast(existing ? 'Deuda actualizada' : 'Deuda creada');
          close();
        },
      },
    ],
  });
}
