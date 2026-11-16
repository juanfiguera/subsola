import { knownPlace } from './placeNames';
import { COVERED_STATES, stateCode } from './places';

/**
 * Which uncovered place an address asked about, for the stats' "missed places" table, so the
 * owner can see which city to add next. The answer only ever comes from the fixed lists here
 * (a city and its state, or a state alone), never from what was typed: a street, a house number
 * or a stray sentence can't be stored because nothing outside these lists is ever returned.
 */

// Large US cities and the suburbs next to covered ones, as "Name:ST" or "Name:ST,ST" where the
// name is shared. Covered cities and their neighborhoods are left to placeNames.ts.
const CITIES = `
Albuquerque:NM;Alexandria:VA;Anaheim:CA;Anchorage:AK;Ann Arbor:MI;Arlington:VA,TX;Atlanta:GA;
Aurora:CO,IL;Austin:TX;Bakersfield:CA;Baltimore:MD;Baton Rouge:LA;Beverly Hills:CA;
Bellevue:WA,NE;Berkeley:CA;Bethesda:MD;Birmingham:AL;Boise:ID;Boston:MA;Boulder:CO;
Bridgeport:CT;Brookline:MA;Buffalo:NY;Burbank:CA;Cambridge:MA;Charleston:SC,WV;Charlotte:NC;
Chattanooga:TN;Chula Vista:CA;Cincinnati:OH;Cleveland:OH;Colorado Springs:CO;Columbus:OH,GA;
Culver City:CA;Dallas:TX;Des Moines:IA;Detroit:MI;Durham:NC;El Paso:TX;Evanston:IL;Fort Worth:TX;
Fremont:CA;Fresno:CA;Glendale:CA,AZ;Grand Rapids:MI;Greensboro:NC;Hartford:CT;Henderson:NV;
Hoboken:NJ;Honolulu:HI;Houston:TX;Indianapolis:IN;Inglewood:CA;Irvine:CA;Jacksonville:FL;
Jersey City:NJ;Kansas City:MO,KS;Knoxville:TN;Lakewood:CO,CA,NJ,OH,WA;Las Vegas:NV;
Lexington:KY;Lincoln:NE;Little Rock:AR;Long Beach:CA;Louisville:KY;Madison:WI;Memphis:TN;
Mesa:AZ;Miami:FL;Milwaukee:WI;Minneapolis:MN;Nashville:TN;New Haven:CT;New Orleans:LA;
Newark:NJ,DE;Norfolk:VA;Oak Park:IL;Oakland:CA;Oklahoma City:OK;Omaha:NE;Orlando:FL;
Pasadena:CA,TX;Philadelphia:PA;Phoenix:AZ;Pittsburgh:PA;Portland:OR,ME;Providence:RI;Provo:UT;
Raleigh:NC;Redmond:WA;Reno:NV;Richmond:VA,CA;Riverside:CA;Rochester:NY,MN;Sacramento:CA;
Salt Lake City:UT;San Antonio:TX;San Jose:CA;Santa Ana:CA;Santa Monica:CA;Savannah:GA;
Scottsdale:AZ;Silver Spring:MD;Somerville:MA;Spokane:WA;Springfield:IL,MA,MO;St Louis:MO;
St Paul:MN;St Petersburg:FL;Stamford:CT;Syracuse:NY;Tacoma:WA;Tampa:FL;Tempe:AZ;Toledo:OH;
Tucson:AZ;Tulsa:OK;Virginia Beach:VA;West Hollywood:CA;Wichita:KS;Worcester:MA;Yonkers:NY
`;

const placeKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim();

const CITY_INDEX = new Map(
  CITIES.split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, states] = entry.split(':') as [string, string];
      return [placeKey(name), { name, states: states.split(',') }] as const;
    }),
);

/** A part of an address split into a place and a state: "Boston MA" is Boston and MA. */
const splitState = (part: string): { place: string; state: string | null } => {
  const whole = stateCode(part);
  if (whole) return { place: '', state: whole };
  const trailing = /^(.*?)\s+([A-Z]\.?[A-Z]\.?)$/i.exec(part);
  const code = trailing ? stateCode(trailing[2]!) : null;
  return code ? { place: trailing![1]!.trim(), state: code } : { place: part, state: null };
};

/**
 * The uncovered city or state an address names, as "Boston, MA", "Portland" (when the state
 * isn't given and the name is shared) or "MA", or null when nothing from the lists is named.
 * A state alone counts only when no covered city is in it, so "350 5th Ave, NY" is never a miss.
 */
export const missedPlace = (text: string): string | null => {
  const parts = text
    .split(',')
    .slice(1)
    .map((part) => part.replace(/\b\d{5}(-\d{4})?\b/g, '').trim())
    // A unit, floor or street has a number in it; a place name doesn't.
    .filter((part) => part && !/\d/.test(part))
    .map(splitState);
  const state = parts.findLast((part) => part.state)?.state ?? null;
  for (const { place } of parts) {
    if (!place || knownPlace(place)) continue;
    const city = CITY_INDEX.get(placeKey(place));
    // "Portland, CA" is no Portland on the list; the state alone may still say something.
    if (!city || (state && !city.states.includes(state))) continue;
    if (state) return `${city.name}, ${state}`;
    return city.states.length === 1 ? `${city.name}, ${city.states[0]}` : city.name;
  }
  return state && !COVERED_STATES.has(state) ? state : null;
};
