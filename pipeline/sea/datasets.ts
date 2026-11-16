import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import type { DatasetSpec } from '../datasets';
import { esriLine, esriPoint, esriPolygon } from '../dc/datasets';

/**
 * The City of Seattle's layers on its ArcGIS Online organization: SDOT's Street Use permits and
 * street segments, SPU's sewers, water mains and catch basins, City Light's poles. Attributes plus
 * an Esri JSON shape in degrees. See docs/regions/sea.md.
 */

const text = z.string().nullish();
const number = z.number().nullish();

// Who held the permit and what kind of work it allowed, never the applicant or contact person,
// and not the project description, where crews type names and phone numbers.
export const seaPermitSchema = z.object({
  PERMIT_NUMBER: text,
  PERMIT_STATUS: text,
  APPLICANT_COMPANY: text,
  USE_TYPE: text,
  USE_DESCRIPTION: text,
  FIRST_ISSUED_DATE: number,
  USE_START_DATE: number,
  USE_END_DATE: number,
  ON_STREET: text,
  FROM_STREET: text,
  TO_STREET: text,
  STREET_KEY: number,
  geometry: esriLine.nullish(),
});

export const seaStreetSchema = z.object({
  COMPKEY: number,
  ONSTREET: text,
  UNITDESC: text,
  geometry: esriLine,
});

export const seaPolygonSchema = z.object({ geometry: esriPolygon });

export const seaSewerSchema = z.object({
  OBJECTID: z.number(),
  MNL_WIDTH_IN_NBR: number,
  MNL_MATERIAL_TYPE: text,
  MNL_INSTALL_DATE: number,
  MNL_PRBL_FLOW_TEXT: text,
  MNL_OWNER_NAME: text,
  MNL_UPS_DEPTH_FT_NBR: number,
  MNL_DNS_DEPTH_FT_NBR: number,
  geometry: esriLine,
});

export const seaHoleSchema = z.object({
  MNLEP_S_ENDPT_ID: text,
  MNLEP_FEATYPE_TEXT: text,
  MNLEP_DEPTH_FT_NBR: number,
  MNLEP_CVR_ELEV_FT_NBR: number,
  geometry: esriPoint,
});

export const seaWaterMainSchema = z.object({
  OBJECTID: z.number(),
  DIAMETER: number,
  MTRL_DESC: text,
  INSTALL_YR: number,
  DEPTH: text,
  geometry: esriLine,
});

export const seaCatchBasinSchema = z.object({
  CB_FEATYPE_TEXT: text,
  CB_DEPTH_FT_NBR: number,
  CB_OWNER_NAME: text,
  geometry: esriPoint,
});

// Where the service runs, its material, size and year; never the meter, premise, account,
// route or comment fields, which can lead to the people who live there. The line runs from its
// tap on the main to the meter.
export const seaServiceSchema = z.object({
  OBJECTID: z.number(),
  MATERIAL: text,
  DIAMETER: text,
  INSTALL_YR: number,
  LOCATION: text,
  PIN: text,
  geometry: esriLine,
});

// One stretch of a building's own sewer. A side sewer is drawn as many short stretches, joined
// at the keys of the points between them.
export const seaSideSewerSchema = z.object({
  OBJECTID: z.number(),
  NMNL_UPS_FEATURE_KEY: number,
  NMNL_DNS_FEATURE_KEY: number,
  NMNL_MATERIAL_TYPE: text,
  NMNL_WIDTH_IN_NBR: number,
  NMNL_INSTALL_DATE: number,
  geometry: esriLine,
});

export const seaElectricLineSchema = z.object({ OBJECTID: z.number(), geometry: esriLine });

export const seaElectricStructureSchema = z.object({ FACILITY_TYPE: text, geometry: esriPoint });

export const seaLightSchema = z.object({ ASSET_ID: text, HEIGHT: number, geometry: esriPoint });

export const seaSignalSchema = z.object({
  UNITDESC: text,
  SIGNAL_TYPE: text,
  geometry: z.object({ points: z.array(z.array(z.number())) }),
});

const layer = (
  name: SourceKey,
  schema: z.ZodObject,
  {
    where,
    pageRows = 2000,
    optional = true,
  }: { where?: string; pageRows?: number; optional?: boolean } = {},
): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select: Object.keys(schema.shape)
    .filter((field) => field !== 'geometry')
    .join(','),
  pageRows,
  // The city reloads these layers whole, renumbering every object id, so they're paged by offset
  // in a fixed order rather than by id ranges.
  arcgis: { layer: SOURCES[name].id, orderBy: 'OBJECTID', where, geometry: true },
  optional,
});

// SPU's services answer at most 1000 rows a request.
const SPU_PAGE = 1000;

export const SEA_DATASETS: DatasetSpec[] = [
  // One row for each block a permit's work reaches. Revisions repeat the permits they revise.
  layer('seaPermits', seaPermitSchema, {
    where: "PERMIT_TYPE_ALIAS IN ('Minor Utility Permit','Utility Major Permit')",
    optional: false,
  }),
  layer('seaStreets', seaStreetSchema, { optional: false }),
  layer('seaBuildings', seaPolygonSchema),
  // Phantom connectors join the network on paper; no pipe lies along them.
  layer('seaSewers', seaSewerSchema, {
    where: "MNL_FEATYPE_TEXT <> 'PHANTOM CONNECTOR'",
    pageRows: SPU_PAGE,
  }),
  layer('seaSewerHoles', seaHoleSchema, {
    where: "MNLEP_FEATYPE_TEXT LIKE '%MH%' OR MNLEP_FEATYPE_TEXT = 'Maintenance Hole'",
    pageRows: SPU_PAGE,
  }),
  // C is in service; PC is proposed.
  layer('seaWaterMains', seaWaterMainSchema, { where: "LIFECYCLE = 'C'", pageRows: SPU_PAGE }),
  layer('seaCatchBasins', seaCatchBasinSchema, { pageRows: SPU_PAGE }),
  // In service and active; retired and inactive services may be cut off at the main.
  layer('seaServiceLines', seaServiceSchema, {
    where: "LIFECYCLE = 'C' AND OP_STATUS = 'ACT'",
    pageRows: SPU_PAGE,
  }),
  // Connected house sewers carrying sewage. Service drains (roof and yard water), footing and
  // trench drains, and phantom connectors are left out.
  layer('seaSideSewers', seaSideSewerSchema, {
    where:
      "NMNL_FEATYPE_TEXT = 'Side Sewer' AND NMNL_LIFECYCLE_STAT = 'Connected' AND NMNL_PRBL_FLOW_TEXT IN ('Sanitary','Combined')",
  }),
  // Overhead lines are on the poles; only what runs underground.
  layer('seaElectricLines', seaElectricLineSchema, { where: "CONDUCTORTYPE1 = 'UG'" }),
  layer('seaElectricStructures', seaElectricStructureSchema),
  layer('seaLights', seaLightSchema, { where: "HAS_STREETLIGHT = 'YES'" }),
  layer('seaSignals', seaSignalSchema),
];
