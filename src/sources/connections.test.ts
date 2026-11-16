import { describe, expect, it } from 'vitest';
import {
  houseSewerStatus,
  parseConnectionType,
  splitBbl,
  connectionPermitsFromRows,
} from './connections';

describe('parseConnectionType', () => {
  it('reads current and historic permit names', () => {
    expect(parseConnectionType('Sewer Connection')).toEqual({
      utility: 'sewer',
      action: 'Connection',
    });
    expect(parseConnectionType('Sewer Plug')).toEqual({ utility: 'sewer', action: 'Plug' });
    expect(parseConnectionType('Water Relay')).toEqual({ utility: 'water', action: 'Relay' });
    expect(parseConnectionType('SEWER PERMIT-INSTALL')).toEqual({
      utility: 'sewer',
      action: 'Install',
    });
    expect(parseConnectionType('PERMIT-TAP')).toEqual({ utility: 'water', action: 'Tap' });
  });
});

describe('splitBbl', () => {
  it('splits borough, block and lot', () => {
    expect(splitBbl('4006520083')).toEqual({ borough: '4', block: '00652', lot: '0083' });
  });
});

describe('houseSewerStatus', () => {
  const permit = (action: string, date: string, utility: 'water' | 'sewer' = 'sewer') => ({
    utility,
    action,
    date,
    permitNumber: date,
    dataset: 'current' as const,
  });

  it('is assumed with no sewer permit on the lot', () => {
    expect(houseSewerStatus([permit('Tap', '2020-01-01', 'water')])).toEqual({ kind: 'assumed' });
  });

  it('follows the newest house sewer permit', () => {
    expect(
      houseSewerStatus([permit('Install', '2010-01-01'), permit('Plug', '2019-05-01')]).kind,
    ).toBe('plugged');
    expect(
      houseSewerStatus([permit('Plug', '2010-01-01'), permit('Connection', '2019-05-01')]).kind,
    ).toBe('on-record');
  });

  it('ignores catch basin work', () => {
    expect(houseSewerStatus([permit('Ctch basin/man', '2021-01-01')])).toEqual({ kind: 'assumed' });
  });
});

describe('connectionPermitsFromRows', () => {
  it('builds BBLs from both datasets, drops repeats and sorts newest first', () => {
    const byLot = connectionPermitsFromRows(
      [
        {
          propertyborough: 'Brooklyn',
          propertyblock: '2285',
          propertylot: '12',
          permitnumber: 'C1',
          issuancedate: '2023-04-01T00:00:00.000',
          applicationtype: 'Sewer Connection',
        },
        {
          propertyborough: 'Brooklyn',
          propertyblock: '2285',
          propertylot: '12',
          permitnumber: 'C1',
          issuancedate: '2023-04-01T00:00:00.000',
          applicationtype: 'Sewer Connection',
        },
      ],
      [
        {
          borough: '3',
          block: '2285',
          lot: '12',
          permit_no: 'H1',
          dateissued: '2019-06-01T00:00:00.000',
          permit_description: 'WATER PERMIT-TAP',
        },
      ],
    );
    expect(byLot.get('3022850012')?.map((p) => [p.permitNumber, p.utility, p.dataset])).toEqual([
      ['C1', 'sewer', 'current'],
      ['H1', 'water', 'historic'],
    ]);
  });

  it('keeps only the wanted lots when asked', () => {
    const byLot = connectionPermitsFromRows(
      [],
      [
        {
          borough: '3',
          block: '2285',
          lot: '12',
          permit_no: 'H1',
          dateissued: '2019-06-01T00:00:00.000',
          permit_description: 'WATER PERMIT-TAP',
        },
      ],
      new Set(['3022850013']),
    );
    expect(byLot.size).toBe(0);
  });
});
