import { describe, expect, it } from 'vitest';
import {
  chiHolderName,
  classifyChiPermit,
  HOLDER_HIDDEN,
  isChiRestoration,
  keepsChiWorkType,
} from './permits';

describe('classifyChiPermit', () => {
  it('reads the utility from the companies that run them', () => {
    expect(classifyChiPermit('Peoples Gas*', {})).toEqual({
      utility: 'gas',
      owner: 'Peoples Gas',
      assumed: false,
    });
    expect(classifyChiPermit('ComED North*', { light: true })?.utility).toBe('electric');
    expect(classifyChiPermit('AT&T (SBC IL)*', {})?.owner).toBe('AT&T');
    expect(classifyChiPermit('COMCAST OF CHICAGO INC*', {})?.utility).toBe('telecom');
    expect(classifyChiPermit('LEVEL 3 COMMUNICATIONS DBA LUMEN*', {})?.owner).toBe('Lumen');
    expect(classifyChiPermit('MCI METRO ACCESS TRANSMISSION SERVICES LLC', {})?.owner).toBe(
      'Verizon',
    );
  });

  it("sorts Water Management's sewer work from its water, and marks water assumed when it doesn't say", () => {
    expect(classifyChiPermit('DWM*', { water: true, main: true })).toEqual({
      utility: 'water',
      owner: 'Chicago Water Management',
      assumed: false,
    });
    expect(classifyChiPermit('DWM*', { sewer: true })?.utility).toBe('sewer');
    expect(classifyChiPermit('DWM*', { sewer: true, water: true })?.utility).toBe('water');
    expect(classifyChiPermit('DWM*', {})).toEqual({
      utility: 'water',
      owner: 'Chicago Water Management',
      assumed: true,
    });
  });

  it("files the city's street crews as the city's own work, and leaves out signs and trees", () => {
    expect(classifyChiPermit('CDOT - In-House Construction', {})?.utility).toBe('capital');
    expect(classifyChiPermit('CDOT - Division of Electrical Operations', {})).toEqual({
      utility: 'electric',
      owner: 'CDOT Electrical Operations',
      assumed: false,
    });
    expect(classifyChiPermit('CDOT-Sign Management', {})).toBeNull();
    expect(classifyChiPermit('DSS - Bureau of Forestry', { tree: true })).toBeNull();
  });

  it("counts a contractor's permit only where its text or name says the utility", () => {
    expect(classifyChiPermit('BENCHMARK CONSTRUCTION*', { water: true })).toEqual({
      utility: 'water',
      owner: 'BENCHMARK CONSTRUCTION',
      assumed: false,
    });
    expect(classifyChiPermit('Sunesys, LLC', { telecom: true, electric: true })?.utility).toBe(
      'telecom',
    );
    expect(classifyChiPermit('JOHN BURNS CONSTRUCTION CO.*', { light: true })?.utility).toBe(
      'electric',
    );
    expect(classifyChiPermit('NPL CONSTRUCTION*', {})?.utility).toBe('gas');
    expect(classifyChiPermit('MADDEN SEWERAGE & DRAINAGE INC.*', {})?.utility).toBe('sewer');
    // Tree planting, stump removal, sidewalks and paving open the street but aren't a utility's.
    expect(classifyChiPermit('SEVEN-D CONSTRUCTION CO*', { tree: true })).toBeNull();
    expect(classifyChiPermit("O'WALLACE LANDSCAPING INC", { tree: true })).toBeNull();
    expect(classifyChiPermit('G & V CONST CO INC (SL)*', {})).toBeNull();
    // A plumber who lays both water and sewer lines counts only where the text says which.
    expect(classifyChiPermit('PJS EXCAVATING SEWER AND WATER INC', {})).toBeNull();
    expect(classifyChiPermit('PLUMBING PROFESSIONALS CO*', { water: true })?.utility).toBe('water');
  });

  it('keeps a permit whose holder is a person, without the name', () => {
    expect(classifyChiPermit(null, { water: true })).toEqual({
      utility: 'water',
      owner: HOLDER_HIDDEN,
      assumed: false,
    });
    expect(classifyChiPermit('TERENCE COX', { sewer: true })?.owner).toBe(HOLDER_HIDDEN);
    expect(classifyChiPermit(null, {})).toBeNull();
  });
});

describe('chiHolderName', () => {
  it("drops the portal's license marks", () => {
    expect(chiHolderName('SPEEDY GONZALEZ LANDSCAPING, INC. (SL)*')).toBe(
      'SPEEDY GONZALEZ LANDSCAPING, INC.',
    );
    expect(chiHolderName('ERM PLUMBING INC (SL)***')).toBe('ERM PLUMBING INC');
    expect(chiHolderName('Sunesys, LLC')).toBe('Sunesys, LLC');
  });

  it('shows only names that read as a company or agency', () => {
    expect(chiHolderName('TERENCE COX')).toBe(HOLDER_HIDDEN);
    expect(chiHolderName('McCarthy')).toBe(HOLDER_HIDDEN);
    expect(chiHolderName('')).toBe(HOLDER_HIDDEN);
    expect(chiHolderName(null)).toBe(HOLDER_HIDDEN);
    expect(chiHolderName('PETER J. MISTRETTA DBA ROYAL FLUSHING PLUMBING')).toBe(
      'ROYAL FLUSHING PLUMBING',
    );
    expect(chiHolderName('MAT CONSTRUCTION LEASING INC dba MAT CONSTRUCTION*')).toBe(
      'MAT CONSTRUCTION',
    );
  });
});

describe('work types', () => {
  it('keeps restorations as no dig, and work begun early only for a utility', () => {
    expect(isChiRestoration('Restorat')).toBe(true);
    expect(isChiRestoration('GenOpening')).toBe(false);
    const gas = classifyChiPermit('Peoples Gas*', {})!;
    const paving = classifyChiPermit('BIGANE PAVING CO (CONSTRUCTION)*', { sewer: true })!;
    expect(keepsChiWorkType('WorkInAdv', gas)).toBe(true);
    expect(keepsChiWorkType('WorkInAdv', paving)).toBe(false);
    expect(keepsChiWorkType('GenOpening', paving)).toBe(true);
  });
});
