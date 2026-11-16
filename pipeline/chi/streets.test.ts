import { describe, expect, it } from 'vitest';
import { streetMatchKey } from '../../src/sources/streets';
import { chiAddressBlock, chiStreetName, isDrawnChiStreet } from './streets';

const segment = (key: string, name: string, [lf, lt, rf, rt]: string[]) => ({
  key,
  street: streetMatchKey(name),
  row: { l_f_add: lf, l_t_add: lt, r_f_add: rf, r_t_add: rt },
});

describe('Chicago streets', () => {
  it('names a segment the way permits and the county write it', () => {
    expect(
      chiStreetName({ pre_dir: 'W', street_nam: 'ADDISON', street_typ: 'ST', suf_dir: null }),
    ).toBe('W ADDISON ST');
    expect(chiStreetName({ pre_dir: 'N', street_nam: null, street_typ: null, suf_dir: null })).toBe(
      '',
    );
  });

  it('draws streets, not rivers, ramps, expressways or vacated ones', () => {
    expect(isDrawnChiStreet({ class: '4', status: 'N', street_typ: 'AVE' })).toBe(true);
    expect(isDrawnChiStreet({ class: '1', status: 'N', street_typ: 'DR' })).toBe(true);
    expect(isDrawnChiStreet({ class: '1', status: 'N', street_typ: 'EXPY' })).toBe(false);
    expect(isDrawnChiStreet({ class: 'RIV', status: 'N', street_typ: null })).toBe(false);
    expect(isDrawnChiStreet({ class: '9', status: 'N', street_typ: 'ER' })).toBe(false);
    expect(isDrawnChiStreet({ class: '4', status: 'V', street_typ: 'PL' })).toBe(false);
  });

  it("finds a permit's block from its address on the city's grid", () => {
    const find = chiAddressBlock([
      segment('1', 'W ADDISON ST', ['1001', '1059', '1000', '1058']),
      segment('2', 'W ADDISON ST', ['1101', '1159', '1100', '1158']),
      segment('3', 'N CLARK ST', ['3600', '3648', '3601', '3649']),
      // A long segment whose range overlaps a short one's.
      segment('4', 'W ADDISON ST', ['1000', '1200', '0', '0']),
    ]);
    expect(find('W ADDISON ST', 1060)).toBe('4');
    expect(find('W Addison Street', 1120)).toBe('2');
    expect(find('W ADDISON ST', 1030)).toBe('1');
    expect(find('N CLARK ST', 3625)).toBe('3');
    expect(find('N CLARK ST', 5000)).toBeNull();
    expect(find('W ADDISON ST', Number.NaN)).toBeNull();
    expect(find('', 1030)).toBeNull();
  });
});
