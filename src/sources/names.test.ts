import { describe, expect, it } from 'vitest';
import { scrubNames } from './names';

describe('scrubNames', () => {
  it('takes out the names crews sign and mention, as they appear in real permits', () => {
    const cases: [string, string][] = [
      ['LL30 LL30 T102164081 S.WEEMS PCM', 'LL30 LL30 T102164081 [name removed] PCM'],
      ['T101691100-A.MALLOZZI', 'T101691100-[name removed]'],
      [
        'main install integrity t102140855 j.comi',
        'main install integrity t102140855 [name removed]',
      ],
      ['CUT #27377 STEPHEN J. PARK [phone removed]', 'CUT #27377 [name removed] [phone removed]'],
      ['WO#19106670 (C. Burnell)', 'WO#19106670 ([name removed])'],
      [
        'WO# 16715591 ([email removed]) Maines/Brown',
        'WO# 16715591 ([email removed]) [name removed]',
      ],
      ['WARD 7; MIKE WALSH/[phone removed]/', 'WARD 7; [name removed]/[phone removed]/'],
      ['PER DEREK WITH MPL 4X4 RDWY', 'PER [name removed] WITH MPL 4X4 RDWY'],
      ['Contact is Paul Marshall [phone removed]', 'Contact is [name removed] [phone removed]'],
      ['CALL MR.JAMES WARREN AT[phone removed]', 'CALL MR.[name removed] AT[phone removed]'],
      ['Owner: Alma F. Frishkorn Census Tract', 'Owner: [name removed] Census Tract'],
      ['Express OK per J. Strohminger', 'Express OK per [name removed]'],
      [
        'XG21002926 - CWO - 255 - Installing Corrosion Test Station Hallen/R. Paquette/055 - MR',
        'XG21002926 - CWO - 255 - Installing Corrosion Test Station Hallen/[name removed]/055 - MR',
      ],
      ['GAS MAIN TIE IN HALLEN/J.SMITH', 'GAS MAIN TIE IN HALLEN/[name removed]'],
    ];
    for (const [typed, scrubbed] of cases) expect(scrubNames(typed), typed).toBe(scrubbed);
  });

  it('leaves streets, places, companies, agencies, labels and work words alone', () => {
    for (const text of [
      'service at 1505 S. Capitol St SW',
      'the intersection of E. Houston St. & Bowery',
      '275 South Van Ness, dig at S. Van Ness and Erie',
      'McAllister St. from Dr. Carlton B. Goodlett Pl./ Polk St.',
      'Joseph L. Alioto Performing Arts Piazza',
      'sent to J. Flores Construction for repair',
      'PCC R&R. Vaults, pothole',
      'emra is for the landscaping in the R-O-W. Zone',
      'receive pits at Points A and B. Perform HDD installation',
      '64.75" T x 57.5" W x 18" D. CARMEL VALLEY: CVPD-SF2',
      'Milling as per DDC contract',
      'per SDG-123 and per PG&E plans, per SDRSD 107',
      'Private landscape and trees per EMRA.',
      '8 NEY, ALSO SEE X1104, 975037, PER DPW',
      '4/4 OVER MAIN PER MILLER PIPELINE, 55 FEET WEST',
      '4945 Call Place SE to include repair of sidewalk',
      'PER CREW-650 WR 4101921',
      'Two window wells (1 per lot).',
      'NOTE: CALL FROM 311 / Cust Call Back: [phone removed]',
      "[phone removed] TRENCH 195' FROM EXISTING VAULT",
      'ON BARCLAY AV BET BOWNE ST AND PARSONS BLVD. [phone removed]',
      'DU 40 LF of 10in MS.Summary: Emergency MS',
      'INSTALL 1/2. SERVICE, 3/4 IN. COPPER',
      'TRENCH 5 FT OFF C/L. MAIN ON N/S. BROADWAY',
      'WORK IN R/W. RESTORE P/L. FENCE',
      'Sidewalk at C/L. Then N/S. Curb',
      'Repair 816/840/936/1018 Chenery St sidewalk',
    ]) {
      expect(scrubNames(text), text).toBe(text);
    }
  });
});
