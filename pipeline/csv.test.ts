import { describe, expect, it } from 'vitest';
import { csvRecords, csvRowMatches, csvRows } from './csv';

const chunked = async function* (...chunks: string[]) {
  yield* chunks;
};

const collect = async <T>(rows: AsyncIterable<T>) => {
  const all: T[] = [];
  for await (const row of rows) all.push(row);
  return all;
};

describe('csvRecords', () => {
  it('reads quoted commas, doubled quotes and line breaks inside a field', async () => {
    expect(
      await collect(csvRecords(chunked('a,"b, c","say ""hi""","two\nlines"\r\n1,,3,4\n'))),
    ).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['1', '', '3', '4'],
    ]);
  });

  it('reads the same when a chunk ends between a quote and the next character', async () => {
    expect(await collect(csvRecords(chunked('"x"', '"y",z', '\n"end"', '\n')))).toEqual([
      ['x"y', 'z'],
      ['end'],
    ]);
    expect(await collect(csvRecords(chunked('"x"', ',y')))).toEqual([['x', 'y']]);
  });

  it('keeps a last line with no line break', async () => {
    expect(await collect(csvRecords(chunked('a,b\nc,d')))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('csvRows', () => {
  it('names columns by the header, past a byte order mark, and leaves blanks out', async () => {
    expect(await collect(csvRows(chunked('﻿ID,NAME,DATE\n7,,2025-06-03\n')))).toEqual([
      { ID: '7', DATE: '2025-06-03' },
    ]);
  });
});

describe('csvRowMatches', () => {
  it('needs every column to match', () => {
    const match = { TYPE: /^Right of Way/, KIND: /^(A|B)$/ };
    expect(csvRowMatches({ TYPE: 'Right of Way - Dry Utilities', KIND: 'A' }, match)).toBe(true);
    expect(csvRowMatches({ TYPE: 'Right of Way - Dry Utilities', KIND: 'C' }, match)).toBe(false);
    expect(csvRowMatches({ TYPE: 'Right of Way - Dry Utilities' }, match)).toBe(false);
  });
});
