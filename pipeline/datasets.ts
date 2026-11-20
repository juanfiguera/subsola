import type { z } from 'zod';
import { SOURCES, type SourceKey } from '../src/sources/catalog';
import { columnsOf } from '../src/sources/socrata';
import { permitSchema, UTILITY_TYPE_FILTER } from '../src/sources/permits';
import { streetRowSchema } from '../src/sources/streets';
import { serviceLotRowSchema } from '../src/sources/services';
import { currentConnectionSchema, historicConnectionSchema } from '../src/sources/connections';
import {
  buildingSchema,
  catchBasinSchema,
  curbSchema,
  hydrantSchema,
  linkSchema,
  polygonSchema,
} from '../src/sources/assets';
import {
  accessibleSignalSchema,
  exclusiveSignalSchema,
  lpiSignalSchema,
} from '../src/sources/signals';
import { elevationSchema, STREET_SPOTS_FILTER } from '../src/sources/elevations';
import { outfallSchema } from '../src/sources/outfalls';
import { CON_ED_FIELDS, CON_ED_STRUCTURES_LAYER, conEdStructureSchema } from '../src/sources/conEd';
import type { RegionId } from '../src/regions';
import { DC_DATASETS } from './dc/datasets';
import { SF_DATASETS } from './sf/datasets';
import { LA_DATASETS } from './la/datasets';
import { SD_DATASETS } from './sd/datasets';
import { SEA_DATASETS } from './sea/datasets';
import { DEN_DATASETS } from './den/datasets';
import { CHI_DATASETS } from './chi/datasets';
import { DAL_DATASETS } from './dal/datasets';

export interface DatasetSpec {
  name: SourceKey;
  id: string;
  schema: z.ZodObject;
  select: string;
  where?: string;
  /** Rows per request. Big polygons get smaller pages: past about 100 MB a response comes back cut off. */
  pageRows: number;
  /**
   * Set for a dataset that lives in an ArcGIS layer instead of NYC Open Data. With `geometry`,
   * each row also carries its shape, in longitude and latitude, as `geometry` (Esri JSON).
   */
  arcgis?: {
    layer: string;
    orderBy: string;
    where?: string;
    geometry?: boolean;
    /**
     * Pages by ranges of `orderBy` (a numeric id) instead of by offset. Some servers take seconds
     * to skip to a deep offset: LA's buildings took 20 s a page that way, half a second by id.
     */
    byId?: boolean;
    /** Only features crossing this [west, south, east, north] box, for a layer that spans a county. */
    within?: [number, number, number, number];
  };
  /**
   * Set for a dataset a portal publishes only as one CSV file. The rows whose columns match each
   * pattern are kept, with the `select` columns, as text.
   */
  csv?: { url: string; match: Record<string, RegExp> };
  /** The Socrata portal's resource URL, for a dataset not on NYC Open Data. */
  socrata?: string;
  /**
   * The night's build goes ahead without this dataset if its server is down, rather than every
   * city missing a night. Set for a city's map layers; never for permits, the heart of a city.
   */
  optional?: boolean;
}

const spec = (
  name: SourceKey,
  schema: z.ZodObject,
  { where, pageRows = 50_000 }: { where?: string; pageRows?: number } = {},
): DatasetSpec => ({
  name,
  id: SOURCES[name].id,
  schema,
  select: columnsOf(schema),
  where,
  pageRows,
});

/** New York's datasets, with the same columns and filters the app asks for. */
const NYC_DATASETS: DatasetSpec[] = [
  spec('hydrants', hydrantSchema),
  spec('catchBasins', catchBasinSchema),
  spec('linkNyc', linkSchema),
  spec('signalsLpi', lpiSignalSchema),
  spec('signalsAccessible', accessibleSignalSchema),
  spec('signalsExclusive', exclusiveSignalSchema),
  spec('elevations', elevationSchema, { where: STREET_SPOTS_FILTER }),
  spec('outfalls', outfallSchema),
  spec('centerline', streetRowSchema),
  spec('connectionPermitsHistoric', historicConnectionSchema),
  spec('connectionPermits', currentConnectionSchema),
  spec('serviceLines', serviceLotRowSchema),
  spec('curbs', curbSchema),
  spec('roadbed', polygonSchema, { pageRows: 10_000 }),
  spec('sidewalks', polygonSchema, { pageRows: 10_000 }),
  spec('buildings', buildingSchema),
  spec('permitsCurrent', permitSchema, { where: `(${UTILITY_TYPE_FILTER})` }),
  spec('permitsHistoric', permitSchema, { where: `(${UTILITY_TYPE_FILTER})` }),
  {
    name: 'conEdStructures',
    id: SOURCES.conEdStructures.id,
    schema: conEdStructureSchema,
    select: CON_ED_FIELDS,
    // The layer's own cap per request.
    pageRows: 1000,
    arcgis: { layer: CON_ED_STRUCTURES_LAYER, orderBy: 'OBJECTID_1' },
  },
];

/** Each city's datasets, so one city can be downloaded and built alone (CITY=sea). */
export const CITY_DATASETS: Record<RegionId, DatasetSpec[]> = {
  nyc: NYC_DATASETS,
  dc: DC_DATASETS,
  sf: SF_DATASETS,
  la: LA_DATASETS,
  sd: SD_DATASETS,
  sea: SEA_DATASETS,
  den: DEN_DATASETS,
  chi: CHI_DATASETS,
  dal: DAL_DATASETS,
};

/** Every dataset the build reads, every city's. */
export const DATASETS: DatasetSpec[] = Object.values(CITY_DATASETS).flat();
