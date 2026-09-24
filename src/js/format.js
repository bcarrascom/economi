// Formato de montos (CLP), fechas y colores.

const clpFmt = new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const numFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export const clp = (n) => clpFmt.format(Math.round(Number(n) || 0));
export const clpSigned = (n) => (n > 0 ? '+' : '') + clp(n);
export const num = (n) => numFmt.format(Math.round(Number(n) || 0));

/** Monto compacto para ejes de gráficos: $1,2M · $350k */
export function clpCompact(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const f = (x) => x.toLocaleString('es-CL', { maximumFractionDigits: 1 });
  if (a >= 1e6) return `${v < 0 ? '-' : ''}$${f(a / 1e6)}M`;
  if (a >= 1e3) return `${v < 0 ? '-' : ''}$${f(a / 1e3)}k`;
  return clp(v);
}

export const pct = (n, digits = 1) =>
  Number.isFinite(n) ? `${n.toLocaleString('es-CL', { maximumFractionDigits: digits })}%` : '—';

/** "1.250.000" | "$ -3.000" → número entero */
export function parseMoney(s) {
  const str = String(s ?? '');
  const neg = str.split(/\d/)[0].includes('-'); // un "-" antes del primer dígito
  const digits = str.replace(/[^\d]/g, '');
  const v = digits ? parseInt(digits, 10) : 0;
  return neg ? -v : v;
}

// ---------- Fechas (siempre YYYY-MM-DD en hora local) ----------
export const pad = (n) => String(n).padStart(2, '0');
export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export const currentMonthKey = () => today().slice(0, 7);
export const currentYear = () => Number(today().slice(0, 4));

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const monthName = (m) => cap(MESES[m - 1]);

/** '2026-09' → 'Septiembre 2026' | corto: 'sep 26' */
export function monthLabel(key, short = false) {
  const [y, m] = key.split('-').map(Number);
  const name = MESES[m - 1] || '?';
  return short ? `${name.slice(0, 3)} ${String(y).slice(2)}` : `${cap(name)} ${y}`;
}

/** '2026-09-21' → '21 sep 2026' */
export function fechaCorta(f) {
  if (!f) return '—';
  const [y, m, d] = f.split('-').map(Number);
  return `${d} ${MESES[m - 1]?.slice(0, 3) ?? '?'} ${y}`;
}

export function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${fechaCorta(toISODate(d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Lista continua de claves de mes 'YYYY-MM' terminando en `hasta`. */
export function ultimosMeses(n, hasta = currentMonthKey()) {
  let [y, m] = hasta.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${pad(m)}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

/** Fecha 'YYYY-MM-DD' → clave del periodo que la contiene, según granularidad. */
export function claveDe(fecha, gran) {
  if (gran === 'mes') return fecha.slice(0, 7);
  if (gran === 'semana') {
    const d = new Date(`${fecha}T00:00:00`);
    const dow = (d.getDay() + 6) % 7; // 0 = lunes
    d.setDate(d.getDate() - dow);
    return toISODate(d);
  }
  return fecha; // dia
}

/** n claves de periodo consecutivas terminando en la que contiene `hasta` (ascendente). */
export function ultimosPeriodos(n, gran, hasta = today()) {
  if (gran === 'mes') return ultimosMeses(n, claveDe(hasta, 'mes'));
  const paso = gran === 'semana' ? 7 : 1;
  const out = [];
  let k = claveDe(hasta, gran);
  for (let i = 0; i < n; i++) {
    out.unshift(k);
    const d = new Date(`${k}T00:00:00`);
    d.setDate(d.getDate() - paso);
    k = toISODate(d);
  }
  return out;
}

/** Etiqueta corta de una clave de periodo para ejes de gráfico. */
export function periodoLabel(key, gran) {
  if (gran === 'mes') return monthLabel(key, true);
  return fechaCorta(key).replace(/ \d{4}$/, '');
}

/** 'YYYY-MM-DD' + n días → 'YYYY-MM-DD' */
export function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + (Number(n) || 0));
  return toISODate(d);
}

/** Hora actual 'HH:MM' (para comparar contra la hora programada de un sueldo). */
export const nowHHMM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const diasEnMes = (y, m) => new Date(y, m, 0).getDate();

/** Avanza una fecha por una frecuencia ('dia' | 'semana' | 'mes' | 'anio'), cuidando fin de mes. */
export function avanzarFecha(fecha, cantidad, unidad) {
  const [y, m, d] = fecha.split('-').map(Number);
  const n = Math.max(1, Number(cantidad) || 1);
  if (unidad === 'dia') return sumarDias(fecha, n);
  if (unidad === 'semana') return sumarDias(fecha, n * 7);
  if (unidad === 'anio') { const ny = y + n; return `${ny}-${pad(m)}-${pad(Math.min(d, diasEnMes(ny, m)))}`; }
  // 'mes'
  const total = (m - 1) + n;
  const ny = y + Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, diasEnMes(ny, nm)))}`;
}

// ---------- Texto ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const normalize = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const shortId = (id) => String(id ?? '').slice(0, 8);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  }));

// ---------- Colores ----------
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Escala financiera: t ∈ [-1, 1]  →  rojo (-1) · ámbar (0) · verde (1).
 * Todos los números grandes y el arrepentimiento pasan por aquí.
 */
export function scaleColor(t) {
  const x = clamp(Number.isFinite(t) ? t : 0, -1, 1);
  const hue = x < 0 ? 42 + x * 42 : 42 + x * 108;
  const sat = 78 - Math.abs(x) * 8;
  return `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% 66%)`;
}

/** Arrepentimiento 0 (verde) → 5 (rojo) */
export const regretColor = (r) => scaleColor(1 - (Number(r) || 0) / 2.5);

export function hexToRgba(hex, a = 1) {
  const h = String(hex || '#ffffff').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, 'f');
  const n = parseInt(full.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
