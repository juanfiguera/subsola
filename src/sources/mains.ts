import { z } from 'zod';
import type { MultiLineString } from 'geojson';
import { multiLineSchema } from './socrata';
import type { SourceKey } from './catalog';

/**
 * A main on its surveyed route: DC Water's mains 16 in and larger, San Francisco's sewers,
 * Seattle City Light's underground lines. The only lines in the app drawn where they really run;
 * the rest are placed from permits.
 */
export interface SurveyedMain {
  id: string;
  utility: 'water' | 'sewer' | 'electric';
  /** Measured from the street to the top of the pipe, where the records allow. */
  depthFt: number | null;
  /**
   * For a sewer: "combined", "storm", "sanitary", or "side" for a building's own sewer (San
   * Francisco's side sewers, Los Angeles's house connections). For
   * water: "distribution", "transmission", or "recycled" for San Diego's purple pipe.
   */
  use: string | null;
  /** The building a side sewer serves, where the city records it. */
  address: string | null;
  /** Who owns it, where that isn't the city that maps it. */
  owner?: string;
  source: SourceKey;
  /** Inches across, or tall for an egg-shaped sewer. */
  diameterIn: number | null;
  /** In words: "Cast iron". */
  material: string | null;
  installedYear: number | null;
  line: MultiLineString;
}

export const builtMainRowSchema = z.object({
  id: z.string(),
  diameter_in: z.number().nullish(),
  material: z.string().nullish(),
  installed_year: z.number().nullish(),
  // Older builds had only DC Water's mains.
  utility: z.enum(['water', 'sewer', 'electric']).default('water'),
  depth_ft: z.number().nullish(),
  use: z.string().nullish(),
  address: z.string().nullish(),
  owner: z.string().nullish(),
  source: z
    .enum([
      'dcMains',
      'sfSewerMains',
      'sfSideSewers',
      'laSewers',
      'laSideSewers',
      'laStormDrains',
      'sdSewers',
      'sdWaterMains',
      'sdStormDrains',
      'sdRecycledMains',
      'seaSewers',
      'seaWaterMains',
      'seaSideSewers',
      'seaElectricLines',
      'denSewers',
      'denStormDrains',
    ])
    .default('dcMains'),
  the_geom: multiLineSchema,
});

export type BuiltMainRow = z.input<typeof builtMainRowSchema>;

// DC Water's material codes.
const MATERIALS: Record<string, string> = {
  CI: 'Cast iron',
  DI: 'Ductile iron',
  Steel: 'Steel',
  'PCCP-LCP': 'Prestressed concrete cylinder pipe',
  'PCCP-ECP': 'Prestressed concrete cylinder pipe',
  RCP: 'Reinforced concrete',
  Concrete: 'Concrete',
  PVC: 'PVC',
  FRP: 'Fiberglass',
};

/** Recycled water isn't for drinking: no building's water service taps it, nor any hydrant. */
export const isRecycled = (main: { use: string | null } | undefined) => main?.use === 'recycled';

/**
 * A city's storm drains as their own network (San Diego's, Los Angeles's, Denver's): named storm
 * drains, not sewers, and fed only by inlets. NYC's storm sewers are part of the sewer map
 * instead.
 */
const STORM_DRAIN_SOURCES = new Set<SourceKey>([
  'sdStormDrains',
  'laStormDrains',
  'denStormDrains',
]);
export const isStormDrain = (main: { source: SourceKey } | undefined | null) =>
  main ? STORM_DRAIN_SOURCES.has(main.source) : false;

export const mainMaterial = (code: string | null | undefined): string | null =>
  (code && MATERIALS[code]) ?? null;

export const mainsFromRows = (rows: z.infer<typeof builtMainRowSchema>[]): SurveyedMain[] =>
  rows.map((row) => ({
    id: row.id,
    utility: row.utility,
    depthFt: row.depth_ft ?? null,
    use: row.use ?? null,
    address: row.address ?? null,
    ...(row.owner ? { owner: row.owner } : {}),
    source: row.source,
    diameterIn: row.diameter_in ?? null,
    material: row.material ?? null,
    installedYear: row.installed_year ?? null,
    line: row.the_geom as MultiLineString,
  }));
