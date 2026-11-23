import type { ServiceLot, ServiceMaterial, ServiceSide } from './sources/services';
import type { SurveyedMain } from './sources/mains';

/** What each city's utility says about a lot's water service line, in the app's words. */

export const SERVICE_MATERIAL_LABELS: Record<ServiceMaterial, string> = {
  lead: 'Lead',
  galvanized: 'Galvanized, needs replacing',
  'non-lead': 'Not lead',
  unknown: 'Unknown',
};

export const SERVICE_SUMMARY: Record<ServiceMaterial, string> = {
  lead: 'DEP lists the water service line to this lot as lead.',
  galvanized:
    'DEP lists this water service line as galvanized pipe that needs replacing, because it may have sat downstream of lead.',
  'non-lead': 'DEP lists the water service line to this lot as not lead.',
  unknown: 'DEP has not yet determined the material of the water service line to this lot.',
};

const SERVICE_BASIS: Record<string, string> = {
  'Field Inspection': 'Field inspection',
  Records: 'Records review',
  Excavation: 'Observed during excavation',
  'Not Verified': 'Not verified',
  'Statistical Analysis/Predictive Model': 'DEP predictive model',
};

/** DEP's record type in plain words; anything new passes through as published. */
export const serviceBasis = (basis: string) => SERVICE_BASIS[basis] ?? basis;

export const DC_SERVICE_SUMMARY: Record<ServiceMaterial, string> = {
  lead: "DC Water lists lead on this property's water service line.",
  galvanized:
    "DC Water lists galvanized iron on this property's water service line. It replaces galvanized pipe along with lead, because galvanized pipe that sat downstream of lead may have taken it up.",
  'non-lead': "DC Water lists this property's water service line as not lead.",
  unknown: "DC Water has no information yet on this property's water service line.",
};

// DC Water names a pipe by its material ("Copper"), or only by its category ("Non-Lead"), which
// reads better in the app's own words.
const UNNAMED_PIPES = new Set(['Not recorded', 'Non-Lead', 'Lead']);

const sideText = (side: ServiceSide) =>
  side.material === 'unknown'
    ? 'No information'
    : `${UNNAMED_PIPES.has(side.pipe) ? SERVICE_MATERIAL_LABELS[side.material] : side.pipe}, ${side.verified ? 'verified' : 'suspected'}`;

/** DC Water and San Diego record the two halves of a line apart: their own, and the owner's. */
export const dcServiceFacts = (sides: { public: ServiceSide; private: ServiceSide }) =>
  [
    ['Public side', sideText(sides.public)],
    ['Private side', sideText(sides.private)],
  ] as [string, string][];

export const DC_SERVICE_NOTE =
  "The public side runs from the main to the property line and is DC Water's; the private side runs on into the building and is the owner's. Suspected means DC Water inferred the material from records and has not yet seen the pipe.";

export const SD_SERVICE_SUMMARY: Record<ServiceMaterial, string> = {
  lead: "The city's service line inventory lists lead on this water service line.",
  galvanized:
    "The city's service line inventory lists galvanized pipe on this water service line that needs replacing, because it may have sat downstream of lead.",
  'non-lead': "The city's service line inventory lists this water service line as not lead.",
  unknown:
    "The city's service line inventory has not yet determined the material of this water service line.",
};

export const SD_SERVICE_NOTE =
  "The public side runs from the main to the meter and is the city's; the private side runs on from the meter into the building and is the owner's. Suspected means the city inferred the material, often from a predictive model, and has no record of seeing the pipe.";

export const SEA_SERVICE_SUMMARY: Record<ServiceMaterial, string> = {
  lead: 'Seattle Public Utilities records lead on its part of this water service.',
  galvanized:
    "Seattle Public Utilities records galvanized pipe on its part of this water service. SPU has found lead goosenecks, short lead connectors at the main, on some of its galvanized services, and EPA rules count galvanized pipe that sat downstream of lead as needing replacement. SPU's map doesn't say which services had one.",
  'non-lead':
    'Seattle Public Utilities records its part of this water service, from the main through the meter, as pipe that is not lead.',
  unknown:
    'Seattle Public Utilities has not recorded the material of all of its part of this water service.',
};

export const SEA_SERVICE_NOTE =
  "SPU owns the service from the main to the meter, and records the short pipe from the meter to the union, where the owner's line begins. It publishes nothing on the owner's line on into the building, and no Lead and Copper Rule status: this is SPU's record of what was installed, not a pipe anyone has been back to see.";

export const SEA_NO_SERVICE =
  "Seattle Public Utilities' map has no active water service under this address that Subsola could draw. It maps about 178,000, none of them lead.";

export const DAL_SERVICE_SUMMARY: Record<ServiceMaterial, string> = {
  lead: "Dallas Water Utilities' service line inventory lists lead on this water service line.",
  galvanized:
    "Dallas Water Utilities' service line inventory lists galvanized pipe on this water service line that needs replacing, because it may have sat downstream of lead.",
  'non-lead':
    "Dallas Water Utilities' service line inventory lists this water service line as not lead.",
  unknown:
    "Dallas Water Utilities' service line inventory has not yet determined the material of all of this water service line.",
};

export const DAL_SERVICE_NOTE =
  "The public side runs from the main to the meter and is Dallas Water Utilities'; the private side runs on into the building and is the owner's. Suspected means DWU read the material off its standard drawings or the building's age and has no record of the pipe itself. Most private sides are not yet known.";

export const DAL_NO_SERVICE =
  "Dallas Water Utilities' service line inventory has no entry for this address that Subsola could draw. It lists about 326,000 services, none of them lead and 22 galvanized lines to replace.";

/**
 * Denver Water's four categories, each for the whole line from the main to the building. It
 * names no pipe material and doesn't split the line into its own part and the owner's.
 */
const DEN_SERVICE: Record<string, { label: string; summary: string }> = {
  'Confirmed lead': {
    label: 'Lead',
    summary:
      "Denver Water's inventory confirms lead on this water service line, or galvanized pipe that is or was downstream of lead. The line is in its Lead Reduction Program, and Denver Water asks that people drink and cook with filtered water until it is replaced.",
  },
  'Likely lead': {
    label: 'Likely lead',
    summary:
      "Denver Water's inventory says this water service line is likely lead, from the building's age and its records, and includes it in its Lead Reduction Program. Nobody has confirmed the material yet.",
  },
  'Unlikely lead': {
    label: 'Unknown, unlikely lead',
    summary:
      "Denver Water hasn't confirmed the material of this water service line, but from the building's age and its records it is unlikely to be lead.",
  },
  'Not lead': {
    label: 'Not lead',
    summary:
      "Denver Water's inventory lists this water service line as copper or another material that is not lead, from the building's age and its records.",
  },
};

export const DEN_SERVICE_NOTE =
  "Denver Water records one category for the whole line, from the main to the building, and doesn't say which part is its own or what the pipe is made of. Its map asks people to report their line's material if they know it.";

export const DEN_NO_SERVICE =
  "Denver Water's lead service line inventory has no entry for this address that Subsola could draw. It lists about 172,000 addresses in the city, some 9,500 of them confirmed lead.";

/** Chicago's water service, for the lot report and the MCP answers alike. */
export const CHI_NO_SERVICE =
  "Chicago's Department of Water Management doesn't publish its service line inventory as open data, only through its own address lookup at leadsafechicago.org, so none is drawn here. Chicago has more lead service lines than any other US city, about 400,000.";

export const CHI_NO_HOUSE_SEWER =
  "Chicago doesn't publish its house drains. The building's owner owns the drain all the way to the city sewer in the street.";

export const SJ_NO_HOUSE_SEWER =
  "San Jose doesn't publish its house laterals. The property owner is responsible for the whole lateral, from the building to the city sewer and the connection to it.";

export const DAL_NO_HOUSE_SEWER =
  "Dallas doesn't publish its house sewers. Dallas Water Utilities' design manual gives house laterals at least 2 ft of cover.";

/** Denver Water's summary and facts for a line. */
export const denServiceText = (lot: ServiceLot) => ({
  summary: DEN_SERVICE[lot.basis]?.summary ?? `Denver Water's inventory lists ${lot.basis}.`,
  note: DEN_SERVICE_NOTE,
  facts: [
    ['Category', lot.basis],
    ['Building built', lot.builtYear ? String(lot.builtYear) : 'Not recorded'],
    ['Pipe material', 'Not published'],
  ] as [string, string][],
});

/**
 * The verdict in a word or two. SPU doesn't say its galvanized services need replacing; Denver
 * Water's likely and unlikely lead are both unknown, which its own words tell apart.
 */
export const serviceLabel = (lot: ServiceLot) =>
  lot.source === 'denServiceLines'
    ? (DEN_SERVICE[lot.basis]?.label ?? SERVICE_MATERIAL_LABELS[lot.material])
    : lot.source === 'seaServiceLines' && lot.material === 'galvanized'
      ? 'Galvanized'
      : SERVICE_MATERIAL_LABELS[lot.material];

/** Whether a line is lead or might well be: Denver Water's likely lead counts. */
export const serviceNeedsAction = (lot: ServiceLot) =>
  lot.material === 'lead' ||
  lot.material === 'galvanized' ||
  (lot.source === 'denServiceLines' && lot.basis === 'Likely lead');

// Service sizes as they're said: "3/4 in", not "0.75 in".
const SIZE_WORDS: Record<number, string> = { 0.75: '3/4', 1.25: '1 1/4', 1.5: '1 1/2' };
const sizeText = (inches: number) => `${SIZE_WORDS[inches] ?? inches} in`;

const seaServiceFacts = (lot: ServiceLot, sides: { public: ServiceSide; private: ServiceSide }) =>
  [
    ['Main to meter', sides.public.pipe],
    ['Meter to union', sides.private.pipe],
    ["Owner's line", 'Not published'],
    ['Size', lot.sizeIn ? sizeText(lot.sizeIn) : 'Not recorded'],
    ['Installed', lot.installedYear ? String(lot.installedYear) : 'Not recorded'],
  ] as [string, string][];

/**
 * What SPU's side sewer map says near an address, for the lot report and the MCP answer. SPU
 * doesn't file side sewers by address, so the nearest one to the address point stands in.
 */
export const seaSideSewerText = (side: SurveyedMain | null) =>
  side
    ? {
        status: 'On record',
        detail:
          "Seattle Public Utilities maps a side sewer by this address, the building's own line to the sewer in the street, as drawn on the map. SPU doesn't file side sewers by address, so this is the one nearest the address point. The property owner owns and maintains it all the way to the main.",
        facts: [
          ['Size', side.diameterIn ? `${side.diameterIn} in` : 'Not recorded'],
          ['Material', side.material ?? 'Not recorded'],
          ['Installed', side.installedYear ? String(side.installedYear) : 'Not recorded'],
          ['Depth', 'Not recorded'],
        ] as [string, string][],
      }
    : {
        status: 'Not on record',
        detail:
          "Seattle Public Utilities' side sewer map shows none within 50 ft of this address point. Nearly every building in the city drains to a public sewer.",
        facts: [] as [string, string][],
      };

/** The summary, note and facts for an inventory that records a line's pieces apart. */
export const sidedServiceText = (lot: ServiceLot & Required<Pick<ServiceLot, 'sides'>>) =>
  lot.source === 'seaServiceLines'
    ? {
        summary: SEA_SERVICE_SUMMARY[lot.material],
        note: SEA_SERVICE_NOTE,
        facts: seaServiceFacts(lot, lot.sides),
      }
    : lot.source === 'sdServiceLines'
      ? {
          summary: SD_SERVICE_SUMMARY[lot.material],
          note: SD_SERVICE_NOTE,
          facts: dcServiceFacts(lot.sides),
        }
      : lot.source === 'dalServiceLines'
        ? {
            summary: DAL_SERVICE_SUMMARY[lot.material],
            note: DAL_SERVICE_NOTE,
            facts: [
              ...dcServiceFacts(lot.sides),
              ['Building built', lot.builtYear ? String(lot.builtYear) : 'Not recorded'],
            ] as [string, string][],
          }
        : {
            summary: DC_SERVICE_SUMMARY[lot.material],
            note: DC_SERVICE_NOTE,
            facts: dcServiceFacts(lot.sides),
          };

/** What a water service line is, in one sentence, wherever a count or a card names one. */
export const SERVICE_LINE_MEANING =
  'A water service line is the pipe from the water main under the street into a building.';

/**
 * The water services row in the layer list. A bare "30 lead" read as 30 of something unnamed,
 * so the count is of lines, and the note under the name says how many the city lists as lead.
 */
export const waterServicesRow = (total: number, lead: number) => ({
  detail: total.toLocaleString(),
  note: lead ? `${lead.toLocaleString()} listed as lead` : null,
  title: `${SERVICE_LINE_MEANING} ${
    lead
      ? `The city lists ${lead === 1 ? 'one' : lead.toLocaleString()} of the ${total.toLocaleString()} drawn here as lead.`
      : `None of the ${total.toLocaleString()} drawn here is listed as lead.`
  }`,
});
