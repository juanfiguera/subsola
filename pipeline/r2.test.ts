import { describe, expect, it } from 'vitest';
import { parseListing, planUpload } from './r2';

describe('parseListing', () => {
  it('reads keys, unquoted ETags and the next page token', () => {
    const xml = `<ListBucketResult><Contents><Key>0_1.json.gz</Key><ETag>&quot;abc&quot;</ETag></Contents>
      <Contents><Key>index.json</Key><ETag>"def"</ETag></Contents>
      <NextContinuationToken>t2</NextContinuationToken></ListBucketResult>`;
    expect(parseListing(xml)).toEqual({
      objects: [
        { key: '0_1.json.gz', etag: 'abc' },
        { key: 'index.json', etag: 'def' },
      ],
      next: 't2',
    });
  });

  it('has no next token on the last page', () => {
    expect(parseListing('<ListBucketResult></ListBucketResult>')).toEqual({
      objects: [],
      next: undefined,
    });
  });
});

describe('planUpload', () => {
  it('sends new and changed files and removes ones the build no longer makes', () => {
    const local = new Map([
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
    ]);
    const remote = new Map([
      ['a', '1'],
      ['b', 'old'],
      ['gone', '9'],
    ]);
    expect(planUpload(local, remote)).toEqual({ send: ['b', 'c'], remove: ['gone'] });
  });

  it('keeps the files it is told to keep even when the build made none', () => {
    const remote = new Map([
      ['index.json', '1'],
      ['insights.json', '2'],
    ]);
    expect(planUpload(new Map([['index.json', '1']]), remote, new Set(['insights.json']))).toEqual({
      send: [],
      remove: [],
    });
  });

  it('never removes the archives, which the cell build does not make', () => {
    const remote = new Map([
      ['index.json', '1'],
      ['archive/toronto/utility-cut-permits.jsonl.gz', '2'],
      ['archive/toronto/meta.json', '3'],
      ['archive/toronto/snapshots/2026-11-09.jsonl.gz', '4'],
      ['archived-cell.json.gz', '5'],
    ]);
    expect(planUpload(new Map([['index.json', '1']]), remote)).toEqual({
      send: [],
      remove: ['archived-cell.json.gz'],
    });
  });
});
