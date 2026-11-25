import { describe, expect, it } from 'vitest';
import {
  addressFileSchema,
  addressFileUrl,
  buildAddressFiles,
  createAddressIndex,
  indexKey,
  matchAddressFile,
  normalizeAddress,
} from './addressIndex';

const files = buildAddressFiles([
  { number: '233', street: 'BROADWAY', place: 'Manhattan' },
  { number: '233', street: 'BROADWAY', place: 'Brooklyn' },
  { number: '2330', street: 'BROADWAY', place: 'Manhattan' },
  { number: '233', street: 'BEDFORD AVENUE', place: 'Brooklyn' },
  { number: '104-20', street: 'QUEENS BOULEVARD', place: 'Queens' },
  { number: '12', street: 'BARCLAY STREET', place: 'Manhattan' },
  { number: '120', street: 'BROADWAY', place: 'Manhattan' },
  { number: '1905', street: 'E 52 ST', place: 'Brooklyn' },
  { number: '600', street: '4TH AVE', place: 'Seattle' },
]);

describe('normalizeAddress', () => {
  it('spells an address one way, keeping a Queens hyphen and a trailing space', () => {
    expect(normalizeAddress('200 North Spring Street, Los Angeles')).toBe('200 N SPRING STREET');
    expect(normalizeAddress('200 North Spring Street ')).toBe('200 N SPRING ST ');
    expect(normalizeAddress('104-20 Queens Blvd')).toBe('104-20 QUEENS BLVD');
    expect(normalizeAddress('  12  ')).toBe('12 ');
  });

  it('drops street ordinal endings, typed whole or half, but not a house number letter', () => {
    expect(normalizeAddress('1905 E 52nd St ')).toBe('1905 E 52 ST ');
    expect(normalizeAddress('1905 E 52n')).toBe('1905 E 52');
    expect(normalizeAddress('12A 1st Ave ')).toBe('12A 1 AVE ');
  });
});

describe('indexKey', () => {
  it('waits for three characters, and tells a whole number from the start of a longer one', () => {
    expect(indexKey(normalizeAddress('12'))).toBeNull();
    expect(indexKey(normalizeAddress('12 '))).toBe('12 ');
    expect(indexKey(normalizeAddress('123'))).toBe('123');
  });
});

describe('buildAddressFiles', () => {
  it('cuts addresses into files by key, each street once with its numbers', () => {
    expect([...files.keys()].sort()).toEqual(['104', '12 ', '120', '190', '233', '600']);
    const file = addressFileSchema.parse(files.get('233'));
    expect(file.places).toEqual(['Brooklyn', 'Manhattan']);
    expect(file.streets).toContainEqual(['BROADWAY', 1, ['233', '2330']]);
    expect(file.streets).toContainEqual(['BROADWAY', 0, ['233']]);
  });

  it('skips rows without a house number or street', () => {
    expect(buildAddressFiles([{ number: '', street: 'MAIN ST', place: 'X' }]).size).toBe(0);
    expect(buildAddressFiles([{ number: '5', street: ' ', place: 'X' }]).size).toBe(0);
    expect(buildAddressFiles([{ number: '0', street: 'BROADWAY', place: 'X' }]).size).toBe(0);
  });
});

describe('matchAddressFile', () => {
  const file = files.get('233')!;

  it('matches a whole number exactly once a space follows it', () => {
    expect(matchAddressFile(file, '233 Broa', 6)).toEqual([
      { line: '233 BROADWAY', place: 'Brooklyn' },
      { line: '233 BROADWAY', place: 'Manhattan' },
    ]);
  });

  it('matches every number starting with what is typed while the number is unfinished', () => {
    const lines = matchAddressFile(file, '233', 6).map((row) => row.line);
    expect(lines).toContain('2330 BROADWAY');
    // An exact number comes first.
    expect(lines[0]).toMatch(/^233 /);
  });

  it('finds a street typed in either spelling', () => {
    const queens = files.get('104')!;
    expect(matchAddressFile(queens, '104-20 queens blvd', 6)).toHaveLength(1);
    expect(matchAddressFile(queens, '104-20 Queens Boul', 6)).toHaveLength(1);
    expect(matchAddressFile(file, '233 Bedford Ave', 6)).toEqual([
      { line: '233 BEDFORD AVENUE', place: 'Brooklyn' },
    ]);
  });

  it('finds a numbered street typed with its ordinal', () => {
    expect(matchAddressFile(files.get('190')!, '1905 E 52nd', 6)).toEqual([
      { line: '1905 E 52 ST', place: 'Brooklyn' },
    ]);
    expect(matchAddressFile(files.get('190')!, '1905 East 52n', 6)).toHaveLength(1);
  });

  it('finds a street whose name starts with an ordinal, filed with its ending', () => {
    expect(matchAddressFile(files.get('600')!, '600 4th Av', 6)).toEqual([
      { line: '600 4TH AVE', place: 'Seattle' },
    ]);
  });

  it('returns nothing for text that is not an address', () => {
    expect(matchAddressFile(file, 'Times Square', 6)).toEqual([]);
  });
});

describe('addressFileUrl', () => {
  it('spells spaces and hyphens out of the file name', () => {
    expect(addressFileUrl('https://data.subsola.com', 'nyc', '12 ')).toBe(
      'https://data.subsola.com/addresses/v1/nyc/12_.json.gz',
    );
    expect(addressFileUrl('https://data.subsola.com', 'nyc', '1-2')).toBe(
      'https://data.subsola.com/addresses/v1/nyc/1~2.json.gz',
    );
  });
});

describe('createAddressIndex', () => {
  const gz = (body: unknown) => new Response(JSON.stringify(body));
  const manifest = { v: 1, cities: { nyc: ['233', '104'] } };
  const setup = () => {
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      if (url.endsWith('/index.json.gz')) return gz(manifest);
      if (url.endsWith('/nyc/233.json.gz')) return gz(files.get('233'));
      return new Response('', { status: 404 });
    }) as typeof fetch;
    return { index: createAddressIndex('https://data.test', fetcher), asked };
  };

  it('answers from the file for a city with an index, fetching each file once', async () => {
    const { index, asked } = setup();
    expect(await index.lookup('nyc', '233 Broa', 6)).toHaveLength(2);
    expect(await index.lookup('nyc', '233 Broad', 6)).toHaveLength(2);
    expect(asked.filter((url) => url.includes('/233.'))).toHaveLength(1);
    expect(asked.filter((url) => url.endsWith('/index.json.gz'))).toHaveLength(1);
  });

  it('answers null for a city with no index, so its own lookup is asked', async () => {
    const { index } = setup();
    expect(await index.lookup('dc', '800 F St', 6)).toBeNull();
  });

  it('answers nothing, without asking, for a key the city has no addresses under', async () => {
    const { index, asked } = setup();
    expect(await index.lookup('nyc', '999 Main', 6)).toEqual([]);
    expect(asked.some((url) => url.includes('/999.'))).toBe(false);
  });
});
