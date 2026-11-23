import { describe, expect, it } from 'vitest';
import { sjPermitEnds, sjPermitStatusSkip } from './build';
import { SJ_DATASETS } from './datasets';
import { endRim, sjGround, sjMaterial, sjPipeCover, sjPipeSize } from './sewers';

describe('sjPermitStatusSkip', () => {
  it('counts only permits issued and not replaced', () => {
    const issued = Date.UTC(2024, 3, 1);
    expect(sjPermitStatusSkip('Closed Out', issued)).toBeNull();
    expect(sjPermitStatusSkip('Expired', issued)).toBeNull();
    expect(sjPermitStatusSkip('Issued', issued)).toBeNull();
    expect(sjPermitStatusSkip('Upgraded', issued)).toBe('replaced');
    expect(sjPermitStatusSkip('Cancelled', issued)).toBe('never issued');
    expect(sjPermitStatusSkip('Under Review', null)).toBe('never issued');
    expect(sjPermitStatusSkip('Accepted', null)).toBe('never issued');
  });
});

describe('sjPermitEnds', () => {
  it("reads a segment's two cross streets", () => {
    expect(sjPermitEnds('From N 5th St To N 6th St')).toEqual(['N 5th St', 'N 6th St']);
    expect(sjPermitEnds('From End of Street To Chynoweth Av')).toEqual([
      'End of Street',
      'Chynoweth Av',
    ]);
  });

  it('says nothing of a location written any other way', () => {
    expect(sjPermitEnds('50 W. San Fernando St., between S. Market St. and S. 1st St.')).toBeNull();
    expect(sjPermitEnds(null)).toBeNull();
  });
});

describe('San Jose sewers', () => {
  it('names the materials and leaves unknowns blank', () => {
    expect(sjMaterial('VCP')).toBe('Vitrified clay');
    expect(sjMaterial(' rcp ')).toBe('Reinforced concrete');
    expect(sjMaterial('UNK')).toBeNull();
    expect(sjMaterial('TEC')).toBe('TEC');
  });

  it("takes the lid's surveyed height, else the terrain's, and never a blank zero", () => {
    expect(sjGround(246, 249.15)).toBe(246);
    expect(sjGround(null, 249.15)).toBe(249.15);
    expect(sjGround(0, 0)).toBeNull();
    expect(sjGround(99999, null)).toBeNull();
  });

  it('measures cover from the ground at each end less the invert and the pipe', () => {
    const network = {
      manholes: new Map([
        ['25778', 246],
        ['25779', 245],
      ]),
      inlets: new Map([['25779', 200]]),
    };
    // (6.35 + 6.45) / 2 less 6 in of pipe.
    expect(
      sjPipeCover(
        network,
        [
          ['ssManhole', '25778', 239.65],
          ['ssManhole', '25779', 238.55],
        ],
        6,
      ),
    ).toBe(5.9);
    expect(sjPipeCover(network, [['ssManhole', '99999', 230]], 8)).toBeNull();
  });

  it('reads each end in the layer of the structure it names, since their ids overlap', () => {
    const network = { manholes: new Map([['1831', 80.5]]), inlets: new Map([['1831', 200.7]]) };
    expect(endRim(network, 'swManhole', '1831')).toBe(80.5);
    expect(endRim(network, 'swInlet', '1831')).toBe(200.7);
    expect(endRim(network, 'ssCleanOut', '1831')).toBeUndefined();
    expect(endRim({ manholes: network.manholes }, 'swInlet', '1831')).toBeUndefined();
    expect(sjPipeSize(8)).toBe(8);
    expect(sjPipeSize(0)).toBeNull();
    expect(sjPipeSize(500)).toBeNull();
  });
});

describe('San Jose downloads', () => {
  const byName = new Map(SJ_DATASETS.map((spec) => [spec.name, spec]));

  it("never asks for the permit layers' staff, editor or notes fields", () => {
    for (const name of ['sjPermits', 'sjPermitPoints', 'sjPermitParcels'] as const) {
      const fields = byName.get(name)!.select.split(',');
      for (const field of ['ISSUEUSER', 'STAMPUSER', 'LASTEDITOR', 'NOTES'])
        expect(fields).not.toContain(field);
      expect(fields).toContain('REFERENCEFILE');
    }
  });

  it('keeps the permits and streets required and the map layers optional', () => {
    expect(byName.get('sjPermits')!.optional).toBe(false);
    expect(byName.get('sjStreets')!.optional).toBe(false);
    expect(byName.get('sjSewers')!.optional).toBe(true);
    expect(byName.get('sjBuildings')!.optional).toBe(true);
    expect(byName.get('sjBuildings')!.arcgis!.within).toBeDefined();
  });

  it('asks the paused inventory for no account or customer field', () => {
    const fields = byName.get('sjServiceLines')!.select.split(',');
    expect(fields).toEqual([
      'OBJECTID',
      'Address',
      'SJW_Side_Material',
      'Customer_Side_Material',
      'L_Goose_Neck',
    ]);
  });
});
