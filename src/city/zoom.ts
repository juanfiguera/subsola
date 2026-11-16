const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

// MapLibre draws the world 512 px wide at zoom 0; the street view draws 2^zoom px per meter.
const zoomOffset = (lat: number) =>
  Math.log2((EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / 512);

/** The city map zoom that shows as many meters per pixel as the street view at `sceneZoom`. */
export const mapZoomFor = (sceneZoom: number, lat: number) => sceneZoom + zoomOffset(lat);

export const sceneZoomFor = (mapZoom: number, lat: number) => mapZoom - zoomOffset(lat);
