/**
 * Areas walked stop by stop and checked against the records, as written up in docs/areas.
 * Each stop is an address the app was loaded at; it covers SEARCH_RADIUS_M around it.
 */
export interface AreaStop {
  address: string;
  lngLat: [number, number];
}

export interface AnalyzedArea {
  name: string;
  /** YYYY-MM-DD. */
  checked: string;
  /** What the check found, in a line. */
  finding: string;
  stops: AreaStop[];
}

export const ANALYZED_AREAS: AnalyzedArea[] = [
  {
    name: 'Astoria, 37th St',
    checked: '2026-10-24',
    finding:
      'Con Edison gas and electric, 23% of lots with lead service lines, 36 recorded excavation locations.',
    stops: [{ address: '25-87 37th St, Astoria, NY 11103', lngLat: [-73.91477, 40.766532] }],
  },
  {
    name: 'West St, Greenpoint',
    checked: '2026-10-25',
    finding:
      'National Grid gas, city reconstruction from 2015 to 2017, 13% of lots with lead service lines.',
    stops: [
      { address: '20 West St, Brooklyn, NY 11222', lngLat: [-73.9585, 40.726701] },
      { address: '85 West St, Brooklyn, NY 11222', lngLat: [-73.959521, 40.729381] },
      { address: '150 West St, Brooklyn, NY 11222', lngLat: [-73.95934, 40.73224] },
      { address: '213 West St, Brooklyn, NY 11222', lngLat: [-73.96173, 40.73472] },
    ],
  },
];

/** The stop nearest the middle of an area, where opening the area as a whole lands. */
export const middleStop = (area: AnalyzedArea): AreaStop => {
  const count = area.stops.length;
  const lng = area.stops.reduce((sum, stop) => sum + stop.lngLat[0], 0) / count;
  const lat = area.stops.reduce((sum, stop) => sum + stop.lngLat[1], 0) / count;
  return area.stops.reduce((best, stop) =>
    Math.hypot(stop.lngLat[0] - lng, stop.lngLat[1] - lat) <
    Math.hypot(best.lngLat[0] - lng, best.lngLat[1] - lat)
      ? stop
      : best,
  );
};
