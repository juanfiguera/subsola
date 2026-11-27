import type { z } from 'zod';
import { UTILITY_KINDS, type UtilityKind } from '../../src/utilities';

/**
 * Tool arguments as assistants actually send them, made into what the schemas expect before
 * they're checked. Most rejected calls weren't wrong about what they wanted: some clients send
 * null for every optional field, stringify numbers, or name the address "location". Each fix here
 * only applies where the meaning is plain; anything else still fails with a message to act on.
 */

const RADIUS_MIN = 10;
const RADIUS_MAX = 400;

// Names assistants give the address when they don't read the schema closely.
const ADDRESS_ALIASES = ['location', 'query', 'street_address', 'address_line', 'addr', 'place'];

const UTILITY_ALIASES: Record<string, UtilityKind> = {
  electrical: 'electric',
  electricity: 'electric',
  power: 'electric',
  'natural gas': 'gas',
  telecommunications: 'telecom',
  telecommunication: 'telecom',
  communications: 'telecom',
  fiber: 'telecom',
  cable: 'telecom',
  telephone: 'telecom',
  phone: 'telecom',
  sewage: 'sewer',
  sanitary: 'sewer',
  storm: 'sewer',
  city: 'capital',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Arguments sent as a JSON string of the object, by clients that double-encode.
const asObject = (args: unknown): unknown => {
  if (typeof args !== 'string') return args;
  try {
    const parsed: unknown = JSON.parse(args);
    return isRecord(parsed) ? parsed : args;
  } catch {
    return args;
  }
};

const numberOf = (value: unknown): unknown => {
  if (typeof value !== 'string' || !/^\s*-?\d+(\.\d+)?\s*$/.test(value)) return value;
  return Number(value);
};

const radiusOf = (value: unknown): unknown => {
  const number = numberOf(value);
  if (typeof number !== 'number' || !Number.isFinite(number)) return number;
  // Out of range means "wider" or "tighter", not a different question: answer the nearest one.
  return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(number)));
};

// "2024", or a date like "2024-01-01" meaning since then.
const yearOf = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const year = /^\s*(\d{4})(?:-\d{2}(?:-\d{2})?)?\s*$/.exec(value);
    return year ? Number(year[1]) : value;
  }
  return value;
};

const booleanOf = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const word = value.trim().toLowerCase();
  if (word === 'true' || word === 'yes') return true;
  if (word === 'false' || word === 'no') return false;
  return value;
};

const utilityOf = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const word = value.trim().toLowerCase();
  if ((UTILITY_KINDS as readonly string[]).includes(word)) return word;
  if (UTILITY_ALIASES[word]) return UTILITY_ALIASES[word];
  const singular = word.replace(/s$/, '');
  if ((UTILITY_KINDS as readonly string[]).includes(singular)) return singular;
  return UTILITY_ALIASES[singular] ?? value;
};

const FIELDS: Record<string, (value: unknown) => unknown> = {
  radius_m: radiusOf,
  since_year: yearOf,
  permitted_today: booleanOf,
  utility: utilityOf,
};

export const lenientArgs = (args: unknown): unknown => {
  const object = asObject(args ?? {});
  if (!isRecord(object)) return object;
  const fixed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    // A field sent as null or blank means "not given", which is what the schema's optional is.
    if (value === null || (typeof value === 'string' && !value.trim())) continue;
    fixed[key] = FIELDS[key] ? FIELDS[key](value) : value;
  }
  if (fixed.address === undefined) {
    const alias = ADDRESS_ALIASES.find((key) => typeof fixed[key] === 'string');
    if (alias) fixed.address = fixed[alias];
  }
  return fixed;
};

// Field names the stats may store: the tools' own, so a client can't write its own text there.
const KNOWN_FIELDS = new Set([
  'address',
  'city',
  'radius_m',
  'since_year',
  'utility',
  'permitted_today',
]);

/**
 * What failed, for the stats row: "address:missing", "radius_m:invalid_type". Field names from
 * the schemas and zod's issue codes only, never a value that was sent.
 */
export const problemLabel = (issues: z.core.$ZodIssue[], args: unknown): string => {
  const record = isRecord(args) ? args : {};
  const labels = issues.map((issue) => {
    const key = issue.path.length ? String(issue.path[0]) : null;
    const field = key === null ? 'arguments' : KNOWN_FIELDS.has(key) ? key : 'other';
    const missing = issue.code === 'invalid_type' && key !== null && record[key] === undefined;
    return `${field}:${missing ? 'missing' : issue.code}`;
  });
  return [...new Set(labels)].join(',').slice(0, 120);
};
