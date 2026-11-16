import { z } from 'zod';
import { UTILITY_KINDS, type UtilityKind } from './utilities';
import type { Vec2 } from './scene/local';

/**
 * What a shared link reopens: the address, the camera and the open card, in the query string.
 * Positions are in longitude and latitude, not local meters, so a link still lands on the same
 * spot if the geocoder later returns the address a few meters off.
 */

export interface SharedCamera {
  lngLat: [number, number];
  zoom: number;
  /** Degrees from level: 90 is straight down, below 0 is under the street. */
  tilt: number;
  bearing: number;
}

export type SharedPick =
  | { kind: 'utility'; utility: UtilityKind }
  | { kind: 'about' }
  /** The feedback form, so other pages can link straight to it: /?sel=feedback. */
  | { kind: 'feedback' }
  /**
   * A picked feature. Refs are numbered in load order, which changes as records update, so the
   * link names the kind of thing and where it is instead.
   */
  | { kind: 'item'; family: string; lngLat: [number, number] };

export interface SharedView {
  address: string | null;
  camera: SharedCamera | null;
  pick: SharedPick | null;
  /** The year digs are compared from, or null for the whole record. */
  since: number | null;
}

const finite = z.coerce.number().finite();

const cameraSchema = z
  .tuple([
    finite.min(-90).max(90),
    finite.min(-180).max(180),
    finite.min(0).max(12),
    finite.min(-90).max(90),
    finite,
  ])
  .transform(([lat, lng, zoom, tilt, bearing]): SharedCamera => ({
    lngLat: [lng, lat],
    zoom,
    tilt,
    bearing,
  }));

const pointSchema = z
  .tuple([finite.min(-90).max(90), finite.min(-180).max(180)])
  .transform(([lat, lng]): [number, number] => [lng, lat]);

const FAMILY = /^[a-z]+(-[a-z]+)*$/;

const parseCamera = (value: string | null): SharedCamera | null => {
  if (!value) return null;
  const parsed = cameraSchema.safeParse(value.split(','));
  return parsed.success ? parsed.data : null;
};

const parsePick = (value: string | null): SharedPick | null => {
  if (!value) return null;
  if (value === 'about') return { kind: 'about' };
  if (value === 'feedback') return { kind: 'feedback' };
  const [family, where] = value.split(':');
  if (!family || !FAMILY.test(family)) return null;
  if (family === 'utility') {
    const utility = UTILITY_KINDS.find((kind) => kind === where);
    return utility ? { kind: 'utility', utility } : null;
  }
  const point = pointSchema.safeParse(where?.split(',') ?? []);
  return point.success ? { kind: 'item', family, lngLat: point.data } : null;
};

const parseSince = (value: string | null): number | null => {
  const year = z.coerce
    .number()
    .int()
    .min(1900)
    .max(2100)
    .safeParse(value ?? undefined);
  return year.success ? year.data : null;
};

export const ADDRESS_MAX = 200;

export const readSharedView = (search: string): SharedView => {
  const params = new URLSearchParams(search);
  return {
    // Longer than any address; a crafted megabyte of text would only slow the geocoders down.
    address: params.get('q')?.trim().slice(0, ADDRESS_MAX) || null,
    camera: parseCamera(params.get('cam')),
    pick: parsePick(params.get('sel')),
    since: parseSince(params.get('since')),
  };
};

// About 1 cm of latitude; plenty for picking a feature back out.
const degrees = (value: number) => value.toFixed(7).replace(/\.?0+$/, '');
const round = (value: number, places: number) => String(Number(value.toFixed(places)));
const latLng = ([lng, lat]: [number, number]) => `${degrees(lat)},${degrees(lng)}`;

export const sharedViewSearch = (view: SharedView): string => {
  // Commas and colons stay readable; URLSearchParams would escape them.
  const parts: string[] = [];
  if (view.address) parts.push(`q=${encodeURIComponent(view.address)}`);
  if (view.camera) {
    const { lngLat, zoom, tilt, bearing } = view.camera;
    // Bearings past a full turn come from spinning the map; they point the same way.
    const turned = (((bearing % 360) + 540) % 360) - 180;
    parts.push(`cam=${latLng(lngLat)},${round(zoom, 2)},${round(tilt, 1)},${round(turned, 1)}`);
  }
  const pick = view.pick;
  if (pick?.kind === 'about') parts.push('sel=about');
  if (pick?.kind === 'feedback') parts.push('sel=feedback');
  if (pick?.kind === 'utility') parts.push(`sel=utility:${pick.utility}`);
  if (pick?.kind === 'item') parts.push(`sel=${pick.family}:${latLng(pick.lngLat)}`);
  if (view.since !== null) parts.push(`since=${view.since}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

/** `asset-12` and `water-service-3` become `asset` and `water-service`. */
export const refFamily = (ref: string) => ref.replace(/-\d+$/, '');

/** The ref of that family closest to the shared spot, if one is within `toleranceM`. */
export const findPicked = (
  family: string,
  at: Vec2,
  candidates: Iterable<[string, { center: Vec2 }]>,
  toleranceM = 3,
): string | null => {
  let best: string | null = null;
  let bestDistance = toleranceM;
  for (const [ref, { center }] of candidates) {
    if (refFamily(ref) !== family) continue;
    const distance = Math.hypot(center[0] - at[0], center[1] - at[1]);
    if (distance <= bestDistance) {
      best = ref;
      bestDistance = distance;
    }
  }
  return best;
};
