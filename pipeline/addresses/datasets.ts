import { z } from 'zod';
import { SOURCES, type SourceKey } from '../../src/sources/catalog';
import type { RegionId } from '../../src/regions';
import type { IndexedAddress } from '../../src/sources/addressIndex';
import { parseChiSuggestions } from '../../src/sources/chiGeocode';
import { parseDalSuggestions } from '../../src/sources/dalGeocode';
import { parseDenSuggestions } from '../../src/sources/denGeocode';
import { parseSjSuggestions } from '../../src/sources/sjGeocode';
import type { DatasetSpec } from '../datasets';

/**
 * Every street address in each city, for the type-ahead index (pipeline/addresses/build.ts). Only
 * the house number and street are asked for: no units, owners or anything else on the point.
 * Each city's own suggestion parser turns a row into its line, so the index spells addresses the
 * way the city's lookup reads them back when one is picked.
 */

const text = z.string().nullish();
const number = z.number().nullish();

const NYC_BOROUGHS: Record<string, string> = {
  '1': 'Manhattan',
  '2': 'Bronx',
  '3': 'Brooklyn',
  '4': 'Queens',
  '5': 'Staten Island',
};

const nycSchema = z.object({
  house_number: text,
  house_number_suffix: text,
  full_street_name: text,
  boroughcode: text,
});
const chiSchema = z.object({
  addrnocom: text,
  lst_predir: text,
  st_name: text,
  lst_type: text,
  st_posdir: text,
});
const dalSchema = z.object({
  HOUSENUMBER: number,
  STREETPREDIRECTION: text,
  NAME: text,
  STREETTYPE: text,
  STREETPOSTDIRECTION: text,
});
const denSchema = z.object({
  ADDRESS_NUMBER: number,
  PREDIRECTIONAL: text,
  STREET_NAME: text,
  POSTTYPE: text,
});
const sjSchema = z.object({
  Add_Number: number,
  St_PreDirAbbr: text,
  St_PreTyp: text,
  StreetName: text,
  St_PosTypUSPS: text,
  St_PosDir: text,
});

const select = (schema: z.ZodObject) => Object.keys(schema.shape).join(',');

const arcgisSpec = (name: SourceKey, schema: z.ZodObject, where?: string): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select: select(schema),
  pageRows: 2000,
  arcgis: { layer: SOURCES[name].id, orderBy: 'OBJECTID', where, byId: true },
  optional: true,
});

/** "1437 Bannock St" as its house number and street. */
const split = (line: string, place: string): IndexedAddress[] => {
  const match = /^(\S+)\s+(.+)$/.exec(line.trim());
  return match ? [{ number: match[1]!, street: match[2]!, place }] : [];
};

const fromSuggestions = (rows: { line: string; place: string }[]) =>
  rows.flatMap(({ line, place }) => split(line, place));

const esri = (row: unknown) => ({ features: [{ attributes: row }] });

export interface AddressSource {
  spec: DatasetSpec;
  toAddresses: (row: unknown) => IndexedAddress[];
}

export const ADDRESS_SOURCES: Partial<Record<RegionId, AddressSource>> = {
  nyc: {
    spec: {
      name: 'addressPoints',
      id: SOURCES.addressPoints.id,
      schema: nycSchema,
      select: select(nycSchema),
      pageRows: 50_000,
      optional: true,
    },
    toAddresses: (row) => {
      const point = nycSchema.parse(row);
      const street = point.full_street_name?.replace(/\s+/g, ' ').trim();
      if (!point.house_number || !street) return [];
      return [
        {
          number: `${point.house_number}${point.house_number_suffix ?? ''}`,
          street,
          place: NYC_BOROUGHS[point.boroughcode ?? ''] ?? 'New York',
        },
      ];
    },
  },
  chi: {
    spec: {
      name: 'chiAddresses',
      id: SOURCES.chiAddresses.id,
      schema: chiSchema,
      select: select(chiSchema),
      where: "geocode_muni = 'CHICAGO'",
      pageRows: 50_000,
      socrata: 'https://datacatalog.cookcountyil.gov/resource',
      optional: true,
    },
    toAddresses: (row) => fromSuggestions(parseChiSuggestions([row])),
  },
  dal: {
    spec: arcgisSpec('dalAddresses', dalSchema),
    toAddresses: (row) => fromSuggestions(parseDalSuggestions(esri(row))),
  },
  den: {
    spec: arcgisSpec('denAddresses', denSchema),
    toAddresses: (row) => fromSuggestions(parseDenSuggestions(esri(row))),
  },
  sj: {
    spec: arcgisSpec('sjAddresses', sjSchema, "Status = 'Active'"),
    toAddresses: (row) => fromSuggestions(parseSjSuggestions(esri(row))),
  },
};

/** A city's address download, to add to its datasets. */
export const addressDatasets = (city: RegionId): DatasetSpec[] => {
  const source = ADDRESS_SOURCES[city];
  return source ? [source.spec] : [];
};
