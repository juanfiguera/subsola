import { describe, expect, it } from 'vitest';
import { classifySjPermit, OTHER_HOLDER, sjPermitClass } from './permits';

// Descriptions written for these tests in the style of the city's permits; none is copied.
describe('sjPermitClass', () => {
  it('reads the letters at the front of the permit number, a special permit as its class', () => {
    expect(sjPermitClass('E240101S')).toEqual({ utility: 'energy', owner: 'PG&E' });
    expect(sjPermitClass('SE230411DT')).toEqual({ utility: 'energy', owner: 'PG&E' });
    expect(sjPermitClass('SW250112N')).toEqual({ utility: 'water', owner: 'San Jose Water' });
    expect(sjPermitClass('G260020E')).toEqual({ utility: 'water', owner: 'Great Oaks Water' });
    expect(sjPermitClass('SC19400W')).toBe('small cell');
    expect(sjPermitClass('SM260002E')).toBeNull();
    expect(sjPermitClass(null)).toBeNull();
    expect(sjPermitClass('See attached')).toBeNull();
  });
});

describe('classifySjPermit', () => {
  it("tells PG&E's gas from its electric by the work written", () => {
    expect(
      classifySjPermit('E250001W', 'Standard', 'PG&E to replace gas service. PG&E to trench.'),
    ).toEqual([{ utility: 'gas', owner: 'PG&E', assumed: false }]);
    expect(
      classifySjPermit(
        'E250002S',
        'Standard',
        'Excavate a 4x4 bellhole in the street to repair a leak.',
      ),
    ).toEqual([{ utility: 'gas', owner: 'PG&E', assumed: false }]);
    expect(
      classifySjPermit('E250003N', 'Standard', 'Abandon existing 3/4" STL service at main.'),
    ).toMatchObject([{ utility: 'gas', assumed: false }]);
    expect(
      classifySjPermit('E250004E', 'Standard', 'Upgrade TX and replace splice box in sidewalk.'),
    ).toEqual([{ utility: 'electric', owner: 'PG&E', assumed: false }]);
  });

  it('files PG&E work that says neither as electric, marked assumed', () => {
    expect(classifySjPermit('E250005DT', 'Standard', '123 Example Ave')).toEqual([
      { utility: 'electric', owner: 'PG&E', assumed: true },
    ]);
  });

  it('leaves out pole, lashing and tree work that says nothing of the ground', () => {
    expect(classifySjPermit('E250006W', 'Standard', 'PG&E to replace pole and OH service.')).toBe(
      'overhead',
    );
    expect(classifySjPermit('H250007S', 'Standard', 'Overlash approx 900 ft of cable.')).toBe(
      'overhead',
    );
    expect(
      classifySjPermit('SE250008E', 'Special', 'Vegetation crew to trim 3 trees near lines.'),
    ).toBe('overhead');
    // A riser down a pole into new conduit is underground work.
    expect(
      classifySjPermit('E250009S', 'Standard', 'Replace pole, install riser and trench conduit.'),
    ).toMatchObject([{ utility: 'electric' }]);
    // "Street" holds "tree", which isn't tree work.
    expect(
      classifySjPermit('T250010N', 'Standard', 'Place conduit across the street.'),
    ).toMatchObject([{ utility: 'telecom' }]);
  });

  it("names the phone and cable companies from the permit's letter, or the company it names", () => {
    expect(classifySjPermit('T250011E', 'Standard', 'Dig 4x4 pit to repair cable.')).toEqual([
      { utility: 'telecom', owner: 'AT&T', assumed: false },
    ]);
    expect(classifySjPermit('SH250012W', 'Special', 'Bore 300 ft, place CATV vault.')).toEqual([
      { utility: 'telecom', owner: 'Comcast', assumed: false },
    ]);
    expect(classifySjPermit('F250013S', 'Fiber', 'Zayo to trench and place fiber.')).toEqual([
      { utility: 'telecom', owner: 'Zayo', assumed: false },
    ]);
    expect(classifySjPermit('F250014S', 'Fiber', 'Trench and place 2 handholes.')).toEqual([
      { utility: 'telecom', owner: OTHER_HOLDER, assumed: false },
    ]);
  });

  it("files W and G permits as the two water companies' lines", () => {
    expect(classifySjPermit('W250015S', 'Emergency', 'EMG: Short service leak')).toEqual([
      { utility: 'water', owner: 'San Jose Water', assumed: false },
    ]);
    expect(classifySjPermit('G250016E', 'Emergency', 'Emergency water service repair')).toEqual([
      { utility: 'water', owner: 'Great Oaks Water', assumed: false },
    ]);
  });

  it('reads a permit with no letter from its description alone', () => {
    expect(classifySjPermit(null, 'Standard', 'PGE to tie in gas service at main')).toMatchObject([
      { utility: 'gas', owner: 'PG&E' },
    ]);
    expect(classifySjPermit(null, 'Emergency', 'Emergency hydrant replacement')).toEqual([
      { utility: 'water', owner: OTHER_HOLDER, assumed: false },
    ]);
    expect(classifySjPermit(null, 'Standard', 'Comcast to bore and place conduit')).toEqual([
      { utility: 'telecom', owner: 'Comcast', assumed: false },
    ]);
    expect(classifySjPermit(null, 'Standard', 'Repair sewer lateral cleanout')).toMatchObject([
      { utility: 'sewer' },
    ]);
    expect(classifySjPermit(null, 'Standard', 'Dumpster in parking lane')).toBe('no utility named');
  });

  it('leaves out small cells, by letter or work type', () => {
    expect(classifySjPermit('SC240079W', 'Small Cell', 'Replace antennas')).toBe('small cell');
    expect(classifySjPermit('T240001S', 'Small Cell', 'Trench to new pole')).toBe('small cell');
  });

  it('keeps a permit that says the street is not opened, as no dig', () => {
    expect(
      classifySjPermit(
        'ST250017S',
        'Special',
        'TCP to access 3 MH and splice fiber cable. No excavation.',
      ),
    ).toEqual([{ utility: 'telecom', owner: 'AT&T', assumed: false, noOpening: true }]);
    // A dig on the parkstrip or sidewalk still opens the ground.
    expect(
      classifySjPermit(
        'E250018S',
        'Standard',
        'Replace lid and frame in parkstrip. No asphalt excavation.',
      ),
    ).not.toMatchObject([{ noOpening: true }]);
    expect(
      classifySjPermit(
        'T250019E',
        'Standard',
        'Hand digging to expose cable. No excavation on street.',
      ),
    ).toEqual([{ utility: 'telecom', owner: 'AT&T', assumed: false }]);
    // "No excavation" isn't underground work: overhead work saying so is still overhead.
    expect(
      classifySjPermit(
        'E250020E',
        'Standard',
        'PG&E to replace OH service. No excavation in PROW.',
      ),
    ).toBe('overhead');
  });
});
