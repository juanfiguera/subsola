import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BOSTON_FIELDS } from './boston';
import { CAMBRIDGE_FIELDS, digSafeTickets } from './cambridge';
import { COMPANY_FIELD, PERSON_FIELD, isMassachusettsCompany, keepAllowed } from './massachusetts';
import { encodeSnapshot, snapshotKey, sortRows, withheldCounts } from './snapshotFiles';

describe('field allowlists', () => {
  const allowlists = { boston: BOSTON_FIELDS, cambridge: CAMBRIDGE_FIELDS };

  it.each(Object.entries(allowlists))('%s requests no person or contact field', (_, fields) => {
    const personal = fields.filter(
      (field) => PERSON_FIELD.test(field) && !COMPANY_FIELD.test(field),
    );
    expect(personal).toEqual([]);
  });

  it.each(Object.entries(allowlists))(
    '%s never asks for the fields we know are personal',
    (_, fields) => {
      for (const field of [
        'applicant_name',
        'massachusetts_hoisting_license',
        'license_grade',
        'hoisting_license_expiration',
        'contractor',
        'on_behalf',
        'attestat_date',
        'permit_description',
        'other_utility',
        'city_contract_name',
        'utility_permit_number',
        'water_permit_number',
      ])
        expect(fields).not.toContain(field);
    },
  );

  it('only lets company name fields past the name pattern', () => {
    const named = [...BOSTON_FIELDS, ...CAMBRIDGE_FIELDS].filter((field) => /name/i.test(field));
    expect(named.every((field) => COMPANY_FIELD.test(field))).toBe(true);
  });

  it('catches the usual shapes of a personal field', () => {
    for (const field of [
      'applicant_name',
      'contact_phone',
      'email',
      'e_mail',
      'license_number',
      'massachusetts_hoisting_license',
      'owner',
      'first_name',
    ])
      expect(PERSON_FIELD.test(field), field).toBe(true);
  });
});

describe('isMassachusettsCompany', () => {
  it('keeps utilities, agencies and firms', () => {
    for (const name of [
      'NATIONAL GRID',
      '*NSTAR Electric dba Eversource Energy',
      'BOSTON WATER & SEWER COMMISSION',
      'Cambridge Water Department',
      'VERIZON',
      'COMCAST',
      'Crown Castle NG East LLC',
      'Fred DeRoma & Son, Inc',
      'A&R EXCAVATION CO,INC',
      'Cellco Partnership d/b/a Verizon Wireless',
      'Feeney Bros',
    ])
      expect(isMassachusettsCompany(name), name).toBe(true);
  });

  it('withholds people, and firms with a person riding along', () => {
    for (const name of [
      'Jane Q Public',
      'PUBLIC JANE Q',
      'Jane Public dba Public Masonry',
      'Acme Construction - Jane Public',
      'Acme Construction (PM: Jane Public)',
      'MBTA (PM: Jane Public)',
      'Acme Construction/ Jane',
      'Feeney Bros, Jane Public',
      'Acme Construction- JANE PUBLIC',
      '617-555-0100',
      'Acme Construction 617-555-0100',
      'Acme LLC jane@example.com',
    ])
      expect(isMassachusettsCompany(name), name).toBe(false);
  });
});

describe('keepAllowed', () => {
  const allowlist = ['id', 'company_name', 'full_address', 'issue_date', 'public_water'] as const;

  it('keeps only allowlisted fields, in allowlist order', () => {
    expect(
      keepAllowed(
        {
          applicant_name: 'Jane Public',
          public_water: true,
          id: '7',
          company_name: 'Eversource Gas',
          full_address: ' 1 Main St ',
        },
        allowlist,
      ),
    ).toEqual({
      id: '7',
      company_name: 'Eversource Gas',
      full_address: '1 Main St',
      public_water: true,
    });
  });

  it('withholds a company name that may be a person', () => {
    expect(keepAllowed({ company_name: 'Jane Public' }, allowlist)).toEqual({
      company_name: null,
      company_name_withheld: true,
    });
  });

  it('nulls any text that holds a phone number or email address', () => {
    expect(
      keepAllowed({ full_address: 'call 617-555-0100', issue_date: 'x@example.com' }, allowlist),
    ).toEqual({ full_address: null, issue_date: null });
  });
});

describe('digSafeTickets', () => {
  it('keeps only the ticket numbers', () => {
    expect(digSafeTickets('20230805643 Fulkerson St/20230903823 Bent St')).toBe(
      '20230805643 20230903823',
    );
    expect(digSafeTickets('2019-080-4804')).toBe('2019-080-4804');
    expect(digSafeTickets('99999999999 (Jane Public)')).toBe('99999999999');
    expect(digSafeTickets('Pending with Jane Public')).toBeNull();
    expect(digSafeTickets(undefined)).toBeNull();
  });
});

describe('snapshot files', () => {
  it('keys a night by city, dataset and date', () => {
    expect(snapshotKey('boston', 'street-permits', '2026-11-19')).toBe(
      'snapshots/boston/street-permits/2026-11-19.jsonl.gz',
    );
    expect(snapshotKey('boston', 'meta', null)).toBe('snapshots/boston/meta.json');
  });

  it('writes the same pull as the same bytes whatever order it came in', () => {
    const rows = [
      { layer: 'expired', permit_number: 'B', n: 1 },
      { layer: 'active', permit_number: 'Z', n: 2 },
      { layer: 'expired', permit_number: 'A', n: 3 },
    ];
    const key = (row: Record<string, unknown>) =>
      `${String(row.layer)}\t${String(row.permit_number)}`;
    const forwards = encodeSnapshot(sortRows(rows, key));
    const backwards = encodeSnapshot(sortRows([...rows].reverse(), key));
    expect(Buffer.from(forwards).equals(Buffer.from(backwards))).toBe(true);
    expect(
      gunzipSync(forwards)
        .toString('utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line).n),
    ).toEqual([2, 3, 1]);
  });

  it('counts withheld names per field', () => {
    expect(
      withheldCounts([
        { company_name_withheld: true },
        { company_name_withheld: true, client_company_name_withheld: true },
        { company_name: 'Eversource Gas' },
      ]),
    ).toEqual({ company_name: 2, client_company_name: 1 });
  });
});
