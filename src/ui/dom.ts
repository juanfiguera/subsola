const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Every string from a dataset goes through this; permit notes are free text typed by crews. */
export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]!);

// Company suffixes that read wrong in title case ("Llc").
const ACRONYMS = /\b(Llc|Lp|Llp|Nyc|Dep|Ddc|Dot|Dc|Ddot|Rcn|At&T|Pg&E|Sfpuc)\b/g;

export const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(ACRONYMS, (word) => word.toUpperCase())
    // "Mcallister" is McAllister.
    .replace(/\bMc([a-z])/g, (_, letter: string) => `Mc${letter.toUpperCase()}`);

const ordinal = (n: number) => {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

const SUFFIX: Record<string, string> = {
  STREET: 'St',
  AVENUE: 'Ave',
  BOULEVARD: 'Blvd',
  ROAD: 'Rd',
  PLACE: 'Pl',
  DRIVE: 'Dr',
  LANE: 'Ln',
  PARKWAY: 'Pkwy',
};

/** "25-87 37 STREET" becomes "25-87 37th St", the way people write it. */
export const prettyAddress = (line: string): string => {
  // DC permits name a block by its address range: "600 - 699 BLOCK OF 7TH STREET NW".
  const block = /^(\d+)\s*-\s*\d+\s+BLOCK\s+OF\s+(.+)$/i.exec(line.trim());
  if (block) return `${block[1]} block of ${prettyAddress(block[2]!)}`;
  const words = line.trim().split(/\s+/);
  return words
    .map((word, i) => {
      const upper = word.toUpperCase();
      if (SUFFIX[upper]) return SUFFIX[upper];
      // DC's quadrants are part of the address: "800 F St NW".
      if (i > 0 && /^(NW|NE|SW|SE)$/.test(upper)) return upper;
      if (i > 0 && /^\d+$/.test(word)) return ordinal(Number(word));
      if (/^\d+(ST|ND|RD|TH)$/.test(upper)) return word.toLowerCase();
      return /\d/.test(word) ? word : titleCase(word);
    })
    .join(' ');
};

/** City street data says "37 ST"; people say "37th St". */
export const streetName = (value: string) =>
  titleCase(value)
    .replace(
      /\b(\d+) (St|Ave|Rd|Pl|Dr|Ter|Ln|Blvd|Way|Ct)\b/g,
      (_, number: string, kind: string) => `${ordinal(Number(number))} ${kind}`,
    )
    // DC's quadrants are part of the name: "F St NW".
    .replace(/\b(Nw|Ne|Sw|Se)$/, (quadrant) => quadrant.toUpperCase());

// Brooklyn, Staten Island and parts of Queens get gas from National Grid, but its permits are
// still filed under the names it bought (KeySpan, Brooklyn Union Gas). People know it by one.
const NATIONAL_GRID = /KEYSPAN|BROOKLYN UNION GAS|NATIONAL GRID/i;

/** A permittee as people know the company today. */
// NYC's permittees come in capitals ("CONSOLIDATED EDISON"); names the build already wrote as
// people spell them ("SoCalGas", "LADWP") are left alone.
export const ownerName = (permittee: string) =>
  NATIONAL_GRID.test(permittee)
    ? 'National Grid'
    : // A short all-capitals name is an acronym (LADWP, SFPUC), not a shout (VERIZON).
      permittee === permittee.toUpperCase() && (/\s/.test(permittee) || permittee.length > 5)
      ? titleCase(permittee)
      : permittee;
