/**
 * On a phone the card is a bottom sheet: `peek` shows the title, `half` the details and `full`
 * everything under the search bar. The heights live in CSS (body[data-sheet]); this sets the
 * state, follows a drag on the handle and snaps to the nearest height when it's let go. Its
 * height goes out as --sheet so the controls floating above it can follow.
 */
export type SheetState = 'peek' | 'half' | 'full';

// Less movement than this is a tap on the handle, not a drag.
const TAP_PX = 6;

export const createSheet = (sheet: HTMLElement, handle: HTMLElement, phone: MediaQueryList) => {
  let state: SheetState = 'peek';

  const publishHeight = () =>
    document.documentElement.style.setProperty(
      '--sheet',
      `${phone.matches ? sheet.getBoundingClientRect().height : 0}px`,
    );

  const apply = () => {
    if (phone.matches) document.body.dataset.sheet = state;
    else delete document.body.dataset.sheet;
    handle.setAttribute(
      'aria-label',
      state === 'full' ? 'Show less of the card' : 'Show more of the card',
    );
    publishHeight();
  };

  const set = (next: SheetState) => {
    state = next;
    apply();
  };

  /** The height each state settles at, read from the CSS by trying it on. */
  const heightOf = (candidate: SheetState) => {
    document.body.dataset.sheet = candidate;
    const height = sheet.getBoundingClientRect().height;
    document.body.dataset.sheet = state;
    return height;
  };

  handle.addEventListener('pointerdown', (down) => {
    if (!phone.matches) return;
    handle.setPointerCapture(down.pointerId);
    const startY = down.clientY;
    const startHeight = sheet.getBoundingClientRect().height;
    // Without the height animation first, trying a state on would read a height mid-animation.
    sheet.classList.add('is-dragging');
    const heights = (['peek', 'half', 'full'] as const).map((s) => [s, heightOf(s)] as const);
    const lowest = Math.min(...heights.map(([, height]) => height));
    const highest = Math.max(...heights.map(([, height]) => height));

    const move = (event: PointerEvent) => {
      const height = Math.min(highest, Math.max(lowest, startHeight + startY - event.clientY));
      sheet.style.height = `${height}px`;
      publishHeight();
    };
    const end = (event: PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      sheet.classList.remove('is-dragging');
      const height = sheet.getBoundingClientRect().height;
      sheet.style.height = '';
      if (Math.abs(event.clientY - startY) < TAP_PX) {
        set(state === 'peek' ? 'half' : 'peek');
        return;
      }
      const [nearest] = heights.reduce((best, entry) =>
        Math.abs(entry[1] - height) < Math.abs(best[1] - height) ? entry : best,
      );
      set(nearest);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });

  // Enter or Space on the handle, which fires a click with no pointer behind it. A tap's own
  // click comes with a detail of 1 and was handled on pointerup.
  handle.addEventListener('click', (event) => {
    if (!phone.matches || event.detail !== 0) return;
    set(state === 'peek' ? 'half' : 'peek');
  });

  // The height animates between states and changes with the window, so keep --sheet current.
  new ResizeObserver(publishHeight).observe(sheet);
  phone.addEventListener('change', apply);
  apply();

  return { set, state: () => state };
};
