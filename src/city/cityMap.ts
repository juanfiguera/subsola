import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { AreaStop } from '../areas';
import { NYC, REGIONS, regionAt, type Region } from '../regions';
import { mapZoomFor } from './zoom';
import { darkBasemap, type BasemapLayer, type PaintChange } from './basemapTheme';
import { currentTheme, onThemeChange, type Theme } from '../theme';

// MapLibre is about a third of the app's code and most visits never open the city map, so it
// loads on its own, after the street is up (see `prepare`) or when the map is first opened.
const loadMapLibre = () => import('./mapLibre');

// OpenFreeMap: OpenStreetMap vector tiles, free to use from a browser without a key.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Zooming the city map in to the scale of street view zoom 1 opens the street there. The street
// view hands over at 0.5, so going back and forth on the edge doesn't flicker between them.
const ENTER_SCENE_ZOOM = 1;
const FADE_MS = 280;
// Long enough to fetch the tiles in view on a normal connection; after that it fades in anyway.
const READY_WAIT_MS = 700;
// Far enough out to see the whole city when switching to it.
const WHOLE_CITY_ZOOM = 11;
// Below this the city streets are too small to tell where Subsola has data, so each city gets
// a marker and its name.
const CITY_MARKERS_BELOW_ZOOM = 9;

const middleOf = ({ bounds: [west, south, east, north] }: Region): [number, number] => [
  (west + east) / 2,
  (south + north) / 2,
];
// Our marks on the map: ink on the light basemap, light ink on the dark one, each with a halo
// in the ground's color so it lifts off whatever is under it.
const MARKS: Record<Theme, { ink: string; halo: string }> = {
  light: { ink: '#1b2230', halo: '#ffffff' },
  dark: { ink: '#e7eaef', halo: '#14181e' },
};
// The basemap's property names come from its style at runtime, so they're checked there.
type PaintProperty = Parameters<MapLibreMap['setPaintProperty']>[1];
type PaintSetting = Parameters<MapLibreMap['setPaintProperty']>[2];
const MARK_PAINT: [layer: string, property: PaintProperty, mark: 'ink' | 'halo'][] = [
  ['current-ring', 'circle-stroke-color', 'ink'],
  ['city-dot', 'circle-color', 'ink'],
  ['city-dot', 'circle-stroke-color', 'halo'],
  ['city-name', 'text-color', 'ink'],
  ['city-name', 'text-halo-color', 'halo'],
];

const cityMarkers = (): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: REGIONS.map((city) => ({
    type: 'Feature',
    properties: { id: city.id, name: city.short },
    geometry: { type: 'Point', coordinates: middleOf(city) },
  })),
});

const collection = <G extends Point>(features: Feature<G>[]): FeatureCollection<G> => ({
  type: 'FeatureCollection',
  features,
});

export interface CityMapHandlers {
  /**
   * The city map was zoomed in to street scale at `lngLat` and `zoom`; `stop` if it flew to one.
   * The map stays up until `hide`, so the street can load under it.
   */
  onEnter: (lngLat: [number, number], zoom: number, bearing: number, stop: AreaStop | null) => void;
  /** The map was moved over another city, so the card can name it. */
  onRegion: (region: Region) => void;
}

export const createCityMap = (container: HTMLElement, handlers: CityMapHandlers) => {
  let map: MapLibreMap | null = null;
  let building: Promise<MapLibreMap> | null = null;
  let current: [number, number] | null = null;
  // A flight in progress, and the stop it's for, so arriving loads that address rather than the
  // nearest one.
  let flight: { stop: AreaStop | null } | null = null;
  let shown = false;
  // Set once the map has handed over, so the rest of a zoom gesture doesn't hand over again.
  let entering = false;
  // Set after a handover found no street, so the rest of that zoom gesture doesn't try again
  // on every tick. Zooming back out or dragging somewhere else clears it.
  let declined = false;
  let region: Region = NYC;
  // The basemap's own colors, recorded once it loads, and the dark ones made from them.
  let basemap: PaintChange[] | null = null;
  // Street scale is a little further in at DC's latitude than at New York's.
  const enterZoomAt = (lat: number) => mapZoomFor(ENTER_SCENE_ZOOM, lat);

  const currentData = () =>
    collection<Point>(
      current
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: current } }]
        : [],
    );

  const build = async () => {
    const { AttributionControl, Map, NavigationControl } = await loadMapLibre();
    const created = new Map({
      container,
      style: STYLE_URL,
      center: current ?? middleOf(region),
      zoom: enterZoomAt(region.bounds[1]) - 0.5,
      // No floor and no bounds: the map goes anywhere in the world, like any other map.
      minZoom: 0,
      maxZoom: 19,
      // Right-drag turns the map, as it turns the street view; it never tilts.
      pitchWithRotate: false,
      attributionControl: false,
    });
    // Bottom left: the card covers the right side.
    created.addControl(new AttributionControl({ compact: true }), 'bottom-left');
    created.addControl(
      new NavigationControl({ showZoom: false, visualizePitch: false }),
      'top-left',
    );

    created.on('load', () => {
      basemap = darkBasemap(created.getStyle().layers as BasemapLayer[]);
      created.addSource('current', { type: 'geojson', data: currentData() });

      created.addLayer({
        id: 'current-ring',
        type: 'circle',
        source: 'current',
        paint: {
          'circle-radius': 11,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': MARKS.light.ink,
          'circle-stroke-width': 3,
        },
      });

      created.addSource('cities', { type: 'geojson', data: cityMarkers() });
      created.addLayer({
        id: 'city-dot',
        type: 'circle',
        source: 'cities',
        maxzoom: CITY_MARKERS_BELOW_ZOOM,
        paint: {
          'circle-radius': 7,
          'circle-color': MARKS.light.ink,
          'circle-stroke-color': MARKS.light.halo,
          'circle-stroke-width': 2,
        },
      });
      created.addLayer({
        id: 'city-name',
        type: 'symbol',
        source: 'cities',
        maxzoom: CITY_MARKERS_BELOW_ZOOM,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 14,
          'text-anchor': 'left',
          'text-offset': [0.9, 0],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': MARKS.light.ink,
          'text-halo-color': MARKS.light.halo,
          'text-halo-width': 2,
        },
      });
      paintTheme(created, currentTheme());
      created.on('click', 'city-dot', (event) => {
        const id = event.features?.[0]?.properties?.id as string | undefined;
        const city = REGIONS.find((candidate) => candidate.id === id);
        if (city) switchTo(city);
      });
      created.on('mouseenter', 'city-dot', () => (created.getCanvas().style.cursor = 'pointer'));
      created.on('mouseleave', 'city-dot', () => (created.getCanvas().style.cursor = ''));
    });

    const enter = (stop: AreaStop | null) => {
      entering = true;
      const { lng, lat } = created.getCenter();
      handlers.onEnter([lng, lat], created.getZoom(), created.getBearing(), stop);
    };
    // Hands over the moment a zoom gesture crosses street scale, not when it settles, so the
    // street picks up the motion instead of the zoom stalling first.
    created.on('zoom', (event) => {
      if (!shown || entering || flight || !event.originalEvent) return;
      if (created.getZoom() < enterZoomAt(created.getCenter().lat)) {
        declined = false;
        return;
      }
      if (declined) return;
      // Between cities there's no street to open; the map just keeps zooming.
      if (!regionAt(created.getCenter().toArray())) return;
      created.stop();
      enter(null);
    });
    created.on('moveend', () => {
      // Out between cities the card keeps the last one it named.
      const over = regionAt(created.getCenter().toArray());
      if (shown && over && over !== region) {
        region = over;
        handlers.onRegion(over);
      }
      if (!shown || entering || !flight) return;
      const { stop } = flight;
      flight = null;
      if (created.getZoom() >= enterZoomAt(created.getCenter().lat) - 0.01) enter(stop);
    });
    created.on('dragend', () => (declined = false));
    // A drag or scroll of the user's own cancels a flight.
    created.on('movestart', (event) => {
      if (event.originalEvent) flight = null;
    });
    map = created;
    return created;
  };

  /** Recolors the basemap and our marks in place: no new style, no reloaded tiles. */
  const paintTheme = (target: MapLibreMap, theme: Theme) => {
    if (!basemap) return;
    for (const change of basemap)
      target.setPaintProperty(
        change.layer,
        change.property as PaintProperty,
        (theme === 'dark' ? change.dark : change.light) as PaintSetting,
      );
    for (const [layer, property, mark] of MARK_PAINT)
      target.setPaintProperty(layer, property, MARKS[theme][mark]);
  };
  onThemeChange((theme) => {
    if (map) paintTheme(map, theme);
  });

  // A failed download is forgotten, so opening the map again retries it.
  const ready = () =>
    (building ??= build().catch((error: unknown) => {
      building = null;
      throw error;
    }));

  /** Builds the map ahead of time, out of sight, so its tiles are there when it's first shown. */
  const prepare = (center: [number, number]) => {
    if (building) return;
    region = regionAt(center) ?? NYC;
    ready()
      .then((created) => created.jumpTo({ center }))
      .catch((error: unknown) => console.error('[subsola] city map failed to load', error));
  };

  const flyTo = (lngLat: [number, number], stop: AreaStop | null) => {
    if (!map) return;
    // Flying between cities would cross 200 miles of nothing; it cuts to the other city instead.
    const there = regionAt(lngLat) ?? region;
    if (there !== region) switchTo(there);
    flight = { stop };
    map.flyTo({ center: lngLat, zoom: enterZoomAt(lngLat[1]), duration: 1400, essential: true });
  };

  /** Shows the whole of another city. */
  const switchTo = (next: Region) => {
    if (!map) return;
    flight = null;
    region = next;
    if (shown) handlers.onRegion(next);
    map.jumpTo({ center: middleOf(next), zoom: WHOLE_CITY_ZOOM, bearing: 0 });
  };

  const flyToStop = (stop: AreaStop) => flyTo(stop.lngLat, stop);

  /** Fades the map in at exactly this view, once its tiles are drawn or a moment has passed. */
  const show = async (center: [number, number], zoom: number, bearing: number) => {
    const shownMap = await ready();
    shown = true;
    entering = false;
    flight = null;
    shownMap.resize();
    region = regionAt(center) ?? NYC;
    shownMap.jumpTo({ center, zoom, bearing, pitch: 0 });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, READY_WAIT_MS);
      shownMap.once('idle', () => {
        clearTimeout(timer);
        resolve();
      });
      shownMap.triggerRepaint();
    });
    container.classList.add('is-shown');
    await new Promise((resolve) => setTimeout(resolve, FADE_MS));
  };

  /** Fades the map out, revealing the street under it. */
  const hide = () => {
    shown = false;
    flight = null;
    container.classList.remove('is-shown');
  };

  const isShown = () => shown;

  /** Takes zoom gestures again after a handover that found no street, once they move on. */
  const resume = () => {
    entering = false;
    declined = true;
  };

  const setCurrent = (lngLat: [number, number] | null) => {
    current = lngLat;
    (map?.getSource('current') as GeoJSONSource | undefined)?.setData(currentData());
  };

  return {
    prepare,
    show,
    hide,
    isShown,
    resume,
    setCurrent,
    flyTo,
    flyToStop,
    switchTo,
    region: () => region,
    map: () => map,
  };
};
