import { describe, expect, it } from 'vitest';
import { classifySfPermit } from './permits';

const utilities = (agent: string, purpose: string) =>
  classifySfPermit(agent, purpose).map((work) => `${work.utility}${work.assumed ? '?' : ''}`);

describe('classifySfPermit', () => {
  it('reads gas or electric from what PG&E wrote', () => {
    expect(utilities('Pacific Gas & Electric', 'Gas leak repair')).toEqual(['gas']);
    expect(utilities('Pacific Gas & Electric', 'Augusta GPRP MWC 14 Project')).toEqual(['gas']);
    expect(utilities('Pacific Gas & Electric', 'Electric burnout repair')).toEqual(['electric']);
    expect(utilities('Pacific Gas & Electric', 'Repair collapsed conduit')).toEqual(['electric']);
  });

  it('assumes gas when PG&E names only an address', () => {
    expect(utilities('Pacific Gas & Electric', '1665 Alabama St.')).toEqual(['gas?']);
  });

  it('takes a utility company at its word', () => {
    expect(utilities('San Francisco Water Department', 'REPAIR LEAK IN STREET')).toEqual(['water']);
    expect(utilities('SBC - Pacific Bell Engineering', '7524817')).toEqual(['telecom']);
    expect(utilities('NRG Energy Center SF', 'Steam line repair')).toEqual(['steam']);
  });

  it("reads a contractor's work from the purpose", () => {
    expect(
      utilities('J. Flores Construction Co.', 'Spot Sewer Repair 30, Contract #WW-584'),
    ).toEqual(['sewer']);
    expect(
      utilities('M Squared Construction', '12-inch DIP Water Main Installation on Holloway Avenue'),
    ).toEqual(['water']);
    expect(classifySfPermit('M Squared Construction', '12-inch DIP Water Main')[0]?.main).toBe(
      true,
    );
  });

  // Reported permits 24E-00567, 24E-00241, 24E-00440 and 24E-00434: a contractor's electric work
  // for PG&E, once filed as gas because the purpose named PG&E.
  it("files a contractor's electric work for PG&E as electric", () => {
    const phoenix = 'Phoenix Electric Company';
    for (const purpose of [
      'Install conduits for PG&E power and install 3 transformer vaults.',
      'Install conduits for PG&E power and install 3 transformer vaults. Permit modification includes adding conduit work at the intersection of Main St / Folsom St.',
      'install new electrical conduits for PG&E at Folsom/Beale St intersection for service connection to 200 Folsom St',
      'install substructure for PG&E for electrical service to building',
    ])
      expect(utilities(phoenix, purpose)).toEqual(['electric']);
    expect(
      classifySfPermit(phoenix, 'install substructure for PG&E for electrical service')[0]?.owner,
    ).toBe(phoenix);
  });

  it("keeps a contractor's other work, and drops PG&E when it's only worked around", () => {
    expect(utilities('Seton Pacific Construction', 'Joint trench for PG&E and Comcast.')).toEqual([
      'electric',
      'telecom',
    ]);
    expect(utilities('Solcom, Inc.', 'Fiber placement in existing PG&E duct.')).toEqual([
      'telecom',
    ]);
    expect(
      utilities(
        'J. Flores Construction Co.',
        'Replace 20 LF of 12in main sewer upstream of manhole, Fr PG&E',
      ),
    ).toEqual(['sewer']);
  });

  it('leaves out work that is not a utility', () => {
    expect(utilities('LC General Engineering & Construction', 'SIRP 14')).toEqual([]);
    expect(utilities('A. Ruiz Construction Co.', 'South of Market Pavement Renovation')).toEqual(
      [],
    );
  });
});
