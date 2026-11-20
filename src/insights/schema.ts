import { z } from 'zod';

/**
 * The parts of insights.json (pipeline/insights.ts) the page reads. Checked on load so a changed
 * or half-written file shows the error message instead of charts with holes in them. Everything
 * else in the file passes through unread.
 */

export const CITY_KEYS = ['nyc', 'dc', 'sf', 'la', 'sd', 'sea', 'den', 'chi', 'dal'] as const;
export type CityKey = (typeof CITY_KEYS)[number];

const sourceSchema = z.object({ datasets: z.array(z.string()), filter: z.string() });

/** A figure as the pipeline writes it: a value with where it came from. */
const figure = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    source: sourceSchema,
    range: z.tuple([z.string(), z.string()]).optional(),
    note: z.string().optional(),
  });

const pct = z.number().nullable();

const reopeningSchema = z.object({
  medianDaysBetweenVisits: figure(z.number().nullable()),
  reopenedWithinOneYearPct: figure(pct),
  reopenedWithinThreeYearsPct: figure(pct),
  otherUtilityWithin90DaysPct: figure(pct),
  mostVisited: figure(
    z.array(
      z.object({
        block: z.string().nullable(),
        visits: z.number(),
        utilities: z.array(z.string()),
      }),
    ),
  ),
});

const cityPermitsSchema = z.object({
  streetOpenings: figure(z.number()),
  range: z.tuple([z.string(), z.string()]),
  coveredYears: z.array(z.number()),
  topHolders: figure(z.array(z.object({ holder: z.string(), permits: z.number(), share: pct }))),
  reopening: reopeningSchema,
});

const pipeSchema = z.object({
  city: z.enum(CITY_KEYS),
  utility: z.string(),
  miles: figure(z.number()),
  medianInstallYear: figure(z.number().nullable()),
  materialPctOfMiles: figure(z.record(z.string(), pct)),
});

export const leadSummarySchema = z.object({
  unit: z.string(),
  total: z.number(),
  lead: z.number(),
  leadPct: pct,
  galvanized: z.number().nullable(),
  galvanizedPct: pct,
  unknown: z.number(),
  unknownPct: pct,
});

const leadCitySchema = z.object({ summary: figure(leadSummarySchema) });

const licenseSchema = z.object({
  publisher: z.string(),
  license: z.string(),
  // Added with the insights page; older files have only the publisher and license.
  name: z.string().optional(),
  url: z.string().optional(),
});

/**
 * One entry per city. Denver's, Chicago's and Dallas's are optional: a file from before they
 * joined has none of their figures, and the page leaves them out until the nightly writes them.
 */
const perCity = <T extends z.ZodType>(schema: T) =>
  z.object({
    nyc: schema,
    dc: schema,
    sf: schema,
    la: schema,
    sd: schema,
    sea: schema,
    den: schema.optional(),
    chi: schema.optional(),
    dal: schema.optional(),
  });

export const insightsSchema = z.object({
  generatedAt: z.string(),
  cellsBuiltAt: z.string(),
  cities: perCity(z.string()),
  permits: perCity(cityPermitsSchema),
  pipes: z.record(z.string(), pipeSchema),
  leadServiceLines: z.object({
    nyc: leadCitySchema,
    dc: leadCitySchema,
    sd: leadCitySchema,
    sea: leadCitySchema,
    den: leadCitySchema.optional(),
    dal: leadCitySchema.optional(),
  }),
  models: z.object({
    licenses: perCity(z.record(z.string(), licenseSchema)),
  }),
});

export type Insights = z.infer<typeof insightsSchema>;
export type LeadSummary = z.infer<typeof leadSummarySchema>;
