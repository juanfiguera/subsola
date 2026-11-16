import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import type { DatasetSpec } from '../datasets';
import { esriLine, esriPoint, esriPolygon } from '../dc/datasets';

/**
 * The City of San Diego's permits from its open data portal, its street layers on
 * webmaps.sandiego.gov, and its utilities' layers as SanGIS publishes them on geo.sandag.org:
 * attributes plus an Esri JSON shape in degrees. See docs/regions/sd.md.
 */

const text = z.string().nullish();
const number = z.number().nullish();
// Ids come as numbers in some layers and text in others.
const code = z.union([z.string(), z.number()]).nullish();

/** The city's outer box, for SanGIS layers that cover the whole county. */
export const SD_BOUNDS: [number, number, number, number] = [-117.29, 32.53, -116.9, 33.12];

// The portal's CSV gives every value as text: dates as 2025-06-03, read as midnight UTC as the
// map server gave them, and the point in degrees, where 0 stands for none.
const csvDate = text.transform((value) => {
  const millis = value ? Date.parse(value) : NaN;
  return Number.isFinite(millis) ? millis : null;
});
const csvDegrees = text.transform((value) => {
  const degrees = value ? Number(value) : NaN;
  return Number.isFinite(degrees) && degrees !== 0 ? degrees : null;
});

// The holder is read only for a company's name; a person's name is never kept.
export const sdPermitSchema = z.object({
  APPROVAL_ID: z.string(),
  APPROVAL_TYPE: text,
  APPROVAL_STATUS: text,
  APPROVAL_PERMIT_HOLDER: text,
  PROJECT_TITLE: text,
  PROJECT_SCOPE: text,
  APPROVAL_ISSUE_DATE: csvDate,
  APPROVAL_EXPIRE_DATE: csvDate,
  APPROVAL_CLOSE_DATE: csvDate,
  GIS_ADDRESS: text,
  GIS_LATITUDE: csvDegrees,
  GIS_LONGITUDE: csvDegrees,
});

export const sdStreetSchema = z.object({
  roadsegid: number,
  rd30full: text,
  geometry: esriLine,
});

export const sdPolygonSchema = z.object({ geometry: esriPolygon });

export const sdManholeSchema = z.object({
  fac_seq_num: number,
  rim_elev_qty: number,
  invert_elev_qty: number,
  depth_qty: number,
  manhl_typ_desc: text,
  geometry: esriPoint,
});

export const sdSewerSchema = z.object({
  objectid: z.number(),
  size_num: number,
  matl_desc: text,
  main_typ_desc: text,
  upstrm_invert_elev_qty: number,
  dnstreamie: number,
  upstrm_fac_seq_num: code,
  dnstrm_fac_seq_num: code,
  inst_dt: number,
  geometry: esriLine,
});

export const sdWaterMainSchema = z.object({
  objectid: z.number(),
  insd_diam_size_num: number,
  materiald: text,
  pipetyped: text,
  inst_dt: number,
  geometry: esriLine,
});

export const sdHydrantSchema = z.object({
  fac_seq_num: number,
  size_num: number,
  make_desc: text,
  geometry: esriPoint,
});

// Inlets and cleanouts; their elevation is the rim, which gives the storm drains their depth.
export const sdInletSchema = z.object({
  iamfloc: text,
  structure_type: text,
  elevation: number,
  loc_desc: text,
  geometry: esriPoint,
});

// Inverts at each end, in feet; sizes in inches. A box culvert has a width and height instead
// of a diameter.
export const sdStormDrainSchema = z.object({
  objectid: z.number(),
  drain_conveyance_type: text,
  material: text,
  diameter: number,
  height: number,
  from_elev: number,
  to_elev: number,
  install_ye: number,
  geometry: esriLine,
});

export const sdRecycledMainSchema = z.object({
  objectid: z.number(),
  insd_diam_size_num: number,
  materiald: text,
  pipetyped: text,
  ownrshipd: text,
  inst_dt: number,
  geometry: esriLine,
});

// Location, material and how each side is known; never the account, meter or notes fields,
// which can name the people who live there.
export const sdServiceSchema = z.object({
  OBJECTID: z.number(),
  address: text,
  APN: text,
  utilmaterial: text,
  utilstatus: number,
  utilsource: text,
  utilverifmethod: text,
  custmaterial: text,
  custstatus: number,
  custsource: text,
  custverifmethod: text,
  bothsidesstatus: text,
  geometry: esriPoint,
});

export const sdLightSchema = z.object({
  POLE_TYPE: text,
  POLE_HEIGHT_FT: z.union([z.string(), z.number()]).nullish(),
  LOC_DESC: text,
  geometry: esriPoint,
});
export const sdSignalSchema = z.object({ SIGNAL_ID: text, LOC_DESC: text, geometry: esriPoint });

const layer = (
  name: SourceKey,
  schema: z.ZodObject,
  orderBy: string,
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
  arcgis: { layer: SOURCES[name].id, orderBy, where, within, geometry: true, byId: true },
  optional,
});

/** Permits cut from the portal's one CSV of every issued approval; both sets come from it. */
const approvals = (name: SourceKey, match: Record<string, RegExp>): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema: sdPermitSchema,
  select: Object.keys(sdPermitSchema.shape).join(','),
  pageRows: 5000,
  csv: { url: SOURCES[name].id, match },
  optional: false,
});

// Construction permits in the street. Traffic control permits are left out: they're the lane
// closures for the same digs, and would count each one twice. Accela (2021 on) files them by
// project type; PTS, before it, by approval type alone.
const PERMITS_NOW = {
  PROJECT_TYPE: /^(Right of Way - Dry Utilities|Right of Way - Minor - Rapid Review)$/,
  APPROVAL_TYPE: /^Approval - Construction - Right Of Way/,
};
const PERMITS_BEFORE = {
  APPROVAL_TYPE:
    /^(Right Of Way Permit-Const Plan|Right Of Way Permit|Elec\. Utility Undergrnd\. Prgm)$/,
};

export const SD_DATASETS: DatasetSpec[] = [
  approvals('sdPermits', PERMITS_NOW),
  approvals('sdPermitsOld', PERMITS_BEFORE),
  layer('sdStreets', sdStreetSchema, 'objectid', {
    where: "ljurisdic = 'SD' OR rjurisdic = 'SD'",
    optional: false,
  }),
  layer('sdBuildings', sdPolygonSchema, 'objectid', { within: SD_BOUNDS }),
  layer('sdSewerManholes', sdManholeSchema, 'objectid'),
  layer('sdSewers', sdSewerSchema, 'objectid'),
  layer('sdWaterMains', sdWaterMainSchema, 'objectid'),
  layer('sdHydrants', sdHydrantSchema, 'objectid'),
  // I is a storm drain inlet and M a cleanout (manhole); only inlets are drawn, and both give
  // the street's height at the pipe ends. Outlets and headwalls record the invert, not a rim.
  layer('sdInlets', sdInletSchema, 'objectid', { where: "structure_type IN ('I','M')" }),
  // Brow ditches (B) and open channels (C) run on the surface, so they're left out; pipes,
  // boxes, encased and force mains and underdrains stay. Only active ones.
  layer('sdStormDrains', sdStormDrainSchema, 'objectid', {
    where: "drain_conveyance_type NOT IN ('B','C') AND status = 'A'",
  }),
  layer('sdRecycledMains', sdRecycledMainSchema, 'objectid'),
  layer('sdServiceLines', sdServiceSchema, 'OBJECTID'),
  // A is active; I, inactive, isn't drawn.
  layer('sdLights', sdLightSchema, 'OBJECTID', { where: "STATUS = 'A'" }),
  layer('sdSignals', sdSignalSchema, 'OBJECTID', { where: "STATUS = 'A'" }),
];
