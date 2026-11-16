import proj4 from 'proj4';
import type { Geometry, Position } from 'geojson';

/*
 * Kept apart from geo.ts because proj4 is about 125 KB, and only the live NYC permit load needs
 * it: the citywide build has already projected everything, so most visits never load this.
 */

// NY State Plane Long Island (US feet). DOT permit geometry is stored in this CRS.
proj4.defs(
  'EPSG:2263',
  '+proj=lcc +lat_0=40.1666666666667 +lon_0=-74 +lat_1=41.0333333333333 +lat_2=40.6666666666667 +x_0=300000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs',
);

const toWgs84 = proj4('EPSG:2263', 'EPSG:4326');

export const stateplaneToLngLat = (x: number, y: number): Position => toWgs84.forward([x, y]);

/** Easting/northing in US feet, the coordinates NYC engineering drawings and permits use. */
export const lngLatToStateplane = (lng: number, lat: number): Position =>
  toWgs84.inverse([lng, lat]);

const parseCoordList = (text: string): Position[] =>
  text
    .replace(/[()]/g, '')
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter((pair) => pair.length >= 2 && pair.every(Number.isFinite))
    .map(([x, y]) => stateplaneToLngLat(x!, y!));

const splitParts = (body: string): string[] => body.match(/\(([^()]+)\)/g) ?? [];

/** Parses the WKT DOT attaches to permits (POINT, MULTIPOINT, LINESTRING, MULTILINESTRING in EPSG:2263). */
export const parseStateplaneWkt = (wkt: string | undefined): Geometry | null => {
  if (!wkt) return null;
  const match = wkt.trim().match(/^(\w+)\s*\((.*)\)$/s);
  if (!match) return null;
  const [, rawType, body] = match;
  const type = rawType!.toUpperCase();

  if (type === 'POINT') {
    const [coordinates] = parseCoordList(body!);
    return coordinates ? { type: 'Point', coordinates } : null;
  }
  if (type === 'MULTIPOINT') {
    const coordinates = parseCoordList(body!);
    return coordinates.length ? { type: 'MultiPoint', coordinates } : null;
  }
  if (type === 'LINESTRING') {
    const coordinates = parseCoordList(body!);
    return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
  }
  if (type === 'MULTILINESTRING') {
    const coordinates = splitParts(body!)
      .map(parseCoordList)
      .filter((line) => line.length >= 2);
    return coordinates.length ? { type: 'MultiLineString', coordinates } : null;
  }
  return null;
};
