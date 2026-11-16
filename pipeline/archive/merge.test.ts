import { describe, expect, it } from 'vitest';
import {
  decodeArchive,
  describeArchive,
  encodeArchive,
  mergeSnapshot,
  planSnapshots,
  type ArchivedRow,
} from './merge';
import type { PermitRow } from './permits';

const permit = (id: string, fields: Partial<PermitRow> = {}): PermitRow => ({
  permit: id,
  client: 'Toronto Hydro - Grid Maintenance (GM)',
  work: 'Pole Replacement',
  status: 'PERMIT ISSUED',
  from: '2026-01-05',
  to: '2026-02-05',
  geoId: '71568',
  location: '154 ROBINA AVE',
  crossStreets: 'Between GLENHURST AVE AND EARLSDALE AVE',
  ward: '09',
  district: 'Toronto and East York',
  ...fields,
});

const archived = (id: string, firstSeen: string, lastSeen: string, fields = {}): ArchivedRow => ({
  ...permit(id, fields),
  firstSeen,
  lastSeen,
});

describe('mergeSnapshot', () => {
  it('starts an archive from the first snapshot, seen that night', () => {
    expect(mergeSnapshot([], [permit('2'), permit('1')], '2026-11-10')).toEqual([
      archived('1', '2026-11-10', '2026-11-10'),
      archived('2', '2026-11-10', '2026-11-10'),
    ]);
  });

  it('adds new permits and updates ones still listed, keeping when they were first seen', () => {
    const archive = [archived('1', '2026-11-01', '2026-11-09')];
    const snapshot = [permit('1', { status: 'COMPLETED' }), permit('3')];
    expect(mergeSnapshot(archive, snapshot, '2026-11-10')).toEqual([
      archived('1', '2026-11-01', '2026-11-10', { status: 'COMPLETED' }),
      archived('3', '2026-11-10', '2026-11-10'),
    ]);
  });

  it('keeps permits that dropped out of the window as they were last seen', () => {
    const old = archived('1', '2026-06-01', '2026-11-03', { status: 'PLANNED' });
    expect(mergeSnapshot([old], [permit('2')], '2026-11-10')).toEqual([
      old,
      archived('2', '2026-11-10', '2026-11-10'),
    ]);
  });

  it('lets an older snapshot push back first-seen but never overwrite a newer sighting', () => {
    const archive = [archived('1', '2026-11-10', '2026-11-10', { status: 'COMPLETED' })];
    expect(mergeSnapshot(archive, [permit('1', { status: 'PLANNED' })], '2026-07-10')).toEqual([
      archived('1', '2026-07-10', '2026-11-10', { status: 'COMPLETED' }),
    ]);
  });
});

describe('encodeArchive and decodeArchive', () => {
  it('round-trips rows as gzipped JSON Lines', () => {
    const rows = [
      archived('1', '2026-11-01', '2026-11-10'),
      archived('2', '2026-11-10', '2026-11-10'),
    ];
    expect(decodeArchive(encodeArchive(rows))).toEqual(rows);
  });

  it('refuses an archive with a line that is not a permit', () => {
    const bad = encodeArchive([{ permit: '1' } as ArchivedRow]);
    expect(() => decodeArchive(bad)).toThrow(/line 1/);
  });
});

describe('describeArchive', () => {
  it('counts rows still in the source and leaves typo years out of the date range', () => {
    const rows = [
      archived('1', '2026-07-10', '2026-11-03', { from: '2024-01-22' }),
      archived('2', '2026-11-10', '2026-11-10', { from: '2026-12-01' }),
      archived('3', '2026-11-10', '2026-11-10', { from: '9960-01-11' }),
    ];
    expect(describeArchive(rows, '2026-11-10')).toEqual({
      rows: 3,
      inSource: 2,
      droppedFromSource: 1,
      proposedFrom: { oldest: '2024-01-22', newest: '2026-12-01' },
      firstSeen: '2026-07-10',
      lastRun: '2026-11-10',
    });
  });
});

describe('planSnapshots', () => {
  const prefix = 'archive/toronto/snapshots/';
  const key = (date: string) => `${prefix}${date}.jsonl.gz`;

  it('takes one when there is none, and again once the newest is a week old', () => {
    expect(planSnapshots([], prefix, '2026-11-10')).toEqual({
      take: key('2026-11-10'),
      remove: [],
    });
    expect(planSnapshots([key('2026-11-04')], prefix, '2026-11-10').take).toBeNull();
    expect(planSnapshots([key('2026-11-03')], prefix, '2026-11-10').take).toBe(key('2026-11-10'));
  });

  it('keeps the newest eight', () => {
    const weeks = Array.from({ length: 8 }, (_, index) =>
      key(new Date(Date.UTC(2026, 8, 15 + index * 7)).toISOString().slice(0, 10)),
    );
    expect(planSnapshots(weeks, prefix, '2026-11-10')).toEqual({
      take: key('2026-11-10'),
      remove: [weeks[0]],
    });
  });
});
