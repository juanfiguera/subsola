import { z } from 'zod';
import type { Position } from 'geojson';
import { columnsOf, fetchSocrata, pointSchema, withinCircle } from './socrata';
import { SOURCES, type SourceKey } from './catalog';
import type { AssetFeature, SignalInfo } from './assets';

/**
 * NYC DOT doesn't publish a list of its signalized intersections. It does publish the ones with
 * pedestrian features (leading intervals, accessible push buttons, all-way walk phases), and each
 * of those points is a signal, so together with OpenStreetMap they cover most of the city.
 */
export const lpiSignalSchema = z.object({
  the_geom: pointSchema,
  main_street: z.string().optional(),
  cross_stree: z.string().optional(),
  install_da: z.string().optional(),
});

export const accessibleSignalSchema = z.object({
  the_geom: pointSchema,
  location: z.string().optional(),
  date_insta: z.string().optional(),
});

export const exclusiveSignalSchema = z.object({
  the_geom: pointSchema,
  main_stree: z.string().optional(),
  cross_stre: z.string().optional(),
  barnes_dan: z.string().optional(),
  modified_b: z.string().optional(),
  mid_block_: z.string().optional(),
});

export interface SignalRows {
  signalsLpi: z.infer<typeof lpiSignalSchema>[];
  signalsAccessible: z.infer<typeof accessibleSignalSchema>[];
  signalsExclusive: z.infer<typeof exclusiveSignalSchema>[];
}

// One intersection's signal points from different datasets land within a few meters of each
// other; OpenStreetMap often maps a node per approach, up to about 25 m out on wide avenues.
const SAME_SIGNAL_M = 30;

// Both cities' transportation departments (NYC DOT, DDOT) run their signals and keep the routes
// to themselves.
const IMPLIES =
  'Signal cable in conduit under the street to each pole, with pull boxes near the corners. The transportation department does not publish the routes.';

const sinceDate = (iso: string | undefined) => {
  const date =
    iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(`${iso.slice(0, 10)}T12:00:00`) : null;
  return date
    ? `Since ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : 'Yes';
};

const crossing = (main?: string, cross?: string) =>
  main && cross ? `${main.trim()} & ${cross.trim()}` : undefined;

const exclusiveKind = (row: z.infer<typeof exclusiveSignalSchema>) =>
  row.barnes_dan
    ? 'Barnes Dance (all-way walk)'
    : row.modified_b
      ? 'Modified Barnes Dance'
      : row.mid_block_
        ? 'Mid-block crossing'
        : 'Yes';

export const signalFacts = (signal: SignalInfo): [string, string][] => [
  ...(signal.name ? [['Intersection', signal.name] as [string, string]] : []),
  ...signal.features,
  ...(signal.osmNodes.length
    ? [
        [
          'OpenStreetMap',
          signal.osmNodes.length === 1
            ? `Node ${signal.osmNodes[0]}`
            : `${signal.osmNodes.length} nodes`,
        ] as [string, string],
      ]
    : []),
  ['Implies', IMPLIES],
];

export const signalAsset = (coordinates: Position, signal: SignalInfo): AssetFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties: {
    kind: 'traffic-signal',
    // Signals run on DOT's own power feed, like the street lamps.
    utility: 'electric',
    title: 'Traffic signal',
    facts: signalFacts(signal),
    sourceKey: signal.sources[0] ?? 'osm',
    signal,
  },
});

const metersBetween = ([lng1, lat1]: Position, [lng2, lat2]: Position) => {
  const dx = (lng2! - lng1!) * 111_320 * Math.cos((lat1! * Math.PI) / 180);
  const dy = (lat2! - lat1!) * 110_574;
  return Math.hypot(dx, dy);
};

const unique = <T>(items: T[], keyOf: (item: T) => string = String) => [
  ...new Map(items.map((item) => [keyOf(item), item])).values(),
];

const combine = (a: AssetFeature, b: AssetFeature): AssetFeature => {
  const first = a.properties.signal!;
  const second = b.properties.signal!;
  // DOT points sit on the intersection itself; OSM nodes are often out on one approach.
  const position =
    first.sources.length || !second.sources.length
      ? a.geometry.coordinates
      : b.geometry.coordinates;
  return signalAsset(position, {
    name: first.name ?? second.name,
    features: unique([...first.features, ...second.features], ([label]) => label),
    sources: unique([...first.sources, ...second.sources]),
    osmNodes: unique([...first.osmNodes, ...second.osmNodes]),
  });
};

/** Signals already loaded plus new ones, with points at the same intersection made one. */
export const mergeSignals = (existing: AssetFeature[], incoming: AssetFeature[]) => {
  const merged = [...existing];
  for (const signal of incoming) {
    const same = merged.findIndex(
      (other) =>
        metersBetween(other.geometry.coordinates, signal.geometry.coordinates) <= SAME_SIGNAL_M,
    );
    if (same === -1) merged.push(signal);
    else merged[same] = combine(merged[same]!, signal);
  }
  return merged;
};

const dotSignal = (
  coordinates: Position,
  source: SourceKey,
  name: string | undefined,
  feature: [string, string],
) => signalAsset(coordinates, { name, features: [feature], sources: [source], osmNodes: [] });

export const signalsFromRows = ({ signalsLpi, signalsAccessible, signalsExclusive }: SignalRows) =>
  mergeSignals(
    [],
    [
      ...signalsLpi.map((row) =>
        dotSignal(
          row.the_geom.coordinates,
          'signalsLpi',
          crossing(row.main_street, row.cross_stree),
          ['Leading pedestrian interval', sinceDate(row.install_da)],
        ),
      ),
      ...signalsAccessible.map((row) =>
        dotSignal(
          row.the_geom.coordinates,
          'signalsAccessible',
          row.location?.replace(/\s+/g, ' ').replace(' and ', ' & '),
          ['Accessible pedestrian signal', sinceDate(row.date_insta)],
        ),
      ),
      ...signalsExclusive.map((row) =>
        dotSignal(
          row.the_geom.coordinates,
          'signalsExclusive',
          crossing(row.main_stree, row.cross_stre),
          ['Exclusive pedestrian phase', exclusiveKind(row)],
        ),
      ),
    ],
  );

export const fetchSignalRows = async (
  [lng, lat]: Position,
  radius: number,
  signal?: AbortSignal,
): Promise<SignalRows> => {
  const where = withinCircle('the_geom', lat!, lng!, radius);
  const [signalsLpi, signalsAccessible, signalsExclusive] = await Promise.all([
    fetchSocrata(
      SOURCES.signalsLpi.id,
      { where, select: columnsOf(lpiSignalSchema) },
      lpiSignalSchema,
      signal,
    ),
    fetchSocrata(
      SOURCES.signalsAccessible.id,
      { where, select: columnsOf(accessibleSignalSchema) },
      accessibleSignalSchema,
      signal,
    ),
    fetchSocrata(
      SOURCES.signalsExclusive.id,
      { where, select: columnsOf(exclusiveSignalSchema) },
      exclusiveSignalSchema,
      signal,
    ),
  ]);
  return { signalsLpi, signalsAccessible, signalsExclusive };
};
