import { ICONS, isIconName } from '../ui/icons';

/**
 * The page's "On this page" nav and its icons, as on the /mcp page. Without this the nav is still
 * plain links; it only marks the section being read.
 */

/** How far below the top of the window a section's top must pass to count as being read. */
const READING_LINE = 140;

/** The last section whose top has passed the reading line, or the first if none has. */
export const currentSection = (tops: number[], line = READING_LINE) =>
  tops.reduce((current, top, index) => (top < line ? index : current), 0);

export const fillIcons = (root: ParentNode) => {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-icon]'))) {
    const name = node.dataset.icon ?? '';
    if (!isIconName(name)) throw new Error(`No icon named ${name}`);
    node.innerHTML = ICONS[name];
  }
};

export const watchSections = (nav: HTMLElement) => {
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  const sections = links.map((link) => document.getElementById(link.hash.slice(1)));
  const mark = () => {
    const current = currentSection(
      sections.map((section) => section?.getBoundingClientRect().top ?? Infinity),
    );
    links.forEach((link, index) => link.setAttribute('aria-current', String(index === current)));
    const active = links[current];
    // On a phone the nav is one row that scrolls sideways; keep the marked link in view.
    if (!active || nav.scrollWidth <= nav.clientWidth) return;
    const left = active.offsetLeft - 16;
    if (left < nav.scrollLeft || left + active.offsetWidth > nav.scrollLeft + nav.clientWidth)
      nav.scrollLeft = left;
  };
  let frame = 0;
  addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(mark);
    },
    { passive: true },
  );
  mark();
};
