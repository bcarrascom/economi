// Tema y utilidades para Chart.js (cargado como UMD en window.Chart).

import { clp, clpCompact, hexToRgba } from './format.js';

export const COLORS = {
  accent: '#9aa8ff',
  green: '#62d6a0',
  red: '#ff7a7a',
  orange: '#ffb35c',
  text: 'rgba(226, 230, 242, 0.46)',
  grid: 'rgba(255, 255, 255, 0.045)',
};

const registry = new Map();

export function setupCharts() {
  const C = window.Chart;
  if (!C) return;
  const d = C.defaults;
  d.color = COLORS.text;
  d.font.family = getComputedStyle(document.body).fontFamily;
  d.font.size = 10;
  d.borderColor = COLORS.grid;
  d.maintainAspectRatio = false;
  d.animation.duration = 850;
  d.animation.easing = 'easeOutQuart';
  d.plugins.legend.display = false;
  Object.assign(d.plugins.legend.labels, { usePointStyle: true, boxWidth: 6, boxHeight: 6, padding: 14 });
  Object.assign(d.plugins.tooltip, {
    backgroundColor: 'rgba(16, 18, 28, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 10,
    titleFont: { size: 11, weight: '600' },
    bodyFont: { size: 11 },
    usePointStyle: true,
    boxWidth: 7,
    boxHeight: 7,
    boxPadding: 4,
  });
}

/** Crea (o recrea) un gráfico identificado por key. */
export function chart(canvas, key, config, animate = true) {
  registry.get(key)?.destroy();
  registry.delete(key);
  if (!canvas || !window.Chart) return null;
  if (!animate) config.options = { ...(config.options || {}), animation: false };
  const c = new window.Chart(canvas, config);
  registry.set(key, c);
  return c;
}

export function destroyAll() {
  for (const c of registry.values()) c.destroy();
  registry.clear();
}

/** Relleno degradado vertical para líneas. */
export const gradientFill = (color, alpha = 0.28) => (ctx) => {
  const { chart: ch } = ctx;
  const area = ch.chartArea;
  if (!area) return hexToRgba(color, 0);
  const g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, hexToRgba(color, alpha));
  g.addColorStop(1, hexToRgba(color, 0));
  return g;
};

const valueOf = (ctx) => (typeof ctx.parsed === 'object' && ctx.parsed !== null ? ctx.parsed.y : ctx.parsed);

export const moneyTooltip = {
  callbacks: {
    label: (ctx) => ` ${ctx.dataset.label ? `${ctx.dataset.label}: ` : `${ctx.label}: `}${clp(valueOf(ctx))}`,
  },
};

export const moneyScale = (extra = {}) => ({
  grid: { color: COLORS.grid, drawTicks: false },
  border: { display: false },
  ticks: { callback: (v) => clpCompact(v), padding: 8, maxTicksLimit: 6 },
  ...extra,
});

export const catScale = (extra = {}) => ({
  grid: { display: false },
  border: { display: false },
  ticks: { padding: 6, maxRotation: 0, autoSkipPadding: 14 },
  ...extra,
});

/** Doughnut de totales por tag (usado en "Gastos por tag" del Dashboard y de Tags). */
export function tagDoughnutConfig(pt) {
  return {
    type: 'doughnut',
    data: {
      labels: pt.map((x) => x.tag?.nombre || 'Sin tag'),
      datasets: [{
        data: pt.map((x) => x.total),
        backgroundColor: pt.map((x) => hexToRgba(x.tag?.color || '#6b7080', 0.75)),
        hoverBackgroundColor: pt.map((x) => x.tag?.color || '#6b7080'),
        borderColor: 'rgba(10, 12, 20, 0.9)',
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: { cutout: '70%', plugins: { tooltip: moneyTooltip, legend: { display: true, position: 'right' } } },
  };
}

/** Barras horizontales para rankings (por tag, etc). fmt de eje y de tooltip configurables. */
export function rankingConfig(labels, values, colors, { tickFmt = clpCompact, tooltipFmt = clp } = {}) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, hoverBackgroundColor: colors, borderRadius: 5, maxBarThickness: 20 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { tooltip: { callbacks: { label: (ctx) => ` ${tooltipFmt(ctx.parsed.x)}` } } },
      scales: {
        x: { grid: { color: COLORS.grid, drawTicks: false }, border: { display: false }, ticks: { callback: (v) => tickFmt(v), padding: 8, maxTicksLimit: 5 } },
        y: { grid: { display: false }, border: { display: false }, ticks: { padding: 6 } },
      },
    },
  };
}

/** Gráfico de línea de una serie temporal (neto o ahorro). */
export function lineConfig(labels, data, color, label) {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: gradientFill(color),
        borderWidth: 1.8,
        fill: true,
        tension: 0.35,
        pointRadius: data.length <= 1 ? 3 : 0,
        pointHoverRadius: 4,
        pointBackgroundColor: color,
      }],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: moneyTooltip },
      scales: { x: catScale({ ticks: { maxTicksLimit: 7, maxRotation: 0 } }), y: moneyScale() },
    },
  };
}
