import type { z } from 'zod';

/**
 * Bad tool arguments as sentences an assistant can act on, returned as a tool error rather than a
 * JSON-RPC error, so the model sees what to change and calls again. Since protocol 2025-11-25
 * input validation errors are tool execution errors (SEP-1303):
 * https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling
 */

interface Bounds {
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

const article = (word: string) => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);

const shown = (value: unknown) =>
  typeof value === 'string'
    ? JSON.stringify(value.length > 60 ? `${value.slice(0, 60)}...` : value)
    : JSON.stringify(value);

const kindOf = (value: unknown) =>
  value === null ? 'null' : Array.isArray(value) ? 'an array' : article(typeof value);

const issueText = (
  issue: z.core.$ZodIssue,
  args: Record<string, unknown>,
  original: unknown,
  bounds: Record<string, Bounds>,
) => {
  const name = issue.path.join('.') || 'arguments';
  const value = issue.path.length ? args[String(issue.path[0])] : original;
  const range = bounds[name] ?? {};
  const between =
    range.minimum !== undefined && range.maximum !== undefined
      ? `between ${range.minimum} and ${range.maximum}`
      : null;
  switch (issue.code) {
    case 'too_big':
      if (issue.origin === 'string')
        return `${name} can be at most ${String(issue.maximum)} characters (got ${String(value).length}).`;
      return `${name} must be ${between ?? `at most ${String(issue.maximum)}`} (got ${shown(value)}). Try ${String(issue.maximum)}.`;
    case 'too_small':
      if (issue.origin === 'string') return `${name} can't be empty.`;
      return `${name} must be ${between ?? `at least ${String(issue.minimum)}`} (got ${shown(value)}). Try ${String(issue.minimum)}.`;
    case 'invalid_type':
      if (value === undefined) return `${name} is required.`;
      if (issue.expected === 'int') return `${name} must be a whole number (got ${shown(value)}).`;
      return `${name} must be ${article(issue.expected)} (got ${kindOf(value)}: ${shown(value)}).`;
    case 'invalid_value':
      return `${name} must be one of ${issue.values.map((option) => JSON.stringify(option)).join(', ')} (got ${shown(value)}).`;
    default:
      return `${name}: ${issue.message}.`;
  }
};

/** One sentence per problem, after the tool's name: "Invalid arguments for recent_digs: ...". */
export const argumentErrorText = (
  tool: string,
  issues: z.core.$ZodIssue[],
  args: unknown,
  inputSchema: Record<string, unknown>,
) => {
  const record =
    args && typeof args === 'object' && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  const bounds = (inputSchema.properties ?? {}) as Record<string, Bounds>;
  const problems = issues.map((issue) => issueText(issue, record, args, bounds));
  return `Invalid arguments for ${tool}: ${problems.join(' ')}`;
};
