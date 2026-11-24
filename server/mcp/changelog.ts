/**
 * What changed in the MCP server, newest first. The server reports the newest entry's version as
 * serverInfo.version, so a release is one new entry here.
 */

export interface ChangelogEntry {
  version: string;
  /** YYYY-MM-DD. */
  date: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.6.1',
    date: '2026-11-23',
    changes: [
      "Permitted today and scheduled now go by the date in the address's city, not New York's, so a West Coast answer after 9 pm Pacific no longer counts tomorrow's work as today's.",
    ],
  },
  {
    version: '1.6.0',
    date: '2026-11-22',
    changes: [
      "San Jose joins the cities covered: the city's utility permits, with the utility read from the permit number's letter and its description, and the city's sanitary sewers and storm drains at their recorded depths. San Jose Water's service line inventory is paused while Subsola asks for permission, so the lead status there links to the company's own map.",
    ],
  },
  {
    version: '1.5.0',
    date: '2026-11-19',
    changes: [
      "Dallas joins the cities covered: right of way permits, with the utility from the city's own pick list, and Dallas Water Utilities' service line inventory. Dallas publishes no pipe maps, so every line there is placed from permits.",
    ],
  },
  {
    version: '1.4.0',
    date: '2026-11-15',
    changes: [
      "Every answer carries credits: the credit the city's publishers ask for (Open Data DC's CC BY 4.0, Denver's CC BY 3.0, SanGIS's derived-data wording, Chicago's required disclaimer) and OpenStreetMap's, as a credits field and a \"Data credits\" line. All of them are at https://subsola.com/credits.",
      "Records whose publishers' terms don't allow republishing are paused while Subsola asks for permission: DC Water's mains and lead service lines, Denver Water's and San Diego's lead service line inventories, and Con Edison's structures. For those cities the lead status says so and links to the utility's own map.",
    ],
  },
  {
    version: '1.3.0',
    date: '2026-11-15',
    changes: [
      'Permits that are one job filed again and again carry a job field (work order, permits in the job, this one\'s place, first start and last end) in recent_digs and whats_under, and the text says "Same job permitted 50 times, Feb 2018 to Jun 2022". A job is the same holder and utility with the same work order, or the same work on the same street, each permit following the last closely; it is called out from three permits on, counting ones from before since_year. In New York, where the city marks each permit New, Renew or Extend, the job also says how many the city filed as renewals or extensions (renewals; null elsewhere). This reaches answers with the next nightly build.',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-11-14',
    changes: [
      'The city input takes full names and common short forms, in any case: "Los Angeles", "New York City", "NYC", "Brooklyn", "D.C.". An unknown city still comes back as an argument error that lists the cities covered.',
      'whats_under gives each recent permit out front its street and its distance from the address, as recent_digs does.',
      'Permits whose work starts after today are marked scheduled in both tools.',
      'issued is now only a real issue date. Los Angeles and Denver publish none, so their permits have issued null and are dated, sorted and filtered by since_year on the work start, and the text says "starts" rather than "issued". This reaches their answers with the next nightly build.',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-11-14',
    changes: [
      'Each call now leaves a stats row (the tool, the city, how it ended, how long it took, the app and protocol version), kept 90 days, so the server can be watched. Addresses and IPs are never in it.',
      'A health check asks the server one question every 15 minutes.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-11-11',
    changes: [
      'recent_digs takes utility and permitted_today filters, reports total and shown, and says how to narrow a list that was cut short.',
      'Bad arguments come back as tool errors that say what to change ("radius_m must be between 10 and 400 (got 5000). Try 400."), not protocol errors.',
      'Protocol 2026-07-28: server/discover and per-request metadata, with no handshake, beside 2025-11-25 and earlier.',
      'Server and tool icons, a server description and website for clients on 2025-11-25 or later.',
      'A check_before_digging prompt, and a server card at /mcp/server-card listed from /.well-known/ai-catalog.json.',
      'Requests from plain-http or opaque origins are turned away; https pages and local tools are fine.',
      'Tool descriptions and server instructions rewritten to say what each tool does, when it fits and what it returns.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-11-11',
    changes: [
      'An address only counts when its house number, street and any city, borough or neighborhood named match. "100 Main St, Boston" is now a miss, not a report for 190C Main St in the Bronx.',
      'A miss says what the closest match was, why it did not count and how to ask again.',
      'New optional city input on both tools: only that city is searched.',
      'Answers carry requestedAddress, matchedAddress and matchDiffers, and start "Matched to ..." when the match reads differently from the question.',
      'Crew names written after a slash, as in "Hallen/J. Smith", are taken out of permit text, and hand-typed street fields are scrubbed too.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-10',
    changes: [
      'Denver joins the cities covered.',
      'Opening https://subsola.com/mcp in a browser shows this page.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-09',
    changes: [
      'Questions are limited per connection and in total, and an assistant over the limit is told how long to wait.',
      'Storm drains in Los Angeles and San Diego are reported apart from sewers, with an estimated depth.',
      "Seattle answers include the water service line's recorded material and the side sewer.",
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-08',
    changes: ['First release, with the whats_under and recent_digs tools.'],
  },
];

export const SERVER_VERSION = CHANGELOG[0]!.version;
