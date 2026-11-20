import type { Position } from 'geojson';
import {
  DC_DEPTH_STANDARDS,
  NYC_DEPTH_STANDARDS,
  SF_DEPTH_STANDARDS,
  LA_DEPTH_STANDARDS,
  SD_DEPTH_STANDARDS,
  SEA_DEPTH_STANDARDS,
  DEN_DEPTH_STANDARDS,
  CHI_DEPTH_STANDARDS,
  DAL_DEPTH_STANDARDS,
  type DepthStandards,
} from './depth';
import { geocode, reverseGeocode, type GeocodedAddress } from './sources/geocode';
import { splitBbl } from './sources/connections';

// New York's geocoder ships with the app, since it answers most visits and a typed address
// tries it first. Each other city's loads the first time that city is asked.
const dcGeocoder = () => import('./sources/dcGeocode');
const sfGeocoder = () => import('./sources/sfGeocode');
const laGeocoder = () => import('./sources/laGeocode');
const sdGeocoder = () => import('./sources/sdGeocode');
const seaGeocoder = () => import('./sources/seaGeocode');
const denGeocoder = () => import('./sources/denGeocode');
const chiGeocoder = () => import('./sources/chiGeocode');
const dalGeocoder = () => import('./sources/dalGeocode');

/**
 * The cities Subsola maps. Everything drawn comes from the same cell bundles; what differs by
 * city is who answers an address, whose aerial photo sits under the street, whose depth rules
 * apply, and where to call before digging.
 */
export type RegionId = 'nyc' | 'dc' | 'sf' | 'la' | 'sd' | 'sea' | 'den' | 'chi' | 'dal';

export interface Region {
  id: RegionId;
  /** As a sentence names it: "New York City". */
  name: string;
  /** As a label names it: "NYC". */
  short: string;
  /** [west, south, east, north] in degrees, a little past the city line. */
  bounds: [number, number, number, number];
  depths: DepthStandards;
  geocode: (text: string, signal?: AbortSignal) => Promise<GeocodedAddress>;
  reverseGeocode: (lngLat: [number, number], signal?: AbortSignal) => Promise<GeocodedAddress>;
  /**
   * An ArcGIS endpoint that renders aerial photo for a Web Mercator box: a MapServer's `export`
   * or an ImageServer's `exportImage`.
   */
  photoServer: string;
  /** Or an XYZ tile server's URL, with {z}, {x} and {y}, for a city that serves only tiles. */
  photoTiles?: string;
  photoCredit: string;
  markout: {
    /** Who takes the call: "New York 811", "Miss Utility". */
    center: string;
    url: string;
    /** "two full working days", as the law puts it. */
    notice: string;
    /** Whose law: "New York law". */
    law: string;
  };
  /** The big utilities here that keep their routes private, for "what this is not". */
  privateOwners: string;
  /** Words in a typed address that point here, so this city's geocoder is asked first. */
  says?: RegExp;
  /**
   * Set when the records here are too thin to stand with the other cities, as the sentence that
   * says why. Pages that show the city label it beta and print this. The bar: street permits
   * that reach back less than about five years, or permits as the only source, so most of the
   * map is a guess from where crews dug lately.
   */
  beta?: string;
}

export const NYC: Region = {
  id: 'nyc',
  name: 'New York City',
  short: 'NYC',
  bounds: [-74.28, 40.47, -73.68, 40.93],
  depths: NYC_DEPTH_STANDARDS,
  geocode,
  reverseGeocode,
  photoServer: 'https://orthos.its.ny.gov/arcgis/rest/services/wms/Latest/MapServer/export',
  photoCredit: 'NYS ITS Geospatial Services',
  markout: {
    center: 'New York 811',
    url: 'https://www.newyork-811.com/',
    notice: 'two full working days',
    law: 'New York law',
  },
  privateOwners: 'Con Edison, National Grid and Verizon',
};

export const DC: Region = {
  id: 'dc',
  name: 'Washington, DC',
  short: 'DC',
  bounds: [-77.13, 38.78, -76.9, 39.0],
  depths: DC_DEPTH_STANDARDS,
  geocode: async (text, signal) => (await dcGeocoder()).geocodeDc(text, signal),
  reverseGeocode: async (lngLat, signal) => (await dcGeocoder()).reverseGeocodeDc(lngLat, signal),
  // March 2025, 3 in per pixel, CC BY 4.0.
  photoServer:
    'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Ortho2025_WebMercator/MapServer/export',
  photoCredit: 'DC Office of the Chief Technology Officer',
  markout: {
    center: 'Miss Utility',
    url: 'https://www.missutility.net/washington-dc/',
    // D.C. Code §34-2704(a): 96 hours, not counting weekends and holidays.
    notice: 'four working days (96 hours)',
    law: 'DC law',
  },
  privateOwners: 'Pepco, Washington Gas and Verizon',
  // A DC address names its quadrant ("800 F St NW") or the city; a New York one rarely does either.
  says: /\b(NW|NE|SW|SE)\b|\bD\.?C\.?\b|washington|\b200\d\d\b/i,
};

export const SF: Region = {
  id: 'sf',
  name: 'San Francisco',
  short: 'SF',
  bounds: [-122.52, 37.7, -122.35, 37.84],
  depths: SF_DEPTH_STANDARDS,
  geocode: async (text, signal) => (await sfGeocoder()).geocodeSf(text, signal),
  reverseGeocode: async (lngLat, signal) => (await sfGeocoder()).reverseGeocodeSf(lngLat, signal),
  photoServer: '',
  // 2025, 8 cm per pixel.
  photoTiles: 'https://tile.sf.gov/api/tiles/p2025_rgb8cm/{z}/{x}/{y}',
  photoCredit: 'City and County of San Francisco',
  markout: {
    center: 'USA North 811',
    url: 'https://usanorth811.org/',
    // Gov. Code §4216.2(b): not counting the day of the call, and no more than 14 days ahead.
    notice: 'two working days',
    law: 'California law',
  },
  privateOwners: 'PG&E, AT&T and Comcast',
  says: /san francisco|\bS\.?F\.?\b|\b941\d\d\b/i,
};

export const LA: Region = {
  id: 'la',
  name: 'Los Angeles',
  short: 'LA',
  // The city's outer box. It takes in Santa Monica, Beverly Hills and other cities that aren't
  // LA; the geocoder keeps to the city itself.
  bounds: [-118.67, 33.7, -118.15, 34.34],
  depths: LA_DEPTH_STANDARDS,
  geocode: async (text, signal) => (await laGeocoder()).geocodeLa(text, signal),
  reverseGeocode: async (lngLat, signal) => (await laGeocoder()).reverseGeocodeLa(lngLat, signal),
  // NAIP 2022, 60 cm per pixel, public domain. LA County's sharper imagery states no license.
  photoServer:
    'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage',
  photoCredit: 'USGS and USDA, National Agriculture Imagery Program',
  markout: {
    center: 'DigAlert',
    url: 'https://www.digalert.org/',
    notice: 'two working days',
    law: 'California law',
  },
  privateOwners: 'SoCalGas, LADWP, AT&T and Spectrum',
  says: /los angeles|\b900\d\d\b/i,
};

export const SD: Region = {
  id: 'sd',
  name: 'San Diego',
  short: 'SD',
  // The city's outer box. It takes in Chula Vista, National City and other cities that aren't
  // San Diego; the city's locator knows only its own addresses.
  bounds: [-117.29, 32.53, -116.9, 33.12],
  depths: SD_DEPTH_STANDARDS,
  geocode: async (text, signal) => (await sdGeocoder()).geocodeSd(text, signal),
  reverseGeocode: async (lngLat, signal) => (await sdGeocoder()).reverseGeocodeSd(lngLat, signal),
  // NAIP 2022, 60 cm per pixel, public domain; the city publishes no newer open imagery.
  photoServer:
    'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage',
  photoCredit: 'USGS and USDA, National Agriculture Imagery Program',
  markout: {
    center: 'DigAlert',
    url: 'https://www.digalert.org/',
    notice: 'two working days',
    law: 'California law',
  },
  privateOwners: 'SDG&E, AT&T, Cox and Spectrum',
  says: /san diego|\b921\d\d\b/i,
};

export const SEA: Region = {
  id: 'sea',
  name: 'Seattle',
  short: 'SEA',
  bounds: [-122.44, 47.48, -122.22, 47.74],
  depths: SEA_DEPTH_STANDARDS,
  geocode: async (text, signal) => (await seaGeocoder()).geocodeSea(text, signal),
  reverseGeocode: async (lngLat, signal) => (await seaGeocoder()).reverseGeocodeSea(lngLat, signal),
  // NAIP, public domain. The city's and King County's 2025 photos are EagleView's, with no open
  // license stated.
  photoServer:
    'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage',
  photoCredit: 'USGS and USDA, National Agriculture Imagery Program',
  markout: {
    center: 'Washington 811',
    url: 'https://washington811.com/',
    // RCW 19.122.030(2): no fewer than two and no more than ten full business days ahead.
    notice: 'two full business days',
    law: 'Washington law',
  },
  privateOwners: 'Puget Sound Energy, Seattle City Light, CenturyLink and Comcast',
  says: /seattle|\b981\d\d\b/i,
};

export const DEN: Region = {
  id: 'den',
  name: 'Denver',
  short: 'DEN',
  // The City and County's outer box; it reaches out to the airport.
  bounds: [-105.11, 39.61, -104.6, 39.92],
  depths: DEN_DEPTH_STANDARDS,
  geocode: async (text, signal) => (await denGeocoder()).geocodeDen(text, signal),
  reverseGeocode: async (lngLat, signal) => (await denGeocoder()).reverseGeocodeDen(lngLat, signal),
  // NAIP, public domain. The city's and DRCOG's sharper photos state no open license.
  photoServer:
    'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage',
  photoCredit: 'USGS and USDA, National Agriculture Imagery Program',
  markout: {
    center: 'Colorado 811',
    url: 'https://colorado811.org/',
    // C.R.S. 9-1.5-103(3)(a): at least two business days, not counting the day of the call.
    notice: 'two business days',
    law: 'Colorado law',
  },
  privateOwners: 'Xcel Energy, Lumen and Comcast',
  says: /denver|\b802\d\d\b/i,
  // Its street occupancy permits only read cleanly from 2020, and Denver Water publishes no
  // mains, so water lines here are placed from a few years of permits.
  beta: 'Denver publishes street permits only from 2020 on, and Denver Water publishes no water mains, so water, gas, electric and telecom lines are placed from a few years of permits.',
};

export const CHI: Region = {
  id: 'chi',
  name: 'Chicago',
  short: 'CHI',
  // The city with a little margin, out to O'Hare.
  bounds: [-87.95, 41.64, -87.52, 42.03],
  depths: CHI_DEPTH_STANDARDS,
  geocode: async (text, signal) => (await chiGeocoder()).geocodeChi(text, signal),
  reverseGeocode: async (lngLat, signal) => (await chiGeocoder()).reverseGeocodeChi(lngLat, signal),
  // NAIP, public domain. Cook County's sharper photos state no open license.
  photoServer:
    'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage',
  photoCredit: 'USGS and USDA, National Agriculture Imagery Program',
  markout: {
    // Inside the city limits the one-call center is the city's own, Chicago 811 (DIGGER); JULIE
    // takes the rest of Illinois (220 ILCS 50/2.1.8). A street on the city line takes both.
    center: 'Chicago 811 (DIGGER)',
    url: 'https://ipi.cityofchicago.org/Digger',
    // 220 ILCS 50/4(d) and 50/2.9: at least 48 hours, counted as two business days.
    notice: 'two business days',
    law: 'Illinois law',
  },
  privateOwners: 'Peoples Gas, ComEd, AT&T and Comcast',
  says: /chicago|\b60[67]\d\d\b/i,
  // Thirty-five years of permits, but no pipe maps, assets or lead inventory are public.
  beta: 'Chicago publishes no water, sewer or other pipe maps and no hydrants or catch basins, so every line is placed from street opening permits alone.',
};

export const DAL: Region = {
  id: 'dal',
  name: 'Dallas',
  short: 'DAL',
  // The city with a little margin: Lake Ray Hubbard on the east, Mountain Creek Lake on the west.
  // It takes in Highland Park, University Park and other towns that aren't Dallas; the address
  // points know only the city's own.
  bounds: [-97.01, 32.61, -96.46, 33.03],
  depths: DAL_DEPTH_STANDARDS,
  geocode: async (text, signal) => (await dalGeocoder()).geocodeDal(text, signal),
  reverseGeocode: async (lngLat, signal) => (await dalGeocoder()).reverseGeocodeDal(lngLat, signal),
  // NAIP, public domain. The city's sharper photos state no open license.
  photoServer:
    'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage',
  photoCredit: 'USGS and USDA, National Agriculture Imagery Program',
  markout: {
    center: 'Texas811',
    url: 'https://www.texas811.org/',
    // Tex. Util. Code §251.151(a): at least 48 hours before, not counting Saturdays, Sundays and
    // legal holidays, and no more than 14 days ahead.
    notice: 'two business days (48 hours)',
    law: 'Texas law',
  },
  privateOwners: 'Atmos Energy, Oncor, AT&T and Spectrum',
  says: /dallas|\b75[23]\d\d\b/i,
  // Four years of permits, and no pipe maps, manholes or inlets are public.
  beta: 'Dallas publishes street permits only from late 2021 on and no water, sewer or other pipe maps, so every line is placed from a few years of permits.',
};

export const REGIONS: Region[] = [NYC, DC, SF, LA, SD, SEA, DEN, CHI, DAL];

export const regionAt = ([lng, lat]: Position): Region | null =>
  REGIONS.find(
    ({ bounds: [west, south, east, north] }) =>
      lng! >= west && lng! <= east && lat! >= south && lat! <= north,
  ) ?? null;

/** A lot as the city files it, for a report's heading: "Tax block 843, lot 7". */
export const lotName = (bbl: string | null, region: Region) => {
  if (!bbl) return null;
  if (region.id === 'dc') {
    // DC files land by square, suffix and lot: "0510S 0092". A premise off every lot has none.
    const [square, lot] = bbl.split(' ');
    if (!square || !lot || square === 'premise') return null;
    return `Square ${square.replace(/^0+/, '')}, lot ${lot.replace(/^0+/, '')}`;
  }
  if (region.id === 'sd' || region.id === 'sea') {
    // "538-230-12-00#619081": the parcel, then the meter (San Diego) or service (Seattle) that
    // keeps the key unique.
    const [parcel] = bbl.split('#');
    return /^(meter|service) /.test(bbl) || !parcel ? null : `Parcel ${parcel}`;
  }
  // Denver Water and Dallas Water Utilities name no parcel, and Chicago has no lot records here
  // at all.
  if (region.id === 'den' || region.id === 'chi' || region.id === 'dal') return null;
  const { block, lot } = splitBbl(bbl);
  return `Tax block ${Number(block)}, lot ${Number(lot)}`;
};

/** Where the city's page lives: "new-york-city" for subsola.com/new-york-city. */
export const citySlug = (region: Region) =>
  region.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** "New York City and Washington, DC" (or "... or ..."), for sentences about where Subsola works. */
export const cityNames = (joiner: 'and' | 'or' = 'and') =>
  new Intl.ListFormat('en', { type: joiner === 'and' ? 'conjunction' : 'disjunction' }).format(
    REGIONS.map((region) => region.name),
  );

/**
 * Finds an address in whichever city it's in: those the text points to first, then the rest.
 * Each city's geocoder only knows its own addresses, so a miss in one is worth asking the next.
 * New York names no city, so it leads the rest.
 */
export const geocodeAnywhere = async (
  text: string,
  signal?: AbortSignal,
  // A miss here is expected for the other city's addresses; the next one gets its turn. The
  // browser logs why; a server that mustn't log addresses passes its own.
  onMiss: (region: Region, error: unknown) => void = (region, error) =>
    console.info(`[subsola] ${region.short} geocoder: ${String(error)}`),
): Promise<{ address: GeocodedAddress; region: Region }> => {
  const named = REGIONS.filter((region) => region.says?.test(text));
  const order = [...named, ...REGIONS.filter((region) => !named.includes(region))];
  for (const region of order) {
    try {
      const address = await region.geocode(text, signal);
      // The NYC geocoder can fuzzy-match far afield; trust only answers inside the city.
      if (regionAt(address.lngLat) === region) return { address, region };
    } catch (error) {
      if (signal?.aborted) throw error;
      onMiss(region, error);
    }
  }
  throw new Error(`Couldn't find "${text}" in ${cityNames('or')}.`);
};
