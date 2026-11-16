/**
 * The color theme, as public/theme.js set it before the first paint. That script owns the choice
 * and its storage (it has to run before any bundle loads); this is the typed side of it for the
 * scene, the city map and the toggle. See docs/dark-mode.md.
 */

export type Theme = 'light' | 'dark';
export type ThemeChoice = Theme | 'system';

export interface ThemeController {
  readonly choice: ThemeChoice;
  readonly theme: Theme;
  set: (choice: ThemeChoice) => void;
  subscribe: (listener: (theme: Theme, choice: ThemeChoice) => void) => () => void;
}

const controller = (): ThemeController | null =>
  typeof window === 'undefined'
    ? null
    : ((window as Window & { subsolaTheme?: ThemeController }).subsolaTheme ?? null);

/** The theme in effect. Light when the boot script didn't run, as it was before dark mode. */
export const currentTheme = (): Theme =>
  controller()?.theme ??
  (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
    ? 'dark'
    : 'light');

export const setThemeChoice = (choice: ThemeChoice) => {
  const theme = controller();
  if (!theme) throw new Error('public/theme.js did not load, so the theme cannot change');
  theme.set(choice);
};

/** Calls `listener` whenever the theme in effect changes; returns a function that stops it. */
export const onThemeChange = (listener: (theme: Theme) => void): (() => void) => {
  let last = currentTheme();
  return (
    controller()?.subscribe((theme) => {
      if (theme === last) return;
      last = theme;
      listener(theme);
    }) ?? (() => undefined)
  );
};
