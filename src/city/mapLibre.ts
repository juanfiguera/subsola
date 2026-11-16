import { AttributionControl, Map, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre finds its worker next to its own file, which Vite moves; point it at the bundled copy.
setWorkerUrl(workerUrl);

export { AttributionControl, Map, NavigationControl };
