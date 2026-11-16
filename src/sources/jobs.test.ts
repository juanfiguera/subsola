import { describe, expect, it } from 'vitest';
import { jobNote, permitJobs, workOrderOf } from './jobs';
import type { PermitRecord } from './permits';

const WATER_ST = 'WATER STREET between BROAD STREET and COENTIES SLIP';

const permit = (
  permitNumber: string,
  issued: string,
  workStart: string,
  workEnd: string,
  purpose: string,
  street = WATER_ST,
  permittee = 'Consolidated Edison',
): PermitRecord => ({
  permitNumber,
  utility: 'steam',
  type: 'Major Install',
  permittee,
  issued,
  workStart,
  workEnd,
  status: undefined,
  street,
  purpose,
  locationNote: undefined,
  mentionsMain: false,
  dataset: 'permitsHistoric',
});

// Con Edison's steam permits near 55 Water St, as the city published them. Work order 201804340
// goes back to February 2018 (50 street openings); these are its last ten, from July 2021, with
// the city's own New, Renew and Extend marks.
const NEAR_55_WATER_ST: PermitRecord[] = [
  ['M012021181A15', 'renewal', '2021-06-30', '2021-07-10', '2021-08-08'],
  ['M012021208A25', 'renewal', '2021-07-27', '2021-08-09', '2021-09-07'],
  ['M012021243A47', 'renewal', '2021-08-31', '2021-09-08', '2021-10-07'],
  ['M012021272B35', 'renewal', '2021-09-29', '2021-10-08', '2021-11-06'],
  ['M012021299A55', 'extension', '2021-10-26', '2021-11-07', '2021-11-14'],
  ['M012021363A38', '', '2021-12-29', '2022-01-03', '2022-02-01'],
  ['M012022025B46', 'renewal', '2022-01-25', '2022-02-02', '2022-03-03'],
  ['M012022054A49', 'renewal', '2022-02-23', '2022-03-04', '2022-04-02'],
  ['M012022081A79', 'renewal', '2022-03-22', '2022-04-03', '2022-05-02'],
  ['M012022116A27', 'renewal', '2022-04-26', '2022-05-03', '2022-06-01'],
]
  .map(([number, renews, issued, start, end]) => ({
    ...permit(number!, issued!, start!, end!, 'Repair Steam - 201804340'),
    ...(renews && { renews: renews as 'renewal' | 'extension' }),
  }))
  .concat([
    permit(
      'M012021288A10',
      '2021-10-19',
      '2021-10-15',
      '2021-11-13',
      'Repair Steam - 202121734',
      'FRONT STREET between GOUVERNEUR LANE and OLD SLIP',
    ),
    permit(
      'M012021293A21',
      '2021-10-22',
      '2021-10-20',
      '2021-10-22',
      'Repair Steam - 202121734',
      'OLD SLIP between FRONT STREET and SOUTH STREET',
    ),
    permit('M012024349A01', '2024-12-17', '2024-12-14', '2024-12-17', 'Repair Steam - 19263223'),
    permit(
      'M012024357A00',
      '2024-12-30',
      '2024-12-22',
      '2024-12-30',
      'Relay Flanges & Cut and Cap - 19263223',
    ),
    permit('M012025016B20', '2025-01-16', '2025-01-18', '2025-02-16', 'Repair Steam -19263223'),
    permit(
      'M012023155A02',
      '2023-06-06',
      '2023-06-04',
      '2023-06-06',
      'Install 6" Drain Line - 201916756',
    ),
  ]);

describe('permitJobs', () => {
  const jobs = permitJobs(NEAR_55_WATER_ST);

  it('finds the last ten permits of the Water St steam job as one job', () => {
    const job = jobs.get('M012022116A27');
    expect(job).toEqual({
      workOrder: '201804340',
      permits: 10,
      nth: 10,
      since: '2021-07-10',
      through: '2022-06-01',
      renewals: 9,
    });
    // The 45-day wait over the 2021 holidays doesn't break a job with a work order.
    expect(jobs.get('M012021363A38')?.nth).toBe(6);
    expect(jobNote(job)).toBe(
      'Same job permitted 10 times, Jul 2021 to Jun 2022, 9 filed by the city as renewals or extensions',
    );
    // Cities that don't mark renewals leave the count unknown, not zero.
    expect(jobs.get('M012025016B20')?.renewals).toBeNull();
  });

  it('keeps one work order together across streets and reworded purposes', () => {
    expect(jobs.get('M012021293A21')).toMatchObject({ workOrder: '202121734', permits: 2 });
    expect(jobs.get('M012025016B20')).toMatchObject({ workOrder: '19263223', permits: 3, nth: 3 });
  });

  it('leaves a one-off permit out, and calls out only jobs of three or more', () => {
    expect(jobs.has('M012023155A02')).toBe(false);
    expect(jobNote(jobs.get('M012021293A21'))).toBeNull();
  });

  it('says "since" while the job is still open', () => {
    expect(jobNote(jobs.get('M012025016B20'), '2025-02-01')).toBe(
      'Same job permitted 3 times, since Dec 2024',
    );
  });

  it('chains permits with no work order only on the same street, holder and words, close together', () => {
    const vault = (
      number: string,
      start: string,
      end: string,
      street = 'SOUTH STREET between BROAD STREET and OLD SLIP',
    ) => permit(number, start, start, end, 'VAULT REPAIRS', street);
    const chained = permitJobs([
      vault('A1', '2026-05-30', '2026-06-28'),
      vault('A2', '2026-06-29', '2026-07-28'),
      vault('A3', '2026-08-03', '2026-09-02'),
      // Four months later: a new job, not a renewal.
      vault('A4', '2027-01-10', '2027-02-08'),
      vault('B1', '2026-06-29', '2026-07-28', 'WATER STREET between OLD SLIP and WALL STREET'),
    ]);
    expect(chained.get('A3')).toMatchObject({ workOrder: null, permits: 3, nth: 3 });
    expect(chained.has('A4')).toBe(false);
    expect(chained.has('B1')).toBe(false);
  });

  it('counts a permit filed for several blocks once', () => {
    const twice = [NEAR_55_WATER_ST[0]!, NEAR_55_WATER_ST[0]!, NEAR_55_WATER_ST[1]!];
    expect(permitJobs(twice).get(NEAR_55_WATER_ST[1]!.permitNumber)?.permits).toBe(2);
  });
});

describe('workOrderOf', () => {
  it('reads a bare work order number, never a permit number or a size', () => {
    expect(workOrderOf('20676802 - Excavate over leak on 16" expansion joint')).toBe('20676802');
    expect(workOrderOf('SDGE - 300000796946 to remove wood pole')).toBe('300000796946');
    expect(workOrderOf('Restoration for work under 19E-00072')).toBeNull();
    expect(workOrderOf('See permit M012021181A15')).toBeNull();
    expect(workOrderOf('VAULT REPAIRS')).toBeNull();
  });
});
