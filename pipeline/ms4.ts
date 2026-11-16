/**
 * DEP's separate storm sewer (MS4) drainage areas, as of August 2020, from the geodatabase in
 * NYC Open Data j57c-rqtq. Converted once with GDAL into static/ms4-drainage-areas.geojson,
 * keeping each area's outfall and receiving water; the source hasn't changed since 2020, so the
 * nightly build reads the converted file instead of needing GDAL.
 *
 * Checked November 2026: DEP's own MS4 map app still draws the 2020 layer (ArcGIS service
 * MS42020_DrainageAreas, last edited August 2020). Per DEP's 2025 annual report the next map is
 * due August 1, 2027; look for it then.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inPolygon } from '../src/geo';

type Ring = number[][];
type Polygon = Ring[];

export interface StormArea {
  outfall: string;
  water: string;
}

interface Indexed extends StormArea {
  polygons: Polygon[];
  box: [number, number, number, number];
}

export const stormAreasPath = join(import.meta.dirname, 'static', 'ms4-drainage-areas.geojson');

/** The storm area a point falls in, or null; areas are checked by bounding box first. */
export const stormAreaLocator = (
  features: { properties: StormArea; geometry: { coordinates: Polygon[] } }[],
) => {
  const areas: Indexed[] = features.map(({ properties, geometry }) => {
    const points = geometry.coordinates.flatMap((polygon) => polygon[0] ?? []);
    return {
      ...properties,
      polygons: geometry.coordinates,
      box: [
        Math.min(...points.map((p) => p[0]!)),
        Math.min(...points.map((p) => p[1]!)),
        Math.max(...points.map((p) => p[0]!)),
        Math.max(...points.map((p) => p[1]!)),
      ],
    };
  });
  return (point: number[]): StormArea | null => {
    const [x, y] = point;
    for (const area of areas) {
      const [west, south, east, north] = area.box;
      if (x! < west || x! > east || y! < south || y! > north) continue;
      if (area.polygons.some((polygon) => inPolygon(point, polygon)))
        return { outfall: area.outfall, water: area.water };
    }
    return null;
  };
};

export const loadStormAreas = async () =>
  stormAreaLocator(JSON.parse(await readFile(stormAreasPath, 'utf8')).features);
