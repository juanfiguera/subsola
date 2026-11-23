import type { Position } from 'geojson';
import type { UtilityKind } from '../../src/utilities';

export type City = 'nyc' | 'dc' | 'sf' | 'la' | 'sd' | 'sea' | 'den' | 'chi' | 'dal' | 'sj';
export const CITIES: City[] = ['nyc', 'dc', 'sf', 'la', 'sd', 'sea', 'den', 'chi', 'dal', 'sj'];

export const CITY_NAMES: Record<City, string> = {
  nyc: 'New York City',
  dc: 'Washington, DC',
  sf: 'San Francisco',
  la: 'Los Angeles',
  sd: 'San Diego',
  sea: 'Seattle',
  den: 'Denver',
  chi: 'Chicago',
  dal: 'Dallas',
  sj: 'San Jose',
};

/** Where a number came from, so every figure in insights.json can be checked. */
export interface Source {
  datasets: string[];
  filter: string;
}

export interface Figure<T> {
  value: T;
  source: Source;
  /** First and last date the figure covers, as YYYY-MM-DD, when it covers a span of time. */
  range?: [string, string];
  note?: string;
}

export const figure = <T>(value: T, source: Source, extra: Partial<Figure<T>> = {}): Figure<T> => ({
  value,
  source,
  ...extra,
});

export const cityOfDataset = (dataset: string): City => {
  if (dataset.startsWith('permits')) return 'nyc';
  const prefix = CITIES.find((city) => city !== 'nyc' && dataset.startsWith(city));
  if (!prefix) throw new Error(`No city for dataset ${dataset}`);
  return prefix;
};

const EARTH_RADIUS_M = 6_371_008.8;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

export const pathMeters = (path: Position[]): number => {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const [lon1, lat1] = path[i - 1]!;
    const [lon2, lat2] = path[i]!;
    const dLat = radians(lat2! - lat1!);
    const dLon = radians(lon2! - lon1!);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(lat1!)) * Math.cos(radians(lat2!)) * Math.sin(dLon / 2) ** 2;
    total += 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
  }
  return total;
};

export const METERS_PER_MILE = 1609.344;
export const miles = (paths: Position[][]) =>
  paths.reduce((sum, path) => sum + pathMeters(path), 0) / METERS_PER_MILE;

const DAY_MS = 86_400_000;
/** Days since 1970 for a YYYY-MM-DD date, or null when missing or implausible. */
export const dayOf = (date: string | undefined | null): number | null => {
  if (!date) return null;
  const ms = Date.parse(date.slice(0, 10));
  if (Number.isNaN(ms)) return null;
  const year = new Date(ms).getUTCFullYear();
  return year >= 1990 && year <= 2027 ? Math.floor(ms / DAY_MS) : null;
};
export const dateOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export const round = (value: number, places = 1) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

export const share = (part: number, whole: number) => (whole ? round((100 * part) / whole) : null);

export const tally = <K extends string | number>(counts: Map<K, number>, key: K, by = 1) =>
  counts.set(key, (counts.get(key) ?? 0) + by);

export const topEntries = <K>(counts: Map<K, number>, limit: number) =>
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

export type { UtilityKind };
