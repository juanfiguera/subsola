import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import { columnsOf, soqlString } from '../../src/sources/socrata';
import type { DatasetSpec } from '../datasets';
import { CHI_TOPIC_WORDS, CHI_WORK_TYPES, type ChiTopic } from './permits';

/**
 * The City of Chicago data portal's datasets as downloaded: Socrata rows, numbers as text,
 * GeoJSON shapes. See docs/regions/chi.md.
 */

const text = z.string().nullish();
const flag = z.boolean().nullish();

/** The city with a little margin, out to O'Hare. */
export const CHI_BOUNDS: [number, number, number, number] = [-87.95, 41.64, -87.52, 42.03];

// The permit's name and comments, as one upper-case string with a space at each end, so a word can be
// looked for on the portal. Never asked for itself: staff and applicants type names into it.
const PERMIT_TEXT =
  "upper(' ' || coalesce(applicationname, '') || ' ' || coalesce(comments, '') || ' ')";

/** Whether the permit's text mentions any of the words, worked out on the portal. */
export const mentionsAny = (words: string[]) =>
  `(${words.map((word) => `${PERMIT_TEXT} like ${soqlString(`%${word}%`)}`).join(' OR ')})`;

/**
 * Only the work, the dates, where and the company. The dataset also holds the applicant's first
 * name, street address, city, ZIP and phone, an emergency contact and free-text comments, none of
 * which are asked for. The company is in the last name field; where the applicant is a person the
 * first name is filled in too, and the portal sends no name at all.
 */
export const chiPermitSchema = z.object({
  uniquekey: z.string(),
  applicationnumber: text,
  worktype: text,
  applicationstatus: text,
  applicationstartdate: text,
  applicationenddate: text,
  applicationissueddate: text,
  streetnumberfrom: text,
  streetnumberto: text,
  direction: text,
  streetname: text,
  suffix: text,
  latitude: text,
  longitude: text,
  holder: text,
  water: flag,
  sewer: flag,
  gas: flag,
  electric: flag,
  telecom: flag,
  light: flag,
  main: flag,
  tree: flag,
});

type PermitColumn = keyof typeof chiPermitSchema.shape;

// Columns the portal works out rather than sends as stored.
const DERIVED: Partial<Record<PermitColumn, string>> = {
  holder: 'case(primarycontactfirst IS NULL, primarycontactlast)',
  ...Object.fromEntries(
    (Object.entries(CHI_TOPIC_WORDS) as [ChiTopic, string[]][]).map(([topic, words]) => [
      topic,
      mentionsAny(words),
    ]),
  ),
};

/** The `$select` for the permits: the schema's columns, each derived one worked out on the portal. */
export const chiPermitSelect = () =>
  (Object.keys(chiPermitSchema.shape) as PermitColumn[])
    .map((column) => (DERIVED[column] ? `${DERIVED[column]} as ${column}` : column))
    .join(',');

const multiLine = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});
const multiPolygon = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
});

// The address ranges on each side give the geocoder's fallback and the permits' blocks.
export const chiStreetSchema = z.object({
  objectid: z.string(),
  pre_dir: text,
  street_nam: text,
  street_typ: text,
  suf_dir: text,
  l_f_add: text,
  l_t_add: text,
  r_f_add: text,
  r_t_add: text,
  f_cross: text,
  t_cross: text,
  class: text,
  status: text,
  the_geom: multiLine.nullish(),
});

export const chiBuildingSchema = z.object({ the_geom: multiPolygon.nullish() });

const BASE = 'https://data.cityofchicago.org/resource';

const dataset = (
  name: SourceKey,
  schema: z.ZodObject,
  {
    where,
    select = columnsOf(schema),
    pageRows = 50_000,
    optional = true,
  }: { where?: string; select?: string; pageRows?: number; optional?: boolean } = {},
): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select,
  where,
  pageRows,
  socrata: BASE,
  optional,
});

const quoted = (values: readonly string[]) => values.map(soqlString).join(',');

export const CHI_DATASETS: DatasetSpec[] = [
  // Public way openings and the restorations after them, about a million rows since 2013, less
  // the cancelled and denied. Socrata takes a minute for a page near the start and three near the
  // end, so the whole set comes down in about ten minutes six at a time; no frozen cache needed.
  dataset('chiPermits', chiPermitSchema, {
    where: `applicationtype='DOT_PWO' AND worktype in (${quoted(CHI_WORK_TYPES)}) AND currentmilestone not in ('Cancelled','Denied')`,
    select: chiPermitSelect(),
    optional: false,
  }),
  dataset('chiStreets', chiStreetSchema, { optional: false }),
  dataset('chiBuildings', chiBuildingSchema, {
    where: "bldg_statu='ACTIVE'",
    pageRows: 10_000,
  }),
];
