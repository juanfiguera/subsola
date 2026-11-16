// @ts-check
// Sets the color theme before the first paint, so a dark page never flashes light. Loaded as a
// plain blocking script in <head>: a module or a bundled file would run after the first paint, and
// an inline script would need a hash in the security policy. See docs/dark-mode.md.
(() => {
  const KEY = 'subsola:theme';
  // The ground of each theme, for the browser's own chrome (the address bar on a phone).
  const BARS = { light: '#e6e9ee', dark: '#14181e' };
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  /** @type {Set<(theme: 'light' | 'dark', choice: 'light' | 'dark' | 'system') => void>} */
  const listeners = new Set();

  /** @returns {'light' | 'dark' | 'system'} */
  const stored = () => {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch (error) {
      // Storage can be blocked outright; the system setting is the right answer then.
      console.warn('[subsola] theme choice unreadable, following the system', error);
      return 'system';
    }
  };

  let choice = stored();
  /** @returns {'light' | 'dark'} */
  const resolve = () =>
    choice === 'system' ? (media && media.matches ? 'dark' : 'light') : choice;

  const apply = () => {
    const theme = resolve();
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-theme-choice', choice);
    const bar = document.querySelector('meta[name="theme-color"]');
    if (bar) bar.setAttribute('content', BARS[theme]);
    listeners.forEach((listener) => listener(theme, choice));
  };

  /** @param {'light' | 'dark' | 'system'} next */
  const set = (next) => {
    choice = next;
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch (error) {
      console.warn('[subsola] theme choice not saved; it lasts until the page closes', error);
    }
    apply();
  };

  const followSystem = () => {
    if (choice === 'system') apply();
  };
  if (media && media.addEventListener) media.addEventListener('change', followSystem);
  // A choice made in another tab.
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return;
    choice = stored();
    apply();
  });
  // The theme-color tag may come after this script in <head>.
  document.addEventListener('DOMContentLoaded', apply);

  apply();

  /** @type {Window & { subsolaTheme?: unknown }} */ (window).subsolaTheme = {
    get choice() {
      return choice;
    },
    get theme() {
      return resolve();
    },
    set,
    /** @param {(theme: 'light' | 'dark', choice: 'light' | 'dark' | 'system') => void} listener */
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();
