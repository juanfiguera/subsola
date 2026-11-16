import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import type { DatasetSpec } from '../datasets';

/**
 * Washington, DC's layers on DC GIS, as downloaded: each row is the feature's attributes plus its
 * shape in longitude and latitude (Esri JSON). See docs/regions/dc.md.
 */

const xy = z.tuple([z.number(), z.number()]);
export const esriPoint = z.object({ x: z.number(), y: z.number() });
export const esriLine = z.object({ paths: z.array(z.array(xy)) });
export const esriPolygon = z.object({ rings: z.array(z.array(xy)) });

const text = z.string().nullish();
const number = z.number().nullish();

export const dcPermitSchema = z.object({
  OBJECTID: z.number(),
  TrackingNumber: number,
  PermitNumber: text,
  IssueDate: number,
  EffectiveDate: number,
  ExpirationDate: number,
  StatusDescription: text,
  WorkLocationFullAddress: text,
  TypeDetailNames: text,
  PermitteeName: text,
  WorkDetail: text,
  Longitude: number,
  Latitude: number,
});

export const dcBlockSchema = z.object({
  BLOCKKEY: z.string(),
  ROUTENAME: z.string(),
  FROMSTREET: text,
  TOSTREET: text,
  geometry: esriLine,
});

export const dcLineSchema = z.object({ geometry: esriLine });
export const dcPolygonSchema = z.object({ geometry: esriPolygon });

export const dcElevationSchema = z.object({ ELEVATION: z.number(), geometry: esriPoint });

export const dcHydrantSchema = z.object({
  ASSETNUM: text,
  LOCATIONDETAIL: text,
  geometry: esriPoint,
});

export const dcPointSchema = z.object({ geometry: esriPoint });

export const dcOutfallSchema = z.object({
  OUTFALL_ID_TEXT: text,
  RECEIVING_WATERBODY: text,
  TYPE_MATERIAL: text,
  SIZE_: text,
  geometry: esriPoint,
});

export const dcLightSchema = z.object({
  STREETLIGHTID: text,
  POLETYPE: text,
  POLEHEIGHT: text,
  geometry: esriPoint,
});

export const dcSignalSchema = z.object({
  INTERSECTIONNAME: text,
  LPI: text,
  APS: text,
  geometry: esriPoint,
});

// Only what describes the pipe. The layer also scores each main's criticality and
// vulnerability, which stay out of the build.
export const dcMainSchema = z.object({
  OBJECTID: z.number(),
  DIAMT: number,
  MATRL: text,
  INSTALLDATE: number,
  geometry: esriLine,
});

export const dcLotSchema = z.object({ SSL: z.string(), geometry: esriPolygon });

export const dcServiceSchema = z.object({
  OBJECTID: z.number(),
  PremiseAddress: text,
  Pub_Display_Category: text,
  PublicServiceMaterialType: text,
  Priv_Display_Category: text,
  PrivateServiceMaterialType: text,
  geometry: esriPoint,
});

const layer = (
  name: SourceKey,
  schema: z.ZodObject,
  {
    where,
    pageRows = 1000,
    geometry = true,
  }: { where?: string; pageRows?: number; geometry?: boolean } = {},
): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select: Object.keys(schema.shape)
    .filter((field) => field !== 'geometry')
    .join(','),
  pageRows,
  arcgis: { layer: SOURCES[name].id, orderBy: 'OBJECTID', where, geometry },
  // DC GIS has 503 spells; without permits or blocks there's no DC, but the rest can miss a night.
  optional: name !== 'dcPermits' && name !== 'dcBlocks',
});

export const DC_DATASETS: DatasetSpec[] = [
  // Excavation only: the rest are occupancy, paving and sidewalk cafes.
  layer('dcPermits', dcPermitSchema, { where: 'IsExcavation=1', pageRows: 2000, geometry: false }),
  layer('dcBlocks', dcBlockSchema, { pageRows: 2000 }),
  layer('dcCurbs', dcLineSchema, { pageRows: 2000 }),
  layer('dcSidewalks', dcPolygonSchema, { pageRows: 2000 }),
  layer('dcRoads', dcPolygonSchema, { pageRows: 2000 }),
  layer('dcBuildings', dcPolygonSchema),
  layer('dcElevations', dcElevationSchema),
  layer('dcHydrants', dcHydrantSchema),
  layer('dcInlets', dcPointSchema),
  layer('dcOutfalls', dcOutfallSchema, { pageRows: 2000 }),
  layer('dcLights', dcLightSchema),
  layer('dcSignals', dcSignalSchema),
  layer('dcLots', dcLotSchema, { pageRows: 2000 }),
  // Abandoned, removed and proposed mains aren't drawn.
  layer('dcMains', dcMainSchema, { where: "LIFECYCLESTATS='Active'" }),
  layer('dcServiceLines', dcServiceSchema, { pageRows: 2000 }),
];
