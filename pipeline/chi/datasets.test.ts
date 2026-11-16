import { describe, expect, it } from 'vitest';
import { CHI_DATASETS, chiPermitSelect, mentionsAny } from './datasets';

// The permits dataset's contact fields: names, street address, city, state, ZIP, emergency
// contact, and the free text, where people type names and phone numbers.
const NEVER_SENT = [
  'primarycontactfirst',
  'primarycontactmiddle',
  'primarycontactstreet',
  'primarycontactcity',
  'primarycontactstate',
  'primarycontactzip',
  'emergencycontactname',
  'applicationname',
  'comments',
  'detail',
];

describe('Chicago permit download', () => {
  it('asks for no contact field or free text, only what is worked out from them', () => {
    const select = chiPermitSelect();
    const sent = select.split(/,(?![^(]*\))/).map((column) =>
      column
        .trim()
        .split(/\s+as\s+/)
        .at(-1)!,
    );
    for (const field of NEVER_SENT) expect(sent).not.toContain(field);
    expect(sent).toContain('holder');
    expect(sent).toContain('water');
    // The last name is the company; the portal sends it only where no first name says a person.
    expect(select).toContain('case(primarycontactfirst IS NULL, primarycontactlast) as holder');
    expect(select).not.toMatch(/(^|,)\s*primarycontactlast\s*(,|$)/);
  });

  it('looks for words in the text on the portal, quoted safely', () => {
    expect(mentionsAny(['WATER', "O'HARE"])).toMatch(/like '%WATER%' OR .* like '%O''HARE%'\)$/);
  });

  it('builds its permits query from the schema', () => {
    const permits = CHI_DATASETS.find((spec) => spec.name === 'chiPermits')!;
    expect(permits.optional).toBe(false);
    expect(permits.where).toContain("applicationtype='DOT_PWO'");
    expect(permits.where).toContain("not in ('Cancelled','Denied')");
    expect(permits.socrata).toBe('https://data.cityofchicago.org/resource');
  });
});
