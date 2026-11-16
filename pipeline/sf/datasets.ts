import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import { columnsOf } from '../../src/sources/socrata';
import type { DatasetSpec } from '../datasets';
import { esriLine, esriPoint } from '../dc/datasets';

/**
 * San Francisco's layers as downloaded: DataSF rows as Socrata sends them (GeoJSON shapes,
 * numbers as text), and ArcGIS features as attributes plus an Esri JSON shape in degrees. See
 * docs/regions/sf.md.
 */

const text = z.string().nullish();
const lineString = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.array(z.number())),
});
const point = z.object({ type: z.literal('Point'), coordinates: z.array(z.number()) });
const geometry = z.object({ type: z.string(), coordinates: z.array(z.unknown()) });

// Only the work and where it was. The dataset also carries contacts' and staff names and phone
// numbers, which are never asked for.
export const sfPermitSchema = z.object({
  permit_number: z.string(),
  cnn: text,
  streetname: text,
  cross_street_1: text,
  cross_street_2: text,
  permit_type: text,
  agent: text,
  permit_purpose: text,
  approved_date: text,
  status: text,
  permit_start_date: text,
  permit_end_date: text,
});

export const sfStreetSchema = z.object({
  cnn: z.string(),
  streetname: text,
  f_st: text,
  t_st: text,
  active: z.union([z.boolean(), z.string()]).nullish(),
  layer: text,
  line: lineString.nullish(),
});

export const sfNodeSchema = z.object({ cnn: z.string(), the_geom: point.nullish() });
export const sfShapeSchema = z.object({ the_geom: geometry.nullish() });
export const sfBuildingSchema = z.object({ shape: geometry.nullish() });

export const sfSignalSchema = z.object({
  street1: text,
  street2: text,
  type: text,
  shape: point.nullish(),
});

const number = z.number().nullish();

export const sfSewerNodeSchema = z.object({
  GID: z.number(),
  NODE_TYPE: text,
  NODE_USE: text,
  RIM: number,
  INVERT: number,
  MXASSETNUM: text,
  LOCATION_DESC: text,
  geometry: esriPoint,
});

export const sfSewerMainSchema = z.object({
  GID: z.number(),
  PIPE_DIA: text,
  PIPE_MATRL: text,
  PIPE_USE: text,
  INT_YEAR: number,
  OWNER: text,
  geometry: esriLine,
});

// The building's address is the property's, not a person's.
export const sfSideSewerSchema = z.object({
  GID: z.number(),
  ADDRESS: text,
  SIDESEW_DIA: text,
  SIDESEW_MATL: text,
  PIPE_USE: text,
  geometry: esriLine,
});

export const sfHighHydrantSchema = z.object({ hydrant_id: text, geometry: esriPoint });
export const sfLowHydrantSchema = z.object({
  hyd_id: text,
  pr_system: text,
  geometry: esriPoint,
});
export const sfLightSchema = z.object({
  assetnum: text,
  pole_type: text,
  status: text,
  geometry: esriPoint,
});

const BASE = 'https://data.sf.gov/resource';
// Without these there's no SF to build; everything else can miss a night.
const REQUIRED = new Set<SourceKey>(['sfPermits', 'sfStreets', 'sfNodes']);

const dataset = (
  name: SourceKey,
  schema: z.ZodObject,
  { where, pageRows = 50_000 }: { where?: string; pageRows?: number } = {},
): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select: columnsOf(schema),
  where,
  pageRows,
  socrata: BASE,
  optional: !REQUIRED.has(name),
});

const layer = (
  name: SourceKey,
  schema: z.ZodObject,
  orderBy: string,
  { where }: { where?: string } = {},
): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select: Object.keys(schema.shape)
    .filter((field) => field !== 'geometry')
    .join(','),
  pageRows: 2000,
  arcgis: { layer: SOURCES[name].id, orderBy, where, geometry: true },
  optional: true,
});

export const SF_DATASETS: DatasetSpec[] = [
  dataset('sfPermits', sfPermitSchema, {
    where: "permit_type in ('Excavation','ExcStreet','Emergency')",
  }),
  dataset('sfStreets', sfStreetSchema),
  dataset('sfNodes', sfNodeSchema),
  dataset('sfCurbs', sfShapeSchema),
  dataset('sfRoads', sfShapeSchema, { pageRows: 10_000 }),
  dataset('sfBuildings', sfBuildingSchema, { pageRows: 10_000 }),
  dataset('sfSignals', sfSignalSchema),
  // Removed and abandoned structures aren't drawn.
  layer('sfSewerNodes', sfSewerNodeSchema, 'GID', { where: "NODE_STATUS='ACT'" }),
  layer('sfSewerMains', sfSewerMainSchema, 'GID', { where: "PIPE_STATUS='ACT'" }),
  layer('sfSideSewers', sfSideSewerSchema, 'GID', { where: "PIPE_STATUS='ACT'" }),
  layer('sfHydrantsHigh', sfHighHydrantSchema, 'objectid'),
  layer('sfHydrantsLow', sfLowHydrantSchema, 'objectid_12'),
  layer('sfLights', sfLightSchema, 'objectid', { where: "status='ACTIVE'" }),
];
