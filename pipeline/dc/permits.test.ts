import { describe, expect, it } from 'vitest';
import { classifyDcPermit, dcCompany, excavationItems } from './permits';

describe('DC permit work items', () => {
  it('splits the excavation items out of the list', () => {
    expect(
      excavationItems(
        'Excavation; Clean Out (Sewer), Excavation; Water Lateral Conn over 2" Pipe (Trench), Over Head Work; Streetlight(s) Installation',
      ),
    ).toEqual(['Clean Out (Sewer)', 'Water Lateral Conn over 2" Pipe (Trench)']);
    expect(excavationItems(null)).toEqual([]);
  });

  it('reads the utility from the work, mains apart from services', () => {
    expect(
      classifyDcPermit(
        'Excavation; Gas Main Line (Trench), Excavation; Gas Connection (Trench)',
        'X',
      ),
    ).toEqual([
      { utility: 'gas', main: true, detail: 'Gas Main Line (Trench); Gas Connection (Trench)' },
    ]);
    expect(classifyDcPermit('Excavation; Telecom ML Conduits (Trench)', 'X')[0]).toMatchObject({
      utility: 'telecom',
      main: true,
    });
    expect(
      classifyDcPermit('Excavation; Storm Lateral Conn over 4" (Trench)', 'X')[0]?.utility,
    ).toBe('sewer');
  });

  it('gives work that any utility does to the permittee', () => {
    expect(classifyDcPermit('Excavation; Manhole Installation', 'PEPCO')[0]?.utility).toBe(
      'electric',
    );
    expect(classifyDcPermit('Excavation; Manhole Installation', 'DCWATER/CIP')[0]?.utility).toBe(
      'sewer',
    );
    expect(classifyDcPermit('Excavation; Valves (Excavation)', 'DC Water')[0]?.utility).toBe(
      'water',
    );
    // A test pit by a builder is about soil, not a utility.
    expect(classifyDcPermit("Excavation; Boring Test Pit (Each Add'l)", 'Katie Buckley')).toEqual(
      [],
    );
  });

  it('lists each utility once for a permit with several', () => {
    const work = classifyDcPermit(
      'Excavation; Clean Out (Sewer), Excavation; Manhole Installation, Excavation; Water Service Lateral Abandonment (Trench)',
      'M & M Site Utilities, LLC',
    );
    expect(work.map((item) => item.utility).sort()).toEqual(['sewer', 'water']);
  });

  it('ignores work that is not utility work', () => {
    expect(classifyDcPermit('Excavation; Water Proofing in Public Space', 'X')).toEqual([]);
  });

  it('names companies the way people know them', () => {
    expect(dcCompany('Wash Gas & Light Co.')).toEqual({ name: 'Washington Gas', utility: 'gas' });
    expect(dcCompany('Potomac Electric Power Co')?.name).toBe('Pepco');
    expect(dcCompany('RCN/Starpower Communications LLC')?.utility).toBe('telecom');
    expect(dcCompany('SZPM Consultants, Inc.')).toBeNull();
  });
});
