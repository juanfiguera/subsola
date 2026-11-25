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

// The five cities whose type-ahead was a locator have no suggestion parser to reuse, so their
// street is put together here, from the same parts the locator files.
const dcSchema = z.object({
  ADDRESS_NUMBER: number,
  ADDRESS_NUMBER_SUFFIX: text,
  STREET_NAME: text,
  STREET_TYPE: text,
  QUADRANT: text,
});
const sfSchema = z.object({
  address_number: text,
  address_number_suffix: text,
  street_name: text,
  street_type: text,
});
const laSchema = z.object({
  Number: text,
  PreDirAbbr: text,
  PreType: text,
  StreetName: text,
  PostTypeAbbr: text,
  PostDirAbbr: text,
  ZipCode: text,
});
// The ZIP (addrzip) is what the city's locator files an address under; see indexQuery.
const sdSchema = z.object({
  addrnmbr: number,
  addrpdir: text,
  addrname: text,
  addrsfx: text,
  addrpostd: text,
  addrzip: z.union([z.string(), z.number()]).nullish(),
});
// King County's layer also carries USPS ZIP+4 and carrier route fields, which are never read.
const seaSchema = z.object({
  ADDR_NUM: number,
  ADDR_PD: text,
  ADDR_PT: text,
  ADDR_SN: text,
  ADDR_ST: text,
  ADDR_SD: text,
});

const select = (schema: z.ZodObject) => Object.keys(schema.shape).join(',');

const arcgisSpec = (
  name: SourceKey,
  schema: z.ZodObject,
  {
    where,
    orderBy = 'OBJECTID',
    pageRows = 2000,
    byId = true,
  }: { where?: string; orderBy?: string; pageRows?: number; byId?: boolean } = {},
): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select: select(schema),
  pageRows,
  arcgis: { layer: SOURCES[name].id, orderBy, where, byId },
  optional: true,
});

/** A street from its parts, skipping the empty ones: "S HUDSON AVE". */
const joined = (...parts: (string | null | undefined)[]) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

const one = (number: string | number | null | undefined, street: string, place: string) =>
  number != null && String(number).trim() && street
    ? [{ number: String(number).trim(), street, place }]
    : [];

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
  dc: {
    // DC's map server won't give the id range that paging by id starts from; at 143,000 rows,
    // paging by offset is quick enough.
    spec: arcgisSpec('dcAddresses', dcSchema, {
      where: "STATUS = 'ACTIVE' AND ADDRESS_TYPE = 'ADDRESS'",
      byId: false,
    }),
    toAddresses: (row) => {
      const point = dcSchema.parse(row);
      return one(
        point.ADDRESS_NUMBER == null
          ? null
          : `${point.ADDRESS_NUMBER}${point.ADDRESS_NUMBER_SUFFIX?.trim() ?? ''}`,
        joined(point.STREET_NAME, point.STREET_TYPE, point.QUADRANT),
        'Washington, DC',
      );
    },
  },
  sf: {
    spec: {
      name: 'sfAddresses',
      id: SOURCES.sfAddresses.id,
      schema: sfSchema,
      select: select(sfSchema),
      pageRows: 50_000,
      socrata: 'https://data.sf.gov/resource',
      optional: true,
    },
    toAddresses: (row) => {
      const point = sfSchema.parse(row);
      return one(
        point.address_number &&
          `${point.address_number}${point.address_number_suffix?.trim() ?? ''}`,
        joined(point.street_name, point.street_type),
        'San Francisco',
      );
    },
  },
  // A half address ("516 1/2") files under its whole number here, which the locator also finds.
  la: {
    spec: arcgisSpec('laAddresses', laSchema, {
      where: "LegalComm = 'Los Angeles' AND UnitName IS NULL",
    }),
    toAddresses: (row) => {
      const point = laSchema.parse(row);
      return one(
        point.Number,
        joined(
          point.PreDirAbbr,
          point.PreType,
          point.StreetName,
          point.PostTypeAbbr,
          point.PostDirAbbr,
        ),
        point.ZipCode?.trim() ?? '',
      );
    },
  },
  // One row per address and parcel, so condo addresses repeat; the index keeps each once.
  sd: {
    spec: arcgisSpec('sdAddresses', sdSchema, {
      where: "addrjur = 'SD' AND addrunit IS NULL",
      orderBy: 'objectid',
    }),
    toAddresses: (row) => {
      const point = sdSchema.parse(row);
      return one(
        point.addrnmbr,
        joined(point.addrpdir, point.addrname, point.addrsfx, point.addrpostd),
        point.addrzip == null ? '' : String(point.addrzip).trim(),
      );
    },
  },
  sea: {
    spec: arcgisSpec('seaAddresses', seaSchema, { where: "CTYNAME = 'Seattle'", pageRows: 1000 }),
    toAddresses: (row) => {
      const point = seaSchema.parse(row);
      return one(
        point.ADDR_NUM,
        joined(point.ADDR_PD, point.ADDR_PT, point.ADDR_SN, point.ADDR_ST, point.ADDR_SD),
        'Seattle',
      );
    },
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
    spec: arcgisSpec('sjAddresses', sjSchema, { where: "Status = 'Active'" }),
    toAddresses: (row) => fromSuggestions(parseSjSuggestions(esri(row))),
  },
};

/** A city's address download, to add to its datasets. */
export const addressDatasets = (city: RegionId): DatasetSpec[] => {
  const source = ADDRESS_SOURCES[city];
  return source ? [source.spec] : [];
};
