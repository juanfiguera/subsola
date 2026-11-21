import { join, resolve } from 'node:path';

/** Where downloads and built cells go; outside the repo in the cloud, ./data locally. */
export const dataDir = resolve(process.env.SUBSOLA_DATA_DIR ?? 'data');

/** OpenStreetMap points cut from the Geofabrik extract by download-osm. */
export const osmPointsPath = join(dataDir, 'raw', 'osm', 'points.geojsonseq');

// The last complete download of each optional source, kept between nightly runs (see
// nightly.yml), so a server that turns us away for a night costs a day's freshness, not the layer.
export const lastGoodDir = (name: string) => join(dataDir, 'last-good', name);
// Older than this, a layer is better left out than shown as if current.
export const LAST_GOOD_MAX_DAYS = 30;
