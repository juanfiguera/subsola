import { describe, expect, it } from 'vitest';
import { energyWork } from './gasOrElectric';

const read = (text: string, options: Parameters<typeof energyWork>[1] = { fallback: 'gas' }) =>
  energyWork(text, options).map((work) => `${work.utility}${work.assumed ? '?' : ''}`);

describe('energyWork', () => {
  it('reads electric work even when the company is named "Gas & Electric"', () => {
    expect(read('Install conduits for PG&E power and install 3 transformer vaults.')).toEqual([
      'electric',
    ]);
    expect(read('PG&E ZA-1 Embarcadero to Potrero 230kV Transmission Line Project')).toEqual([
      'electric',
    ]);
    expect(read('Joint trench for PG&E and Comcast.')).toEqual(['electric']);
  });

  it('lets gas win over the words both use', () => {
    expect(read('Gas vault cover repair')).toEqual(['gas']);
    expect(read('Trench for two (2) PG&E gas conduits')).toEqual(['gas']);
    expect(read('SDGE - to install new cathodic protection system, rectifier pedestal')).toEqual([
      'gas',
    ]);
    expect(read('SDGE - to raise ex. valve box to grade.')).toEqual(['gas']);
  });

  it('reads a meter or riser as gas only when nothing says electric', () => {
    expect(read('SDGE - install new meter set')).toEqual(['gas']);
    expect(read('remove 45 ft wood pole, transfer riser to new pole')).toEqual(['electric']);
    expect(read('trench on sidewalk for new power service meter')).toEqual(['electric']);
  });

  it('keeps both when both are named', () => {
    expect(read('two trenches for new gas and electrical conduits')).toEqual(['gas', 'electric']);
  });

  it('does not take a sewage leak for a gas leak', () => {
    expect(read('locate and mitigate sewage leak and repair damaged conduit/cable')).toEqual([
      'electric',
    ]);
  });

  it("falls back to the contractor's trade, then the city's default, marked assumed", () => {
    expect(
      read('Trench for PG&E utilities.', { holder: 'Phoenix Electric Company', fallback: 'gas' }),
    ).toEqual(['electric']);
    expect(
      read('Trench for PG&E line.', { holder: 'Sheeran Pipeline, Inc.', fallback: 'electric' }),
    ).toEqual(['gas']);
    expect(
      read('Trench for PG&E line.', { holder: 'JMB Construction, Inc.', fallback: 'gas' }),
    ).toEqual(['gas?']);
    expect(read('work in the right of way', { fallback: 'electric' })).toEqual(['electric?']);
  });

  it('never reads a trade from a company that runs both', () => {
    expect(read('1665 Alabama St.', { holder: 'Pacific Gas & Electric', fallback: 'gas' })).toEqual(
      ['gas?'],
    );
  });

  it('counts a manhole as electric only when the permit names no other work', () => {
    expect(read('3445 25th St - MH 6220')).toEqual(['electric']);
    expect(
      read('20 LF of 8in main sewer downstream of manhole, Fr PG&E', {
        fallback: 'gas',
        otherWork: true,
      }),
    ).toEqual([]);
    expect(read('Water line and PG&E conduit', { fallback: 'gas', otherWork: true })).toEqual([
      'electric',
    ]);
  });
});
