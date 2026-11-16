import { z } from 'zod';
import type { MultiPolygon } from 'geojson';
import { columnsOf, fetchSocrata, intersectsBox, multiPolygonSchema } from './socrata';
import { SOURCES } from './catalog';
import type { Bbox } from './assets';

export type ServiceMaterial = 'lead' | 'galvanized' | 'non-lead' | 'unknown';

/**
 * One side of a line DC Water and San Diego record in two: the utility's, and the owner's. In
 * Seattle, SPU's two pieces: main to meter, and meter to union.
 */
export interface ServiceSide {
  material: ServiceMaterial;
  verified: boolean;
  /** As the utility names it: "Copper", "Galvanized Iron with Lead". */
  pipe: string;
}

/** One tax lot's water service line, as the city's lead service line inventory records it. */
export interface ServiceLot {
  bbl: string;
  address: string;
  /** The worse of the two sides, where the inventory records them apart. */
  material: ServiceMaterial;
  /** How it's known: "Field Inspection", "Records", "Excavation", "Not Verified". */
  basis: string;
  cityOwned: boolean;
  lot: MultiPolygon;
  /** Whose inventory: DEP's in New York, DC Water's in DC, the city's in San Diego, SPU's, Denver Water's. */
  source:
    'serviceLines' | 'dcServiceLines' | 'sdServiceLines' | 'seaServiceLines' | 'denServiceLines';
  sides?: { public: ServiceSide; private: ServiceSide };
  /** Where the line leaves the main, where the utility maps it (Seattle). */
  tap?: [number, number];
  sizeIn?: number;
  installedYear?: number;
  /** When the building was built, where the inventory goes by it (Denver). */
  builtYear?: number;
}

export const serviceLotRowSchema = z.object({
  the_geom: multiPolygonSchema,
  tbbl: z.string(),
  address: z.string().optional(),
  material: z.string(),
  record_ty: z.string().optional(),
  city_owned: z.string().optional(),
});

/** Null for lots DEP marks "Non-Applicable", which have no service line to draw. */
export const materialOf = (raw: string): ServiceMaterial | null => {
  const value = raw.toLowerCase();
  if (value.startsWith('non-applicable')) return null;
  if (value.startsWith('non-lead')) return 'non-lead';
  if (value.startsWith('lead')) return 'lead';
  // DEP counts galvanized pipe that was ever downstream of lead as needing replacement too.
  if (value.startsWith('galvanized')) return 'galvanized';
  return 'unknown';
};

const sideSchema = z.object({
  material: z.enum(['lead', 'galvanized', 'non-lead', 'unknown']),
  verified: z.boolean(),
  pipe: z.string(),
});

/**
 * As the nightly build writes lots, other cities' included. Kept apart from
 * `serviceLotRowSchema`, whose columns are what's asked of NYC Open Data.
 */
export const builtServiceLotRowSchema = serviceLotRowSchema.extend({
  source: z
    .enum(['dcServiceLines', 'sdServiceLines', 'seaServiceLines', 'denServiceLines'])
    .optional(),
  public_side: sideSchema.optional(),
  private_side: sideSchema.optional(),
  tap: z.tuple([z.number(), z.number()]).optional(),
  size_in: z.number().optional(),
  installed_year: z.number().optional(),
  built_year: z.number().optional(),
});

export type ServiceLotRow = z.infer<typeof builtServiceLotRowSchema>;

export const fetchServiceLots = async (bbox: Bbox, signal?: AbortSignal): Promise<ServiceLot[]> =>
  serviceLotsFromRows(
    await fetchSocrata(
      SOURCES.serviceLines.id,
      { where: intersectsBox('the_geom', bbox), select: columnsOf(serviceLotRowSchema) },
      serviceLotRowSchema,
      signal,
    ),
  );

export const serviceLotsFromRows = (rows: ServiceLotRow[]): ServiceLot[] =>
  rows.flatMap((row) => {
    const material = materialOf(row.material);
    if (!material) return [];
    return [
      {
        bbl: row.tbbl,
        address: row.address ?? '',
        material,
        basis: row.record_ty ?? 'Not Verified',
        cityOwned: row.city_owned === 'Yes',
        lot: row.the_geom,
        source: row.source ?? 'serviceLines',
        ...(row.public_side && row.private_side
          ? { sides: { public: row.public_side, private: row.private_side } }
          : {}),
        ...(row.tap ? { tap: row.tap } : {}),
        ...(row.size_in ? { sizeIn: row.size_in } : {}),
        ...(row.installed_year ? { installedYear: row.installed_year } : {}),
        ...(row.built_year ? { builtYear: row.built_year } : {}),
      },
    ];
  });
