import type { Region, RegionId } from '../../src/regions';

/**
 * NYC's geocoder answers almost anything with some New York address ("1 Main St, Boston, MA"
 * came back as 1 Main St, Brooklyn). The site lets the map show where it landed; an assistant
 * can't see that, so an address naming another state or another state's ZIP code is a miss.
 */

const STATE_OF: Record<RegionId, string> = {
  nyc: 'NY',
  dc: 'DC',
  sf: 'CA',
  la: 'CA',
  sd: 'CA',
  sea: 'WA',
  den: 'CO',
  chi: 'IL',
  dal: 'TX',
  sj: 'CA',
};

const STATES: Record<string, string> = {
  AL: 'alabama',
  AK: 'alaska',
  AZ: 'arizona',
  AR: 'arkansas',
  CA: 'california',
  CO: 'colorado',
  CT: 'connecticut',
  DE: 'delaware',
  DC: 'district of columbia',
  FL: 'florida',
  GA: 'georgia',
  HI: 'hawaii',
  ID: 'idaho',
  IL: 'illinois',
  IN: 'indiana',
  IA: 'iowa',
  KS: 'kansas',
  KY: 'kentucky',
  LA: 'louisiana',
  ME: 'maine',
  MD: 'maryland',
  MA: 'massachusetts',
  MI: 'michigan',
  MN: 'minnesota',
  MS: 'mississippi',
  MO: 'missouri',
  MT: 'montana',
  NE: 'nebraska',
  NV: 'nevada',
  NH: 'new hampshire',
  NJ: 'new jersey',
  NM: 'new mexico',
  NY: 'new york',
  NC: 'north carolina',
  ND: 'north dakota',
  OH: 'ohio',
  OK: 'oklahoma',
  OR: 'oregon',
  PA: 'pennsylvania',
  RI: 'rhode island',
  SC: 'south carolina',
  SD: 'south dakota',
  TN: 'tennessee',
  TX: 'texas',
  UT: 'utah',
  VT: 'vermont',
  VA: 'virginia',
  WA: 'washington',
  WV: 'west virginia',
  WI: 'wisconsin',
  WY: 'wyoming',
};

// The first three digits of each city's ZIP codes.
const ZIP_PREFIXES: Record<RegionId, RegExp> = {
  nyc: /^(10[0-4]|11[0-6])/,
  dc: /^20[0-5]/,
  sf: /^94[01]/,
  la: /^9(0[0-9]|1[0-8])/,
  sd: /^9(19|2[01])/,
  sea: /^98[01]/,
  den: /^802/,
  chi: /^60[67]/,
  dal: /^75[23]/,
  sj: /^951/,
};

/** The two-letter code when a comma-separated part is only a state: "NY", "N.Y.", "California". */
export const stateCode = (part: string): string | null => {
  const text = part.replace(/\./g, '').trim();
  if (text.toUpperCase() in STATES) return text.toUpperCase();
  return Object.entries(STATES).find(([, name]) => name === text.toLowerCase())?.[0] ?? null;
};

/** Whether a comma-separated part of an address is only a state: "NY", "N.Y.", "California". */
export const isState = (part: string): boolean => stateCode(part) !== null;

/** The states the covered cities are in. */
export const COVERED_STATES = new Set(Object.values(STATE_OF));

/** The state a typed address ends with, after a comma: ", MA", ", Massachusetts 02108". */
const namedState = (text: string): string | null => {
  const tail = text.split(',').slice(1).join(',').trim();
  if (!tail) return null;
  const words = tail.replace(/\b\d{5}(-\d{4})?\b/g, '').trim();
  const code = /\b([A-Z]{2})\.?\s*$/i.exec(words)?.[1]?.toUpperCase();
  if (code && code in STATES) return code;
  const lower = words.toLowerCase();
  // Longest first, so "west virginia" isn't read as "virginia".
  const byLength = Object.entries(STATES).sort((a, b) => b[1].length - a[1].length);
  return byLength.find(([, name]) => new RegExp(`\\b${name}\\s*$`).test(lower))?.[0] ?? null;
};

export const namesAnotherPlace = (text: string, region: Region): boolean => {
  const state = namedState(text);
  // "Washington" ends DC addresses as often as Seattle ones, and ", LA" or ", SD" names the
  // city, not Louisiana or South Dakota.
  const ambiguous = (state === 'WA' && region.id === 'dc') || state === region.short;
  if (state && state !== STATE_OF[region.id] && !ambiguous) return true;
  const zip = /\b(\d{5})(-\d{4})?\s*$/.exec(text.trim())?.[1];
  return zip !== undefined && !ZIP_PREFIXES[region.id].test(zip);
};
