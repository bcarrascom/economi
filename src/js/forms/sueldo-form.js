// Formulario para crear o editar un sueldo (ingreso recurrente) o una subscripción (cobro recurrente).

import * as store from '../store.js';
import {
  openModal, segmented, bindSegmented, sw, bindMoney, tagPicker, toast, shake,
} from '../ui.js';
import { uid, today, esc } from '../format.js';

const UNIDADES = [['dia', 'Días'], ['semana', 'Semanas'], ['mes', 'Meses'], ['anio', 'Años']];

const TXT = {
  sueldo: { uno: 'sueldo', o: 'o', placeholder: 'Sueldo, Remuneración diaria…', mov: 'ingreso', variable: 'una remuneración diaria' },
  subscripcion: { uno: 'subscripción', o: 'a', placeholder: 'Netflix, Arriendo, Gimnasio…', mov: 'gasto', variable: 'una cuenta de luz' },
};

/**
 * @param {object|null} existing  sueldo/subscripción a editar
 * @param {object} preset         { clase } para nuevos
 */
export function openSueldoForm(existing = null, preset = {}) {
  const s = existing ? { ...existing } : {
    id: uid(),
    clase: preset.clase === 'subscripcion' ? 'subscripcion' : 'sueldo',
    nombre: '',
    monto: null,
    frecuenciaCantidad: 1,
    frecuenciaUnidad: 'mes',
    hora: '09:00',
    modo: 'sugerido',
    tags: [],
    proxima: today(),
    activo: true,
    creado: new Date().toISOString(),
  };
  let clase = s.clase;
  let conMonto = s.monto != null;
  let unidad = s.frecuenciaUnidad;
  let modo = s.modo;
  let el;
  let picker;
  let getMonto;
  const q = (n) => el.querySelector(`[name="${n}"]`);

  const body = `
    <div class="form-row center">${segmented('clase', [['sueldo', 'Sueldo'], ['subscripcion', 'Subscripción']], clase)}</div>
    <div class="hint" data-el="claseHint"></div>
    <div class="field"><label>Nombre</label><input class="input" name="nombre" maxlength="80" value="${esc(s.nombre)}" placeholder="${TXT[clase].placeholder}" autofocus></div>

    <div class="row-line"><span>Activ${TXT[clase].o}</span>${sw('activo', s.activo !== false)}</div>

    <div class="row-line"><span>Monto fijo</span>${sw('conMonto', conMonto)}</div>
    <div class="collapse ${conMonto ? 'open' : ''}" data-sec="monto"><div><div class="pad-top">
      <div class="money"><span>$</span><input class="input" name="monto" inputmode="numeric" placeholder="0" value="${s.monto || ''}"></div>
      <div class="hint" data-el="montoHint"></div>
    </div></div></div>

    <div class="field"><label>Frecuencia</label>
      <div class="ahorro-ctl">
        <input class="input sm num-input" name="cantidad" inputmode="numeric" value="${s.frecuenciaCantidad}">
        ${segmented('unidad', UNIDADES, unidad)}
      </div>
    </div>

    <div class="grid-2">
      <div class="field"><label>Próxima vez</label><input class="input" type="date" name="proxima" value="${s.proxima}"></div>
      <div class="field"><label>Hora</label><input class="input" type="time" name="hora" value="${s.hora}"></div>
    </div>

    <div class="row-line"><span>Al llegar la fecha</span>${segmented('modo', [['sugerido', 'Sugerir'], ['auto', 'Aplicar automático']], modo)}</div>
    <div class="hint" data-el="modoHint"></div>

    <div class="field"><label>Tags</label><div data-el="tags"></div></div>`;

  openModal({
    title: existing ? `Editar ${TXT[clase].uno}` : 'Nuevo sueldo o subscripción',
    width: 480,
    body,
    onMount: (root) => {
      el = root;
      picker = tagPicker(el.querySelector('[data-el="tags"]'), s.tags);
      getMonto = bindMoney(q('monto'));

      const relayout = () => requestAnimationFrame(() => {
        el.querySelectorAll('[data-seg]').forEach((seg) => {
          const on = seg.querySelector('button.on');
          const th = seg.querySelector('.thumb');
          if (on && th) { th.style.left = `${on.offsetLeft}px`; th.style.width = `${on.offsetWidth}px`; }
        });
      });

      const segModo = bindSegmented(el, 'modo', (v) => { modo = v; updateModoHint(); });
      bindSegmented(el, 'unidad', (v) => { unidad = v; });
      bindSegmented(el, 'clase', (v) => { clase = v; updateClase(); });

      // Textos que cambian según sea sueldo (ingreso) o subscripción (gasto).
      function updateClase() {
        const t = TXT[clase];
        el.querySelector('[data-el="claseHint"]').textContent = `Cada vez que toque, registra un ${t.mov}.`;
        el.querySelector('[data-el="montoHint"]').textContent = `Si lo dejas sin monto fijo, te lo pedirá cada vez (útil si varía, como ${t.variable}).`;
        q('nombre').placeholder = t.placeholder;
        q('activo').closest('.row-line').querySelector('span').textContent = `Activ${t.o}`;
      }
      updateClase();

      q('conMonto').onchange = (e) => {
        conMonto = e.target.checked;
        el.querySelector('[data-sec="monto"]').classList.toggle('open', conMonto);
        if (!conMonto && modo === 'auto') { modo = 'sugerido'; segModo.set('sugerido'); updateModoHint(); }
        relayout();
      };
      updateModoHint();

      function updateModoHint() {
        el.querySelector('[data-el="modoHint"]').textContent = modo === 'auto'
          ? 'Se registrará solo, sin preguntar (igual podrás editarlo después desde Movimientos).'
          : 'Aparecerá como sugerencia al abrir Movimientos, con un botón para aplicar o posponer.';
      }
    },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (c) => c() },
      {
        icon: 'check', tip: 'Guardar (Enter)', kind: 'primary', primary: true,
        onClick: (close) => {
          s.clase = clase;
          s.activo = q('activo').checked;
          s.nombre = q('nombre').value.trim();
          s.frecuenciaCantidad = Number(q('cantidad').value) || 1;
          s.frecuenciaUnidad = unidad;
          s.hora = q('hora').value || '09:00';
          s.proxima = q('proxima').value || today();
          s.modo = modo;
          s.monto = conMonto ? getMonto() : null;
          s.tags = picker.value();

          if (!s.nombre) { shake(q('nombre')); toast('Escribe un nombre', 'warn'); return; }
          if (conMonto && !(s.monto > 0)) { shake(q('monto')); toast('El monto debe ser mayor a 0, o desactiva "Monto fijo"', 'warn'); return; }
          if (!s.proxima) { shake(q('proxima')); toast('Elige cuándo empieza', 'warn'); return; }
          if (!conMonto && modo === 'auto') {
            toast('Sin un monto fijo no hay quién lo escriba: activa "Monto fijo" o cambia a "Sugerir"', 'warn');
            return;
          }

          store.saveSueldo(s);
          const t = TXT[clase];
          toast(`${t.uno[0].toUpperCase()}${t.uno.slice(1)} ${existing ? 'actualizad' : 'cread'}${t.o}`);
          close();
        },
      },
    ],
  });
}
