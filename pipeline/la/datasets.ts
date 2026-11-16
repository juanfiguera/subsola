import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import type { DatasetSpec } from '../datasets';
import { esriLine, esriPoint, esriPolygon } from '../dc/datasets';

/**
 * The City of Los Angeles's layers on maps.lacity.org, as downloaded: attributes plus an Esri
 * JSON shape in degrees. See docs/regions/la.md.
 */

const text = z.string().nullish();
const number = z.number().nullish();
// Ids and flags come as numbers in some layers and text in others.
const code = z.union([z.string(), z.number()]).nullish();

// Only where and when, and the contact's email, which the build reads for its domain alone. The
// layer's contact names and phone numbers are never asked for.
const permitFields = {
  ID: z.number(),
  PermitNo: z.union([z.string(), z.number()]).nullish(),
  RefNo: z.union([z.string(), z.number()]).nullish(),
  PermitSubType: text,
  Location: text,
  Active: code,
  StartDate: number,
  EndDate: number,
  ContactEmail: text,
};
export const laPermitPolygonSchema = z.object({ ...permitFields, geometry: esriPolygon });
export const laPermitPointSchema = z.object({ ...permitFields, geometry: esriPoint });
export const laPermitLineSchema = z.object({ ...permitFields, geometry: esriLine });

export const laStreetSchema = z.object({
  SECT_ID: z.union([z.string(), z.number()]).nullish(),
  TDIR: text,
  STNAME: text,
  STSFX: text,
  geometry: esriLine,
});

export const laPolygonSchema = z.object({ geometry: esriPolygon });

export const laHydrantSchema = z.object({ HYDRTS_ID: code, SIZE_CODE: text, geometry: esriPoint });
// Every storm drain structure: catch basins and maintenance holes are drawn, and a lid's
// elevation, where recorded, is the street's height over the pipes that meet there.
export const laInletSchema = z.object({
  ASSETID: code,
  MAINTAINED_BY: text,
  DESCRIPTION: text,
  LID_ELEV: number,
  geometry: esriPoint,
});

// Sizes in inches; a box records a height and a width. Elevations are the inverts at each end,
// in feet. The owner is an agency (the city, the county's flood control district, Caltrans).
export const laStormDrainSchema = z.object({
  OBJECTID: z.number(),
  DESCRIPTION: text,
  MATERIAL_DESC: text,
  PIPESHAPE_DESC: text,
  DIAMETER_HEIGHT: number,
  WIDTH: number,
  UP_ELEV: number,
  DN_ELEV: number,
  OWNER_DESC: text,
  geometry: esriLine,
});

// A route and nothing else: no address, size or material is filled in.
export const laSideSewerSchema = z.object({
  OBJECTID: z.number(),
  LATERALTYPE_DESC: text,
  geometry: esriLine,
});

export const laStructureSchema = z.object({
  STRUCTURE_ID: number,
  LID_ELEV: number,
  MH_DEPTH: text,
  MH_TYPE: text,
  STREET1: text,
  geometry: esriPoint,
});

export const laSewerSchema = z.object({
  OBJECTID: z.number(),
  PIPE_SIZE: number,
  PIPE_MAT: text,
  UP_INV: number,
  DN_INV: number,
  UP_STRUCT: number,
  DN_STRUCT: number,
  YEAR_INST: text,
  geometry: esriLine,
});

export const laLightSchema = z.object({
  STLID: text,
  POSTDESC: text,
  LAMPA: text,
  geometry: esriPoint,
});
export const laSignalSchema = z.object({ ST1: text, ST2: text, geometry: esriPoint });

const layer = (
  name: SourceKey,
  schema: z.ZodObject,
  orderBy: string,
  {
    where,
    pageRows = 1000,
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
  // The city's server is slow to skip to deep offsets; see `byId`.
  arcgis: { layer: SOURCES[name].id, orderBy, where, geometry: true, byId: true },
  optional,
});

const U_PERMITS = "PermitType='U'";

export const LA_DATASETS: DatasetSpec[] = [
  // Excavation permits come in four layers that barely overlap: dig spots as small polygons
  // (active, and archived since about 2016), and older ones as points and lines.
  layer('laPermitsActive', laPermitPolygonSchema, 'ID', {
    where: U_PERMITS,
    pageRows: 5000,
    optional: false,
  }),
  layer('laPermitsArchived', laPermitPolygonSchema, 'ID', {
    where: U_PERMITS,
    pageRows: 5000,
    optional: false,
  }),
  layer('laPermitsPoints', laPermitPointSchema, 'ID', {
    where: U_PERMITS,
    pageRows: 5000,
    optional: false,
  }),
  layer('laPermitsLines', laPermitLineSchema, 'ID', {
    where: U_PERMITS,
    pageRows: 5000,
    optional: false,
  }),
  layer('laStreets', laStreetSchema, 'AutoID', { optional: false }),
  layer('laBuildings', laPolygonSchema, 'OBJECTID'),
  layer('laHydrants', laHydrantSchema, 'OBJECTID'),
  layer('laInlets', laInletSchema, 'OBJECTID'),
  // Abandoned and inactive structures aren't drawn.
  layer('laSewerStructures', laStructureSchema, 'OBJECTID', {
    where: "MH_TYPE NOT IN ('ABN','INA')",
  }),
  // F and T are in service (T marks most of downtown's); A, P, R and the rest are abandoned,
  // proposed or removed.
  layer('laSewers', laSewerSchema, 'OBJECTID', { where: "PIPE_STATUS IN ('F','T')" }),
  // Pipes, culverts and underdrains; open channels, swales, ditches and natural watercourses run
  // on the surface, and abandoned pipes are gone, so they're left out.
  layer('laStormDrains', laStormDrainSchema, 'OBJECTID', {
    where:
      "DESCRIPTION IN ('Main Line','Connector','Culvert','Subdrain','Low Flow','Private Drain','Relief Pipe') AND (MATERIAL_DESC IS NULL OR MATERIAL_DESC NOT IN ('Improved Channel','Dirt Channel','Dirt Swale'))",
  }),
  layer('laSideSewers', laSideSewerSchema, 'OBJECTID'),
  layer('laSidewalks', laPolygonSchema, 'OBJECTID'),
  layer('laLights', laLightSchema, 'OBJECTID', { pageRows: 5000 }),
  layer('laSignals', laSignalSchema, 'ID'),
];
