import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import type { DatasetSpec } from '../datasets';
import { esriLine, esriPoint, esriPolygon } from '../dc/datasets';
import { DEN_DIG_PURPOSES } from './permits';

/**
 * The City and County of Denver's open data layers (permits, streets, buildings, Wastewater
 * Management's sanitary and storm networks, signals) and Denver Water's lead service line
 * inventory: attributes plus an Esri JSON shape in degrees. See docs/regions/den.md.
 */

const text = z.string().nullish();
const number = z.number().nullish();

/** The City and County's outer box, a little past the line; it takes in the airport. */
export const DEN_BOUNDS: [number, number, number, number] = [-105.11, 39.61, -104.6, 39.92];

// The company is read only for the utility it names; the free-text location details, the
// project and the billing ("exempt") note, where staff type people's names, are never read.
export const denPermitSchema = z.object({
  OBJECTID: z.number(),
  PERMIT_NUMBER: text,
  COMPANY: text,
  PURPOSE: text,
  FULL_ADDRESS: text,
  BEGIN_DATE: number,
  END_DATE: number,
  STREET: text,
  FROM_STREET: text,
  TO_STREET: text,
  geometry: esriLine.nullish(),
});

export const denStreetSchema = z.object({
  OBJECTID: z.number(),
  FULLNAME: text,
  FROMNAME: text,
  TONAME: text,
  geometry: esriLine,
});

export const denPolygonSchema = z.object({ geometry: esriPolygon });

// Pipe inverts at both ends and the manholes they meet, in feet above sea level (NAVD 88). The
// notes field, which carries staff names, is never read.
export const denSewerSchema = z.object({
  OBJECTID: z.number(),
  diameter: number,
  material: text,
  installdate: number,
  upelev: number,
  downelev: number,
  upstream_node_id: text,
  downstream_node_id: text,
  ownedby: text,
  unittype: text,
  geometry: esriLine,
});

// The ground at the manhole, mostly read from a terrain model, and its lowest invert. Its site
// manager and phone fields, filled in for pump stations, are never read.
export const denManholeSchema = z.object({
  assetid: text,
  ground_elevation: number,
  ground_elevation_source: text,
  invert_1: number,
  ownedby: text,
  geometry: esriPoint,
});

export const denStormDrainSchema = z.object({
  OBJECTID: z.number(),
  ASSETGROUP: number,
  width: number,
  height: number,
  material: text,
  pipeshape: text,
  installdate: number,
  upelev: number,
  downelev: number,
  upstream_nodeid: text,
  downstream_nodeid: text,
  ownedby: text,
  geometry: esriLine,
});

export const denInletSchema = z.object({
  assetid: text,
  ground_elevation: number,
  ownedby: text,
  geometry: esriPoint,
});

export const denSignalSchema = z.object({
  TRAFFIC_SIGNAL_ID: number,
  SIGNAL_OWNER: text,
  geometry: esriPoint,
});

// The address and Denver Water's category; never the premise id, tap number or service point,
// which tie the line to an account.
export const denServiceSchema = z.object({
  OBJECTID: z.number(),
  prem_full_addr: text,
  PREM_CITY: text,
  lsli_final_lead_cat: text,
  parcelyearbuilt: number,
  geometry: esriPoint,
});

const layer = (
  name: SourceKey,
  schema: z.ZodObject,
  {
    where,
    within,
    pageRows = 2000,
    optional = true,
  }: {
    where?: string;
    within?: [number, number, number, number];
    pageRows?: number;
    optional?: boolean;
  } = {},
): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select: Object.keys(schema.shape)
    .filter((field) => field !== 'geometry')
    .join(','),
  pageRows,
  arcgis: {
    layer: SOURCES[name].id,
    orderBy: 'OBJECTID',
    where,
    within,
    geometry: true,
    byId: true,
  },
  optional,
});

const quoted = (values: string[]) => values.map((value) => `'${value}'`).join(',');

// In service. Private pipes run on private land, not under the street; stubouts are the short
// lengths left at a main for a house sewer to join later.
const PUBLIC_SEWERS =
  "lifecyclestatus = 2 AND ownedby <> 'PRIV' AND (unittype IS NULL OR unittype <> 'Stubout')";

export const DEN_DATASETS: DatasetSpec[] = [
  // One row for each stretch of street a permit closes; a permit can close several.
  layer('denPermits', denPermitSchema, {
    where: `PURPOSE IN (${quoted(DEN_DIG_PURPOSES)})`,
    optional: false,
  }),
  layer('denStreets', denStreetSchema, { optional: false }),
  layer('denBuildings', denPolygonSchema),
  layer('denSewers', denSewerSchema, { where: PUBLIC_SEWERS }),
  layer('denSewerManholes', denManholeSchema, { where: 'lifecyclestatus = 2' }),
  // Pipes (4) and culverts (6) in service or due for removal; open channels and the linear
  // drains along a curb or a plaza aren't pipes under the street.
  layer('denStormDrains', denStormDrainSchema, {
    where: "ASSETGROUP IN (4,6) AND lifecyclestatus IN (2,4) AND ownedby <> 'PRIV'",
  }),
  layer('denStormManholes', denManholeSchema, { where: 'lifecyclestatus IN (2,4)' }),
  layer('denInlets', denInletSchema, { where: "lifecyclestatus IN (2,4) AND ownedby <> 'PRIV'" }),
  layer('denSignals', denSignalSchema, { where: "SIGNAL_STATUS = 'IN USE'" }),
  // Denver Water serves the suburbs too; the build keeps the City and County's own streets.
  layer('denServiceLines', denServiceSchema, { within: DEN_BOUNDS }),
];
