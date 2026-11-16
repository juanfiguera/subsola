import { join, resolve } from 'node:path';

/** Where downloads and built cells go; outside the repo in the cloud, ./data locally. */
export const dataDir = resolve(process.env.SUBSOLA_DATA_DIR ?? 'data');

/** OpenStreetMap points cut from the Geofabrik extract by download-osm. */
export const osmPointsPath = join(dataDir, 'raw', 'osm', 'points.geojsonseq');
