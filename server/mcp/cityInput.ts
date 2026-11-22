import { z } from 'zod';
import { REGIONS, type RegionId } from '../../src/regions';

/**
 * The `city` tool input. Models write the city the way people do ("Los Angeles", "NYC",
 * "Brooklyn", "D.C."), so any of these is read as the region's id rather than rejected.
 */

// Beyond each region's id, name and short name. Boroughs count as New York City, since that's
// how people name where they are.
const ALIASES: Record<RegionId, string[]> = {
  nyc: [
    'New York',
    'NYC',
    'New York City',
    'Manhattan',
    'Brooklyn',
    'Queens',
    'Bronx',
    'The Bronx',
    'Staten Island',
  ],
  dc: ['Washington', 'Washington DC', 'DC', 'D.C.'],
  sf: ['SF', 'San Francisco'],
  la: ['LA', 'Los Angeles'],
  sd: ['San Diego', 'SD'],
  sea: ['Seattle'],
  den: ['Denver'],
  chi: ['Chicago'],
  dal: ['Dallas'],
  sj: ['San Jose', 'San José', 'San Jose CA'],
};

/** Lower case, punctuation dropped, spaces collapsed: "Washington, D.C." to "washington dc". */
export const cityKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const BY_KEY = new Map<string, RegionId>(
  REGIONS.flatMap((region) =>
    [region.id, region.name, region.short, ...ALIASES[region.id]].map(
      (name) => [cityKey(name), region.id] as const,
    ),
  ),
);

/** The region a typed city name means, or null. */
export const cityIdOf = (text: string): RegionId | null => BY_KEY.get(cityKey(text)) ?? null;

const choices = REGIONS.map((region) => `"${region.id}" (${region.name})`).join(', ');

export const cityInput = z
  .string()
  // The ids, listed in the published schema where an enum used to be; the docs page shows them.
  .meta({ examples: REGIONS.map((region) => region.id) })
  .transform((value, ctx): RegionId => {
    const id = cityIdOf(value);
    if (id) return id;
    ctx.addIssue({
      code: 'custom',
      message: `${JSON.stringify(value.slice(0, 60))} isn't a city Subsola covers. Use one of ${choices}; full names like "Los Angeles" work too`,
    });
    return z.NEVER;
  })
  .optional()
  .describe(
    `Which city the address is in, to search only that city and rule out a lookalike address elsewhere. One of ${REGIONS.map((region) => `"${region.id}" for ${region.name}`).join(', ')}. The full name or a common short form works too, in any case: "Los Angeles", "NYC", "Brooklyn", "D.C.".`,
  );
