import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import type { DatasetSpec } from '../datasets';
import { esriLine, esriPoint, esriPolygon } from '../dc/datasets';

/**
 * The City of San Jose's utility permits and its open data layers (streets, sanitary and storm
 * networks, inlets, streetlights, signals), the County of Santa Clara's building footprints, and
 * San Jose Water's service line inventory, paused for its terms: attributes plus an Esri JSON
 * shape in degrees. See docs/regions/sj.md.
 */

const text = z.string().nullish();
const number = z.number().nullish();

/** The city with a little margin, from Alviso on the bay down to Coyote Valley. */
export const SJ_BOUNDS: [number, number, number, number] = [-122.05, 37.12, -121.58, 37.47];

// Each permit layer also carries the staff who issued and stamped it (ISSUEUSER, STAMPUSER), the
// last editor and free notes; none of those is asked for. The description is read only to tell
// the utility and the kind of work (pipeline/sj/permits.ts) and is never written to the cells.
const permitFields = {
  OBJECTID: z.number(),
  FOLDERRSN: text,
  REFERENCEFILE: text,
  FOLDERNAME: text,
  FOLDERDESCRIPTION: text,
  PROPERTYLOCATION: text,
  ISSUEDATE: number,
  EXPIRYDATE: number,
  FINALDATE: number,
  STATUSDESC: text,
  WORKDESC: text,
};

export const sjPermitSchema = z.object({ ...permitFields, geometry: esriLine });
export const sjPermitPointSchema = z.object({ ...permitFields, geometry: esriPoint });
export const sjPermitParcelSchema = z.object({ ...permitFields, geometry: esriPolygon });

export type SjPermitRow = z.infer<typeof sjPermitSchema>;

export const sjStreetSchema = z.object({
  OBJECTID: z.number(),
  FULLNAME: text,
  FROMLEFT: number,
  TOLEFT: number,
  FROMRIGHT: number,
  TORIGHT: number,
  STREETCLASS: text,
  geometry: esriLine,
});

export const sjPolygonSchema = z.object({ geometry: esriPolygon });

// The pipe and the structure at each end, its kind and id, with the invert there in feet. The
// notes and plan fields are never read.
export const sjMainSchema = z.object({
  OBJECTID: z.number(),
  UPTYPE: text,
  UPID: text,
  UPELEV: number,
  DOWNTYPE: text,
  DOWNID: text,
  DOWNELEV: number,
  DIAMETER: number,
  MATERIAL: text,
  PIPETYPE: text,
  INSTALLYEAR: number,
  geometry: esriLine,
});

// The lid's surveyed elevation where there is one, else the ground from a terrain model.
export const sjManholeSchema = z.object({
  OBJECTID: z.number(),
  FACILITYID: text,
  RIMELEV: number,
  DEMELEV: number,
  INVERTELEV: number,
  INSTALLYEAR: number,
  geometry: esriPoint,
});

export const sjInletSchema = z.object({
  OBJECTID: z.number(),
  FACILITYID: text,
  INLETTYPE: text,
  RIMELEV: number,
  geometry: esriPoint,
});

export const sjLightSchema = z.object({
  OBJECTID: z.number(),
  POLEMATERIAL: text,
  POLEHEIGHT: text,
  POLEOWNER: text,
  geometry: esriPoint,
});

export const sjSignalSchema = z.object({
  OBJECTID: z.number(),
  INTERSECTIONNAME1: text,
  INTERSECTIONNAME2: text,
  SHOPTYPE: text,
  geometry: esriPoint,
});

// The address and each side's material; the layer holds nothing else. Paused (PAUSED_SOURCES):
// never downloaded while San Jose Water's terms bar republishing it.
export const sjServiceSchema = z.object({
  OBJECTID: z.number(),
  Address: text,
  SJW_Side_Material: text,
  Customer_Side_Material: text,
  L_Goose_Neck: text,
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
    byId = true,
  }: {
    where?: string;
    within?: [number, number, number, number];
    pageRows?: number;
    optional?: boolean;
    byId?: boolean;
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
    byId,
  },
  optional,
});

// Public streets in the city: not private drives, freeways, expressways (the county's) or ramps.
const STREETS =
  "(MUNILEFT = 'SJ' OR MUNIRIGHT = 'SJ') AND PRIVATE = 'No' AND (STREETCLASS IS NULL OR STREETCLASS NOT IN ('FY','EX','RA','DW','PA','AL'))";

export const SJ_DATASETS: DatasetSpec[] = [
  // Every utility permit since March 2019, one row per street segment, intersection or parcel a
  // permit names: about 36,000, 1,000 and 120.
  layer('sjPermits', sjPermitSchema, { optional: false }),
  layer('sjPermitPoints', sjPermitPointSchema),
  layer('sjPermitParcels', sjPermitParcelSchema),
  layer('sjStreets', sjStreetSchema, { where: STREETS, optional: false }),
  // The county's footprints, read within the city's box; the build keeps those in cells the
  // city's streets reach. The server answers 2,000 a page.
  layer('sjBuildings', sjPolygonSchema, { within: SJ_BOUNDS }),
  layer('sjSewers', sjMainSchema),
  layer('sjSewerManholes', sjManholeSchema),
  layer('sjStormDrains', sjMainSchema),
  layer('sjStormManholes', sjManholeSchema),
  layer('sjInlets', sjInletSchema),
  layer('sjLights', sjLightSchema, { where: "UPPER(POLESTATUS) = 'EXISTING'" }),
  // Signals, beacons and flashers at intersections and crossings, in service.
  layer('sjSignals', sjSignalSchema, {
    where:
      "STATUS IN ('Existing','Existing-To be Modified') AND SHOPTYPE IN ('Traffic Signal','Traffic Signal (Ped Crossing)','RRFB','HAWK','Original Flashing Beacon')",
  }),
  layer('sjServiceLines', sjServiceSchema),
];
