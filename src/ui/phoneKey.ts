import { RECYCLED_WATER, UTILITY_STYLES, type UtilityKind } from '../utilities';
import { escapeHtml } from './dom';
import { DEFAULT_UTILITIES } from './explainer';

/**
 * On a phone the layer list folds away, so nothing on screen says what the colors mean. This is
 * the short version: the utilities on this street and solid against dashed, tucked into the
 * top corner away from the street, with a way to the full explainer and a close button that is
 * remembered (subsola:phone-key).
 */

export const PHONE_KEY_STORAGE = 'subsola:phone-key';

export const phoneKeyHtml = (utilities: UtilityKind[], recycled: boolean) => {
  const shown = (utilities.length ? utilities : DEFAULT_UTILITIES).filter(
    (utility) => utility !== 'capital',
  );
  const items = [
    ...shown.map((utility) => [UTILITY_STYLES[utility].label, UTILITY_STYLES[utility].color]),
    ...(recycled ? [[RECYCLED_WATER.label, RECYCLED_WATER.color]] : []),
  ] as [string, string][];
  return `
    <ul class="phone-key-colors">${items
      .map(
        ([label, color]) =>
          `<li><span class="phone-key-swatch" style="--accent:${color}" aria-hidden="true"></span>${escapeHtml(label)}</li>`,
      )
      .join('')}</ul>
    <div class="phone-key-lines">
      <button class="phone-key-more" data-action="explainer">More</button>
    </div>
    <button class="phone-key-close" data-action="close-key" aria-label="Hide the color key">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/></svg>
    </button>`;
};

export const keyDismissed = () => {
  try {
    return localStorage.getItem(PHONE_KEY_STORAGE) === 'hidden';
  } catch {
    return false;
  }
};

export const rememberKeyDismissed = () => {
  try {
    localStorage.setItem(PHONE_KEY_STORAGE, 'hidden');
  } catch (error) {
    console.warn('[subsola] could not remember the color key was closed', error);
  }
};
