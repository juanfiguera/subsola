import { describe, expect, it } from 'vitest';
import {
  DC_NO_INFORMATION,
  DC_SUSPECTED,
  DC_VERIFIED,
  dcLeadCounts,
  leadSummary,
  materialLeadCounts,
  nycLeadCounts,
} from './lead';

describe('lead service line summaries', () => {
  it("reads NYC DEP's labels the way the map does", () => {
    const counts = nycLeadCounts(
      new Map([
        ['Non-Lead', 582483],
        ['Lead', 117561],
        ['Unknown - Lead Status Unknown', 114473],
        ['Non-Applicable', 39345],
        ['Galvanized Service Line Requiring Replacement', 3050],
      ]),
    );
    expect(counts).toEqual({ lead: 117561, galvanized: 3050, unknown: 114473 });
    expect(leadSummary('tax lots', 856912, counts)).toEqual({
      unit: 'tax lots',
      total: 856912,
      lead: 117561,
      leadPct: 13.7,
      galvanized: 3050,
      galvanizedPct: 0.4,
      unknown: 114473,
      unknownPct: 13.4,
    });
  });

  it('counts only verified lead in DC and lists no galvanized', () => {
    const counts = dcLeadCounts(
      new Map([
        [DC_VERIFIED, 6230],
        [DC_SUSPECTED, 4903],
        [DC_NO_INFORMATION, 8574],
        ['Non-lead both sides', 108128],
      ]),
    );
    expect(counts).toEqual({ lead: 6230, galvanized: null, unknown: 13477 });
    expect(leadSummary('premises', 127835, counts).galvanizedPct).toBeNull();
  });

  it("takes San Diego's and Seattle's materials as they are", () => {
    expect(
      materialLeadCounts(
        new Map([
          ['non-lead', 9],
          ['galvanized', 5],
          ['unknown', 2],
        ]),
      ),
    ).toEqual({ lead: 0, galvanized: 5, unknown: 2 });
  });
});
