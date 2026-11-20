import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import { columnsOf, soqlString } from '../../src/sources/socrata';
import type { DatasetSpec } from '../datasets';
import { esriLine, esriPoint, esriPolygon } from '../dc/datasets';
import { DAL_HOLDERS, DAL_IMPROVEMENTS, DAL_TOPIC_WORDS, type DalTopic } from './permits';

/**
 * The City of Dallas's layers on its ArcGIS Online organization (right of way permits, Dallas
 * Water Utilities' service line inventory), its street centerlines on Dallas Open Data, and
 * FEMA's building footprints, since the city publishes none. See docs/regions/dal.md.
 */

const text = z.string().nullish();
const number = z.number().nullish();
const flag = z.number().nullish();

/** The city with a little margin: Lake Ray Hubbard on the east, Mountain Creek Lake on the west. */
export const DAL_BOUNDS: [number, number, number, number] = [-97.01, 32.61, -96.46, 33.03];

const DAL_AGOL = 'https://services2.arcgis.com/rwnOSbfKSwyTBcwN/arcgis/rest/services';
export const DAL_ROW = `${DAL_AGOL}/ROW/FeatureServer`;

const quoted = (values: readonly string[]) => values.map(soqlString).join(',');

// The work description, upper-cased with a space at each end, so a word can be looked for on the
// portal. Never asked for itself: crews type their phone numbers into it.
const DESCRIPTION = "' ' || UPPER(WORKDESCRIPTION) || ' '";
const COMPANY = 'UPPER(APPLICANTCOMPANYNAMESTORED)';

/** Whether the work description mentions any of the words, worked out on the portal as 1 or 0. */
export const mentionsAny = (words: string[]) =>
  `CASE WHEN (${words.map((word) => `${DESCRIPTION} LIKE ${soqlString(`%${word}%`)}`).join(' OR ')}) THEN 1 ELSE 0 END`;

/**
 * The known owner the applicant's company names, worked out on the portal; null for anyone else.
 * The company itself never comes down: it often carries a crew member's name.
 */
export const holderCase = () =>
  `CASE ${DAL_HOLDERS.map(
    ([label, patterns]) =>
      `WHEN (${patterns.map((pattern) => `${COMPANY} LIKE ${soqlString(pattern)}`).join(' OR ')}) THEN ${soqlString(label)}`,
  ).join(' ')} ELSE NULL END`;

/**
 * The work, the dates, the work site and the contractors. The layer also holds the applicant's
 * name, the company as typed (often with a person's name in it), the free-text work description
 * and location notes; none of those are asked for. The contractors are read only for the first
 * one that reads as a company.
 */
export const dalPermitSchema = z.object({
  OBJECTID: z.number(),
  EXTERNALFILENUM: text,
  STATUSDESCRIPTION: text,
  ISSUEDATE: number,
  ROWREQUESTEDSTARTDATE: number,
  ROWESTIMATEDCOMPLETIONDATE: number,
  ROWREASONFORJOB: text,
  ROWIMPROVEMENTREPAIR: text,
  ROWISEMERGENCYREPAIR: text,
  LOCATIONNAMES: text,
  ALLCONTRACTORSNAME: text,
  holder: text,
  overhead: flag,
  underground: flag,
  crossBore: flag,
  main: flag,
  water: flag,
  sewer: flag,
});

type PermitColumn = keyof typeof dalPermitSchema.shape;

// Columns the portal works out rather than sends as stored.
const DERIVED: Partial<Record<PermitColumn, () => string>> = {
  holder: holderCase,
  ...Object.fromEntries(
    (Object.entries(DAL_TOPIC_WORDS) as [DalTopic, string[]][]).map(([topic, words]) => [
      topic,
      () => mentionsAny(words),
    ]),
  ),
};

/** The `outFields` for the permits: the schema's columns, each derived one worked out on the portal. */
export const dalPermitSelect = () =>
  (Object.keys(dalPermitSchema.shape) as PermitColumn[])
    .map((column) => (DERIVED[column] ? `${DERIVED[column]()} AS ${column}` : column))
    .join(',');

/** One permit's shape: the lines and points layers carry the same permits, joined by file number. */
export const dalPermitLineSchema = z.object({ EXTERNALFILENUM: text, geometry: esriLine });
export const dalPermitPointSchema = z.object({ EXTERNALFILENUM: text, geometry: esriPoint });

const multiLine = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

// The address ranges on each side give the permits without a shape their block.
export const dalStreetSchema = z.object({
  objectid: z.string(),
  prefix: text,
  name: text,
  type: text,
  suffix: text,
  l_f_add: text,
  l_t_add: text,
  r_f_add: text,
  r_t_add: text,
  the_geom: multiLine.nullish(),
});

export const dalBuildingSchema = z.object({ geometry: esriPolygon });

// The address and both sides' material and how it's known; never the account id, which ties the
// line to a customer.
export const dalServiceSchema = z.object({
  OBJECTID: z.number(),
  address: text,
  utilmaterial: text,
  utilstatus: number,
  utilsource: text,
  utilverified: text,
  custmaterial: text,
  custstatus: number,
  custsource: text,
  custverified: text,
  bothsidesstatus: text,
  yearstructbuilt: number,
  geometry: esriPoint,
});

const layer = (
  name: SourceKey,
  schema: z.ZodObject,
  {
    where,
    within,
    select = Object.keys(schema.shape)
      .filter((field) => field !== 'geometry')
      .join(','),
    pageRows = 2000,
    optional = true,
    byId = true,
  }: {
    where?: string;
    within?: [number, number, number, number];
    select?: string;
    pageRows?: number;
    optional?: boolean;
    byId?: boolean;
  } = {},
): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select,
  pageRows,
  arcgis: {
    layer: SOURCES[name].id,
    orderBy: 'OBJECTID',
    where,
    within,
    geometry: 'geometry' in schema.shape,
    byId,
  },
  optional,
});

// The improvement types that can be a utility's; ramps and "None" never are.
const PERMIT_WHERE = `ROWIMPROVEMENTREPAIR IN (${quoted(DAL_IMPROVEMENTS)}) OR ROWIMPROVEMENTREPAIR LIKE 'Small Cell%'`;

// Streets in the city that utilities run under: not private drives, unbuilt "paper" streets,
// trails, walkways or the freeways and their ramps. The city files its arterials ("MAJOR
// ARTERIAL") in a dataset of their own and the rest ("MINOR ARTERIAL", "SECONDARY") in another.
const streetWhere = (classes: string[]) =>
  `(city_l = 'DALLAS' OR city_r = 'DALLAS') AND class IN (${quoted(classes)}) AND (type IS NULL OR type NOT IN ('EXPY','FWY','HOV','RAMP'))`;

const streets = (name: 'dalStreets' | 'dalMajorStreets', classes: string[]): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema: dalStreetSchema,
  select: columnsOf(dalStreetSchema),
  where: streetWhere(classes),
  pageRows: 50_000,
  socrata: 'https://www.dallasopendata.com/resource',
  optional: false,
});

export const DAL_DATASETS: DatasetSpec[] = [
  // Every right of way permit since November 2021, about 90,000. The table holds them all; the
  // lines and points layers hold the shapes of all but about 2,500, which the build places by
  // address instead.
  layer('dalPermits', dalPermitSchema, {
    where: PERMIT_WHERE,
    select: dalPermitSelect(),
    optional: false,
  }),
  layer('dalPermitLines', dalPermitLineSchema, { where: PERMIT_WHERE }),
  layer('dalPermitPoints', dalPermitPointSchema, { where: PERMIT_WHERE }),
  streets('dalStreets', ['MINOR ARTERIAL', 'SECONDARY']),
  streets('dalMajorStreets', ['MAJOR ARTERIAL']),
  // FEMA's footprints for all of the US, read within the city's box and the postal city of
  // Dallas; the build keeps those in cells the city's streets reach. Paged by offset: the layer's
  // ids run across the whole country.
  layer('dalBuildings', dalBuildingSchema, {
    where: "PROP_CITY = 'DALLAS'",
    within: DAL_BOUNDS,
    select: 'OBJECTID',
    byId: false,
  }),
  layer('dalServiceLines', dalServiceSchema),
];
