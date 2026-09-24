// Formulario de tag: nombre y color (blanco por defecto).

import * as store from '../store.js';
import { openModal, toast, shake, tagPill } from '../ui.js';
import { uid, esc } from '../format.js';

export const PALETA = [
  '#ffffff', '#9aa8ff', '#62d6a0', '#ff7a7a', '#ffb35c', '#f5d76e',
  '#5fd3e8', '#c49bff', '#ff8ac6', '#8fe3c8', '#a7adbd', '#c9a27e',
];

export function openTagForm(existing = null) {
  const t = existing ? { ...existing } : { id: uid(), nombre: '', color: '#ffffff' };
  let el;

  const preview = () => {
    el.querySelector('[data-el="preview"]').innerHTML = tagPill({ id: t.id, nombre: t.nombre || 'Vista previa', color: t.color });
    el.querySelectorAll('.swatch[data-c]').forEach((s) => s.classList.toggle('on', s.dataset.c.toLowerCase() === t.color.toLowerCase()));
  };

  openModal({
    title: existing ? 'Editar tag' : 'Nuevo tag',
    width: 420,
    body: `
      <div class="tag-preview" data-el="preview"></div>
      <div class="field"><label>Nombre</label><input class="input" name="nombre" maxlength="32" value="${esc(t.nombre)}" autofocus></div>
      <div class="field">
        <label>Color</label>
        <div class="swatches">
          ${PALETA.map((c) => `<button type="button" class="swatch" data-c="${c}" style="--c:${c}" data-tip="${c}"></button>`).join('')}
          <label class="swatch custom" data-tip="Color personalizado"><input type="color" value="${esc(t.color)}"></label>
        </div>
      </div>`,
    onMount: (root) => {
      el = root;
      const nombre = el.querySelector('[name="nombre"]');
      nombre.oninput = () => { t.nombre = nombre.value; preview(); };
      el.querySelector('.swatches').onclick = (e) => {
        const s = e.target.closest('.swatch[data-c]');
        if (s) { t.color = s.dataset.c; preview(); }
      };
      el.querySelector('.custom input').oninput = (e) => { t.color = e.target.value; preview(); };
      preview();
    },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (c) => c() },
      {
        icon: 'check', tip: 'Guardar (Enter)', kind: 'primary', primary: true,
        onClick: (close) => {
          t.nombre = t.nombre.trim();
          if (!t.nombre) { shake(el.querySelector('[name="nombre"]')); toast('Escribe un nombre para el tag', 'warn'); return; }
          store.saveTag(t);
          toast(existing ? 'Tag actualizado' : 'Tag creado');
          close();
        },
      },
    ],
  });
}
