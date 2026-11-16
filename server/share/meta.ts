import { REGIONS, regionAt, type Region } from '../../src/regions';
import { readSharedView, sharedViewSearch } from '../../src/share';
import { prettyAddress } from '../../src/ui/dom';
import { SHARE_IMAGE, SHARE_IMAGE_ALT, SITE_URL } from '../../src/site';

/**
 * The link preview for a shared street. "Copy link" writes the address and the view into the
 * query string (src/share.ts); this turns that into the page title, description and picture a
 * chat app or social site shows, so a link to 117 West St says 117 West St.
 *
 * The address comes from whoever wrote the URL, so it's cut to the first part of an address,
 * stripped to the characters addresses use and capped, and every value is rebuilt from the
 * parsed view rather than copied from the request.
 */

export interface ShareMeta {
  title: string;
  description: string;
  /** The share link as the app would write it, without anything else the URL carried. */
  url: string;
  image: string;
  imageAlt: string;
}

export const STREET_MAX = 60;

/**
 * "117 West Street, New York, NY 10007" becomes "117 West St": the part before the first comma,
 * with only letters, digits, spaces and . ' # / - kept, at most STREET_MAX characters, cut at a
 * word. Null if nothing is left.
 */
export const streetLine = (address: string): string | null => {
  const first = address.split(',')[0] ?? '';
  const kept = first
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} .'#/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[\p{L}\p{N}]/u.test(kept)) return null;
  const capped =
    kept.length <= STREET_MAX
      ? kept
      : kept.slice(0, STREET_MAX).replace(/\s+\S*$/, '') || kept.slice(0, STREET_MAX);
  return prettyAddress(capped);
};

/** The city a share link is in: where its camera points, else what the address names. */
export const shareRegion = (lngLat: [number, number] | null, address: string): Region | null => {
  if (lngLat) return regionAt(lngLat);
  return REGIONS.find((region) => region.says?.test(address)) ?? null;
};

/** Five decimals is about a meter: close enough to draw the street, coarse enough to cache. */
const coordinate = (value: number) => value.toFixed(5);

/** The per-street picture for a spot, keyed so the same street always asks for the same URL. */
export const streetImageUrl = (lngLat: [number, number], street: string) =>
  `${SITE_URL}/og/street?at=${coordinate(lngLat[1])},${coordinate(lngLat[0])}&q=${encodeURIComponent(street)}`;

/** Null when the URL names no address: the page keeps its own tags. */
export const shareMeta = (search: string): ShareMeta | null => {
  const view = readSharedView(search);
  if (!view.address) return null;
  const street = streetLine(view.address);
  if (!street) return null;
  const lngLat = view.camera?.lngLat ?? null;
  const region = shareRegion(lngLat, view.address);
  const place = region ? `${street}, ${region.name}` : street;
  return {
    title: `${place}: what's under the street`,
    description: `The water, sewer, gas, electric and telecom lines likely under ${place}, mapped from public records. Research, not a utility locate: call 811 before you dig.`,
    url: `${SITE_URL}/${sharedViewSearch(view)}`,
    image: lngLat && region ? streetImageUrl(lngLat, street) : SHARE_IMAGE,
    imageAlt:
      lngLat && region
        ? `A plan of ${place} with the utility lines under it in locator paint colors.`
        : SHARE_IMAGE_ALT,
  };
};
