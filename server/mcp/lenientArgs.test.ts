import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { lenientArgs, problemLabel } from './lenientArgs';

const A = '200 N Spring St, Los Angeles';

describe('lenientArgs', () => {
  it('drops null and blank optionals, which some clients send for every field left out', () => {
    expect(lenientArgs({ address: A, city: null, radius_m: null, utility: '' })).toEqual({
      address: A,
    });
  });

  it('reads the address under the names assistants give it', () => {
    expect(lenientArgs({ location: A })).toMatchObject({ address: A });
    expect(lenientArgs({ query: A })).toMatchObject({ address: A });
    expect(lenientArgs({ address: A, query: 'other' })).toMatchObject({ address: A });
  });

  it('turns stringified numbers and booleans into the real thing', () => {
    expect(
      lenientArgs({ address: A, radius_m: '200', since_year: '2024', permitted_today: 'true' }),
    ).toEqual({
      address: A,
      radius_m: 200,
      since_year: 2024,
      permitted_today: true,
    });
  });

  it('answers the nearest radius instead of refusing one out of range', () => {
    expect(lenientArgs({ address: A, radius_m: 500 })).toMatchObject({ radius_m: 400 });
    expect(lenientArgs({ address: A, radius_m: 5 })).toMatchObject({ radius_m: 10 });
    expect(lenientArgs({ address: A, radius_m: 150.6 })).toMatchObject({ radius_m: 151 });
  });

  it('reads a date as its year', () => {
    expect(lenientArgs({ address: A, since_year: '2023-06-01' })).toMatchObject({
      since_year: 2023,
    });
  });

  it('matches utility names in any case, plural or by a common name', () => {
    expect(lenientArgs({ address: A, utility: 'Gas' })).toMatchObject({ utility: 'gas' });
    expect(lenientArgs({ address: A, utility: 'electrical' })).toMatchObject({
      utility: 'electric',
    });
    expect(lenientArgs({ address: A, utility: 'sewers' })).toMatchObject({ utility: 'sewer' });
    expect(lenientArgs({ address: A, utility: 'pipes' })).toMatchObject({ utility: 'pipes' });
  });

  it('opens arguments sent as a JSON string', () => {
    expect(lenientArgs(JSON.stringify({ address: A }))).toEqual({ address: A });
    expect(lenientArgs('not json')).toBe('not json');
  });

  it('treats no arguments as an empty object', () => {
    expect(lenientArgs(undefined)).toEqual({});
  });
});

describe('problemLabel', () => {
  const schema = z.object({ address: z.string(), radius_m: z.number().optional() });

  it('names the field and the failure, never the value', () => {
    const parsed = schema.safeParse({ radius_m: 'wide' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(problemLabel(parsed.error.issues, { radius_m: 'wide' })).toBe(
      'address:missing,radius_m:invalid_type',
    );
  });

  it('labels a field the tools lack as other, so a client cannot write its own text', () => {
    const strict = z.object({ address: z.string() }).strict();
    const parsed = strict.safeParse({ address: A, secret_note: 'x' });
    if (parsed.success) throw new Error('expected a failure');
    expect(problemLabel(parsed.error.issues, {})).toBe('arguments:unrecognized_keys');
    const nested = z.object({ zzz: z.string() }).safeParse({});
    if (nested.success) throw new Error('expected a failure');
    expect(problemLabel(nested.error.issues, {})).toBe('other:missing');
  });
});
