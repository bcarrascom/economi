// Formulario de ítem de la lista de compras.

import * as store from '../store.js';
import { openModal, sw, bindMoney, tagPicker, toast, shake } from '../ui.js';
import { uid, esc } from '../format.js';

export function openCompraForm(existing = null) {
  const c = existing ? structuredClone(existing) : {
    id: uid(), nombre: '', descripcion: '', costo: 0, tags: [], esAhorro: false,
  };
  let picker;
  let getCosto;
  let el;

  openModal({
    title: existing ? 'Editar ítem' : 'Nuevo ítem en la lista',
    width: 520,
    body: `
      <div class="grid-2 wide-first">
        <div class="field"><label>Producto o servicio</label><input class="input" name="nombre" maxlength="120" value="${esc(c.nombre)}" autofocus></div>
        <div class="field"><label>Costo</label><div class="money"><span>$</span><input class="input" name="costo" inputmode="numeric" placeholder="0" value="${c.costo || ''}"></div></div>
      </div>
      <div class="field"><label>Descripción <span class="opt">opcional</span></label><textarea class="input" name="descripcion" rows="2">${esc(c.descripcion)}</textarea></div>
      <div class="field"><label>Tags</label><div data-el="tags"></div></div>
      <div class="subform">
        <div class="row-line"><span>Es ahorro <span class="muted">(suma al objetivo y se paga desde el ahorro)</span></span>${sw('esAhorro', c.esAhorro)}</div>
      </div>`,
    onMount: (root) => {
      el = root;
      picker = tagPicker(el.querySelector('[data-el="tags"]'), c.tags);
      getCosto = bindMoney(el.querySelector('[name="costo"]'));
    },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (close) => close() },
      {
        icon: 'check', tip: 'Guardar (Enter)', kind: 'primary', primary: true,
        onClick: (close) => {
          const q = (n) => el.querySelector(`[name="${n}"]`);
          c.nombre = q('nombre').value.trim();
          c.descripcion = q('descripcion').value.trim();
          c.costo = getCosto();
          c.esAhorro = q('esAhorro').checked;
          c.tags = picker.value();
          if (!c.nombre) { shake(q('nombre')); toast('Escribe el nombre del producto', 'warn'); return; }
          if (!(c.costo > 0)) { shake(q('costo')); toast('El costo debe ser mayor a 0', 'warn'); return; }
          store.saveCompra(c);
          toast(existing ? 'Ítem actualizado' : 'Ítem agregado a la lista');
          close();
        },
      },
    ],
  });
}
