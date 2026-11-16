import { z } from 'zod';
import { lotLineNote } from '../../src/frontage';
import type { Feature, Geometry, Position } from 'geojson';
import type { LotReport, MainOutFront } from '../../src/report';
import { lotName, type Region } from '../../src/regions';
import type { GeocodedAddress } from '../../src/sources/geocode';
import type { PermitGroupProperties, PermitRecord } from '../../src/sources/permits';
import { scrubContacts } from '../../src/sources/permits';
import { byPermitDayDesc, permitDay } from '../../src/sources/permitDay';
import { jobNote, permitJobs, REPEATED_JOB_MIN, type PermitJob } from '../../src/sources/jobs';
import type { ServiceLot } from '../../src/sources/services';
import { houseSewerStatus } from '../../src/sources/connections';
import { laHouseSewerText } from '../../src/houseSewerText';
import { isStormDrain } from '../../src/sources/mains';
import { CONFIDENCE_LABELS, pausedNote, SOURCES, type Confidence } from '../../src/sources/catalog';
import { COVERAGE } from './coverage';
import { creditLine } from '../../src/attribution';
import type { FartherLine } from './farther';
import { DEPTH_BASIS_LABELS, FEET_TO_METERS, formatFeet } from '../../src/depth';
import { UTILITY_KINDS, UTILITY_STYLES, type UtilityKind } from '../../src/utilities';
import { distanceMeters } from '../../src/geo';
import { isOpenOn } from '../../src/work';
import { sharedViewSearch } from '../../src/share';
import { ownerName, prettyAddress, titleCase } from '../../src/ui/dom';
import {
  CHI_NO_HOUSE_SEWER,
  CHI_NO_SERVICE,
  DEN_NO_SERVICE,
  denServiceText,
  SEA_NO_SERVICE,
  SERVICE_MATERIAL_LABELS,
  SERVICE_SUMMARY,
  seaSideSewerText,
  serviceBasis,
  serviceLabel,
  sidedServiceText,
} from '../../src/serviceText';

/**
 * The two tools' answers: a structured object (checked against the output schemas below) and the
 * same thing as text an assistant can quote. Every answer ends with the 811 notice and a link.
 */

export const SITE_URL = 'https://subsola.com';

const NOTICE =
  'This is public-records evidence, not a survey, and not a substitute for calling 811. Utilities do not publish exact positions or depths, and lines with no permit on record may not appear.';

const utilityEnum = z.enum(UTILITY_KINDS);

const footerShape = {
  notice: z.string(),
  call811: z.object({
    center: z.string(),
    url: z.string(),
    /** "two full working days". */
    notice: z.string(),
  }),
  mapUrl: z.string().describe('This spot on subsola.com'),
  credits: z
    .string()
    .describe(
      "The credit the city's publishers ask for, and OpenStreetMap's; quote it with the records",
    ),
};

const headerShape = {
  address: z.string().describe('The address as the city geocoder found it'),
  requestedAddress: z.string().describe('The address as it was asked for'),
  matchedAddress: z
    .string()
    .describe('The address the answer is for; the same as address, kept beside requestedAddress'),
  matchDiffers: z
    .boolean()
    .describe('Whether the matched address reads differently from the one asked for'),
  city: z.string(),
  recordsAsOf: z.string().describe('When the records were last built, ISO 8601'),
  incomplete: z.boolean().describe('Some map data failed to load; the answer may miss records'),
};

const depthSchema = z.object({
  shallowestFt: z.number().nullable(),
  deepestFt: z.number().nullable(),
  measuredFt: z.number().nullable().describe('Depth from the owner’s records, where published'),
  basis: z.string().describe('Where the depth comes from: federal or state code, city standard'),
  summary: z.string(),
  standard: z.object({ name: z.string(), url: z.string() }).nullable(),
});

const utilityOutFrontSchema = z.object({
  utility: utilityEnum,
  label: z.string(),
  distanceFromLotLineFt: z.number().describe('To the line as drawn on the map, not surveyed'),
  diameterIn: z.number().nullable(),
  depth: depthSchema,
  placement: z.enum(['surveyed', 'permits', 'inferred']),
  placedBy: z.string(),
  confidence: z.string(),
  confidenceDetail: z.string(),
  permitsOnBlock: z.number().nullable(),
  permitYears: z.string().nullable(),
  permittees: z.array(z.string()),
});

const issuedField = z
  .string()
  .nullable()
  .describe(
    'The day the city issued the permit; null where the city publishes no issue date (Los Angeles, Denver), so go by workStart',
  );
const scheduledField = z.boolean().describe('The work starts after today');
const distanceField = z
  .number()
  .describe('Meters from the address to the nearest block the permit is filed on');

const openPermitSchema = z.object({
  utility: utilityEnum,
  permittee: z.string(),
  workStart: z.string().nullable(),
  workEnd: z.string().nullable(),
  street: z.string(),
  permitNumber: z.string(),
});

const jobField = z
  .object({
    workOrder: z
      .string()
      .nullable()
      .describe("The utility's work order, where the permit names one"),
    permits: z.number().describe('Permits filed for this one job'),
    nth: z.number().describe("This permit's place in the job, 1 for the first"),
    since: z.string().describe("YYYY-MM-DD, the job's first work start"),
    through: z.string().describe("YYYY-MM-DD, the job's last work end"),
    renewals: z
      .number()
      .nullable()
      .describe(
        'Permits the city itself filed as a renewal or extension (New York only); null where the city does not say',
      ),
  })
  .nullable()
  .describe(
    `Set when this permit is one of ${REPEATED_JOB_MIN} or more for the same job, re-permitted as the work dragged on (same holder and work order, or same holder, work and street, each following closely)`,
  );

export const whatsUnderOutput = z.object({
  ...headerShape,
  lot: z.string().nullable(),
  leadServiceLine: z.object({
    published: z.boolean().describe('Whether the city publishes service line material by lot'),
    material: z.enum(['lead', 'galvanized', 'non-lead', 'unknown']).nullable(),
    status: z.string(),
    detail: z.string(),
  }),
  houseSewer: z.object({ status: z.string(), detail: z.string() }),
  utilities: z.array(utilityOutFrontSchema),
  permittedToday: z.array(openPermitSchema),
  recentPermits: z.array(
    z.object({
      issued: issuedField,
      workStart: z.string().nullable(),
      scheduled: scheduledField,
      utility: utilityEnum,
      work: z.string(),
      permittee: z.string(),
      street: z.string(),
      distanceM: distanceField.nullable(),
      job: jobField,
    }),
  ),
  latestDigNote: z
    .object({ note: z.string(), issued: z.string().nullable(), notesNearby: z.number() })
    .nullable(),
  fartherLines: z
    .array(
      z.object({
        label: z.string(),
        distanceFromLotLineFt: z.number(),
        placedFrom: z.enum(['owner map', 'permits', 'inferred']),
      }),
    )
    .describe(
      'Only when no line is within reach of the lot line: the nearest lines farther out, up to about 400 ft',
    ),
  nearestFixtures: z.array(
    z.object({ kind: z.string(), label: z.string(), distanceFromLotLineFt: z.number() }),
  ),
  ...footerShape,
});

export type WhatsUnder = z.infer<typeof whatsUnderOutput>;

export const recentDigsOutput = z.object({
  ...headerShape,
  radiusM: z.number(),
  sinceYear: z.number().nullable(),
  utility: utilityEnum.nullable().describe('The utility asked for, or null for all'),
  permittedToday: z.boolean().describe('Whether only permits open today were asked for'),
  total: z.number().describe('Digs on record that match, before the cap'),
  shown: z.number().describe('Digs listed here: total, or the cap when there are more'),
  found: z.number().describe('The same as total; kept for clients written against 1.0'),
  digs: z.array(
    z.object({
      permitNumber: z.string(),
      utility: utilityEnum,
      permittee: z.string(),
      work: z.string(),
      issued: issuedField,
      workStart: z.string().nullable(),
      workEnd: z.string().nullable(),
      permittedToday: z.boolean(),
      scheduled: scheduledField,
      street: z.string(),
      distanceM: distanceField,
      job: jobField,
    }),
  ),
  ...footerShape,
});

export type RecentDigs = z.infer<typeof recentDigsOutput>;

export interface Answer<T> {
  structured: T;
  text: string;
}

/** The address asked for and the one found, as every answer reports them. */
export interface Asked {
  requested: string;
  differs: boolean;
}

const header = (
  shown: string,
  region: Region,
  builtAt: string,
  incomplete: boolean,
  asked: Asked,
) => ({
  address: shown,
  requestedAddress: asked.requested,
  matchedAddress: shown,
  matchDiffers: asked.differs,
  city: region.name,
  recordsAsOf: builtAt,
  incomplete,
});

/** Said first whenever the match isn't simply the address asked for, reformatted. */
const matchedLine = (answer: {
  matchDiffers: boolean;
  matchedAddress: string;
  requestedAddress: string;
}) =>
  answer.matchDiffers
    ? [`Matched to ${answer.matchedAddress} (you asked for ${answer.requestedAddress}).`]
    : [];

const round = (value: number) => Math.round(value);
const feet = (meters: number) => Math.round(meters / FEET_TO_METERS);

/** The address as people write it: "200 N Spring St, Los Angeles". */
export const displayAddress = (address: Pick<GeocodedAddress, 'label'>) => {
  const [line, ...rest] = address.label.split(',').map((part) => part.trim());
  return [prettyAddress(line!), ...rest].filter(Boolean).join(', ');
};

export const mapUrl = (address: string, since: number | null = null) =>
  `${SITE_URL}/${sharedViewSearch({ address, camera: null, pick: null, since })}`;

const footer = (region: Region, link: string) => ({
  notice: NOTICE,
  call811: {
    center: region.markout.center,
    url: region.markout.url,
    notice: region.markout.notice,
  },
  mapUrl: link,
  credits: creditLine(region.id),
});

export const footerText = ({ notice, call811, mapUrl: link, credits }: ReturnType<typeof footer>) =>
  [
    notice,
    `Before any digging, request a free markout from ${call811.center} at least ${call811.notice} ahead: ${call811.url}`,
    `See this spot on Subsola: ${link}`,
    `Data credits: ${credits}`,
  ].join('\n');

/** For an answer with no city: every city's 811 center. */
export const coverageText = (regions: Region[]) =>
  [
    `Subsola covers ${new Intl.ListFormat('en', { type: 'conjunction' }).format(regions.map((r) => r.name))}.`,
    NOTICE,
    `Before any digging, call 811 or request a markout: ${regions.map((r) => `${r.name}: ${r.markout.center}, ${r.markout.url}`).join('; ')}.`,
    `Subsola: ${SITE_URL}`,
  ].join('\n');

// The wording of the site's report (src/ui/report.ts) for cities that don't publish by lot.
const UNPUBLISHED_WATER: Partial<Record<Region['id'], { status: string; detail: string }>> = {
  sf: {
    status: 'Not published by lot',
    detail:
      'SFPUC publishes service line material only for the few hundred addresses where it still has lines to replace, not for every lot.',
  },
  la: {
    status: 'Not published',
    detail:
      'LADWP does not publish its service lines by lot. It reports finding no lead or galvanized service lines that need replacing.',
  },
  chi: { status: 'Not published', detail: CHI_NO_SERVICE },
};

const leadServiceLine = (
  report: LotReport,
  region: Region,
  lots: ServiceLot[],
): WhatsUnder['leadServiceLine'] => {
  const unpublished = UNPUBLISHED_WATER[region.id];
  if (unpublished) return { published: false, material: null, ...unpublished };
  // Held back for the publisher's terms while permission is asked (PAUSED_SOURCES).
  const inventory = COVERAGE[region.id]?.serviceLines;
  const paused = typeof inventory === 'string' ? pausedNote(inventory) : null;
  if (paused) return { published: true, material: null, status: 'Not shown', detail: paused };
  // The inventory's record for the lot, even where no main is drawn close enough to draw the line.
  const lot = report.water?.lot ?? lots.find((candidate) => candidate.bbl === report.bbl);
  // Denver Water files one category for the whole line.
  if (region.id === 'den') {
    if (lot?.source !== 'denServiceLines')
      return { published: true, material: null, status: 'No entry', detail: DEN_NO_SERVICE };
    const { summary, note, facts } = denServiceText(lot);
    return {
      published: true,
      material: lot.material,
      status: serviceLabel(lot),
      detail: [summary, ...facts.map(([fact, text]) => `${fact}: ${text}.`), note].join(' '),
    };
  }
  // DC Water and San Diego record the city's side and the owner's side apart, and SPU its two
  // pieces of the line.
  if (region.id === 'dc' || region.id === 'sd' || region.id === 'sea') {
    if (!lot?.sides)
      return {
        published: true,
        material: null,
        status: 'No entry',
        detail:
          region.id === 'dc'
            ? "DC Water's service line inventory has no entry for this lot."
            : region.id === 'sd'
              ? "The city's service line inventory has no entry for this address. It lists about 281,000 services with a location, and no lead ones."
              : SEA_NO_SERVICE,
      };
    const { summary, facts } = sidedServiceText({ ...lot, sides: lot.sides });
    return {
      published: true,
      material: lot.material,
      status: serviceLabel(lot),
      detail: [summary, ...facts.map(([side, text]) => `${side}: ${text}.`)].join(' '),
    };
  }
  if (!lot)
    return {
      published: true,
      material: null,
      status: 'No entry',
      detail:
        "DEP's lead service line inventory has no entry for this lot. Vacant lots, parks and some city property are not included.",
    };
  const needsAction = lot.material === 'lead' || lot.material === 'galvanized';
  return {
    published: true,
    material: lot.material,
    status: SERVICE_MATERIAL_LABELS[lot.material],
    detail: `${SERVICE_SUMMARY[lot.material]} How DEP knows: ${serviceBasis(lot.basis)}.${needsAction ? ' DEP provides free lead test kits for tap water through 311.' : ''}`,
  };
};

const houseSewer = (report: LotReport, region: Region): WhatsUnder['houseSewer'] => {
  switch (region.id) {
    case 'nyc': {
      const status = houseSewerStatus(report.connectionPermits);
      if (status.kind === 'assumed')
        return {
          status: 'Inferred',
          detail:
            "DEP's published sewer permits begin in 2018, and none is on record for this lot. Nearly every NYC building drains to the city sewer.",
        };
      const year = status.permit.date.slice(0, 4);
      return status.kind === 'plugged'
        ? {
            status: 'Plugged',
            detail: `DEP's most recent sewer permit for this lot is a plug from ${year}: the connection was capped.`,
          }
        : {
            status: 'On record',
            detail: `DEP issued a sewer ${status.permit.action.toLowerCase()} permit for this lot in ${year}.`,
          };
    }
    case 'sf': {
      const side = report.sideSewer;
      if (!side)
        return {
          status: 'Not on record',
          detail: "San Francisco's side sewer records have no entry under this address.",
        };
      return {
        status: 'On record',
        detail: `The city records this building's side sewer and its route to the sewer in the street${side.diameterIn ? `, ${side.diameterIn} in` : ''}${side.material ? `, ${side.material.toLowerCase()}` : ''}. Its depth is not recorded. The property owner owns and maintains it.`,
      };
    }
    case 'dc':
      return {
        status: 'Not published',
        detail: 'DC publishes no records of house sewer connections.',
      };
    case 'la':
      return laHouseSewerText(report.nearbySideSewer);
    case 'sd':
      return {
        status: 'Not published',
        detail:
          "The city doesn't publish its house laterals. Its design guide puts them 5 to 7 ft below the top of the curb at the property line.",
      };
    case 'sea': {
      const { status, detail, facts } = seaSideSewerText(report.sideSewer);
      return {
        status,
        detail: [detail, ...facts.map(([fact, text]) => `${fact}: ${text}.`)].join(' '),
      };
    }
    case 'den':
      return {
        status: 'Not published',
        detail:
          "Denver doesn't publish its house sewers. The building's owner owns the line all the way to the main.",
      };
    case 'chi':
      return { status: 'Not published', detail: CHI_NO_HOUSE_SEWER };
  }
};

// "City of San Diego Public Utilities'" rather than "Utilities's".
const possessive = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);

const placementOf = (main: MainOutFront) => {
  if (main.surveyed) {
    const source = SOURCES[main.surveyed.source];
    return {
      placement: 'surveyed' as const,
      placedBy: `${possessive(source.publisher)} map of its ${isStormDrain(main.surveyed) ? 'storm drains' : main.surveyed.utility === 'sewer' ? 'sewers' : main.surveyed.utility === 'electric' ? 'underground lines' : 'mains'}`,
      confidence: source.confidence,
    };
  }
  if (main.assumed)
    return {
      placement: 'inferred' as const,
      placedBy: 'Carried on from the rest of the street; no permit for it on this block',
      confidence: 'inferred' as Confidence,
    };
  return {
    placement: 'permits' as const,
    placedBy: main.digSpots
      ? `Excavation permits, with the lane set from ${main.digSpots} crew location ${main.digSpots === 1 ? 'note' : 'notes'}`
      : 'Excavation permits on this block, drawn at a standard offset in the street',
    confidence: 'block-level' as Confidence,
  };
};

const depthOf = (main: MainOutFront, region: Region): WhatsUnder['utilities'][number]['depth'] => {
  const standard = region.depths[main.utility];
  const measuredFt = main.surveyed?.depthFt ?? null;
  if (measuredFt !== null)
    return {
      shallowestFt: standard?.shallowestFt ?? null,
      deepestFt: standard?.deepestFt ?? null,
      measuredFt,
      basis: DEPTH_BASIS_LABELS.measured,
      summary: `About ${formatFeet(measuredFt)} down to the top of the pipe, from ${SOURCES[main.surveyed!.source].publisher} records.`,
      standard: null,
    };
  if (!standard)
    return {
      shallowestFt: null,
      deepestFt: null,
      measuredFt: null,
      basis: DEPTH_BASIS_LABELS.unknown,
      summary: 'No depth standard is on record for this kind of work.',
      standard: null,
    };
  // Where a city's sewer range comes from its measured sewers (LA, San Diego), a storm drain with
  // no depth of its own borrows that range, which is an estimate, not a measurement of this pipe.
  if (isStormDrain(main.surveyed) && standard.basis === 'measured')
    return {
      shallowestFt: standard.shallowestFt,
      deepestFt: standard.deepestFt,
      measuredFt: null,
      basis: "Estimated from the city's sewer depths",
      summary: `No depth is recorded for this storm drain, so it is drawn where the city's sewers usually sit, ${formatFeet(standard.shallowestFt)} or more down.`,
      standard: standard.source,
    };
  return {
    shallowestFt: standard.shallowestFt,
    deepestFt: standard.deepestFt,
    measuredFt: null,
    basis: DEPTH_BASIS_LABELS[standard.basis],
    summary: standard.summary,
    standard: standard.source,
  };
};

// Permit text comes padded for fixed-width columns: "EAST   18 STREET".
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

// Some cities' street fields are typed by hand (DC's work location, LA's location), so they are
// scrubbed like the purpose.
const streetOf = (record: PermitRecord) => tidy(scrubContacts(record.street));

// The purpose crews typed, scrubbed again in case the build predates a scrubbing fix.
const workOf = (record: PermitRecord) =>
  tidy(record.purpose ? scrubContacts(record.purpose) : titleCase(record.type));

const utilityLabel = (utility: UtilityKind) => UTILITY_STYLES[utility].label;

/** Work that hasn't started yet, judged against the same today as "permitted today". */
const isScheduled = (record: PermitRecord, today: string) =>
  Boolean(record.workStart && record.workStart > today);

/**
 * A permit's date as the answers say it: "issued 2026-10-01", or where the city publishes no
 * issue date "starts 2026-11-16", with "scheduled" when the work hasn't started.
 */
const permitWhen = ({
  issued,
  workStart,
  scheduled,
}: {
  issued: string | null;
  workStart: string | null;
  scheduled: boolean;
}) => {
  const starts = workStart ? `${scheduled ? 'scheduled, ' : ''}starts ${workStart}` : null;
  if (!issued) return starts ?? 'undated';
  return scheduled && starts ? `issued ${issued}, ${starts}` : `issued ${issued}`;
};

/** Each permit's distance from `origin` to the nearest block it is filed on, in meters. */
const permitDistances = (origin: Position, groups: Feature<Geometry, PermitGroupProperties>[]) => {
  const nearest = new Map<string, number>();
  for (const group of groups) {
    const distanceM = distanceMeters(origin, group.geometry);
    for (const record of group.properties.permits) {
      const seen = nearest.get(record.permitNumber);
      if (seen === undefined || distanceM < seen) nearest.set(record.permitNumber, distanceM);
    }
  }
  return nearest;
};

const FIXTURE_LABELS: Record<string, string> = {
  hydrant: 'Nearest fire hydrant',
  'catch-basin': 'Nearest catch basin',
  manhole: 'Nearest mapped manhole',
};

export interface WhatsUnderInput {
  asked: Asked;
  /** The nearest lines past the report's reach, when nothing is within it (farther.ts). */
  farther?: FartherLine[];
  report: LotReport;
  address: GeocodedAddress;
  region: Region;
  builtAt: string;
  incomplete: boolean;
  serviceLots: ServiceLot[];
  /** The permit blocks loaded around the address, to measure each recent permit's distance. */
  groups: Feature<Geometry, PermitGroupProperties>[];
  /** YYYY-MM-DD, the day the site counts as today. */
  today: string;
}

const calledOut = (job: PermitJob | undefined) =>
  job && job.permits >= REPEATED_JOB_MIN ? job : null;

/** The work, with a note when it's one job permitted again and again. */
const withJob = (work: string, job: PermitJob | null) => {
  const note = jobNote(job ?? undefined);
  return note ? `${work} (${note}${job!.workOrder ? `, work order ${job!.workOrder}` : ''})` : work;
};

export const whatsUnderAnswer = ({
  asked,
  farther = [],
  report,
  address,
  region,
  builtAt,
  incomplete,
  serviceLots,
  groups,
  today,
}: WhatsUnderInput): Answer<WhatsUnder> => {
  const shown = displayAddress(address);
  const distances = permitDistances(address.lngLat, groups);
  const jobs = permitJobs(groups.flatMap((group) => group.properties.permits));
  const structured: WhatsUnder = {
    ...header(shown, region, builtAt, incomplete, asked),
    lot: lotName(report.bbl, region),
    leadServiceLine: leadServiceLine(report, region, serviceLots),
    houseSewer: houseSewer(report, region),
    utilities: report.mains.map((main) => {
      const { placement, placedBy, confidence } = placementOf(main);
      return {
        utility: main.utility,
        // San Diego's and Los Angeles's storm drains are reported apart from the sewer.
        label: isStormDrain(main.surveyed) ? 'Storm drain' : utilityLabel(main.utility),
        distanceFromLotLineFt: feet(main.distanceM),
        diameterIn: main.surveyed?.diameterIn ?? null,
        depth: depthOf(main, region),
        placement,
        placedBy,
        confidence: CONFIDENCE_LABELS[confidence].label,
        confidenceDetail: CONFIDENCE_LABELS[confidence].detail,
        permitsOnBlock: main.surveyed || main.assumed ? null : main.digs,
        permitYears: main.firstYear
          ? main.firstYear === main.lastYear
            ? String(main.firstYear)
            : `${main.firstYear} to ${main.lastYear}`
          : null,
        permittees: [...new Set(main.permittees.map(ownerName))].slice(0, 3),
      };
    }),
    permittedToday: report.live.map((record) => ({
      utility: record.utility,
      permittee: ownerName(record.permittee),
      workStart: record.workStart ?? null,
      workEnd: record.workEnd ?? null,
      street: streetOf(record),
      permitNumber: record.permitNumber,
    })),
    recentPermits: report.recent.map((record) => ({
      issued: record.issued ?? null,
      workStart: record.workStart ?? null,
      scheduled: isScheduled(record, today),
      utility: record.utility,
      work: workOf(record),
      permittee: ownerName(record.permittee),
      street: streetOf(record),
      distanceM: distances.has(record.permitNumber)
        ? round(distances.get(record.permitNumber)!)
        : null,
      job: calledOut(jobs.get(record.permitNumber)),
    })),
    latestDigNote: report.digSpots[0]
      ? {
          note: scrubContacts(report.digSpots[0].note),
          issued: report.digSpots[0].issued ?? null,
          notesNearby: report.digSpots.length,
        }
      : null,
    fartherLines: farther,
    nearestFixtures: report.fixtures.map((fixture) => ({
      kind: fixture.kind,
      label: FIXTURE_LABELS[fixture.kind] ?? fixture.title,
      distanceFromLotLineFt: feet(fixture.distanceM),
    })),
    ...footer(region, mapUrl(shown)),
  };
  return { structured, text: whatsUnderText(structured, lotLineNote(report.lotLine)) };
};

const depthText = (depth: WhatsUnder['utilities'][number]['depth']) => {
  if (depth.measuredFt !== null) return `about ${formatFeet(depth.measuredFt)} down, measured`;
  if (depth.basis === DEPTH_BASIS_LABELS.unknown || depth.shallowestFt === null)
    return 'depth not published; treat it as possible anywhere in the top 6 ft';
  const range = `${formatFeet(depth.shallowestFt)} to ${formatFeet(depth.deepestFt ?? depth.shallowestFt)} down`;
  return `expected ${range} (${depth.basis.toLowerCase()}${depth.standard ? `: ${depth.standard.name}` : ''})`;
};

export const whatsUnderText = (answer: WhatsUnder, lotLine: string | null = null) => {
  const lines = [
    ...matchedLine(answer),
    `What public records show under the street at ${answer.address} (${answer.city})${answer.lot ? `, ${answer.lot}` : ''}. Records as of ${answer.recordsAsOf.slice(0, 10)}.`,
  ];
  if (answer.incomplete)
    lines.push('Some map data failed to load, so this may be missing records.');
  lines.push('', 'Utilities in the street in front:');
  if (lotLine) lines.push(lotLine);
  if (!answer.utilities.length)
    lines.push(
      '- None on record within about 80 ft of the lot line. That does not mean the street is empty: a line not excavated since records begin will not appear.',
    );
  if (answer.fartherLines.length)
    lines.push(
      `- Nearest lines farther off: ${answer.fartherLines.map((line) => `${line.label.toLowerCase()} about ${line.distanceFromLotLineFt} ft away (${line.placedFrom === 'owner map' ? "from the owner's map" : line.placedFrom === 'permits' ? 'from permits' : 'inferred'})`).join('; ')}. The city's point for this address may sit well back from the street, on the building.`,
    );
  for (const main of answer.utilities) {
    const size = main.diameterIn ? `, ${main.diameterIn} in` : '';
    const years = main.permitYears ? ` (${main.permitYears})` : '';
    const filers = main.permittees.length
      ? ` Most often filed by: ${main.permittees.join('; ')}`
      : '';
    // A block known only from permits to open its manholes or store material has no digs to count.
    const permits =
      main.permitsOnBlock === null
        ? ''
        : main.permitsOnBlock === 0
          ? ` No excavation permits on this block, only permits to open its manholes or use the street${years}.${filers}`
          : ` ${main.permitsOnBlock} ${main.permitsOnBlock === 1 ? 'permit' : 'permits'} on this block${years}.${filers}`;
    lines.push(
      `- ${main.label}${size}: about ${main.distanceFromLotLineFt} ft from the lot line as drawn, ${depthText(main.depth)}. Position from: ${main.placedBy}. Confidence: ${main.confidence}.${permits}`,
    );
  }
  lines.push(
    '',
    `Water service line (lead status): ${answer.leadServiceLine.status}. ${answer.leadServiceLine.detail}`,
    `House sewer: ${answer.houseSewer.status}. ${answer.houseSewer.detail}`,
    '',
  );
  if (answer.permittedToday.length)
    lines.push(
      `Digging permitted today on the block: ${answer.permittedToday
        .map(
          (open) =>
            `${open.permittee}, ${utilityLabel(open.utility).toLowerCase()} work on ${open.street || 'this block'} until ${open.workEnd ?? 'an unlisted date'}`,
        )
        .join('; ')}.`,
    );
  else lines.push('Digging permitted today on the block: none on record.');
  if (answer.recentPermits.length) {
    lines.push(
      'Recent excavation permits out front (date | utility | permit holder | work | street):',
    );
    for (const permit of answer.recentPermits)
      lines.push(
        `- ${[
          permitWhen(permit),
          utilityLabel(permit.utility),
          permit.permittee,
          withJob(permit.work, permit.job),
          `${permit.street || 'street not listed'}${permit.distanceM === null ? '' : `, ${permit.distanceM} m away`}`,
        ].join(' | ')}`,
      );
  }
  if (answer.latestDigNote)
    lines.push(
      `${answer.latestDigNote.notesNearby} crew location ${answer.latestDigNote.notesNearby === 1 ? 'note places' : 'notes place'} an excavation within 130 ft. Most recent: "${answer.latestDigNote.note}" (${answer.latestDigNote.issued ?? 'undated'}).`,
    );
  if (answer.nearestFixtures.length)
    lines.push(
      answer.nearestFixtures
        .map(
          (fixture) => `${fixture.label}: ${fixture.distanceFromLotLineFt} ft from the lot line.`,
        )
        .join(' '),
    );
  lines.push('', footerText(answer));
  return lines.join('\n');
};

export interface RecentDigsInput {
  asked: Asked;
  address: GeocodedAddress;
  region: Region;
  builtAt: string;
  incomplete: boolean;
  groups: Feature<Geometry, PermitGroupProperties>[];
  radiusM: number;
  sinceYear: number | null;
  utility: UtilityKind | null;
  permittedToday: boolean;
  /** YYYY-MM-DD, the day the site counts as today. */
  today: string;
  limit: number;
}

/** Digs on the blocks within the radius, newest first. Permits that don't open the street are left out. */
export const recentDigsAnswer = ({
  asked,
  address,
  region,
  builtAt,
  incomplete,
  groups,
  radiusM,
  sinceYear,
  utility,
  permittedToday,
  today,
  limit,
}: RecentDigsInput): Answer<RecentDigs> => {
  const origin: Position = address.lngLat;
  const nearest = new Map<string, { record: PermitRecord; distanceM: number }>();
  // Jobs are read before the filters, so a job's permits from before since_year still count.
  const inRadius: PermitRecord[] = [];
  for (const group of groups) {
    const distanceM = distanceMeters(origin, group.geometry);
    if (!(distanceM <= radiusM)) continue;
    for (const record of group.properties.permits) {
      if (record.noOpening) continue;
      inRadius.push(record);
      const day = permitDay(record);
      if (sinceYear !== null && !(day && Number(day.slice(0, 4)) >= sinceYear)) continue;
      if (utility !== null && record.utility !== utility) continue;
      if (permittedToday && !isOpenOn(record, today)) continue;
      // A permit filed for several blocks counts once, on the nearest.
      const seen = nearest.get(record.permitNumber);
      if (!seen || distanceM < seen.distanceM)
        nearest.set(record.permitNumber, { record, distanceM });
    }
  }
  const jobs = permitJobs(inRadius);
  const all = [...nearest.values()].sort(
    (a, b) => byPermitDayDesc(a.record, b.record) || a.distanceM - b.distanceM,
  );
  const shown = displayAddress(address);
  const structured: RecentDigs = {
    ...header(shown, region, builtAt, incomplete, asked),
    radiusM,
    sinceYear,
    utility,
    permittedToday,
    total: all.length,
    shown: Math.min(all.length, limit),
    found: all.length,
    digs: all.slice(0, limit).map(({ record, distanceM }) => ({
      permitNumber: record.permitNumber,
      utility: record.utility,
      permittee: ownerName(record.permittee),
      work: workOf(record),
      issued: record.issued ?? null,
      workStart: record.workStart ?? null,
      workEnd: record.workEnd ?? null,
      permittedToday: isOpenOn(record, today),
      scheduled: isScheduled(record, today),
      street: streetOf(record),
      distanceM: round(distanceM),
      job: calledOut(jobs.get(record.permitNumber)),
    })),
    ...footer(region, mapUrl(shown, sinceYear)),
  };
  return { structured, text: recentDigsText(structured) };
};

export const recentDigsText = (answer: RecentDigs) => {
  const kind = `${answer.utility ? utilityLabel(answer.utility).toLowerCase() : 'utility'} `;
  const filters = [
    answer.sinceYear !== null ? ` since ${answer.sinceYear}` : '',
    answer.permittedToday ? ', permitted today' : '',
  ].join('');
  const scope = `within ${answer.radiusM} m of ${answer.address} (${answer.city})${filters}`;
  const capped = answer.total > answer.shown;
  const lines = [
    ...matchedLine(answer),
    answer.total
      ? `${answer.total} ${kind}${answer.total === 1 ? 'dig' : 'digs'} on record ${scope}${capped ? `; the newest ${answer.shown} are listed` : ''}. Records as of ${answer.recordsAsOf.slice(0, 10)}.`
      : `No ${kind}digs on record ${scope}. Records as of ${answer.recordsAsOf.slice(0, 10)}.`,
  ];
  if (answer.incomplete)
    lines.push('Some map data failed to load, so this may be missing records.');
  if (answer.digs.length)
    lines.push('Date | utility | permit holder | work | street | work window | permit');
  for (const dig of answer.digs)
    lines.push(
      `- ${[
        permitWhen(dig),
        utilityLabel(dig.utility),
        dig.permittee,
        withJob(dig.work, dig.job),
        `${dig.street || 'street not listed'}, ${dig.distanceM} m away`,
        `${dig.workStart ?? 'not listed'} to ${dig.workEnd ?? 'not listed'}${dig.permittedToday ? ' (permitted today)' : ''}`,
        dig.permitNumber,
      ].join(' | ')}`,
    );
  if (capped)
    lines.push(
      `${answer.total - answer.shown} more not listed. Narrow with since_year, radius_m, utility or permitted_today.`,
    );
  lines.push('', footerText(answer));
  return lines.join('\n');
};
