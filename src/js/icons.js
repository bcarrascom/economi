// ÍCONOS PROVISORIOS
// ------------------------------------------------------------------
// Reemplaza cualquiera de estos por tu propio SVG. Acepta dos formatos:
//   1) Solo el contenido interno (paths) para un viewBox 0 0 24 24, con trazo.
//   2) Un <svg ...>...</svg> completo (se usa tal cual; se le agrega class="ico").
// Usa `currentColor` en tus SVG para que hereden el color del tema.
// ------------------------------------------------------------------

export const ICONS = {
  dashboard: '<rect x="3.5" y="3.5" width="7" height="9" rx="2"/><rect x="13.5" y="3.5" width="7" height="5" rx="2"/><rect x="13.5" y="11.5" width="7" height="9" rx="2"/><rect x="3.5" y="15.5" width="7" height="5" rx="2"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  cart: '<path d="M3 4h2.2l2.1 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L20.5 8H6.1"/><circle cx="9.5" cy="19.5" r="1.2"/><circle cx="17" cy="19.5" r="1.2"/>',
  tag: '<path d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.4"/>',
  settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  chevronUp: '<path d="M6 14.5l6-6 6 6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  chevronLeft: '<path d="M14.5 6l-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  hash: '<path d="M5 9h14M5 15h14M10.5 4L8.5 20M15.5 4l-2 16"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2.5h7.2a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  bag: '<path d="M5.5 8h13l-1 12h-11z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  income: '<path d="M17 7L7 17M7 9.5V17h7.5"/>',
  expense: '<path d="M7 17L17 7M9.5 7H17v7.5"/>',
  invest: '<path d="M3.5 17l5.5-5.5 4 4 7.5-7.5"/><path d="M15 8h5.5v5.5"/>',
  piggy: '<path d="M18.5 10.5c-.6-3-3.4-5-6.9-5-4 0-7.1 2.7-7.1 6 0 1.8.9 3.4 2.4 4.5V19h2.8v-1.5h3.8V19h2.8v-2.4c.9-.6 1.6-1.4 2-2.3h1.2v-3.8z"/><path d="M8 8.5c.9-.5 2-.8 3.1-.8"/><circle cx="15.5" cy="10.5" r=".6" fill="currentColor"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="13.5" rx="3"/><path d="M3.5 10h17"/><circle cx="16.5" cy="14.8" r="1" fill="currentColor"/>',
  flag: '<path d="M5.5 21V4.5M5.5 4.5h11l-2 4 2 4h-11"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 17v.01"/>',
  sparkle: '<path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z"/>',
  filter: '<path d="M4 5.5h16l-6.2 7.3V19l-3.6-1.8v-4.4z"/>',
  sort: '<path d="M8 5v14M4.5 15.5L8 19l3.5-3.5M16 19V5M12.5 8.5L16 5l3.5 3.5"/>',
  logo: '<path d="M4 17.5l4.5-5 3.5 3 8-9.5"/><path d="M15 6h5v5"/><path d="M4 21h16" opacity=".4"/>',
  debt: '<path d="M4 8h14M14 4l4 4-4 4"/><path d="M20 16H6M10 12l-4 4 4 4"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  lockClosed: '<rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="15.3" r="1.3" fill="currentColor"/>',
  lockOpen: '<rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8 11V7a4 4 0 0 1 7.5-2.4"/><circle cx="12" cy="15.3" r="1.3" fill="currentColor"/>',
  heart: '<path d="M12 20s-7.2-4.4-9.5-8.6C.9 8 2.4 4.3 6 3.8a5 5 0 0 1 6 2.1 5 5 0 0 1 6-2.1c3.6.5 5.1 4.2 3.5 7.6C19.2 15.6 12 20 12 20z"/>',
};

export function icon(name, cls = '') {
  const s = ICONS[name] || ICONS.sparkle;
  if (s.trim().startsWith('<svg')) {
    return s.replace('<svg', `<svg class="ico ${cls}" aria-hidden="true"`);
  }
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${s}</svg>`;
}
