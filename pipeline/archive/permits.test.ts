import { describe, expect, it } from 'vitest';
import { isCompanyName, splitLocation, toPermitRow, type SourceRow } from './permits';

const source = (fields: Partial<SourceRow> = {}): SourceRow => ({
  PERMIT_NUMBER: '999995001',
  PROPOSED_FROM_DATE: '2024-11-05',
  PROPOSED_TO_DATE: '2025-05-05',
  CLIENT_NAME: 'Toronto Water - CSS',
  GEO_ID: '71568',
  DISPLAY_DESC: '154 ROBINA AVE (Between GLENHURST AVE AND EARLSDALE AVE)',
  PERMIT_STATUS: 'PERMIT ISSUED',
  INSTALLATION_TYPE_DESC: 'Water and Sewer Connection',
  CITY_WARD: '09',
  DISTRICT: 'Toronto and East York',
  ...fields,
});

describe('isCompanyName', () => {
  it('keeps utilities, agencies and companies', () => {
    for (const name of [
      'Toronto Hydro - Capital Projects West (CPW)',
      'Enbridge Gas Distribution - Restoration',
      'ROGERS COMMUNICATIONS CANADA INC  - RCF',
      'Astral Media Outdoor, L.P.',
      'ECS-TRANSPORTATION INFRASTRUCTURE (TI)',
      'Mosaic Transit Constructors GP',
      '1386073 Ontario Inc.',
      'Toronto Standard Condominium Corporation 2058',
    ])
      expect(isCompanyName(name), name).toBe(true);
  });

  it('withholds names that read as a person', () => {
    expect(isCompanyName('JANE Q PUBLIC')).toBe(false);
    expect(isCompanyName('Mei Lin Chen')).toBe(false);
  });
});

describe('splitLocation', () => {
  it('splits the address from the cross streets', () => {
    expect(splitLocation('98 YORKVIEW DR (NY) (Between ELGIN RD AND BEVDALE RD)')).toEqual({
      location: '98 YORKVIEW DR (NY)',
      crossStreets: 'Between ELGIN RD AND BEVDALE RD',
    });
  });

  it('drops the free-text description, contact details and all', () => {
    expect(
      splitLocation(
        '2100 YONGE ST [ Description: DUCTBANK*** Contact Pat Doe at 416-555-0100, pat.doe@example.com [ref] ], (Between CHURCH ST (TO) AND MUTUAL ST)',
      ),
    ).toEqual({ location: '2100 YONGE ST', crossStreets: 'Between CHURCH ST (TO) AND MUTUAL ST' });
  });

  it('reads the older layouts with a district after the cross street', () => {
    expect(
      splitLocation(
        'DENROCK DR [ Description: From Howard to the end ], (Intersected By HOWARD DR), North York',
      ),
    ).toEqual({ location: 'DENROCK DR, North York', crossStreets: 'Intersected By HOWARD DR' });
    expect(
      splitLocation('55 CHEVRON CRES, Scarborough  , [ Description: SEWER MAINTENANCE      ]'),
    ).toEqual({ location: '55 CHEVRON CRES, Scarborough', crossStreets: null });
  });

  it('has nothing for an empty field', () => {
    expect(splitLocation(null)).toEqual({ location: null, crossStreets: null });
  });
});

describe('toPermitRow', () => {
  it('keeps the fields that place and classify a dig', () => {
    expect(toPermitRow(source())).toEqual({
      permit: '999995001',
      client: 'Toronto Water - CSS',
      work: 'Water and Sewer Connection',
      status: 'PERMIT ISSUED',
      from: '2024-11-05',
      to: '2025-05-05',
      geoId: '71568',
      location: '154 ROBINA AVE',
      crossStreets: 'Between GLENHURST AVE AND EARLSDALE AVE',
      ward: '09',
      district: 'Toronto and East York',
    });
  });

  it('withholds a client that may be a person and marks it', () => {
    const row = toPermitRow(source({ CLIENT_NAME: 'JANE Q PUBLIC' }));
    expect(row.client).toBeNull();
    expect(row.clientWithheld).toBe(true);
    expect(toPermitRow(source({ CLIENT_NAME: null })).clientWithheld).toBeUndefined();
  });

  it('drops a location that holds a phone number', () => {
    expect(
      toPermitRow(source({ DISPLAY_DESC: 'CALL 416-555-0100 (Intersected By KING ST)' })).location,
    ).toBeNull();
  });
});
