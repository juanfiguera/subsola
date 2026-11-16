import { z } from 'zod';
import type { Position } from 'geojson';
import { columnsOf, fetchSocrata, pointSchema, withinCircle } from './socrata';
import { SOURCES } from './catalog';
import type { AssetFeature } from './assets';

/** A pipe end at a waterway, from DEP's citywide outfall inventory. */
export const outfallSchema = z.object({
  the_geom: pointSchema,
  unitid: z.string().optional(),
  outfall_ty: z.string().optional(),
  ownership: z.string().optional(),
  location: z.string().optional(),
  of_size: z.string().optional(),
  receiving_: z.string().optional(),
  treatment_: z.string().optional(),
});

type OutfallRow = z.infer<typeof outfallSchema>;

// The inventory's own codes; the ones not listed are shown as given.
const OUTFALL_TYPES: Record<string, string> = {
  CSO: 'Combined sewer overflow',
  MS4: 'Storm sewer (MS4)',
  DIRECT: 'Direct drainage',
  HIGHWAY: 'Highway drainage',
  PLANT: 'Treatment plant',
  CLVT: 'Culvert',
  ABND: 'Abandoned',
};

const OWNERS: Record<string, string> = {
  DEP: 'NYC DEP',
  PVT: 'Private',
  PVT_PRE64: 'Private (before 1964)',
  NYSDOT: 'NYS DOT',
  NYSDEC: 'NYS DEC',
  UNK: 'Unknown',
  OTH: 'Other',
};

/** The wastewater treatment plant whose service area the outfall is in. */
const PLANTS: Record<string, string> = {
  HP: 'Hunts Point',
  BB: 'Bowery Bay',
  OB: 'Owls Head',
  WI: 'Wards Island',
  NC: 'Newtown Creek',
  TI: 'Tallman Island',
  RH: 'Rockaway',
  CI: 'Coney Island',
  JA: 'Jamaica',
  PR: 'Port Richmond',
  OH: 'Oakwood Beach',
  NR: 'North River',
  RK: 'Red Hook',
  '26W': '26th Ward',
};

const IMPLIES: Record<string, string> = {
  CSO: 'During heavy rain, combined sewage and runoff overflow here instead of reaching the treatment plant.',
  MS4: 'Untreated runoff from a separate storm sewer area discharges here. Catch basins in that area drain to it.',
};

const titleCase = (text: string) =>
  text.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

export const outfallsFromRows = (rows: OutfallRow[]): AssetFeature[] =>
  rows.map((row) => {
    const type = row.outfall_ty ?? '';
    const plant = row.treatment_ ? PLANTS[row.treatment_] : undefined;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: row.the_geom.coordinates },
      properties: {
        kind: 'outfall',
        utility: 'sewer',
        title: `Outfall ${row.unitid ?? ''}`.trim(),
        facts: [
          ['Type', OUTFALL_TYPES[type] ?? (type ? titleCase(type) : 'Not given')],
          ['Into', row.receiving_ ? titleCase(row.receiving_) : 'Not given'],
          ['Size', row.of_size ?? 'Not given'],
          ['Owner', OWNERS[row.ownership ?? ''] ?? row.ownership ?? 'Not given'],
          ...(row.location ? [['Location', titleCase(row.location)] as [string, string]] : []),
          ...(plant ? [['Plant area', `${plant} treatment plant`] as [string, string]] : []),
          ...(IMPLIES[type] ? [['Implies', IMPLIES[type]] as [string, string]] : []),
        ],
        sourceKey: 'outfalls',
      },
    };
  });

export const fetchOutfalls = async ([lng, lat]: Position, radius: number, signal?: AbortSignal) =>
  outfallsFromRows(
    await fetchSocrata(
      SOURCES.outfalls.id,
      { where: withinCircle('the_geom', lat!, lng!, radius), select: columnsOf(outfallSchema) },
      outfallSchema,
      signal,
    ),
  );
