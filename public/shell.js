// @ts-check
// The script every page outside the map shares (src/pages/shell.ts): it turns on the theme switch
// in the top bar and marks the section being read in the "On this page" nav. A plain same-origin
// file, like theme.js, so the generated pages' `script-src 'self'` allows it and /mcp loads it
// under its nonce. Without it the switch stays hidden and the nav is plain links.
(() => {
  /** @typedef {{ theme: 'light' | 'dark', set: (choice: 'light' | 'dark' | 'system') => void, subscribe: (listener: (theme: 'light' | 'dark') => void) => unknown }} Theme */
  const theme = /** @type {Window & { subsolaTheme?: Theme }} */ (window).subsolaTheme;

  // theme.js owns the choice and its storage; without it a switch would do nothing, so it stays
  // hidden rather than becoming a dead button.
  const wireSwitch = (/** @type {HTMLButtonElement} */ button) => {
    if (!theme) return;
    const show = (/** @type {'light' | 'dark'} */ current) => {
      button.setAttribute('aria-checked', String(current === 'dark'));
      button.title = current === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    };
    button.addEventListener('click', () => theme.set(theme.theme === 'dark' ? 'light' : 'dark'));
    theme.subscribe(show);
    show(theme.theme);
    button.hidden = false;
  };

  /** How far below the top of the window a section's top must pass to count as being read. */
  const READING_LINE = 140;

  const watchSections = (/** @type {HTMLElement} */ nav) => {
    const links = /** @type {HTMLAnchorElement[]} */ ([...nav.querySelectorAll('a[href^="#"]')]);
    const sections = links.map((link) => document.getElementById(link.hash.slice(1)));
    const mark = () => {
      let current = 0;
      sections.forEach((section, index) => {
        // A section that isn't laid out yet (insights, before its figures load) hasn't been read.
        if (
          section &&
          section.getClientRects().length &&
          section.getBoundingClientRect().top < READING_LINE
        )
          current = index;
      });
      links.forEach((link, index) => link.setAttribute('aria-current', String(index === current)));
      const active = links[current];
      // On a phone the nav is one row that scrolls sideways; keep the marked link in view.
      if (!active || nav.scrollWidth <= nav.clientWidth) return;
      const left = active.offsetLeft - 16;
      if (left < nav.scrollLeft || left + active.offsetWidth > nav.scrollLeft + nav.clientWidth)
        nav.scrollLeft = left;
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(mark);
    };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    mark();
  };

  document
    .querySelectorAll('.theme-switch')
    .forEach((button) => wireSwitch(/** @type {HTMLButtonElement} */ (button)));
  document
    .querySelectorAll('nav.side')
    .forEach((nav) => watchSections(/** @type {HTMLElement} */ (nav)));
})();
