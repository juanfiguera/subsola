import { currentTheme, onThemeChange, setThemeChoice, type Theme } from '../theme';

/**
 * The theme switch in the top bar: one click flips light and dark. It follows the system setting
 * until it's first used, then keeps the choice (public/theme.js stores it).
 */

const SUN =
  '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>';
const MOON = '<path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z"/>';

/**
 * The switch's markup. The pages outside the map write it into their HTML (src/pages/shell.ts)
 * hidden, and public/shell.js shows it once it can work, so it's never a dead button.
 */
export const themeSwitchHtml = ({ hidden }: { hidden: boolean }) =>
  `<button type="button" class="theme-switch" role="switch" aria-label="Dark mode"${hidden ? ' hidden' : ''}>
      <svg class="theme-sun" viewBox="0 0 16 16" aria-hidden="true">${SUN}</svg>
      <svg class="theme-moon" viewBox="0 0 16 16" aria-hidden="true">${MOON}</svg>
      <span class="theme-knob" aria-hidden="true"></span>
    </button>`;

export const mountThemeToggle = (container: HTMLElement) => {
  container.classList.add('theme-toggle');
  container.innerHTML = themeSwitchHtml({ hidden: false });
  const button = container.querySelector<HTMLButtonElement>('.theme-switch')!;

  const show = (theme: Theme) => {
    button.setAttribute('aria-checked', String(theme === 'dark'));
    button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  };

  button.addEventListener('click', () =>
    setThemeChoice(currentTheme() === 'dark' ? 'light' : 'dark'),
  );
  show(currentTheme());
  onThemeChange(show);
};
