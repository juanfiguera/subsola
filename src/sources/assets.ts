import { z } from 'zod';
import type { Feature, FeatureCollection, Geometry, Point, Position } from 'geojson';
import {
  columnsOf,
  fetchSocrata,
  intersectsBox,
  multiLineSchema,
  multiPolygonSchema,
  pointSchema,
  withinCircle,
} from './socrata';
import { SOURCES, type SourceKey } from './catalog';
import { UTILITY_KINDS, type UtilityKind } from '../utilities';
import { signalAsset } from './signals';

export type AssetKind =
  | 'hydrant'
  | 'catch-basin'
  | 'linknyc'
  | 'manhole'
  | 'street-lamp'
  | 'traffic-signal'
  | 'outfall'
  | 'electric-structure';

/** What's known about one signalized intersection, kept so later loads can add to it. */
export interface SignalInfo {
  name?: string;
  features: [string, string][];
  sources: SourceKey[];
  osmNodes: number[];
}

export interface AssetProperties {
  kind: AssetKind;
  utility: UtilityKind | null;
  title: string;
  /** Short facts shown in the popup, already formatted. */
  facts: [string, string][];
  sourceKey: SourceKey;
  signal?: SignalInfo;
  /** Catch basins from the build: whether DEP's 2020 MS4 map puts them in a storm sewer area. */
  drainage?: { storm: true; outfall: string; water: string } | { storm: false };
}

export type AssetFeature = Feature<Point, AssetProperties>;

const asset = (coordinates: Position, properties: AssetProperties): AssetFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties,
});

export const hydrantSchema = z.object({ the_geom: pointSchema, unitid: z.string().optional() });

export const fetchHydrants = async ([lng, lat]: Position, radius: number, signal?: AbortSignal) =>
  hydrantsFromRows(
    await fetchSocrata(
      SOURCES.hydrants.id,
      { where: withinCircle('the_geom', lat!, lng!, radius), select: columnsOf(hydrantSchema) },
      hydrantSchema,
      signal,
    ),
  );

export const hydrantsFromRows = (rows: z.infer<typeof hydrantSchema>[]) =>
  rows.map((row) =>
    asset(row.the_geom.coordinates, {
      kind: 'hydrant',
      utility: 'water',
      title: 'Fire hydrant',
      facts: [
        ['DEP unit ID', row.unitid ?? 'n/a'],
        [
          'Implies',
          'A water main nearby, typically under the roadway, with a branch line to the hydrant',
        ],
      ],
      sourceKey: 'hydrants',
    }),
  );

export const catchBasinSchema = z.object({ the_geom: pointSchema, unitid: z.string().optional() });

/**
 * A basin from the citywide build, which adds the separate storm sewer (MS4) outfall it drains
 * to: the outfall's ID, or '' when it's outside every mapped storm area. Live rows don't have it.
 */
export const builtCatchBasinSchema = catchBasinSchema.extend({
  ms4_outfall: z.string().optional(),
  ms4_water: z.string().optional(),
});

export const fetchCatchBasins = async (
  [lng, lat]: Position,
  radius: number,
  signal?: AbortSignal,
) =>
  catchBasinsFromRows(
    await fetchSocrata(
      SOURCES.catchBasins.id,
      { where: withinCircle('the_geom', lat!, lng!, radius), select: columnsOf(catchBasinSchema) },
      catchBasinSchema,
      signal,
    ),
  );

export const catchBasinsFromRows = (rows: z.infer<typeof builtCatchBasinSchema>[]) =>
  rows.map((row) =>
    asset(row.the_geom.coordinates, {
      ...(row.ms4_outfall !== undefined
        ? {
            drainage: row.ms4_outfall
              ? { storm: true, outfall: row.ms4_outfall, water: row.ms4_water ?? '' }
              : { storm: false },
          }
        : {}),
      kind: 'catch-basin',
      utility: 'sewer',
      title: 'Catch basin (storm drain)',
      facts: [
        ['DEP unit ID', row.unitid ?? 'n/a'],
        ['Implies', 'A connection pipe from the curb to the sewer, typically mid-street'],
      ],
      sourceKey: 'catchBasins',
    }),
  );

export const linkSchema = z.object({
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  street_address: z.string().optional(),
  link_installation_status: z.string().optional(),
});

export const fetchLinkNyc = async ([lng, lat]: Position, radius: number, signal?: AbortSignal) =>
  linkNycFromRows(
    await fetchSocrata(
      SOURCES.linkNyc.id,
      { where: withinCircle('location', lat!, lng!, radius), select: columnsOf(linkSchema) },
      linkSchema,
      signal,
    ),
  );

export const linkNycFromRows = (rows: z.infer<typeof linkSchema>[]) =>
  rows
    .filter((row) => row.latitude && row.longitude)
    .map((row) =>
      asset([Number(row.longitude), Number(row.latitude)], {
        kind: 'linknyc',
        utility: 'telecom',
        title: 'LinkNYC kiosk',
        facts: [
          ['Address', row.street_address ?? 'n/a'],
          ['Status', row.link_installation_status ?? 'n/a'],
          ['Implies', 'Fiber and power feeds in conduit under the sidewalk'],
        ],
        sourceKey: 'linkNyc',
      }),
    );

/**
 * One OpenStreetMap node, as the citywide build stores it from Geofabrik's extract. The app never
 * asks OpenStreetMap's volunteer-run Overpass servers, whose policy rules out commercial use; a
 * street outside the build shows no OpenStreetMap nodes.
 */
export const osmElementSchema = z.object({
  id: z.number(),
  lat: z.number(),
  lon: z.number(),
  tags: z.record(z.string(), z.string()).default({}),
});

export type OsmElement = z.infer<typeof osmElementSchema>;

/** The OpenStreetMap nodes the build keeps, as [key, value] tag pairs. */
const OSM_TAGS: [string, string][] = [
  ['man_made', 'manhole'],
  ['highway', 'street_lamp'],
  ['highway', 'traffic_signals'],
];

/** The same nodes as osmium tags-filter expressions, for the citywide build. */
export const OSM_FILTERS = OSM_TAGS.map(([key, value]) => `n/${key}=${value}`);

// Only these tags reach the popup or the utility guess; the rest would bloat every cell.
export const OSM_KEPT_TAGS = ['man_made', 'manhole', 'utility', 'substance', 'operator', 'highway'];

const manholeUtility = (tags: Record<string, string>): UtilityKind | null => {
  const hint = `${tags.manhole ?? ''} ${tags.utility ?? ''} ${tags.substance ?? ''}`.toLowerCase();
  if (/sewer|drain|sewage|storm/.test(hint)) return 'sewer';
  if (/water/.test(hint)) return 'water';
  if (/gas/.test(hint)) return 'gas';
  if (/telecom|telephone|cable|fiber/.test(hint)) return 'telecom';
  if (/power|electric/.test(hint)) return 'electric';
  return null;
};

export const osmAssetsFromElements = (elements: OsmElement[]): AssetFeature[] =>
  elements.map((el) => {
    if (el.tags.highway === 'traffic_signals')
      return signalAsset([el.lon, el.lat], { features: [], sources: [], osmNodes: [el.id] });
    const isManhole = el.tags.man_made === 'manhole';
    const operator = el.tags.operator ?? 'Unknown';
    return asset([el.lon, el.lat], {
      kind: isManhole ? 'manhole' : 'street-lamp',
      utility: isManhole ? manholeUtility(el.tags) : 'electric',
      title: isManhole ? 'Manhole cover' : 'Street lamp',
      facts: isManhole
        ? [
            ['Owner', operator],
            ['Type tag', el.tags.manhole ?? 'not specified'],
            ['OSM node', String(el.id)],
            ['Check', 'Cover lettering identifies the owner (CON ED, DEP SEWER, ECS, etc.)'],
          ]
        : [
            ['Operator', operator],
            ['OSM node', String(el.id)],
            ['Implies', 'Typically fed by underground cable along the curb'],
          ],
      sourceKey: 'osm',
    });
  });

export const curbSchema = z.object({ the_geom: multiLineSchema });
export const polygonSchema = z.object({ the_geom: multiPolygonSchema });
export const buildingSchema = z.object({
  the_geom: multiPolygonSchema,
  height_roof: z.string().optional(),
});

export type Bbox = [number, number, number, number];

const toCollection = (geometries: Geometry[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: geometries.map((geometry) => ({ type: 'Feature', geometry, properties: {} })),
});

export interface GroundRows {
  curbs: z.infer<typeof curbSchema>[];
  roadbed: z.infer<typeof polygonSchema>[];
  sidewalks: z.infer<typeof polygonSchema>[];
  buildings: z.infer<typeof buildingSchema>[];
}

export const groundFromRows = ({ curbs, roadbed, sidewalks, buildings }: GroundRows) => ({
  curbs: toCollection(curbs.map((row) => row.the_geom)),
  roadbed: toCollection(roadbed.map((row) => row.the_geom)),
  sidewalks: toCollection(sidewalks.map((row) => row.the_geom)),
  buildings: {
    type: 'FeatureCollection',
    features: buildings.map((row) => ({
      type: 'Feature',
      geometry: row.the_geom,
      // Roof height is in feet; extrusions want meters.
      properties: { heightM: (Number(row.height_roof) || 0) * 0.3048 },
    })),
  } satisfies FeatureCollection,
});

export const fetchStreetGeometry = async (bbox: Bbox, signal?: AbortSignal) => {
  const where = intersectsBox('the_geom', bbox);
  const [curbs, roadbed, sidewalks, buildings] = await Promise.all([
    fetchSocrata(SOURCES.curbs.id, { where, select: columnsOf(curbSchema) }, curbSchema, signal),
    fetchSocrata(
      SOURCES.roadbed.id,
      { where, select: columnsOf(polygonSchema) },
      polygonSchema,
      signal,
    ),
    fetchSocrata(
      SOURCES.sidewalks.id,
      { where, select: columnsOf(polygonSchema) },
      polygonSchema,
      signal,
    ),
    fetchSocrata(
      SOURCES.buildings.id,
      { where, select: columnsOf(buildingSchema) },
      buildingSchema,
      signal,
    ),
  ]);
  return groundFromRows({ curbs, roadbed, sidewalks, buildings });
};

/**
 * An asset the build has already put in the app's terms, for cities whose layers don't match
 * any NYC dataset: what it is, its utility, the card's title and facts, and where it came from.
 */
export const builtAssetSchema = z.object({
  kind: z.enum([
    'hydrant',
    'catch-basin',
    'linknyc',
    'manhole',
    'street-lamp',
    'traffic-signal',
    'outfall',
    'electric-structure',
  ]),
  utility: z.enum(UTILITY_KINDS).nullable(),
  title: z.string(),
  facts: z.array(z.tuple([z.string(), z.string()])),
  source: z.enum(Object.keys(SOURCES) as [SourceKey, ...SourceKey[]]),
  lngLat: z.tuple([z.number(), z.number()]),
});

export type BuiltAssetRow = z.infer<typeof builtAssetSchema>;

export const builtAssetsFromRows = (rows: BuiltAssetRow[]): AssetFeature[] =>
  rows.map((row) =>
    // Signals carry what merging two records of one intersection needs.
    row.kind === 'traffic-signal'
      ? signalAsset(row.lngLat, {
          name: row.title,
          features: row.facts,
          sources: [row.source],
          osmNodes: [],
        })
      : asset(row.lngLat, {
          kind: row.kind,
          utility: row.utility,
          title: row.title,
          facts: row.facts,
          sourceKey: row.source,
        }),
  );
