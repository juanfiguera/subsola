import { describe, expect, it } from 'vitest';
import { DAL_DATASETS, dalPermitSelect, holderCase, mentionsAny } from './datasets';

// The layer's contact and free-text fields: the applicant's name, the company as typed (crew
// names ride along in it), the work description and the location notes, where people type
// phone numbers.
const NEVER_SENT = [
  'APPLICANTNAMESTORED',
  'APPLICANTCOMPANYNAMESTORED',
  'WORKDESCRIPTION',
  'SPECIFICLOCATION',
];

/** The columns `outFields` asks for by name, not counting what's worked out from them. */
const sentColumns = (select: string) =>
  select
    .split(/,(?![^(]*\))(?=(?:[^']*'[^']*')*[^']*$)/)
    .map((column) => column.trim())
    .filter((column) => !/\bAS \w+$/.test(column));

describe('Dallas permit download', () => {
  it('asks for no contact field or free text, only what is worked out from them', () => {
    const select = dalPermitSelect();
    for (const field of NEVER_SENT) expect(sentColumns(select)).not.toContain(field);
    expect(select).toMatch(/ AS holder,/);
    expect(select).toMatch(/ AS overhead,/);
    expect(select).toContain('EXTERNALFILENUM');
  });

  it('names only known owners, never the company as typed', () => {
    const holder = holderCase();
    expect(holder).toMatch(/^CASE WHEN /);
    expect(holder).toContain("THEN 'Atmos Energy'");
    expect(holder).toContain("THEN 'Dallas Water Utilities'");
    expect(holder).toMatch(/ELSE NULL END$/);
    expect(holder).not.toMatch(/THEN APPLICANTCOMPANYNAMESTORED|ELSE APPLICANT/);
  });

  it('looks for words in the description on the portal, quoted safely', () => {
    expect(mentionsAny(['POLE', "O'NEIL"])).toBe(
      "CASE WHEN (' ' || UPPER(WORKDESCRIPTION) || ' ' LIKE '%POLE%' OR ' ' || UPPER(WORKDESCRIPTION) || ' ' LIKE '%O''NEIL%') THEN 1 ELSE 0 END",
    );
  });

  it("never asks for the service line inventory's account id", () => {
    const services = DAL_DATASETS.find((spec) => spec.name === 'dalServiceLines')!;
    expect(services.select.split(',')).not.toContain('accountid');
    expect(services.select).toContain('address');
  });

  it('keeps the permits required and the map layers optional', () => {
    const byName = new Map(DAL_DATASETS.map((spec) => [spec.name, spec]));
    expect(byName.get('dalPermits')!.optional).toBe(false);
    expect(byName.get('dalStreets')!.optional).toBe(false);
    expect(byName.get('dalBuildings')!.optional).toBe(true);
    // FEMA's layer spans the country, so it pages by offset inside the city's box.
    expect(byName.get('dalBuildings')!.arcgis).toMatchObject({ byId: false });
    expect(byName.get('dalBuildings')!.arcgis!.within).toBeDefined();
  });
});
