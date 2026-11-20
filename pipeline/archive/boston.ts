import { z } from 'zod';
import { keepAllowed } from './massachusetts';
import { retrying } from './store';

/**
 * Boston's street permits from the Street Access Awareness layers, the three of them together:
 * permits that have expired, are active now, or start later. The expired layer is a rolling year,
 * so a permit leaves the source about twelve months after it ends. See docs/archive.md.
 */

const SERVICES = 'https://services.arcgis.com/sFnw0xNflSi8J0uh/arcgis/rest/services';
export const BOSTON_LAYERS = {
  expired: `${SERVICES}/Analytics_Street_Access_Awareness_Expired_Permits/FeatureServer/0`,
  active: `${SERVICES}/Analytics_Street_Access_Awareness_Active_Permits/FeatureServer/0`,
  future: `${SERVICES}/Analytics_Street_Access_Awareness_Future_Permits/FeatureServer/0`,
} as const;
export type BostonLayer = keyof typeof BOSTON_LAYERS;

/**
 * The only fields requested. Left out: permit_description, free text typed by the applicant that
 * holds names and phone numbers of crews, police details and neighbours; the *_for_map labels,
 * which only restate the type fields; ObjectId, a row number that changes between refreshes.
 * company_name is the permit holder and passes through the company check.
 */
export const BOSTON_FIELDS = [
  'permit_number',
  'permit_type_code',
  'permit_type',
  'permit_work_type_code',
  'permit_work_type',
  'permit_start_date',
  'permit_end_date',
  'company_name',
  'length_estimated',
  'squarefootage_estimated',
  'sam_id',
  'sam_full_address',
] as const;

// The layers allow 2,000 a page.
const PAGE_ROWS = 2_000;
const REQUEST_TIMEOUT_MS = 120_000;

const errorSchema = z.object({ error: z.object({ code: z.number(), message: z.string() }) });
const countSchema = z.object({ count: z.number() });
const featuresSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.record(z.string(), z.unknown()),
      geometry: z.object({ x: z.number(), y: z.number() }).nullish(),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
});

/** An ArcGIS query. A busy server answers 200 with the error in the body, so that is checked. */
const query = async <T extends z.ZodType>(
  layer: string,
  params: Record<string, string>,
  schema: T,
): Promise<z.infer<T>> => {
  const url = `${layer}/query?${new URLSearchParams({ where: '1=1', f: 'json', ...params })}`;
  const res = await retrying('ArcGIS query', () =>
    fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  );
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const body: unknown = await res.json();
  const failed = errorSchema.safeParse(body);
  if (failed.success)
    throw new Error(`${url}: ArcGIS error ${failed.data.error.code} ${failed.data.error.message}`);
  return schema.parse(body);
};

const round = (degrees: number) => Math.round(degrees * 1e6) / 1e6;

/** Every row of one layer, cut to the allowlist. Throws unless it got exactly the rows promised. */
export const fetchBostonLayer = async (layer: BostonLayer) => {
  const url = BOSTON_LAYERS[layer];
  const { count } = await query(url, { returnCountOnly: 'true' }, countSchema);
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < count; offset += PAGE_ROWS) {
    const page = await query(
      url,
      {
        outFields: BOSTON_FIELDS.join(','),
        orderByFields: 'ObjectId',
        resultOffset: String(offset),
        resultRecordCount: String(PAGE_ROWS),
        outSR: '4326',
      },
      featuresSchema,
    );
    for (const { attributes, geometry } of page.features)
      rows.push({
        layer,
        ...keepAllowed(attributes, BOSTON_FIELDS),
        lon: geometry ? round(geometry.x) : null,
        lat: geometry ? round(geometry.y) : null,
      });
    if (page.features.length === 0) break;
  }
  // A refresh landing mid-run shifts the offsets, which shows up as a count that doesn't match.
  const { count: after } = await query(url, { returnCountOnly: 'true' }, countSchema);
  if (rows.length !== count || after !== count)
    throw new Error(`Boston ${layer}: promised ${count} rows, sent ${rows.length}, now ${after}`);
  return rows;
};
