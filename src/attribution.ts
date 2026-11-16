import type { RegionId } from './regions';

/**
 * The credits each publisher's terms ask for, in one place, so the map, lot reports, the MCP
 * server, the cell files and the credits page all say the same thing. Where a publisher gives
 * wording (Open Data DC, Denver, SanGIS, Chicago) it is used as given. Read 2026-11-15; see README,
 * "Data terms and attribution".
 */

export interface Credit {
  /** Plain text, as an MCP answer or a cell file carries it. */
  text: string;
  /** Links named in the text, so a page can show them as links. */
  links: { label: string; url: string }[];
}

const CC_BY_4 = 'https://creativecommons.org/licenses/by/4.0/';
const CC_BY_3 = 'https://creativecommons.org/licenses/by/3.0/';

/** Chicago's terms ask for this, word for word, wherever an app using its data can be reached. */
export const CHICAGO_DISCLAIMER =
  "This site provides applications using data that has been modified for use from its original source, www.cityofchicago.org, the official website of the City of Chicago. The City of Chicago makes no claims as to the content, accuracy, timeliness, or completeness of any of the data provided at this site. The data provided at this site is subject to change at any time. It is understood that the data provided at this site is being used at one's own risk.";

export const CITY_CREDITS: Record<RegionId, Credit> = {
  nyc: {
    text: 'Records from NYC Open Data (NYC DOT, NYC DEP and NYC OTI), modified by Subsola.',
    links: [{ label: 'NYC Open Data', url: 'https://opendata.cityofnewyork.us/' }],
  },
  dc: {
    text: `Source: Open Data DC (opendata.dc.gov), from DDOT, OCTO, OTR, DOEE and DC Water; CC BY 4.0 (${CC_BY_4}); modified by Subsola.`,
    links: [
      { label: 'Open Data DC', url: 'https://opendata.dc.gov/' },
      { label: 'CC BY 4.0', url: CC_BY_4 },
    ],
  },
  sf: {
    text: "Records from DataSF (San Francisco Public Works and SFMTA, PDDL) and the City and County of San Francisco's map services, modified by Subsola.",
    links: [{ label: 'DataSF', url: 'https://data.sfgov.org/' }],
  },
  la: {
    text: 'Records from the City of Los Angeles GeoHub (Bureau of Engineering, LA Sanitation, LAFD, LADOT, Street Lighting and StreetsLA) and LA County eGIS, modified by Subsola.',
    links: [
      { label: 'City of Los Angeles GeoHub', url: 'https://geohub.lacity.org/' },
      { label: 'LA County eGIS', url: 'https://egis-lacounty.hub.arcgis.com/' },
    ],
  },
  sd: {
    text: 'Permits from City of San Diego open data (PDDL). GIS data derived, modified, reduced, and/or processed from SanGIS downloadable data - www.sangis.org.',
    links: [
      { label: 'City of San Diego open data', url: 'https://data.sandiego.gov/' },
      { label: 'www.sangis.org', url: 'https://www.sangis.org/' },
    ],
  },
  sea: {
    text: 'Records from City of Seattle open data (SDOT, Seattle Public Utilities and Seattle City Light), modified by Subsola.',
    links: [{ label: 'City of Seattle open data', url: 'https://data.seattle.gov/' }],
  },
  den: {
    text: `Source: City of Denver Open Data Catalog (data.denvergov.org), CC BY 3.0 (${CC_BY_3}), modified by Subsola. Not for engineering purposes.`,
    links: [
      { label: 'City of Denver Open Data Catalog', url: 'http://data.denvergov.org' },
      { label: 'CC BY 3.0', url: CC_BY_3 },
    ],
  },
  chi: {
    text: `${CHICAGO_DISCLAIMER} Addresses from Cook County GIS.`,
    links: [{ label: 'www.cityofchicago.org', url: 'https://www.cityofchicago.org/' }],
  },
};

export const OSM_CREDIT: Credit = {
  text: 'Street features and map data © OpenStreetMap contributors, under the Open Database License (openstreetmap.org/copyright).',
  links: [{ label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }],
};

export const BASEMAP_CREDIT: Credit = {
  text: 'City map: OpenFreeMap © OpenMapTiles, data from OpenStreetMap.',
  links: [
    { label: 'OpenFreeMap', url: 'https://openfreemap.org/' },
    { label: 'OpenMapTiles', url: 'https://openmaptiles.org/' },
  ],
};

export const NOT_ENDORSED =
  'Subsola is independent and is not affiliated with or endorsed by any city, agency or utility whose records it uses.';

/** One city's credits as a single line of text, for an MCP answer or a cell file. */
export const creditLine = (region: RegionId) => `${CITY_CREDITS[region].text} ${OSM_CREDIT.text}`;

/** Text with each named link turned into an anchor; the text itself must already be escaped. */
export const linkCredit = (
  credit: Credit,
  escape: (text: string) => string,
  attributes = 'target="_blank" rel="noopener"',
) =>
  credit.links.reduce(
    (html, { label, url }) =>
      html.replace(escape(label), `<a href="${escape(url)}" ${attributes}>${escape(label)}</a>`),
    // A license URL written out for plain text is redundant once its name is a link.
    escape(credit.text.replace(/ \(https?:\/\/[^)]+\)/g, '')),
  );
