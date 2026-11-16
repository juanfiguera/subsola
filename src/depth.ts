import type { UtilityKind } from './utilities';

/**
 * How deep each utility is expected to be, from published standards only.
 * No NYC dataset gives actual pipe depths, so these are planning ranges, not measurements.
 * The map draws each pipe at `shallowestFt`, the depth a digger could hit it first, unless
 * `drawnFt` says otherwise.
 */
export type DepthBasis = 'federal-code' | 'state-code' | 'city-standard' | 'measured' | 'unknown';

export interface DepthStandard {
  shallowestFt: number;
  /** Where the map draws the line, when the shallowest depth is a rare exception. */
  drawnFt?: number;
  deepestFt: number;
  basis: DepthBasis;
  /** One plain sentence a crew can act on. */
  summary: string;
  source: { name: string; url: string } | null;
}

export const DEPTH_BASIS_LABELS: Record<DepthBasis, string> = {
  'federal-code': 'Federal minimum',
  'state-code': 'State minimum',
  'city-standard': 'City standard',
  measured: 'Measured in city records',
  unknown: 'No public standard',
};

// Electric, telecom and steam owners do not publish burial specs, and we could not verify a
// code minimum, so the whole shallow zone is treated as possible.
const UNKNOWN_SHALLOW: DepthStandard = {
  shallowestFt: 0.5,
  deepestFt: 6,
  basis: 'unknown',
  summary:
    'The owner does not publish burial depth. Treat it as possible anywhere in the top 6 ft, including directly below the pavement.',
  source: null,
};

export type DepthStandards = Partial<Record<UtilityKind, DepthStandard>>;

export const NYC_DEPTH_STANDARDS: DepthStandards = {
  gas: {
    shallowestFt: 1.5,
    deepestFt: 4,
    basis: 'federal-code',
    summary:
      'Federal code requires at least 24 in of cover for mains and 18 in for service lines under streets, so gas is expected from about 1.5 ft down.',
    source: {
      name: '49 CFR 192.327(b) and 192.361(a)',
      url: 'https://www.law.cornell.edu/cfr/text/49/192.327',
    },
  },
  water: {
    shallowestFt: 3.4,
    deepestFt: 5,
    basis: 'city-standard',
    summary:
      'NYC installs water mains with 3 ft 5 in to 4 ft of cover, depending on pipe size. Older mains may differ.',
    source: {
      name: 'NYC DDC Water Main Standard Specifications, p. 89',
      url: 'https://www.nyc.gov/assets/ddc/downloads/publications/infrastructure/watermain_std_specs_090801.pdf',
    },
  },
  sewer: {
    shallowestFt: 5,
    deepestFt: 25,
    basis: 'city-standard',
    summary:
      'DEP standard sewer details cover depths of 5 to 25 ft. Catch basin connections are shallower near the curb.',
    source: {
      name: 'NYC DEP Sewer Design Standards (drawing index)',
      url: 'https://www.nyc.gov/assets/dep/downloads/pdf/about/water-and-sewer-forms/sewer-design-standards.pdf',
    },
  },
  electric: UNKNOWN_SHALLOW,
  telecom: UNKNOWN_SHALLOW,
  steam: UNKNOWN_SHALLOW,
};

const DC_WATER_MANUAL =
  'https://www.dcwater.com/sites/default/files/engineering/PDM%20Vol%203%20-%20Linear%20Infrastructure%20Design_0.pdf';

export const DC_DEPTH_STANDARDS: DepthStandards = {
  gas: {
    shallowestFt: 1.5,
    deepestFt: 4,
    basis: 'federal-code',
    summary:
      'DC requires at least 24 in of cover over gas pipelines, and federal code at least 18 in over service lines under streets, so gas is expected from about 1.5 ft down.',
    source: {
      name: '15 DCMR §2305.2; 49 CFR 192.327 and 192.361',
      url: 'https://dcpsc.org/PSCDC/media/Images/15-23-Compiled_1.pdf',
    },
  },
  water: {
    shallowestFt: 4,
    deepestFt: 5.5,
    basis: 'city-standard',
    summary:
      'DC Water designs mains and service lines with at least 4 ft of cover, and transmission mains with 4 ft 6 in. Older mains may differ.',
    source: {
      name: 'DC Water Project Design Manual, Vol. 3, §4.3.3 and §4.8.2',
      url: DC_WATER_MANUAL,
    },
  },
  sewer: {
    shallowestFt: 4,
    // At the storm sewer minimum: drawn at 4 ft, the sewers sat level with the water mains and
    // the basin leads ran through them. Digs still count from 4 ft.
    drawnFt: 5.5,
    deepestFt: 10.5,
    basis: 'city-standard',
    summary:
      "DC Water's design manual puts sewers about 10 ft 6 in deep to the bottom of the pipe, and allows as little as 4 ft of cover only in isolated upper reaches. Storm sewers get at least 5 ft 6 in.",
    source: {
      name: 'DC Water Project Design Manual, Vol. 3, §5.6.1.3 and Fig. 4-2',
      url: DC_WATER_MANUAL,
    },
  },
  electric: UNKNOWN_SHALLOW,
  telecom: UNKNOWN_SHALLOW,
  steam: UNKNOWN_SHALLOW,
};

const SF_STANDARD_PLANS =
  'https://www.sfpuc.gov/sites/default/files/documents/CDD_StandardPlans_2020.pdf';
const GO_128 = 'https://ia.cpuc.ca.gov/GOs/GO128/go_128_rule_33_4.html';

export const SF_DEPTH_STANDARDS: DepthStandards = {
  gas: {
    shallowestFt: 1.5,
    deepestFt: 4,
    basis: 'federal-code',
    summary:
      'Federal code requires at least 24 in of cover over gas mains and 18 in over service lines under streets, so gas is expected from about 1.5 ft down.',
    source: {
      name: '49 CFR 192.327 and 192.361',
      url: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-D/part-192',
    },
  },
  water: {
    shallowestFt: 2,
    // The mains; the 24 in minimum is for service lines.
    drawnFt: 3,
    deepestFt: 5,
    basis: 'city-standard',
    summary:
      "SFPUC's standard plans dig water trenches at least 36 in deep for 4 to 8 in mains and 24 in for service lines, so water is expected from about 2 ft down. Older mains may differ.",
    source: {
      name: 'SFPUC CDD Standard Plans (2020), CDD-LP-001A and LP-002',
      url: SF_STANDARD_PLANS,
    },
  },
  sewer: {
    shallowestFt: 5,
    drawnFt: 8,
    deepestFt: 12,
    basis: 'measured',
    summary:
      "In the city's sewer records, half of San Francisco's manholes measure 9 ft 6 in or more from the street to the bottom of the pipe, and nine in ten more than 6 ft 6 in.",
    source: {
      name: 'SF Public Works sewer nodes, rim and invert elevations',
      url: 'https://gis.sf.gov/svc/rest/services/boe/SEWER_ASSETS_ALL_STATUS/FeatureServer/0',
    },
  },
  electric: {
    shallowestFt: 2,
    deepestFt: 6,
    basis: 'state-code',
    summary:
      'California requires at least 24 in of cover over electric lines under streets, more for lines over 35 kV, so electric is expected from about 2 ft down.',
    source: { name: 'CPUC General Order 128, Rule 33.4-C', url: GO_128 },
  },
  telecom: {
    shallowestFt: 1.5,
    deepestFt: 6,
    basis: 'state-code',
    summary:
      'California requires at least 18 in of cover over communication lines under streets, so telecom is expected from about 1.5 ft down.',
    source: {
      name: 'CPUC General Order 128, Appendix A, Table 1',
      url: 'https://ia.cpuc.ca.gov/gos/GO128/go_128_appendix_a_table_1.html',
    },
  },
  steam: UNKNOWN_SHALLOW,
};

const LADWP_STANDARDS =
  'https://ladwp.com/sites/default/files/2023-09/Design%20Standards%20and%20Installation%20Requirements_2023.pdf';

export const LA_DEPTH_STANDARDS: DepthStandards = {
  gas: SF_DEPTH_STANDARDS.gas,
  water: {
    shallowestFt: 2,
    // Mains under 12 in; the 2 ft minimum is for small service lines.
    drawnFt: 3,
    deepestFt: 4,
    basis: 'city-standard',
    summary:
      "LADWP's design standards give mains under 12 in 30 to 42 in of cover and larger mains 36 to 48 in, and small service lines at least 2 ft, so water is expected from about 2 ft down.",
    source: {
      name: 'LADWP Design Standards and Installation Requirements (2023)',
      url: LADWP_STANDARDS,
    },
  },
  sewer: {
    shallowestFt: 4,
    drawnFt: 8,
    deepestFt: 14,
    basis: 'measured',
    summary:
      'LA Sanitation records the depth of most of its sewers. House connections must be at least 4 ft deep at the property line, so sewer is expected from about 4 ft down.',
    source: {
      name: 'LA Sanitation sewer pipes and maintenance holes; LAMC 64.17',
      url: 'https://maps.lacity.org/lahub/rest/services/Sewer_Information/MapServer/9',
    },
  },
  electric: SF_DEPTH_STANDARDS.electric,
  telecom: SF_DEPTH_STANDARDS.telecom,
  steam: UNKNOWN_SHALLOW,
};

const SD_WATER_TRENCH = 'https://www.sandiego.gov/sites/default/files/sdw-110.pdf';
const SD_SEWER_GUIDE =
  'https://www.sandiego.gov/sites/default/files/legacy/mwwd/pdf/sewerdesign.pdf';

export const SD_DEPTH_STANDARDS: DepthStandards = {
  gas: SF_DEPTH_STANDARDS.gas,
  water: {
    shallowestFt: 3,
    drawnFt: 3,
    deepestFt: 5,
    basis: 'city-standard',
    summary:
      "The city's trench standard gives distribution mains at least 3 ft of cover and transmission mains 5 ft, so water is expected from about 3 ft down.",
    source: { name: 'City of San Diego Standard Drawing SDW-110', url: SD_WATER_TRENCH },
  },
  sewer: {
    shallowestFt: 5,
    drawnFt: 8,
    deepestFt: 15,
    basis: 'measured',
    summary:
      'The city records the depth of most of its sewers. House laterals must be 5 to 7 ft below the top of the curb at the property line, so sewer is expected from about 5 ft down.',
    source: { name: 'City of San Diego Sewer Design Guide, section 2.5.2', url: SD_SEWER_GUIDE },
  },
  electric: SF_DEPTH_STANDARDS.electric,
  telecom: SF_DEPTH_STANDARDS.telecom,
  steam: UNKNOWN_SHALLOW,
};

const SEA_WATER_MAINS =
  'https://seattle.gov/documents/departments/spu/engineering/developer_installed_main.pdf';

export const SEA_DEPTH_STANDARDS: DepthStandards = {
  gas: SF_DEPTH_STANDARDS.gas,
  water: {
    shallowestFt: 2.2,
    drawnFt: 3,
    deepestFt: 5,
    basis: 'city-standard',
    summary:
      "Seattle's standard specifications give mains 12 in and smaller at least 26 in of cover, and SPU records most it has measured at 3 ft, so water is expected from a little over 2 ft down.",
    source: {
      name: 'Seattle Standard Specifications 7-10.3(5); SPU developer installed main guide',
      url: SEA_WATER_MAINS,
    },
  },
  sewer: {
    shallowestFt: 4,
    drawnFt: 8,
    deepestFt: 14,
    basis: 'measured',
    summary:
      'SPU records the depth of most of its sewer and drainage pipes at both ends, so each is drawn at its own depth.',
    source: {
      name: 'SPU sewer and drainage mainlines',
      url: 'https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/SPU_DWW_Mainlines_External/FeatureServer/10',
    },
  },
  electric: UNKNOWN_SHALLOW,
  telecom: UNKNOWN_SHALLOW,
  steam: UNKNOWN_SHALLOW,
};

const DEN_WATER_STANDARDS =
  'https://www.denverwater.org/sites/default/files/engineering-standards-17th-edition.pdf';
const DEN_SEWER_MANUAL =
  'https://denvergov.org/files/assets/public/v/1/doti/documents/standards/pwes-006.0-sanitary_sewer_design_technical_criteria_manual.pdf';

export const DEN_DEPTH_STANDARDS: DepthStandards = {
  gas: SF_DEPTH_STANDARDS.gas,
  water: {
    shallowestFt: 4.5,
    deepestFt: 6,
    basis: 'city-standard',
    summary:
      "Denver Water's engineering standards give mains at least 4 1/2 ft of cover, and lay service lines 4 1/2 to 6 ft below the ground, below the frost. Denver Water may allow as little as 3 ft where a main crosses another line, and older mains may differ.",
    source: {
      name: 'Denver Water Engineering Standards, 17th edition, §3.02 and §8.04',
      url: DEN_WATER_STANDARDS,
    },
  },
  sewer: {
    shallowestFt: 3,
    drawnFt: 9,
    deepestFt: 16,
    basis: 'measured',
    summary:
      'Denver Wastewater Management records the invert at each end of its pipes and the ground at most manholes, so each is drawn at its own depth. The city designs sanitary sewers at least 9 ft deep to the bottom of the pipe; storm drains run shallower, a quarter of them within 3 1/2 ft.',
    source: {
      name: 'Denver Sanitary Sewer Design Technical Criteria Manual (PWES-006.0), §3.01.1',
      url: DEN_SEWER_MANUAL,
    },
  },
  electric: UNKNOWN_SHALLOW,
  telecom: UNKNOWN_SHALLOW,
  steam: UNKNOWN_SHALLOW,
};

// The Water Section's standard notes for anyone building near its pipes; chicago.gov turns away
// scripted downloads, and the Internet Archive keeps copies (read from its February 2026 one).
const CHI_WATER_NOTES =
  'https://www.chicago.gov/content/dam/city/depts/water/general/Engineering/WMdesignStd/CDWM_WaterSection_Standard_Notes_Info.pdf';

export const CHI_DEPTH_STANDARDS: DepthStandards = {
  gas: SF_DEPTH_STANDARDS.gas,
  water: {
    // The big feeder mains, 54 in and up, are the exception at about 3 ft of cover; the grid
    // mains on most streets have their top near 5 ft, where the line is drawn.
    shallowestFt: 3,
    drawnFt: 5,
    deepestFt: 6,
    basis: 'city-standard',
    summary:
      'Grid mains (12 in and smaller) are laid 6 ft to the bottom of the pipe, so their top is about 5 ft down, and services and hydrant branches have 5 ft of cover. Feeder mains of 54 in and larger have only about 3 ft of cover. Older mains may differ.',
    source: {
      name: 'Chicago Department of Water Management, Water Section Standard Notes',
      url: CHI_WATER_NOTES,
    },
  },
  sewer: {
    shallowestFt: 5,
    drawnFt: 8,
    deepestFt: 20,
    basis: 'unknown',
    summary:
      'Chicago publishes neither a map of its sewers nor their depth. They run below the water mains, so treat anything from 5 ft down as possibly a sewer; most were laid before 1930.',
    source: null,
  },
  electric: UNKNOWN_SHALLOW,
  telecom: UNKNOWN_SHALLOW,
  steam: UNKNOWN_SHALLOW,
};

export const drawnDepthFt = (standard: DepthStandard) => standard.drawnFt ?? standard.shallowestFt;

let current: DepthStandards = NYC_DEPTH_STANDARDS;

/** The depth standards of the city on screen; they differ by who builds and runs the lines. */
export const depthStandards = (): DepthStandards => current;

export const useDepthStandards = (standards: DepthStandards) => {
  current = standards;
};

export const MAX_DEPTH_FT = 25;
export const FEET_TO_METERS = 0.3048;

export const formatFeet = (feet: number) => {
  const whole = Math.floor(feet);
  const inches = Math.round((feet - whole) * 12);
  if (!whole) return `${inches} in`;
  return inches ? `${whole} ft ${inches} in` : `${whole} ft`;
};

/** Short depth phrase for labels and chips. */
export const describeDepth = (standard: DepthStandard) =>
  standard.basis === 'unknown'
    ? 'Depth not published'
    : `${formatFeet(standard.shallowestFt)} down`;
