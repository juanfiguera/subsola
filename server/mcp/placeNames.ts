import { REGIONS, type Region, type RegionId } from '../../src/regions';
import { isState, namesAnotherPlace } from './places';

/**
 * Places people name in an address that belong to a covered city, beyond the city's own name:
 * New York's boroughs and the neighborhoods people write instead of a city. Each says which
 * cities it can mean ("Capitol Hill" is in DC, Seattle and Denver) and, in New York, which borough
 * the geocoder must have found. A named place that isn't listed here and isn't in the found
 * address is somewhere Subsola doesn't cover, so the answer is a miss, not a lookalike elsewhere:
 * "100 Main St, Boston" once came back as 190C Main St in the Bronx.
 */

export interface KnownPlace {
  regions: RegionId[];
  borough?: string;
}

const inBorough = (borough: string, ...places: string[]): [string, KnownPlace][] =>
  places.map((place) => [place, { regions: ['nyc'], borough }]);
const inCity = (region: RegionId, ...places: string[]): [string, KnownPlace][] =>
  places.map((place) => [place, { regions: [region] }]);

const NEIGHBORHOODS: [string, KnownPlace][] = [
  ...inBorough(
    'Manhattan',
    'manhattan',
    'harlem',
    'east harlem',
    'tribeca',
    'soho',
    'noho',
    'chelsea',
    'midtown',
    'east village',
    'west village',
    'greenwich village',
    'lower east side',
    'upper east side',
    'upper west side',
    'financial district',
    'washington heights',
    'inwood',
    'murray hill',
    'gramercy',
    "hell's kitchen",
    'battery park city',
  ),
  ...inBorough(
    'Brooklyn',
    'brooklyn',
    'williamsburg',
    'greenpoint',
    'bushwick',
    'park slope',
    'bed-stuy',
    'bedford-stuyvesant',
    'crown heights',
    'flatbush',
    'bay ridge',
    'red hook',
    'dumbo',
    'brooklyn heights',
    'sunset park',
    'coney island',
    'bensonhurst',
  ),
  ...inBorough(
    'Queens',
    'queens',
    'astoria',
    'long island city',
    'lic',
    'flushing',
    'jamaica',
    'forest hills',
    'jackson heights',
    'elmhurst',
    'corona',
    'woodside',
    'ridgewood',
    'bayside',
    'far rockaway',
    'rockaway',
    'kew gardens',
    'rego park',
    'maspeth',
    'whitestone',
    'college point',
    'ozone park',
    'richmond hill',
  ),
  ...inBorough('Bronx', 'bronx', 'the bronx', 'riverdale', 'mott haven', 'fordham'),
  ...inBorough('Staten Island', 'staten island', 'st george', 'tottenville'),
  ...inCity(
    'dc',
    'district of columbia',
    'navy yard',
    'dupont circle',
    'adams morgan',
    'foggy bottom',
    'anacostia',
    'columbia heights',
    'shaw',
    'petworth',
    'brookland',
    'logan circle',
  ),
  ...inCity(
    'sf',
    'mission district',
    'the mission',
    'soma',
    'south of market',
    'noe valley',
    'castro',
    'haight-ashbury',
    'nob hill',
    'north beach',
    'pacific heights',
    'sunset district',
    'outer sunset',
    'inner sunset',
    'richmond district',
    'bayview',
    'potrero hill',
    'russian hill',
    'excelsior',
    'bernal heights',
    'dogpatch',
    'tenderloin',
  ),
  ...inCity(
    'la',
    'hollywood',
    'north hollywood',
    'hollywood hills',
    'venice',
    'san pedro',
    'van nuys',
    'encino',
    'sherman oaks',
    'studio city',
    'silver lake',
    'echo park',
    'highland park',
    'westwood',
    'brentwood',
    'koreatown',
    'downtown los angeles',
    'dtla',
    'boyle heights',
    'wilmington',
    'reseda',
    'canoga park',
    'woodland hills',
    'eagle rock',
    'los feliz',
    'mar vista',
    'playa vista',
    'pacific palisades',
    'tarzana',
    'chatsworth',
    'northridge',
    'sylmar',
    'pacoima',
    'harbor city',
    'watts',
  ),
  ...inCity(
    'sd',
    'la jolla',
    'pacific beach',
    'ocean beach',
    'mission beach',
    'north park',
    'hillcrest',
    'mission valley',
    'point loma',
    'clairemont',
    'mira mesa',
    'rancho bernardo',
    'san ysidro',
    'university city',
    'gaslamp',
    'barrio logan',
    'normal heights',
    'city heights',
    'carmel valley',
    'tierrasanta',
    'little italy',
    'golden hill',
    'linda vista',
    'otay mesa',
  ),
  ...inCity(
    'sea',
    'ballard',
    'fremont',
    'queen anne',
    'wallingford',
    'west seattle',
    'beacon hill',
    'rainier valley',
    'rainier beach',
    'columbia city',
    'university district',
    'u district',
    'green lake',
    'greenwood',
    'phinney ridge',
    'magnolia',
    'belltown',
    'south lake union',
    'first hill',
    'central district',
    'madison park',
    'montlake',
    'ravenna',
    'wedgwood',
    'lake city',
    'northgate',
    'sodo',
    'pioneer square',
    'delridge',
    'alki',
    'eastlake',
  ),
  ...inCity(
    'den',
    'lodo',
    'five points',
    'cherry creek',
    'lohi',
    'rino',
    'baker',
    'washington park',
    'congress park',
    'park hill',
    'montbello',
    'green valley ranch',
    'globeville',
    'platt park',
    'cheesman park',
    'golden triangle',
  ),
  ...inCity(
    'chi',
    'the loop',
    'river north',
    'west loop',
    'wicker park',
    'bucktown',
    'logan square',
    'lincoln park',
    'lakeview',
    'wrigleyville',
    'hyde park',
    'pilsen',
    'bronzeville',
    'rogers park',
    'andersonville',
    'bridgeport',
  ),
  ...inCity(
    'dal',
    'deep ellum',
    'uptown',
    'oak cliff',
    'bishop arts',
    'bishop arts district',
    'lakewood',
    'lower greenville',
    'knox henderson',
    'oak lawn',
    'design district',
    'victory park',
    'the cedars',
    'lake highlands',
    'preston hollow',
    'pleasant grove',
    'trinity groves',
    'fair park',
    'west end',
  ),
  // More than one covered city has one.
  ['capitol hill', { regions: ['dc', 'sea', 'den'] }],
  ['georgetown', { regions: ['dc', 'sea'] }],
  ['chinatown', { regions: ['nyc', 'sf', 'la'] }],
  ['south park', { regions: ['sd', 'sea'] }],
  ['sunnyside', { regions: ['nyc', 'den'] }],
  ['mission', { regions: ['sf'] }],
];

const placeKey = (text: string) =>
  text.toLowerCase().replace(/[’]/g, "'").replace(/\./g, '').replace(/\s+/g, ' ').trim();

/** Each city by its own names, so a city added to REGIONS is known here without an edit. */
const cityPlaces = (regions: Region[]): [string, KnownPlace][] =>
  regions.flatMap((region) =>
    [region.name, region.name.split(',')[0]!, region.short].map((name): [string, KnownPlace] => [
      name,
      { regions: [region.id] },
    ]),
  );

const buildIndex = (regions: Region[]) => {
  const index = new Map<string, KnownPlace>();
  // Cities first, so a neighborhood never shadows a city's own name.
  for (const [name, place] of [...cityPlaces(regions), ...NEIGHBORHOODS])
    if (!index.has(placeKey(name))) index.set(placeKey(name), place);
  return index;
};

let index: Map<string, KnownPlace> | null = null;

/** What a place name means in Subsola's cities, or null for anywhere else. */
export const knownPlace = (name: string): KnownPlace | null =>
  (index ??= buildIndex(REGIONS)).get(placeKey(name)) ?? null;

/**
 * The places an address names after its street line, without states, ZIP codes and unit numbers:
 * "117 West St, Apt 2, Brooklyn NY 11222" names Brooklyn. A state on its own (", NY",
 * ", Washington") is left to the state check, since "Washington" and "New York" are also cities.
 */
export const namedPlaces = (text: string): string[] =>
  text
    .split(',')
    .slice(1)
    .map((part) => part.replace(/\b\d{5}(-\d{4})?\b/g, '').trim())
    .flatMap((part) => {
      // A unit, floor or suite has a number in it; a place name doesn't.
      if (!part || /\d/.test(part) || isState(part)) return [];
      if (/^(usa|us|united states)$/i.test(part.replace(/\./g, ''))) return [];
      if (knownPlace(part)) return [part];
      // "Brooklyn NY", "Washington DC": the place before a state code.
      const beforeState = part.replace(/\s+[A-Z]\.?[A-Z]\.?$/i, '').trim();
      if (beforeState !== part && isState(part.slice(beforeState.length)))
        return isState(beforeState) ? [] : [beforeState];
      return [part];
    });

/** The covered cities an address's places allow, or null when it names none of them. */
export const citiesNamed = (text: string): RegionId[] | null => {
  let allowed: RegionId[] | null = null;
  for (const name of namedPlaces(text)) {
    const place = knownPlace(name);
    if (!place) continue;
    allowed = allowed ? allowed.filter((id) => place.regions.includes(id)) : [...place.regions];
  }
  return allowed;
};

export type PlaceProblem =
  | { kind: 'other-state' }
  | { kind: 'unknown-place'; place: string }
  | { kind: 'other-city'; place: string; regions: RegionId[] }
  | { kind: 'other-borough'; place: string; borough: string };

/**
 * What's wrong with a geocoder's answer for the place the address names, or null when nothing
 * is. A place Subsola doesn't list still passes when the found address carries it: GeoSearch
 * labels Queens addresses with their neighborhood ("25-87 37 Street, Astoria, NY").
 */
export const placeProblem = (
  text: string,
  region: Region,
  found: { label: string; borough: string },
): PlaceProblem | null => {
  if (namesAnotherPlace(text, region)) return { kind: 'other-state' };
  const label = placeKey(found.label);
  for (const name of namedPlaces(text)) {
    const place = knownPlace(name);
    if (!place) {
      if (label.includes(placeKey(name))) continue;
      return { kind: 'unknown-place', place: name };
    }
    if (!place.regions.includes(region.id))
      return { kind: 'other-city', place: name, regions: place.regions };
    if (place.borough && place.borough.toLowerCase() !== found.borough.toLowerCase())
      return { kind: 'other-borough', place: name, borough: found.borough };
  }
  return null;
};
