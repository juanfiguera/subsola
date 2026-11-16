/**
 * People's names in crew-typed permit text. Utility staff sign their permits ("T102172349
 * S.WEEMS", "(L.DEANS)", "Duperly/Brown") and crews note who told them what ("PER JOSH",
 * "designer: Noel Carino"). Text that's all capitals can't be told apart by case, so this goes by
 * the shapes names come in. A name written freely in a sentence can still get through.
 */

const NAME_REMOVED = '[name removed]';

// Words that follow "per", "contact" and the rest in ordinary permit language. A name slot that
// starts with one of these isn't a name: "per contract", "call from 311", "contact system".
const NOT_NAMES = new Set(
  `a an the and or with from for to at on of in by if any before after as is are be our your their
  this that these those all each new existing proposed
  contract contracts city ddc nycddc dot ddot dep dbi dob sdge sdg sffd sfwd sfpuc ntr nyc dc sf sd
  crew crews plan plans sketch drawing drawings print prints attached permit permits code codes
  section tcp customer customers request field inspector inspectors inspection engineer engineers
  engineering system spec specs specification specifications standard standards letter direction
  directions instruction instructions agreement mpl siod miss office department dept public
  emergency gas electric water sewer steam con ed edison pepco verizon national grid wgl owner owners
  landlord manager project site dig location locations design layout service services order orders
  work job wr wo markout markouts number phone email number address utility utilities approved
  approval review district ward police fire traffic detail details note notes requirement
  requirements condition conditions schedule restoration program telephone mobile cell
  office main mains line lines meter meters property building submitted release waiver
  communications comm cox att fiber trench bore replace install remove repair back notice eng pm
  per call contact by attn cc foreman supervisor designer dpw emra msp cdp accela imcat dsd sfgo
  wmata npl rps socal pipeline company enterprises contractor contractors
  st ave av rd pl dr blvd ct ln ter way pkwy hwy street avenue road place drive court lane terrace
  parkway boulevard broadway side removal`
    .split(/\s+/)
    .filter(Boolean),
);

// Streets named after people: "E. Houston St", "Dr. Carlton B. Goodlett Pl", "King Jr Ave".
const STREET_AFTER =
  /^\s*(?:[A-Za-z'-]+\s+){0,2}(?:st|ave?|rd|pl|dr|blvd|ct|ln|ter|way|pkwy|hwy|sq|cir|street|avenue|road|place|drive|court|lane|terrace|parkway|broadway|capitol)\b/i;
// Companies and places named after a person: "J. Flores Construction", "Joseph L. Alioto
// Performing Arts Piazza", "Thurgood Marshall High".
const NAMED_AFTER =
  /^\s*(?:const|construction|contracting|inc|co|corp|llc|&|and sons|performing|high|school|elementary|middle|academy|center|park|plaza|hall|library|playground|memorial|bridge|tunnel)\b/i;

// Words before a lone letter that make it a label, not an initial: "Points A and B. Perform",
// "18\" D. Carmel Valley", "point A. Seal".
const LABEL_BEFORE =
  /(?:\b(?:to|and|or|point|points|from|at|x|type|grid|sheet|phase|unit|lot|zone|block|area|section)|\d["']?)\s*$/i;

// Whether the crew typed in mixed case. The "[phone removed]" markers don't count.
const hasLowercase = (text: string) =>
  /[a-z]/.test(text.replace(/\[(?:name|phone|email) removed\]/g, ''));

// A word of letters, with apostrophes or hyphens only inside it ("O'Neil", "Carter-Moton").
const WORD = String.raw`[A-Za-z](?:[A-Za-z']|-(?=[A-Za-z]))+`;

const isName = (word: string) =>
  new RegExp(`^${WORD}$`).test(word) && !NOT_NAMES.has(word.toLowerCase());

/**
 * "S.WEEMS", "J. PARK", "STEPHEN J. PARK", "T101691100-A.MALLOZZI", but not "E. Houston St",
 * "R&R. Vaults" or "R-O-W. Zone". After a hyphen only the run-together tag counts. After a slash
 * the initial counts only when a word comes before it, as in crew pairs ("Hallen/R. Paquette"):
 * after a lone letter or a number it is a label ("C/L. MAIN", "N/S. Broadway", "1/2.").
 */
const INITIAL_SURNAME =
  /(?<![\w."'&])(?<!(?:^|[^A-Za-z])[A-Za-z]?\/)(?:([A-Za-z][A-Za-z'-]+) )?([A-Za-z])\.( ?)([A-Za-z][A-Za-z'-]{2,})\b/g;

const scrubInitials = (text: string) =>
  text.replace(
    INITIAL_SURNAME,
    (
      match,
      first: string | undefined,
      initial: string,
      space: string,
      last: string,
      offset: number,
    ) => {
      const after = text.slice(offset + match.length);
      if (STREET_AFTER.test(` ${last}${after}`) || NAMED_AFTER.test(after)) return match;
      // "S. Van Ness" is a street; staff tags run together ("S.WEEMS").
      if (/^[NSEW]$/i.test(initial) && space) return match;
      if (text[offset - 1] === '-' && space) return match;
      const before = `${text.slice(0, offset)}${first ? `${first} ` : ''}`;
      if (space && LABEL_BEFORE.test(before)) return match;
      // Mixed-case text spells names "Torres"; "D. CARMEL" there is a place or a code.
      if (space && hasLowercase(text) && !/^[A-Z][a-z]/.test(last)) return match;
      if (!isName(last)) return match;
      // A first name only goes with a middle initial ("STEPHEN J. PARK"); "SAT STIPS M.GILL" keeps "STIPS".
      const keepFirst = first && (!space || !isName(first)) ? `${first} ` : '';
      return `${keepFirst}${NAME_REMOVED}`;
    },
  );

// "MR. JAMES WARREN", "Mrs Lopez", "Ms. Diaz". In SF permits "MS" is a main sewer, and
// "MS.Summary" runs together, so "Ms." needs a space after it.
const AFTER_TITLE = new RegExp(
  String.raw`\b(mrs?(?:\.\s*|\s+)|ms\.\s+)(${WORD})(?:\s+(${WORD}))?(?:\s+(${WORD}))?`,
  'gi',
);
// "PER JOSH", "contact Samer Alhawamd", "Designer Name: Cris David".
const AFTER_CUE = new RegExp(
  String.raw`\b((?:per|call|contact|attn|thank you|thanks|designer(?: name)?|supervisor|foreman|point of contact is)[.:]?\s+)(${WORD})(?:\s+(${WORD}))?(?:\s+(${WORD}))?`,
  'gi',
);
// What can follow a name: the end, punctuation, or a word joining it to the rest ("PER DEREK WITH
// MPL", "per Barmore, at"). Anything else ("per SDG-123", "per PG&E", "per SDRSD 107") is a code.
const AFTER_NAME = /^(?:\s*$|\s*[,.;:)(\]]|\s+(?:with|from|of|at|w\/|@|and|to|re|on|for|in)\b)/i;

const replaceAfter = (pattern: RegExp) => (text: string) => {
  // In text with lowercase letters, a name is capitalized; in all capitals, anything goes.
  const capitalized = hasLowercase(text) ? (word: string) => /^[A-Z]/.test(word) : () => true;
  const looksLikeName = (word: string | undefined): word is string =>
    Boolean(word) && isName(word!) && word!.length > 2 && capitalized(word!);
  // In mixed-case text an all-capitals word is an agency ("per EMRA"); a lone short word in any
  // text usually is too ("PER DPW", "PER NPL").
  const acronym = (word: string) =>
    (hasLowercase(text) && word === word.toUpperCase()) || word.length < 4;
  return text.replace(pattern, (match, cue: string, ...rest: unknown[]) => {
    const words = (rest.slice(0, 3) as (string | undefined)[]).filter(Boolean) as string[];
    const offset = rest[3] as number;
    if (STREET_AFTER.test(` ${words.join(' ')}`)) return match;
    // Take the longest run of name-like words that ends where a name can end.
    for (let count = words.length; count > 0; count--) {
      const names = words.slice(0, count);
      if (!names.every(looksLikeName)) continue;
      if (count === 1 && acronym(names[0]!)) continue;
      const kept = match.slice(match.indexOf(names.at(-1)!, cue.length) + names.at(-1)!.length);
      if (!AFTER_NAME.test(`${kept}${text.slice(offset + match.length)}`)) continue;
      return `${cue}${NAME_REMOVED}${kept}`;
    }
    return match;
  });
};

const scrubTitles = replaceAfter(AFTER_TITLE);
const scrubCues = replaceAfter(AFTER_CUE);

// Sign-offs beside a contact that's already gone: "Umair Zia [phone removed]",
// "[email removed]) Ton/Mason", "ROBERT BROWN/[phone removed]".
// A first and last name, or a pair of crew surnames joined by a slash.
const NAME_WORDS = String.raw`[A-Za-z][A-Za-z.'-]+(?:\s?[/ ]\s?[A-Za-z][A-Za-z.'-]+)?`;
const BEFORE_CONTACT = new RegExp(
  String.raw`(?<![\w])(${NAME_WORDS})([\s/(-]{0,3})(?=\[(?:phone|email) removed\])`,
  'g',
);
// Only a sign-off that ends the text or a bracket, so "[phone removed] TRENCH 195'" keeps its work.
const AFTER_CONTACT = new RegExp(
  String.raw`(\[(?:phone|email) removed\]\)?[\s/-]{1,3})(${NAME_WORDS})(?=\s*(?:$|[)(\]\n,;]))`,
  'g',
);

const allNames = (words: string) =>
  words.split(/[\s/]+/).every((word) => isName(word.replace(/\.$/, '')));

const scrubBesideContacts = (text: string) =>
  text
    .replace(BEFORE_CONTACT, (match, words: string, gap: string) =>
      allNames(words) ? `${NAME_REMOVED}${gap}` : match,
    )
    .replace(AFTER_CONTACT, (match, lead: string, words: string) =>
      allNames(words) ? `${lead}${NAME_REMOVED}` : match,
    );

/** Crew-typed text with the names of the people who typed or are mentioned in it taken out. */
export const scrubNames = (text: string) =>
  scrubBesideContacts(scrubCues(scrubTitles(scrubInitials(text))));
