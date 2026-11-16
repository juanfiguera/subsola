import { inPolygon } from './geo';
import { closestOnPolyline, distance2, type Vec2 } from './scene/local';
import { streetsAgree } from './sources/streets';

/**
 * Where a lot meets its street, for an address point set far back from it. The lot report
 * measures from the lot line, which a water service usually places. Without one it fell back
 * to the address point itself, and some sit deep inside big lots: Denver's 1437 Bannock St, the
 * City and County Building, is 108 m from Bannock St, so nothing on that street was in reach and
 * the report came back empty. There the lot line is taken from the building's face toward its
 * named street, or failing a building, from the street itself.
 */

/** How a lot report placed its lot line, so it can say so. */
export type LotLineSource = 'service' | 'building' | 'street' | 'address';

export interface LotLine {
  point: Vec2;
  from: LotLineSource;
  /** The named street, as the city labels it, when the line was placed from it. */
  street?: string;
}

/** An address point farther than this from its named street is set back: look for the frontage. */
export const SET_BACK_M = 35;
// A building this close to the address point, when none contains it, is taken as the address's.
const BUILDING_REACH_M = 30;
// Without a building, the lot line is this far in from the centerline: half a street and a
// sidewalk, about where a right of way ends.
const ROW_HALF_WIDTH_M = 12;
// Building faces are checked this often along each edge.
const FACE_STEP_M = 1;

export interface NamedStreetPaths {
  label: string;
  paths: Vec2[][];
}

/** "1437 BANNOCK ST" → "BANNOCK ST"; null when the line doesn't start with a house number. */
export const streetOfAddress = (line: string): string | null =>
  line.trim().match(/^\d+[A-Z]?(?:-\d+)?\s+(.+)$/i)?.[1] ?? null;

const distanceToPaths = (paths: Vec2[][], point: Vec2) =>
  Math.min(...paths.map((path) => closestOnPolyline(path, point).distance));

/** Points every meter or so around a ring, corners included. */
const aroundRing = (ring: Vec2[]): Vec2[] =>
  ring.slice(1).flatMap((b, i) => {
    const a = ring[i]!;
    const steps = Math.max(1, Math.ceil(distance2(a, b) / FACE_STEP_M));
    return Array.from({ length: steps }, (_, k): Vec2 => [
      a[0] + ((b[0] - a[0]) * k) / steps,
      a[1] + ((b[1] - a[1]) * k) / steps,
    ]);
  });

/**
 * The lot line for an address at `origin`, when its point sits more than `SET_BACK_M`
 * from the street it's numbered on: the point of its building (the one it falls in, else the
 * nearest close by) closest to that street, or else a right of way's half width in from the
 * street. Null when the point is close to its street already, or the street isn't loaded.
 */
export const frontageLotLine = (
  addressLine: string,
  streets: NamedStreetPaths[],
  buildings: Vec2[][],
  origin: Vec2 = [0, 0],
): LotLine | null => {
  const name = streetOfAddress(addressLine);
  if (!name) return null;
  const named = streets.filter((street) => streetsAgree(name, street.label));
  const paths = named.flatMap((street) => street.paths).filter((path) => path.length > 1);
  if (!paths.length) return null;
  const setBack = distanceToPaths(paths, origin);
  if (setBack <= SET_BACK_M) return null;
  const label = named[0]!.label;

  const building =
    buildings.find((ring) => ring.length > 3 && inPolygon(origin, [ring])) ??
    buildings
      .filter((ring) => ring.length > 3)
      .map((ring) => ({ ring, distance: distanceToPaths([ring], origin) }))
      .filter(({ distance }) => distance <= BUILDING_REACH_M)
      .sort((a, b) => a.distance - b.distance)[0]?.ring;
  if (building) {
    const face = aroundRing(building)
      .map((point) => ({ point, distance: distanceToPaths(paths, point) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (face) return { point: face.point, from: 'building', street: label };
  }

  const nearest = paths
    .map((path) => closestOnPolyline(path, origin))
    .sort((a, b) => a.distance - b.distance)[0]!;
  const toward: Vec2 = [
    (origin[0] - nearest.point[0]) / setBack,
    (origin[1] - nearest.point[1]) / setBack,
  ];
  return {
    point: [
      nearest.point[0] + toward[0] * ROW_HALF_WIDTH_M,
      nearest.point[1] + toward[1] * ROW_HALF_WIDTH_M,
    ],
    from: 'street',
    street: label,
  };
};

/** How the report placed the lot line, in a sentence, when it wasn't the usual way. */
export const lotLineNote = (lotLine: LotLine): string | null => {
  if (lotLine.from === 'building')
    return `The address point sits well back from ${streetLabel(lotLine.street)}, so distances are measured from the front of the building on that street.`;
  if (lotLine.from === 'street')
    return `The address point sits well back from ${streetLabel(lotLine.street)}, so distances are measured from about where the lot meets it, a half street's width in from its center line.`;
  return null;
};

// "N BANNOCK ST" reads better in a sentence as "N Bannock St".
const streetLabel = (label: string | undefined) =>
  label
    ? label
        .toLowerCase()
        .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
        .replace(/\b(Ne|Nw|Se|Sw)\b/g, (quadrant) => quadrant.toUpperCase())
    : 'its street';
