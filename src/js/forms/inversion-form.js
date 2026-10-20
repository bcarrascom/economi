// Formularios de inversiones: crear/editar la inversión, sus entradas, y completarla.

import * as store from '../store.js';
import { openModal, segmented, bindSegmented, bindMoney, toast, shake } from '../ui.js';
import { uid, today, esc, clp } from '../format.js';
import { ENTRADA_LABEL } from '../calc.js';

/** Crear o editar una inversión. El tipo no se puede cambiar si ya tiene entradas (cambiaría su significado). */
export function openInversionForm(existing = null, { onSaved } = {}) {
  const inv = existing ? structuredClone(existing) : {
    id: uid(), nombre: '', descripcion: '', tipo: 'externa', estado: 'activa', variaciones: [],
  };
  const tipoFijo = existing ? store.entradasDe(existing).length > 0 : false;
  let tipo = inv.tipo;
  let el;

  const TIPO_HINT = {
    externa: 'La plata sale de tu cuenta hacia otro lugar (un broker, una cuenta de inversión…). Solo los aportes y retiros tocan tu cuenta; las ganancias y pérdidas cambian el valor de la inversión hasta que retires.',
    interna: 'La plata se mueve directo desde y hacia tu cuenta (ej. pagas publicidad y después vendes). Cada gasto es una pérdida y cada ingreso una ganancia.',
  };

  openModal({
    title: existing ? 'Editar inversión' : 'Nueva inversión',
    width: 480,
    body: `
      <div class="form-row center">${segmented('tipo', [['externa', 'Externa'], ['interna', 'Interna']], tipo)}</div>
      <div class="hint" data-el="tipoHint">${TIPO_HINT[tipo]}</div>
      ${tipoFijo ? '<div class="note">El tipo no se puede cambiar porque la inversión ya tiene movimientos.</div>' : ''}
      <div class="field"><label>Nombre</label><input class="input" name="nombre" maxlength="120" value="${esc(inv.nombre)}" autofocus></div>
      <div class="field"><label>Descripción <span class="opt">opcional</span></label><textarea class="input" name="descripcion" rows="2">${esc(inv.descripcion)}</textarea></div>`,
    onMount: (root) => {
      el = root;
      if (tipoFijo) el.querySelector('[data-seg="tipo"]').classList.add('is-disabled');
      bindSegmented(el, 'tipo', (v) => {
        if (tipoFijo) return;
        tipo = v;
        el.querySelector('[data-el="tipoHint"]').textContent = TIPO_HINT[v];
      });
    },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (c) => c() },
      {
        icon: 'check', tip: 'Guardar (Enter)', kind: 'primary', primary: true,
        onClick: (close) => {
          const nombre = el.querySelector('[name="nombre"]').value.trim();
          if (!nombre) { shake(el.querySelector('[name="nombre"]')); toast('Escribe un nombre', 'warn'); return; }
          const n = store.saveInversion({
            ...inv,
            nombre,
            descripcion: el.querySelector('[name="descripcion"]').value.trim(),
            tipo: tipoFijo ? existing.tipo : tipo,
          });
          toast(existing ? 'Inversión actualizada' : 'Inversión creada');
          close();
          onSaved?.(n);
        },
      },
    ],
  });
}

/** Tipos de entrada disponibles según el tipo de inversión. */
const tiposPara = (inv) => (inv.tipo === 'externa'
  ? [['aporte', 'Aporte'], ['retiro', 'Retiro'], ['ganancia', 'Ganancia'], ['perdida', 'Pérdida']]
  : [['perdida', 'Pérdida'], ['ganancia', 'Ganancia']]);

function efectoTexto(inv, tipo) {
  if (inv.tipo === 'interna') return tipo === 'ganancia' ? 'Se registra como ingreso en tu cuenta.' : 'Se registra como gasto en tu cuenta.';
  return {
    aporte: 'Se registra como gasto en tu cuenta: la plata pasa a la inversión.',
    retiro: 'Se registra como ingreso en tu cuenta: la plata vuelve desde la inversión. No cambia el monto.',
    ganancia: 'No toca tu cuenta: sube el saldo y el monto de la inversión.',
    perdida: 'No toca tu cuenta: baja el saldo y el monto de la inversión.',
  }[tipo];
}

/**
 * Nueva entrada (o editar una) desde la página de la inversión.
 * `entrada`: una de store.entradasDe(inv), o null para crear.
 */
export function openEntradaForm(inv, entrada = null) {
  const opts = tiposPara(inv);
  let tipo = entrada?.tipo || opts[0][0];
  let el;
  let getMonto;
  let revision = {};

  openModal({
    title: entrada ? 'Editar movimiento' : `Nuevo movimiento · ${inv.nombre}`,
    width: 480,
    body: `
      <div class="form-row center">${segmented('tipo', opts, tipo)}</div>
      <div class="grid-2">
        <div class="field"><label>Fecha</label><input class="input" type="date" name="fecha" value="${entrada?.fecha || today()}"></div>
        <div class="field"><label>Monto</label><div class="money"><span>$</span><input class="input" name="monto" inputmode="numeric" placeholder="0" value="${entrada?.monto || ''}" autofocus></div></div>
      </div>
      <div class="field"><label>Descripción <span class="opt">opcional</span></label><textarea class="input" name="descripcion" rows="2">${esc(entrada?.descripcion || '')}</textarea></div>
      <div class="hint" data-el="hint"></div>`,
    onMount: (root) => {
      el = root;
      getMonto = bindMoney(el.querySelector('[name="monto"]'));
      bindSegmented(el, 'tipo', (v) => { tipo = v; update(); });
      el.querySelector('[name="monto"]').addEventListener('input', update);
      el.querySelector('[name="fecha"]').addEventListener('change', update);
      update();
    },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (c) => c() },
      { icon: 'check', tip: 'Guardar (Enter)', kind: 'primary', primary: true, onClick: (close) => save(close) },
    ],
  });

  function datos() {
    return {
      id: entrada?.id || null,
      tipo,
      fecha: el.querySelector('[name="fecha"]').value || today(),
      monto: getMonto(),
      descripcion: el.querySelector('[name="descripcion"]').value.trim(),
    };
  }

  function update() {
    const d = datos();
    revision = store.revisarEntrada(inv, { quitar: d.id, entrada: d });
    let txt = efectoTexto(inv, tipo);
    if (revision.gananciaExtra) txt += ` <span class="pos">Supera el saldo: se registrará también una ganancia de ${clp(revision.gananciaExtra)}.</span>`;
    if (revision.error) txt = `<span class="neg">${esc(revision.error)}</span>`;
    el.querySelector('[data-el="hint"]').innerHTML = txt;
  }

  function save(close) {
    const d = datos();
    if (!(d.monto > 0)) { shake(el.querySelector('[name="monto"]')); toast('El monto debe ser mayor a 0', 'warn'); return; }
    update();
    if (revision.error) { shake(el.querySelector('[name="monto"]')); toast(revision.error, 'warn'); return; }
    store.saveEntrada(inv.id, d, { gananciaExtra: revision.gananciaExtra });
    toast(entrada ? 'Movimiento actualizado' : `${ENTRADA_LABEL[tipo]} ${tipo === 'ganancia' || tipo === 'perdida' ? 'registrada' : 'registrado'}`);
    close();
  }
}

/** Completar: en una externa se pregunta cuánto te llevas (se propone el saldo que queda). */
export function openCompletarForm(inv) {
  const r = store.resumenDe(inv);
  const externa = inv.tipo === 'externa';
  let el;
  let getMonto;

  openModal({
    title: 'Completar inversión',
    width: 440,
    body: externa ? `
      <div class="note">Una vez completada no se le pueden agregar movimientos (puedes reabrirla si te equivocas).</div>
      <div class="grid-2">
        <div class="field"><label>¿Cuánto retiras al cerrar?</label><div class="money"><span>$</span><input class="input" name="monto" inputmode="numeric" value="${r.saldo || ''}" placeholder="0" autofocus></div></div>
        <div class="field"><label>Fecha</label><input class="input" type="date" name="fecha" value="${today()}"></div>
      </div>
      <div class="hint" data-el="hint"></div>` : `
      <div class="note">Una vez completada no se le pueden agregar movimientos (puedes reabrirla si te equivocas).</div>
      <div class="field"><label>Fecha</label><input class="input" type="date" name="fecha" value="${today()}"></div>
      <div class="hint">Resultado final: <b class="${r.resultado >= 0 ? 'pos' : 'neg'}">${clp(r.resultado)}</b>.</div>`,
    onMount: (root) => {
      el = root;
      if (!externa) return;
      getMonto = bindMoney(el.querySelector('[name="monto"]'));
      const update = () => {
        const dif = getMonto() - r.saldo;
        const partes = [];
        if (getMonto() > 0) partes.push(`Se registrará un retiro de <b>${clp(getMonto())}</b> (ingreso en tu cuenta).`);
        if (dif > 0) partes.push(`<span class="pos">Es más que el saldo (${clp(r.saldo)}): la diferencia de ${clp(dif)} cuenta como ganancia.</span>`);
        if (dif < 0) partes.push(`<span class="neg">Es menos que el saldo (${clp(r.saldo)}): los ${clp(-dif)} que quedan se registran como pérdida.</span>`);
        el.querySelector('[data-el="hint"]').innerHTML = partes.join(' ') || 'No queda saldo en la inversión.';
      };
      el.querySelector('[name="monto"]').addEventListener('input', update);
      update();
    },
    actions: [
      { icon: 'close', tip: 'Cancelar', onClick: (c) => c() },
      {
        icon: 'check', tip: 'Completar (Enter)', kind: 'primary', primary: true,
        onClick: (close) => {
          store.completarInversion(inv.id, {
            recibido: externa ? getMonto() : 0,
            fecha: el.querySelector('[name="fecha"]').value || today(),
          });
          toast('Inversión completada');
          close();
        },
      },
    ],
  });
}
