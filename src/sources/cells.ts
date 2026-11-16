import { z } from 'zod';
import type { Feature, Geometry } from 'geojson';
import type { GridCell } from '../grid';
import type { PermitGroupProperties } from './permits';
import { builtStreetRowSchema, streetsFromRows, type StreetSegment } from './streets';
import { builtMainRowSchema, mainsFromRows, type SurveyedMain } from './mains';
import { builtServiceLotRowSchema, serviceLotsFromRows, type ServiceLot } from './services';
import {
  connectionPermitsFromRows,
  currentConnectionSchema,
  historicConnectionSchema,
  type ConnectionPermit,
} from './connections';
import {
  buildingSchema,
  builtAssetSchema,
  builtAssetsFromRows,
  builtCatchBasinSchema,
  catchBasinsFromRows,
  curbSchema,
  groundFromRows,
  hydrantSchema,
  hydrantsFromRows,
  linkNycFromRows,
  linkSchema,
  osmAssetsFromElements,
  osmElementSchema,
  polygonSchema,
  type AssetFeature,
} from './assets';
import { elevationSchema, spotsFromRows, type Spot } from './elevations';
import { outfallSchema, outfallsFromRows } from './outfalls';
import { conEdStructureSchema, conEdStructuresFromRows } from './conEd';
import { isPaused } from './catalog';
import {
  accessibleSignalSchema,
  exclusiveSignalSchema,
  lpiSignalSchema,
  signalsFromRows,
} from './signals';

/**
 * One cell of the citywide build: the rows the app would have fetched live for that ground, with
 * permits already grouped by block. Written by pipeline/build.ts.
 */
const bundleSchema = z.object({
  v: z.literal(1),
  key: z.string(),
  centerline: z.array(builtStreetRowSchema).default([]),
  curbs: z.array(curbSchema).default([]),
  roadbed: z.array(polygonSchema).default([]),
  sidewalks: z.array(polygonSchema).default([]),
  buildings: z.array(buildingSchema).default([]),
  serviceLines: z.array(builtServiceLotRowSchema).default([]),
  mains: z.array(builtMainRowSchema).default([]),
  connectionPermits: z.array(currentConnectionSchema).default([]),
  connectionPermitsHistoric: z.array(historicConnectionSchema).default([]),
  hydrants: z.array(hydrantSchema).default([]),
  catchBasins: z.array(builtCatchBasinSchema).default([]),
  linkNyc: z.array(linkSchema).default([]),
  signalsLpi: z.array(lpiSignalSchema).default([]),
  signalsAccessible: z.array(accessibleSignalSchema).default([]),
  signalsExclusive: z.array(exclusiveSignalSchema).default([]),
  osm: z.array(osmElementSchema).default([]),
  elevations: z.array(elevationSchema).default([]),
  outfalls: z.array(outfallSchema).default([]),
  conEdStructures: z.array(conEdStructureSchema).default([]),
  assets: z.array(builtAssetSchema).default([]),
  // Built by the same groupPermits the live path uses; only the outline is checked here.
  permitGroups: z
    .array(
      z.object({
        type: z.literal('Feature'),
        geometry: z.object({ type: z.string() }).loose(),
        properties: z.object({ key: z.string(), permits: z.array(z.unknown()) }).loose(),
      }),
    )
    .default([]),
});

export interface CellData {
  streets: StreetSegment[];
  ground: ReturnType<typeof groundFromRows>;
  permitGroups: Feature<Geometry, PermitGroupProperties>[];
  serviceLots: ServiceLot[];
  mains: SurveyedMain[];
  connectionPermits: Map<string, ConnectionPermit[]>;
  assets: AssetFeature[];
  spots: Spot[];
}

const indexSchema = z.object({
  v: z.literal(1),
  builtAt: z.string(),
  /** Whether the cells carry OpenStreetMap's manholes, lamps and signals from Geofabrik's extract. */
  osm: z.boolean().default(false),
  cells: z.record(z.string(), z.number()),
});

export type CellIndex = z.infer<typeof indexSchema>;

const GZIP_MAGIC = [0x1f, 0x8b];

/** Bundles are gzipped files; a host that sends them with Content-Encoding has unzipped them already. */
const readJson = async (res: Response): Promise<unknown> => {
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== GZIP_MAGIC[0] || bytes[1] !== GZIP_MAGIC[1])
    return JSON.parse(new TextDecoder().decode(bytes));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
};

const fetchOk = async (url: string, signal?: AbortSignal) => {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res;
};

export const fetchCellIndex = async (baseUrl: string, signal?: AbortSignal): Promise<CellIndex> =>
  indexSchema.parse(await (await fetchOk(`${baseUrl}/index.json`, signal)).json());

export const fetchCell = async (
  baseUrl: string,
  cell: GridCell,
  signal?: AbortSignal,
): Promise<CellData> => {
  const bundle = bundleSchema.parse(
    await readJson(await fetchOk(`${baseUrl}/${cell.key}.json.gz`, signal)),
  );
  // Cells built before a source was paused still carry it until the next build replaces them.
  return {
    streets: streetsFromRows(bundle.centerline),
    ground: groundFromRows(bundle),
    permitGroups: bundle.permitGroups as unknown as Feature<Geometry, PermitGroupProperties>[],
    serviceLots: serviceLotsFromRows(bundle.serviceLines).filter((lot) => !isPaused(lot.source)),
    mains: mainsFromRows(bundle.mains).filter((main) => !isPaused(main.source)),
    connectionPermits: connectionPermitsFromRows(
      bundle.connectionPermits,
      bundle.connectionPermitsHistoric,
    ),
    assets: [
      ...hydrantsFromRows(bundle.hydrants),
      ...catchBasinsFromRows(bundle.catchBasins),
      ...linkNycFromRows(bundle.linkNyc),
      ...signalsFromRows(bundle),
      ...osmAssetsFromElements(bundle.osm),
      ...outfallsFromRows(bundle.outfalls),
      ...conEdStructuresFromRows(bundle.conEdStructures),
      ...builtAssetsFromRows(bundle.assets),
    ].filter((asset) => !isPaused(asset.properties.sourceKey)),
    spots: spotsFromRows(bundle.elevations),
  };
};
