/**
 * Line icons for the About card and the insights page, drawn on the /mcp page's 24px grid. The
 * stroke is set on each icon rather than left to a stylesheet, so they draw the same on the map
 * (whose sheet styles every svg) and on insights (whose sheet styles none).
 */

const icon = (paths: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  permit: icon('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>'),
  carry: icon('<circle cx="5" cy="12" r="2"/><path d="M7 12h12M15 8l4 4-4 4"/>'),
  house: icon('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  depth: icon('<path d="M4 4h16M4 20h16"/><path d="M12 7v9M8.5 12.5 12 16l3.5-3.5"/>'),
  tag: icon('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
  warn: icon('<path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18h.01"/>'),
  chart: icon('<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>'),
  chat: icon(
    '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 3v-3H6a2 2 0 0 1-2-2Z"/>',
  ),
  key: icon('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>'),
  lock: icon(
    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  ),
  mail: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>'),
  pencil: icon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  check: icon('<path d="M20 6 9 17l-5-5"/>'),
  alert: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>'),
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  pin: icon(
    '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  ),
  file: icon('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>'),
  arrow: icon('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  repeat: icon(
    '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  ),
  swap: icon('<path d="M7 4v13M3 13l4 4 4-4"/><path d="M17 20V7M13 11l4-4 4 4"/>'),
  crew: icon('<path d="M4 15a8 8 0 0 1 16 0"/><path d="M2 15h20v2H2zM10 7V4h4v3"/>'),
  pipes: icon(
    '<rect x="3" y="5" width="18" height="5" rx="2.5"/><rect x="3" y="14" width="18" height="5" rx="2.5"/>',
  ),
  drop: icon('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>'),
  book: icon('<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19V5M8 7h8"/>'),
};

export type IconName = keyof typeof ICONS;

export const isIconName = (name: string): name is IconName => Object.hasOwn(ICONS, name);
