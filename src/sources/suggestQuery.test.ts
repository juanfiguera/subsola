import { describe, expect, it } from 'vitest';
import {
  likePrefix,
  prefixWhere,
  sameAddressKey,
  soqlPrefix,
  streetGuesses,
  typedPrefix,
  uniqueBy,
} from './suggestQuery';

const TYPES = { STREET: 'ST', ST: 'ST', STRAVENUE: 'STRA', AVENUE: 'AVE', AVE: 'AVE' };
const COLUMNS = { number: 'NUM', direction: 'DIR', name: 'NAME', type: 'TYPE' };

describe('typedPrefix', () => {
  it('reads a house number, a direction and the start of a street', () => {
    expect(typedPrefix('233 S Wac')).toEqual({ number: 233, direction: 'S', street: 'WAC' });
    expect(typedPrefix('1500 mar')).toEqual({ number: 1500, direction: null, street: 'MAR' });
    expect(typedPrefix('200 East Santa, San Jose')).toEqual({
      number: 200,
      direction: 'E',
      street: 'SANTA',
    });
  });

  it('keeps a lone direction as the street, since it may be the start of one', () => {
    expect(typedPrefix('233 S')).toEqual({ number: 233, direction: null, street: 'S' });
  });

  it('wants a number and some street', () => {
    expect(typedPrefix('233')).toBeNull();
    expect(typedPrefix('Wacker')).toBeNull();
    expect(typedPrefix('   ')).toBeNull();
  });

  it('drops quotes and wildcards before anything is asked', () => {
    expect(typedPrefix("12 O'Br%_")).toEqual({ number: 12, direction: null, street: 'O BR' });
  });
});

describe('likePrefix', () => {
  it('escapes quotes, wildcards and the escape character', () => {
    expect(likePrefix('MAR')).toBe("'MAR%' ESCAPE '\\'");
    expect(likePrefix("O'BRIEN")).toBe("'O''BRIEN%' ESCAPE '\\'");
    expect(likePrefix('50%_OFF')).toBe("'50\\%\\_OFF%' ESCAPE '\\'");
    expect(likePrefix('A\\B')).toBe("'A\\\\B%' ESCAPE '\\'");
  });

  it("can't be closed early by a typed quote", () => {
    const pattern = likePrefix("X' OR 1=1 --");
    // Every quote inside the pattern is doubled, so the literal runs to the closing one.
    expect(pattern.slice(1, pattern.indexOf("%' ESCAPE")).replace(/''/g, '')).not.toContain("'");
  });
});

describe('soqlPrefix', () => {
  it('uses starts_with, which takes no wildcards, and doubles quotes', () => {
    expect(soqlPrefix('st_name', "O'BR")).toBe("starts_with(st_name, 'O''BR')");
    expect(soqlPrefix('st_name', '50%')).toBe("starts_with(st_name, '50%')");
  });
});

describe('streetGuesses', () => {
  it('reads a full name and the start of its type', () => {
    expect(streetGuesses('MARILLA ST', TYPES)).toEqual({
      prefix: 'MARILLA ST',
      named: { name: 'MARILLA', abbreviations: ['ST', 'STRA'] },
    });
    expect(streetGuesses('4 AVE', TYPES).named).toEqual({ name: '4TH', abbreviations: ['AVE'] });
  });

  it('has only the prefix for one word or no type', () => {
    expect(streetGuesses('MAR', TYPES).named).toBeNull();
    expect(streetGuesses('MARTIN LU', TYPES).named).toBeNull();
  });
});

describe('prefixWhere', () => {
  it('asks for the number, the direction and the street start', () => {
    expect(prefixWhere({ number: 233, direction: 'S', street: 'WAC' }, COLUMNS, TYPES)).toBe(
      "NUM = 233 AND UPPER(DIR) = 'S' AND (UPPER(NAME) LIKE 'WAC%' ESCAPE '\\')",
    );
  });

  it('also matches a whole name with its type filed apart, and a full name column', () => {
    expect(
      prefixWhere(
        { number: 1500, direction: null, street: 'MARILLA ST' },
        {
          ...COLUMNS,
          fullName: 'FULL',
        },
        TYPES,
      ),
    ).toBe(
      "NUM = 1500 AND (UPPER(NAME) LIKE 'MARILLA ST%' ESCAPE '\\' OR UPPER(FULL) LIKE 'MARILLA ST%' ESCAPE '\\' OR (UPPER(NAME) = 'MARILLA' AND UPPER(TYPE) IN ('ST','STRA')))",
    );
  });
});

describe('sameAddressKey', () => {
  it('reads spelled-out and short forms as one address', () => {
    expect(sameAddressKey('200 North Spring Street')).toBe(sameAddressKey('200 N Spring St'));
    expect(sameAddressKey('200 S Spring St')).not.toBe(sameAddressKey('200 N Spring St'));
  });
});

describe('uniqueBy', () => {
  it('keeps the first of each', () => {
    expect(uniqueBy(['a1', 'b1', 'a2'], (item) => item[0]!)).toEqual(['a1', 'b1']);
  });
});
