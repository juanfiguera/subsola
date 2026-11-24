import { z } from 'zod';
import { REGIONS, cityNames, type RegionId } from '../../src/regions';
import { useDepthStandards } from '../../src/depth';
import { ADDRESS_MAX } from '../../src/share';
import { placeStreet, lotReportAt, CONTEXT_RADIUS_M } from '../../src/street';
import { activeWork, todayIn } from '../../src/work';
import { lookupPlace, permitsOnly, type Lookup, type LookupDeps } from './lookup';
import { missText } from './misses';
import { fartherLines } from './farther';
import { argumentErrorText } from './argErrors';
import { cityInput as city } from './cityInput';
import { SERVER_ICONS } from './meta';
import { UTILITY_KINDS, UTILITY_STYLES } from '../../src/utilities';
import { distanceMeters } from '../../src/geo';
import type { AddressProblem } from './findAddress';
import { missedPlace } from './missedPlace';
import type { CallFacts } from './calls';
import {
  coverageText,
  recentDigsAnswer,
  recentDigsOutput,
  whatsUnderAnswer,
  whatsUnderOutput,
  type Answer,
} from './answers';

export interface ToolDeps {
  lookup: LookupDeps;
  now: () => Date;
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** What a run tells the stats besides its answer; the tool's name is added by callTool. */
type RunFacts = Omit<CallFacts, 'tool'>;

interface Ran {
  result: ToolResult;
  facts: RunFacts;
}

interface Tool<Input extends z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: Input;
  output: z.ZodType;
  run: (args: z.output<Input>, deps: ToolDeps) => Promise<Ran>;
}

const DEFAULT_RADIUS_M = 150;
const MAX_RADIUS_M = 400;
export const MAX_DIGS = 25;
// A block is stored in the cell its middle falls in, so a long block reaching into the radius
// can sit in a cell this far past it.
const BLOCK_REACH_M = 125;

const address = z
  .string()
  .trim()
  .min(1)
  .max(ADDRESS_MAX)
  .describe(
    `A street address with house number, in ${cityNames('or')}. Include the city, e.g. "200 N Spring St, Los Angeles" or "33 Union Square West, Manhattan".`,
  );

const whatsUnderInput = z.object({ address, city });

const recentDigsInput = z.object({
  address,
  city,
  radius_m: z
    .number()
    .int()
    .min(10)
    .max(MAX_RADIUS_M)
    .default(DEFAULT_RADIUS_M)
    .describe(
      `How far around the address to look, in meters. Default ${DEFAULT_RADIUS_M}, at most ${MAX_RADIUS_M}.`,
    ),
  since_year: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .optional()
    .describe(
      'Only permits issued in this year or later. Where a city publishes no issue date (Los Angeles, Denver), the year the work starts counts.',
    ),
  utility: z
    .enum(UTILITY_KINDS)
    .optional()
    .describe(
      `Only this kind of work: ${UTILITY_KINDS.map((kind) => `"${kind}" (${UTILITY_STYLES[kind].label.toLowerCase()})`).join(', ')}.`,
    ),
  permitted_today: z
    .boolean()
    .optional()
    .describe('true for only the permits whose work window includes today.'),
});

const FAILURES = {
  timeout: "The city's address lookup didn't answer in time. Try again in a moment.",
  'no-records': "Found the address, but Subsola's records don't reach that street yet.",
  'data-unavailable': "Subsola's map data couldn't be loaded right now. Try again in a moment.",
};

type LookupMiss = Extract<Lookup, { ok: false }>;

const failureText = (found: LookupMiss, typed: string) =>
  found.reason === 'not-found' ? missText(found.problem ?? null, typed) : FAILURES[found.reason];

// Problems that mean the address is somewhere Subsola doesn't cover, not a typo in a covered city.
const OUTSIDE: AddressProblem['kind'][] = ['other-state', 'unknown-place'];

/**
 * How a failed lookup counts in the stats. A miss is outside coverage when the matcher said so,
 * or when nothing matched (or only a lookalike outside every city did) and the text names an
 * uncovered place: which geocoder answered first decides the matcher's problem, not the address.
 */
export const missFacts = (found: LookupMiss, typed: string, city?: RegionId): RunFacts => {
  const region = found.region ?? city ?? null;
  if (found.reason === 'timeout' || found.reason === 'data-unavailable')
    return { outcome: 'upstream_error', region, missedPlace: null };
  if (found.reason === 'no-records') return { outcome: 'no_records', region, missedPlace: null };
  const kind = found.problem?.kind;
  const place = missedPlace(typed);
  const outside =
    (kind !== undefined && OUTSIDE.includes(kind)) ||
    ((kind === undefined || kind === 'wrong-city') && place !== null);
  return outside
    ? { outcome: 'outside_coverage', region: null, missedPlace: place }
    : { outcome: 'no_match', region, missedPlace: null };
};

const missed = (found: LookupMiss, typed: string, city?: RegionId): Ran => ({
  result: errorResult(failureText(found, typed)),
  facts: missFacts(found, typed, city),
});

const answeredIn = (region: RegionId): RunFacts => ({
  outcome: 'answered',
  region,
  missedPlace: null,
});

export const errorResult = (message: string): ToolResult => ({
  content: [{ type: 'text', text: `${message}\n\n${coverageText(REGIONS)}` }],
  isError: true,
});

const answered = <T extends Record<string, unknown>>({
  structured,
  text,
}: Answer<T>): ToolResult => ({
  content: [{ type: 'text', text }],
  structuredContent: structured,
});

const whatsUnder: Tool<typeof whatsUnderInput> = {
  name: 'whats_under',
  title: "What's under the street at an address",
  description: `Looks up what public records say is under the street in front of one street address in ${cityNames('and')}. Returns each utility likely in the street (water, sewer, storm drain, gas, electric, telecom, steam) with its distance from the lot line, its expected depth and the code or standard behind it, and how the line was placed (the owner's published map, excavation permits on the block, or inferred) with a confidence label; the water service line's lead status where the city publishes it by address; the house sewer; digging permitted there today; the newest permits out front, each with its street, its distance from the address and its issue date (or its start date, marked scheduled when the work hasn't begun), and whether it is one of several permits for the same long-running job; and the nearest hydrant, catch basin and manhole. Use it for site research, scoping an excavation, or due diligence on a property: what is under the street or sidewalk at an address, whether planned digging might meet a line, and whether the service line is lead. Answers are public-records evidence with a records-as-of date, not a survey or a utility locate, and end with the city's 811 notice. An address outside these cities, or with no exact match, returns an error saying what was found instead.`,
  input: whatsUnderInput,
  output: whatsUnderOutput,
  run: async (args, deps) => {
    const found = await lookupPlace(
      args.address,
      CONTEXT_RADIUS_M,
      deps.lookup,
      undefined,
      args.city,
    );
    if (!found.ok) return missed(found, args.address, args.city);
    const {
      address: geocoded,
      region,
      frame,
      records,
      builtAt,
      cellsMissing,
      differs,
    } = found.place;
    // Synchronous from here: the placement reads the city's depth standards from a shared slot.
    useDepthStandards(region.depths);
    const placed = placeStreet(frame, records);
    // The day the site counts as today, so "permitted today" and "scheduled" agree with the map.
    const today = todayIn(region.timeZone, deps.now());
    const active = activeWork(records.permitGroups, today);
    const report = lotReportAt(frame, geocoded, records, placed, active);
    return {
      facts: answeredIn(region.id),
      result: answered(
        whatsUnderAnswer({
          asked: { requested: args.address, differs },
          farther: fartherLines(report, placed.runs),
          report,
          address: geocoded,
          region,
          builtAt,
          incomplete: cellsMissing > 0,
          serviceLots: records.serviceLots,
          groups: records.permitGroups,
          today,
        }),
      ),
    };
  },
};

const recentDigs: Tool<typeof recentDigsInput> = {
  name: 'recent_digs',
  title: 'Recent utility digs near an address',
  description: `Lists utility excavation permits on the blocks around one street address in ${cityNames('and')}, newest first, at most ${MAX_DIGS} with the total found: the utility, the permit holder, what the work was, the issue date (or, where a city publishes none, the start date) and work window, whether digging is permitted today or scheduled to start later, the street and its distance, and, for a job permitted again and again, how many permits it has run to since when. Use it to see who holds permits on a block, what work is open now or scheduled, which jobs drag on, and how often the street gets opened, when planning or coordinating work there. Narrow with radius_m, since_year, utility or permitted_today. Permits that don't cut the street (opening a manhole, storing material) are left out. Answers are public-records evidence with a records-as-of date and end with the city's 811 notice.`,
  input: recentDigsInput,
  output: recentDigsOutput,
  run: async (args, deps) => {
    const found = await lookupPlace(
      args.address,
      args.radius_m + BLOCK_REACH_M,
      deps.lookup,
      (origin) => permitsOnly((group) => distanceMeters(origin, group.geometry) <= args.radius_m),
      args.city,
    );
    if (!found.ok) return missed(found, args.address, args.city);
    const { address: geocoded, region, records, builtAt, cellsMissing, differs } = found.place;
    return {
      facts: answeredIn(region.id),
      result: answered(
        recentDigsAnswer({
          asked: { requested: args.address, differs },
          address: geocoded,
          region,
          builtAt,
          incomplete: cellsMissing > 0,
          groups: records.permitGroups,
          radiusM: args.radius_m,
          sinceYear: args.since_year ?? null,
          utility: args.utility ?? null,
          permittedToday: args.permitted_today ?? false,
          // The day the site counts as today, so "permitted today" agrees with the map.
          today: todayIn(region.timeZone, deps.now()),
          limit: MAX_DIGS,
        }),
      ),
    };
  },
};

export const TOOLS = [whatsUnder, recentDigs] as const;

const jsonSchema = (schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> => {
  const json: Record<string, unknown> = z.toJSONSchema(schema, { io });
  // MCP assumes its own dialect; some clients choke on a $schema they don't know.
  delete json.$schema;
  return json;
};

/**
 * The tools as `tools/list` describes them. Icons are a 2025-11-25 field, sent only to clients
 * on that version or later.
 */
export const toolList = ({ icons = false }: { icons?: boolean } = {}) =>
  TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    ...(icons && { icons: SERVER_ICONS }),
    inputSchema: jsonSchema(tool.input, 'input'),
    outputSchema: jsonSchema(tool.output, 'output'),
    annotations: {
      title: tool.title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }));

export type ToolCall = (
  { ok: true; result: ToolResult } | { ok: false; code: number; message: string }
) & { facts: CallFacts };

const NO_FACTS = { region: null, missedPlace: null };

/**
 * Runs a tool by name. An unknown tool is a protocol error; bad arguments, like every other
 * failure, are a tool error the assistant can read and fix.
 */
export const callTool = async (name: unknown, args: unknown, deps: ToolDeps): Promise<ToolCall> => {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool)
    return {
      ok: false,
      code: -32602,
      message: `Unknown tool: ${String(name)}`,
      facts: { outcome: 'bad_args', tool: null, ...NO_FACTS },
    };
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success)
    return {
      ok: true,
      facts: { outcome: 'bad_args', tool: tool.name, ...NO_FACTS },
      result: {
        content: [
          {
            type: 'text',
            text: argumentErrorText(
              tool.name,
              parsed.error.issues,
              args ?? {},
              jsonSchema(tool.input, 'input'),
            ),
          },
        ],
        isError: true,
      },
    };
  try {
    // Each tool's run takes its own input; the union of runs can't be called with one argument.
    const ran = await (tool.run as Tool<z.ZodType>['run'])(parsed.data, deps);
    return { ok: true, result: ran.result, facts: { ...ran.facts, tool: tool.name } };
  } catch (error) {
    // The error's name only: its message can carry the address.
    console.error(
      `[subsola mcp] ${tool.name} failed`,
      error instanceof Error ? error.name : 'error',
    );
    return {
      ok: true,
      result: errorResult('Something went wrong answering that. Try again in a moment.'),
      facts: { outcome: 'server_error', tool: tool.name, ...NO_FACTS },
    };
  }
};
