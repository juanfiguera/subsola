import { z } from 'zod';

const BASE_URL = 'https://data.cityofnewyork.us/resource';
// Absent under Node, where the citywide build runs this code outside Vite.
const APP_TOKEN = import.meta.env?.VITE_SOCRATA_APP_TOKEN as string | undefined;

export interface SocrataQuery {
  where?: string;
  select?: string;
  order?: string;
  limit?: number;
}

const RETRY_DELAYS_MS = [800, 2400];

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

/**
 * Without an app token NYC Open Data throttles anonymous callers, and a throttled or dropped
 * request surfaces as a bare "Failed to fetch". A couple of spaced retries ride that out.
 */
const fetchWithRetry = async (url: string, init: RequestInit): Promise<Response> => {
  for (let attempt = 0; ; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    try {
      const res = await fetch(url, init);
      if (delay === undefined || (res.status !== 429 && res.status < 500)) return res;
      console.warn(`[subsola] ${url} returned ${res.status}, retrying`);
    } catch (error) {
      if (delay === undefined || init.signal?.aborted || !(error instanceof TypeError)) throw error;
      console.warn(`[subsola] ${url} failed, retrying`, error);
    }
    await wait(delay, init.signal ?? undefined);
  }
};

export const fetchSocrata = async <T>(
  datasetId: string,
  query: SocrataQuery,
  rowSchema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T[]> => {
  const params = new URLSearchParams({ $limit: String(query.limit ?? 5000) });
  if (query.where) params.set('$where', query.where);
  if (query.select) params.set('$select', query.select);
  if (query.order) params.set('$order', query.order);

  const headers: HeadersInit = APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {};
  const res = await fetchWithRetry(`${BASE_URL}/${datasetId}.json?${params}`, { headers, signal });
  if (!res.ok) {
    throw new Error(`NYC Open Data ${datasetId} returned ${res.status}: ${await res.text()}`);
  }
  return z.array(rowSchema).parse(await res.json());
};

/** The columns a row schema reads, so a query asks for nothing else. */
export const columnsOf = (schema: z.ZodObject) => Object.keys(schema.shape).join(',');

export const soqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

export const soqlIn = (values: string[]) => values.map(soqlString).join(',');

export const withinCircle = (column: string, lat: number, lng: number, meters: number) =>
  `within_circle(${column}, ${lat}, ${lng}, ${meters})`;

export const intersectsBox = (
  column: string,
  [west, south, east, north]: [number, number, number, number],
) =>
  `intersects(${column}, 'POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))')`;

export const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]),
});

export const multiLineSchema = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

export const multiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
});
