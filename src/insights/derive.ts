import type { CityKey, Insights, LeadSummary } from './schema';

/**
 * Turns insights.json into what the page prints: readable names, combined holders, the systems
 * and cities each section compares. Pure, so every number the page shows can be tested from a
 * fixture.
 */

export const CITY_LABELS: Record<CityKey, string> = {
  nyc: 'New York',
  dc: 'Washington, DC',
  sf: 'San Francisco',
  la: 'Los Angeles',
  sd: 'San Diego',
  sea: 'Seattle',
  den: 'Denver',
  chi: 'Chicago',
};

/**
 * The cities whose permits name one block each. LA and San Diego file one permit per job, often
 * on a whole street, so their repeat-dig figures would measure filing, not digging.
 */
export const BLOCK_CITIES: CityKey[] = ['nyc', 'dc', 'sf', 'sea', 'den', 'chi'];

const numberFormat = new Intl.NumberFormat('en-US');

export const formatInt = (value: number) => numberFormat.format(Math.round(value));

/** "71.9%", "4%", "n/a" when the share couldn't be worked out. */
export const formatPct = (value: number | null) =>
  value === null ? 'n/a' : `${value.toFixed(1).replace(/\.0$/, '')}%`;

/** A share with its count, where a rounded 0% would hide a real handful: "under 0.1% (140)". */
export const formatShare = (pct: number | null, count: number | null) => {
  if (count === null || pct === null) return 'not listed';
  const share = pct === 0 && count > 0 ? 'under 0.1%' : formatPct(pct);
  return `${share} (${formatInt(count)})`;
};

/** "November 8, 2026", from an ISO timestamp, in New York's day as the map uses. */
export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'America/New_York',
  }).format(new Date(iso));

const LOWER = new Set(['between', 'and', 'from', 'to', 'of', 'at']);
const UPPER = new Set(['NE', 'NW', 'SE', 'SW']);

const tidyWord = (word: string): string => {
  if (!word) return word;
  const upper = word.toUpperCase();
  if (LOWER.has(word.toLowerCase())) return word.toLowerCase();
  if (UPPER.has(upper)) return upper;
  // "07TH" to "7th", "1ST" to "1st".
  const ordinal = /^0*(\d+)(ST|ND|RD|TH)$/.exec(upper);
  if (ordinal) return `${ordinal[1]}${ordinal[2]!.toLowerCase()}`;
  if (/^\d+$/.test(word)) return word.replace(/^0+(?=\d)/, '');
  // Single letters are street names or directions: "M St", "S King St".
  if (word.length === 1) return upper;
  return upper[0] + upper.slice(1).toLowerCase();
};

/**
 * A block as the cities' street files spell it, in capitals, made readable:
 * "WEST 56 STREET between 5 AVENUE and 6 AVENUE, MANHATTAN" to
 * "West 56 Street between 5 Avenue and 6 Avenue, Manhattan".
 */
export const tidyStreet = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((token) =>
      token
        .split(/([/,-])/)
        .map((part) => (/^[/,-]$/.test(part) ? part : tidyWord(part)))
        .join(''),
    )
    .join(' ');

/** The holders New York files under more than one name, by the name people know. */
const HOLDER_ALIASES: [RegExp, string][] = [
  [/CONSOLIDATED EDISON|\bCON ?ED\b/, 'Con Edison'],
  // National Grid bought KeySpan, which had bought Brooklyn Union Gas; filings carry all three.
  [/NATIONAL GRID|KEYSPAN|BROOKLYN UNION/, 'National Grid'],
  [/VERIZON/, 'Verizon'],
  [/ENVIRONMENTAL PROT/, 'NYC Environmental Protection'],
  [/EMPIRE CITY SUBWAY/, 'Empire City Subway'],
];

const READS_AS_PERSON = /^[A-Z]+ [A-Z]\. [A-Z]+$/;

const SUFFIX = /[,\s]+(INC|CORP|CORPORATION|CO|COMPANY|LLC|L\.L\.C|LTD|LP)\.?$/;

/** A permittee as filed ("MASPETH SUPPLY CO.,LLC") made readable ("Maspeth Supply"). */
export const holderName = (raw: string) => {
  const upper = raw.trim().toUpperCase();
  const alias = HOLDER_ALIASES.find(([pattern]) => pattern.test(upper));
  if (alias) return alias[1];
  let name = upper;
  for (let stripped = name.replace(SUFFIX, ''); stripped !== name;) {
    // One word left is too little to know the company by ("JRCRUZ CORP." stays whole).
    if (!stripped.includes(' ')) break;
    // Nor is a bare name that reads as a person's ("JOSEPH L. BALKAN, INC." keeps its Inc.).
    if (READS_AS_PERSON.test(stripped)) break;
    name = stripped;
    stripped = name.replace(SUFFIX, '');
  }
  return (
    name
      .split(' ')
      // Initials ("C.A.C.", "L.") stay as written.
      .map((word) => (/^([A-Z]\.)+$/.test(word) ? word : tidyWord(word)))
      .join(' ')
  );
};

export interface HolderShare {
  holder: string;
  permits: number;
  pct: number | null;
}

/**
 * NYC's largest permit holders, with each company's filings under old names combined. Names the
 * pipeline grouped because they may be a person are left out: they aren't one holder.
 */
export const nycHolders = (insights: Insights, limit = 8): HolderShare[] => {
  const nyc = insights.permits.nyc;
  const openings = nyc.streetOpenings.value;
  const totals = new Map<string, number>();
  for (const { holder, permits } of nyc.topHolders.value) {
    if (/not shown/i.test(holder)) continue;
    const name = holderName(holder);
    totals.set(name, (totals.get(name) ?? 0) + permits);
  }
  return [...totals]
    .map(([holder, permits]) => ({
      holder,
      permits,
      pct: openings ? Math.round((1000 * permits) / openings) / 10 : null,
    }))
    .sort((a, b) => b.permits - a.permits)
    .slice(0, limit);
};

export interface ReopeningRow {
  city: CityKey;
  label: string;
  withinOneYear: number | null;
  withinThreeYears: number | null;
  medianDays: number | null;
  otherUtility90: number | null;
}

export const reopeningRows = (insights: Insights): ReopeningRow[] =>
  BLOCK_CITIES.flatMap((city) => {
    const reopening = insights.permits[city]?.reopening;
    if (!reopening) return [];
    return [
      {
        city,
        label: CITY_LABELS[city],
        withinOneYear: reopening.reopenedWithinOneYearPct.value,
        withinThreeYears: reopening.reopenedWithinThreeYearsPct.value,
        medianDays: reopening.medianDaysBetweenVisits.value,
        otherUtility90: reopening.otherUtilityWithin90DaysPct.value,
      },
    ];
  });

/** The first year a city's permits cover in earnest, and the last; null before the city joined. */
export const yearsCovered = (insights: Insights, city: CityKey): [number, number] | null => {
  const permits = insights.permits[city];
  if (!permits) return null;
  const first = permits.coveredYears[0] ?? Number(permits.range[0].slice(0, 4));
  return [first, Number(permits.range[1].slice(0, 4))];
};

export interface DugBlock {
  city: CityKey;
  label: string;
  block: string;
  digs: number;
  utilities: number;
}

const MOST_DUG: [CityKey, number][] = [
  ['nyc', 6],
  ['dc', 2],
  ['sf', 2],
  ['sea', 2],
  ['den', 2],
  ['chi', 2],
];

export const mostDugBlocks = (insights: Insights): DugBlock[] =>
  MOST_DUG.flatMap(([city, count]) =>
    (insights.permits[city]?.reopening.mostVisited.value ?? [])
      .filter((entry): entry is typeof entry & { block: string } => Boolean(entry.block))
      .slice(0, count)
      .map((entry) => ({
        city,
        label: CITY_LABELS[city],
        block: tidyStreet(entry.block),
        digs: entry.visits,
        utilities: entry.utilities.length,
      })),
  );

/** One mapped pipe system on the page, and what the city's map of it leaves out. */
const SYSTEMS: { key: string; name: string; scope: string }[] = [
  { key: 'laSewers', name: 'Los Angeles sewers', scope: 'City sewer mains in service' },
  { key: 'sdWaterMains', name: 'San Diego water mains', scope: 'City water mains' },
  { key: 'sdSewers', name: 'San Diego sewers', scope: 'City sewer mains' },
  {
    key: 'seaWaterMains',
    name: 'Seattle water mains',
    scope: 'Distribution mains only, 10 in and smaller; SPU publishes no transmission mains',
  },
  { key: 'seaSewers', name: 'Seattle sewers', scope: 'Sewer mainlines' },
  {
    key: 'denSewers',
    name: 'Denver sanitary sewers',
    scope: 'Public sanitary sewers; Denver Water publishes no water mains',
  },
  { key: 'denStormDrains', name: 'Denver storm drains', scope: 'Public storm pipes and culverts' },
  { key: 'sfSewerMains', name: 'San Francisco sewers', scope: 'Sewer mains, not side sewers' },
  {
    key: 'dcMains',
    name: 'Washington, DC water mains',
    scope: 'Mains 16 in and larger only; DC Water publishes no smaller mains',
  },
];

const MATERIAL_ALIASES: Record<string, string> = {
  'POLYVINYL CHLORIDE': 'PVC',
  POLYVINYLCHLORIDE: 'PVC',
  'VITRIFIED CLAY EXTRA STRENGTH': 'Vitrified clay',
  'REINFORCED CONCRETE PIPE': 'Reinforced concrete',
  'DUCTILE IRON PIPE': 'Ductile iron',
  'CAST IRON PIPE': 'Cast iron',
  'HIGH DENSITY POLYETHYLENE': 'HDPE plastic',
  'PLASTIC (HDPE)': 'HDPE plastic',
  'PRESTRESSED CONCRETE CYLINDER PIPE': 'Prestressed concrete cylinder',
  'NOT RECORDED': 'Not recorded',
  UNKNOWN: 'Not recorded',
};

export const OTHER_MATERIALS = 'Everything else';
export const NOT_RECORDED = 'Not recorded';

/** "ASBESTOS CEMENT" to "Asbestos cement", with the cities' variant spellings merged. */
export const materialName = (raw: string) => {
  const upper = raw.trim().toUpperCase();
  const alias = MATERIAL_ALIASES[upper];
  if (alias) return alias;
  return upper === 'PVC' ? 'PVC' : upper[0] + upper.slice(1).toLowerCase();
};

export interface MaterialShare {
  material: string;
  pct: number;
}

export interface PipeSystem {
  key: string;
  name: string;
  scope: string;
  miles: number;
  medianInstallYear: number | null;
  materials: MaterialShare[];
}

/** The three largest materials by share of length, and the rest together. */
export const materialShares = (byMaterial: Record<string, number | null>, top = 3) => {
  const merged = new Map<string, number>();
  for (const [raw, pct] of Object.entries(byMaterial)) {
    if (pct === null) continue;
    const name = materialName(raw);
    merged.set(name, (merged.get(name) ?? 0) + pct);
  }
  const largest = [...merged]
    .map(([material, pct]) => ({ material, pct: Math.round(pct * 10) / 10 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, top);
  const rest = Math.round((100 - largest.reduce((sum, entry) => sum + entry.pct, 0)) * 10) / 10;
  return rest > 0 ? [...largest, { material: OTHER_MATERIALS, pct: rest }] : largest;
};

export const pipeSystems = (insights: Insights): PipeSystem[] =>
  SYSTEMS.flatMap(({ key, name, scope }) => {
    const pipe = insights.pipes[key];
    if (!pipe) return [];
    return [
      {
        key,
        name,
        scope,
        miles: pipe.miles.value,
        medianInstallYear: pipe.medianInstallYear.value,
        materials: materialShares(pipe.materialPctOfMiles.value),
      },
    ];
  }).sort((a, b) => b.miles - a.miles);

/** The largest material of one system, for the sentence above the chart. */
export const topMaterial = (systems: PipeSystem[], key: string) =>
  systems.find((system) => system.key === key)?.materials[0] ?? null;

export interface LeadRow {
  city: CityKey;
  label: string;
  summary: LeadSummary;
}

const LEAD_CITIES = ['nyc', 'dc', 'sd', 'sea', 'den'] as const;

/** A city whose inventory didn't download tonight has no rows, and is left out until it does. */
export const leadRows = (insights: Insights): LeadRow[] =>
  LEAD_CITIES.flatMap((city) => {
    const summary = insights.leadServiceLines[city]?.summary.value;
    return summary && summary.total > 0 ? [{ city, label: CITY_LABELS[city], summary }] : [];
  });

export interface SourceCredit {
  city: CityKey;
  label: string;
  entries: { name: string; publisher: string; license: string; url: string | null }[];
}

// Permits, the pipe systems above and the service line inventories; the licenses list also
// holds layers the page doesn't chart, such as storm drains.
const isShown = (key: string) =>
  /permits/i.test(key) ||
  /serviceLines$/i.test(key) ||
  SYSTEMS.some((system) => system.key === key);

/**
 * Every dataset the page's figures came from, by city, with its publisher and license as the
 * catalog states them. Datasets sharing a publisher and license are listed once.
 */
export const sourceCredits = (insights: Insights): SourceCredit[] =>
  (Object.keys(CITY_LABELS) as CityKey[]).flatMap((city) => {
    const licenses = insights.models.licenses[city];
    if (!licenses) return [];
    const seen = new Set<string>();
    const entries = Object.entries(licenses).flatMap(([key, source]) => {
      if (!isShown(key)) return [];
      const name = source.name ?? key;
      const id = `${name}|${source.publisher}|${source.license}`;
      if (seen.has(id)) return [];
      seen.add(id);
      return [
        { name, publisher: source.publisher, license: source.license, url: source.url ?? null },
      ];
    });
    return [{ city, label: CITY_LABELS[city], entries }];
  });
