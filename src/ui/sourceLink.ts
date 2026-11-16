import { escapeHtml } from './dom';

/** A link out to a source. Only https addresses become links; anything else shows as text. */
export const sourceLink = (name: string, url: string) => {
  let safe = false;
  try {
    safe = new URL(url).protocol === 'https:';
  } catch {
    // Not a URL at all.
  }
  return safe
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`
    : escapeHtml(name);
};
