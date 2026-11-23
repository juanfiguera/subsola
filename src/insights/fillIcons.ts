import { ICONS, isIconName } from '../ui/icons';

/**
 * The page's icons, filled into each [data-icon] placeholder. The "On this page" nav is marked by
 * public/shell.js, as on every page with the shared shell.
 */

export const fillIcons = (root: ParentNode) => {
  for (const node of Array.from(root.querySelectorAll<HTMLElement>('[data-icon]'))) {
    const name = node.dataset.icon ?? '';
    if (!isIconName(name)) throw new Error(`No icon named ${name}`);
    node.innerHTML = ICONS[name];
  }
};
