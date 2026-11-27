import './style.css';
import { z } from 'zod';

// Zod otherwise tries new Function once to check for it, which the page's security policy
// blocks and reports.
z.config({ jitless: true });
import { startErrorReporting } from './errors';
import { markStage, watchForCrashes } from './crashes';
import {
  depthBasis,
  lineKindOf,
  searchSource,
  startAnalytics,
  track as trackEvent,
  type AnalyticsProperties,
  type SearchSource,
} from './analytics';
import { recordsFreshness } from './ui/freshness';
import type { Feature, Geometry } from 'geojson';
import type { GeocodedAddress } from './sources/geocode';
import { blockLocator, fetchStreets, type StreetSegment } from './sources/streets';
import type { PermitGroupProperties } from './sources/permits';
import {
  fetchCatchBasins,
  fetchHydrants,
  fetchLinkNyc,
  fetchStreetGeometry,
  type AssetFeature,
  type AssetKind,
  type Bbox,
} from './sources/assets';
import { CONFIDENCE_LABELS, SOURCES, type Confidence, type SourceKey } from './sources/catalog';
import { fetchSignalRows, signalsFromRows } from './sources/signals';
import type { Spot } from './sources/elevations';
import { fetchOutfalls } from './sources/outfalls';
import { gridBearing } from './scene/orientation';
import { summarize, type UtilitySummary } from './brief';
import { depthStandards, describeDepth, formatFeet, useDepthStandards } from './depth';
import { assessDig } from './dig';
import { activeWork, todayIn, type ActiveWork } from './work';
import { RECYCLED_WATER, UTILITY_KINDS, UTILITY_STYLES, type UtilityKind } from './utilities';
import {
  createFrame,
  ringsOf,
  linesOf,
  distance2,
  midpoint,
  pointsOf,
  type LocalFrame,
  type Vec2,
} from './scene/local';
import { buildAssets, buildGround, emptyScene, piecesOf, type SceneData } from './scene/build';
import { linkAssets } from './scene/assetLinks';
import { networkOf } from './scene/assetStyle';
import { CONTEXT_RADIUS_M, lotReportAt, placeStreetSteps } from './street';
import { mergeAssets, streetKey } from './sources/merge';
import { CELL_REACH_M, cellAt, cellsAround, mergeBy, type Cell } from './tiles';
import { builtCellsAround, gridCellBounds, gridCellOf, type GridCell } from './grid';
import { fetchCell, fetchCellIndex, type CellIndex } from './sources/cells';
import type { Continuation, Junction } from './scene/continuations';
import { createCityMap } from './city/cityMap';
import { mapZoomFor, sceneZoomFor } from './city/zoom';
import { createSheet } from './ui/sheet';
import { mountThemeToggle } from './ui/themeToggle';
import { mapCredit, siteLinks } from './ui/siteLinks';
import { fetchServiceLots, type ServiceLot } from './sources/services';
import { isRecycled, type SurveyedMain } from './sources/mains';
import {
  fetchConnectionPermits,
  houseSewerStatus,
  type ConnectionPermit,
} from './sources/connections';
import type {
  CameraPose,
  createScene,
  Ground,
  Preset,
  ProbeView,
  SceneHandlers,
  WorkZone,
} from './scene/scene';
import {
  assetCard,
  homeCard,
  houseSewerSummary,
  serviceCard,
  digSpotCard,
  probeCard,
  cityCard,
  continuationCard,
  junctionCard,
  mainCard,
  mainCallout,
  plural,
  probePromptCard,
  runCard,
  backButton,
  utilityCard,
  type LiveWork,
} from './ui/cards';
import type { SourceStatus } from './ui/sources';
import type { YearRange } from './ui/history';
import { escapeHtml, ownerName, prettyAddress } from './ui/dom';
import { serviceBasis, serviceLabel, waterServicesRow } from './serviceText';
import { layersPanel, type LayerKey, type LayerRow } from './ui/layers';
import { explainerHtml } from './ui/explainer';
import { coverageCard, type CoverageMiss } from './ui/coverage';
import { aboutCard, aboutSources } from './ui/about';
import { keyDismissed, phoneKeyHtml, rememberKeyDismissed } from './ui/phoneKey';
import { hiddenLayers, readLayerChoices, saveLayerChoices, withChoice } from './ui/layerPrefs';
import { distanceMeters, feetFromMeters } from './geo';
import { parseGlbMeshes } from './scene/glb';
import {
  CHI,
  DAL,
  SJ,
  DEN,
  LA,
  NYC,
  REGIONS,
  SD,
  SEA,
  SF,
  geocodeAnywhere,
  geocodeIn,
  regionAt,
  type Region,
} from './regions';
import { SUGGESTION_LIMIT, suggestAddresses, type CitySuggestion } from './sources/suggest';
import { createAddressIndex } from './sources/addressIndex';
import { attachSuggestions } from './ui/suggestions';
import { fetchConEdStructures } from './sources/conEd';
import type { MeshData } from './scene/meshes';
import { isInAppBrowser } from './device';
import {
  findPicked,
  readSharedView,
  refFamily,
  sharedViewSearch,
  type SharedCamera,
  type SharedPick,
} from './share';

startErrorReporting(import.meta.env.VITE_SENTRY_DSN as string | undefined);
startAnalytics(import.meta.env.VITE_POSTHOG_KEY as string | undefined, { page: 'map' });

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in index.html`);
  return element as T;
};

const crash = watchForCrashes();
if (crash) trackEvent('load_crashed', { seconds: crash.seconds, stage: crash.stage });

const DEFAULT_ADDRESS = '1 Times Square, New York, NY 10036';
// About 500 ft: the block plus both intersections.
const SEARCH_RADIUS_M = 150;
const STRETCH_STEPS = [1, 2, 4, 6, 8, 10];
const CURRENT_YEAR = new Date().getFullYear();

const ui = {
  form: byId<HTMLFormElement>('search'),
  input: byId<HTMLInputElement>('search-input'),
  card: byId('card'),
  layers: byId('layers'),
  dig: byId<HTMLButtonElement>('dig'),
  groundPhoto: byId<HTMLButtonElement>('ground-photo'),
  stretch: byId<HTMLButtonElement>('stretch'),
  stretchValue: byId('stretch-value'),
  compass: byId<HTMLButtonElement>('compass'),
  side: byId<HTMLButtonElement>('side'),
  sideLabel: byId('side-label'),
  tooltip: byId('tooltip'),
  report: byId('report'),
  city: byId('city'),
  cityTab: byId<HTMLButtonElement>('city-tab'),
  share: byId<HTMLButtonElement>('share'),
  call811: byId<HTMLAnchorElement>('call-811'),
  sheet: byId('sheet'),
  sheetHandle: byId<HTMLButtonElement>('sheet-handle'),
  layersToggle: byId<HTMLButtonElement>('layers-toggle'),
  scene: byId('scene'),
  help: byId<HTMLButtonElement>('help'),
  explainer: byId('explainer'),
  phoneKey: byId('phone-key'),
};

mountThemeToggle(byId('theme-toggle'));
const siteLinksCorner = byId('site-links');
siteLinksCorner.innerHTML = siteLinks('corner') + mapCredit('corner');
siteLinksCorner.addEventListener('click', (event) => {
  const target = event.target as Element;
  const mcpLink = target.closest<HTMLElement>('[data-mcp-link]');
  if (mcpLink) return trackEvent('mcp_link_clicked', { city: state.region.id, from: 'site links' });
  if (target.closest('[data-action="about"]')) open({ kind: 'about' });
});

// Phones, upright or on their side: the layout in style.css switches at the same sizes.
const phone = window.matchMedia('(max-width: 900px), (max-height: 520px)');
const sheet = createSheet(ui.sheet, ui.sheetHandle, phone);

const setLayersOpen = (open: boolean) => {
  if (open) document.body.dataset.layers = 'open';
  else delete document.body.dataset.layers;
  ui.layersToggle.setAttribute('aria-expanded', String(open));
};
ui.layersToggle.addEventListener('click', () =>
  setLayersOpen(document.body.dataset.layers !== 'open'),
);
// Touching the map puts the layer list away, the way a menu closes.
ui.scene.addEventListener('pointerdown', () => setLayersOpen(false));

type CardView =
  | { kind: 'home' }
  | { kind: 'utility'; utility: UtilityKind }
  | { kind: 'ref'; ref: string }
  | { kind: 'about' }
  | { kind: 'feedback' }
  | { kind: 'probe' }
  | { kind: 'city' };

interface Inspectable {
  card: () => string;
  callout: { title: string; detail: string };
  confidence: Confidence;
  center: Vec2;
  utility: UtilityKind | null;
}

interface AppState {
  address: GeocodedAddress | null;
  /** What the card and report are about: the searched address, then the one nearest the view. */
  place: GeocodedAddress | null;
  frame: LocalFrame | null;
  permitGroups: Feature<Geometry, PermitGroupProperties>[];
  assets: AssetFeature[];
  /** Street spot elevations from the citywide build, for which way sewers drain. */
  spots: Spot[];
  serviceLots: ServiceLot[];
  /** Water mains on their surveyed routes, where the utility publishes them (DC only). */
  mains: SurveyedMain[];
  /** DEP water and sewer connection permits, by BBL. */
  connectionPermits: Map<string, ConnectionPermit[]>;
  streets: StreetSegment[];
  summaries: UtilitySummary[];
  scene: SceneData;
  statuses: Map<SourceKey, SourceStatus>;
  inspectables: Map<string, Inspectable>;
  view: CardView;
  permitsLoaded: boolean;
  permitsFailed: boolean;
  /** When the citywide build these records came from was made; null for a live load. */
  recordsBuiltAt: string | null;
  ground: Ground;
  stretch: number;
  hidden: Set<LayerKey>;
  /** Permits whose work window includes today. */
  active: ActiveWork[];
  workZones: WorkZone[];
  /** Waiting for a tap on the map to place the dig check. */
  probing: boolean;
  probe: Vec2 | null;
  digDepthFt: number;
  /** Aerial tiles for the area; images fill in as they arrive. */
  photo: PhotoTile[] | null;
  /** Curbs, roadbed, sidewalks and buildings as loaded, so cells loaded later merge in. */
  groundData: GroundData | null;
  /** Comparing digs from this year on; kept from street to street, like the layer switches. */
  since: number | null;
  /** The city the loaded street is in, which decides geocoder, photo, depth rules and wording. */
  region: Region;
}

type GroundData = Awaited<ReturnType<typeof fetchStreetGeometry>>;

/** Layer switches this browser flipped away from the defaults; see layerPrefs.ts. */
let layerChoices = readLayerChoices();

const state: AppState = {
  address: null,
  place: null,
  frame: null,
  permitGroups: [],
  assets: [],
  spots: [],
  serviceLots: [],
  mains: [],
  connectionPermits: new Map(),
  streets: [],
  summaries: [],
  scene: emptyScene(),
  statuses: new Map(),
  inspectables: new Map(),
  view: { kind: 'home' },
  permitsLoaded: false,
  permitsFailed: false,
  recordsBuiltAt: null,
  ground: 'plan',
  stretch: 6,
  hidden: hiddenLayers(layerChoices),
  active: [],
  workZones: [],
  probing: false,
  probe: null,
  digDepthFt: 3,
  photo: null,
  groundData: null,
  since: null,
  region: NYC,
};

/** The card a shared link asked for, until the records it's about have loaded. */
let pendingPick: SharedPick | null = null;
/** False between a new address and its first camera move, when the camera is still the old street's. */
let cameraPlaced = false;
// Declared before the scene, whose camera callback writes the link from its first frame.
let urlTimer: ReturnType<typeof setTimeout> | undefined;

const GUIDE_KEY = 'subsola:guide-seen';
// Storage can be blocked (private windows, strict settings); then the guide shows each visit.
let guideSeen = (() => {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1';
  } catch {
    return false;
  }
})();

const dismissGuide = ({ focus = true } = {}) => {
  guideSeen = true;
  try {
    localStorage.setItem(GUIDE_KEY, '1');
  } catch (error) {
    console.warn('[subsola] could not remember the guide was read', error);
  }
  renderCard();
  // The pressed button is gone; keep keyboard focus in the card rather than dropping to the page.
  if (focus) ui.card.querySelector<HTMLElement>('button')?.focus();
};

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The explainer: what the colors, lines, labels and pins mean (ui/explainer.ts). */

let explainerOpener: HTMLElement | null = null;

function openExplainer(from: 'button' | 'card' | 'phone key' | 'keyboard') {
  ui.explainer.innerHTML = explainerHtml({
    region: state.region,
    utilities: presentUtilities(),
    recycled: state.mains.some(isRecycled),
    stretch: state.stretch,
  });
  explainerOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ui.explainer.hidden = false;
  ui.help.setAttribute('aria-expanded', 'true');
  ui.explainer.focus();
  trackEvent('explainer_opened', { city: state.region.id, from });
  // Whoever has read it doesn't need the first-visit note any more.
  if (!guideSeen) dismissGuide({ focus: false });
}

function closeExplainer() {
  if (ui.explainer.hidden) return;
  ui.explainer.hidden = true;
  ui.help.setAttribute('aria-expanded', 'false');
  (explainerOpener?.isConnected ? explainerOpener : ui.help).focus();
  explainerOpener = null;
}

ui.help.addEventListener('click', () =>
  ui.explainer.hidden ? openExplainer('button') : closeExplainer(),
);
ui.explainer.addEventListener('click', (event) => {
  if ((event.target as Element).closest('[data-action="close-explainer"]')) closeExplainer();
});
// Tab stays inside while it's open, the way a dialog keeps focus.
ui.explainer.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const stops = Array.from(ui.explainer.querySelectorAll<HTMLElement>('button, a[href]'));
  const [first, last] = [stops[0], stops.at(-1)];
  if (!first || !last) return;
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === ui.explainer)
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
document.addEventListener('pointerdown', (event) => {
  const target = event.target as Node;
  if (!ui.explainer.hidden && !ui.explainer.contains(target) && !ui.help.contains(target))
    closeExplainer();
});

type Scene = ReturnType<typeof createScene>;

// deck.gl and the scene are over half the app's code. They download while the address is looked
// up and the first cells arrive, rather than before any of that starts; until then the card
// shows and the controls that move the camera wait.
let scene!: Scene;
let sceneLoaded = false;
const sceneReady: Promise<Scene> = import('./scene/scene').then(({ createScene }) => {
  scene = createScene(byId<HTMLDivElement>('scene'), sceneHandlers);
  sceneLoaded = true;
  return scene;
});

/** A control's action on the 3D scene, ignored until the scene has loaded. */
const withScene = (act: (scene: Scene) => void) => () => {
  if (sceneLoaded) act(scene);
};

const sceneHandlers: SceneHandlers = {
  onSelect: (ref) => (ref && state.inspectables.has(ref) ? open({ kind: 'ref', ref }) : undefined),
  onHover: (ref, x, y) => {
    const item = ref ? state.inspectables.get(ref) : undefined;
    ui.tooltip.hidden = !item;
    if (!item) return;
    const color = item.utility ? UTILITY_STYLES[item.utility].color : 'var(--feature)';
    ui.tooltip.innerHTML = `<strong style="--accent:${color}">${escapeHtml(item.callout.title)}</strong>${
      item.callout.detail ? `<span>${escapeHtml(item.callout.detail)}</span>` : ''
    }<em class="confidence confidence-${item.confidence}">${CONFIDENCE_LABELS[item.confidence].label}</em>`;
    ui.tooltip.style.left = `${x + 16}px`;
    ui.tooltip.style.top = `${y - 34}px`;
  },
  onCamera: ({ north, east, below }) => {
    scheduleExtend();
    scheduleUrl();
    ui.compass.style.setProperty('--north', `${north}deg`);
    ui.compass.style.setProperty('--east', `${east}deg`);
    if (document.body.dataset.side === (below ? 'below' : 'above')) return;
    document.body.dataset.side = below ? 'below' : 'above';
    ui.sideLabel.textContent = below ? 'Below street' : 'Above street';
    ui.side.title = below
      ? 'You are under the street looking up, so east and west are swapped. Click to go back above.'
      : 'You are above the street. Click to look up from below.';
  },
  obstacles: () =>
    Array.from(
      document.querySelectorAll<HTMLElement>('.topbar, .layers, .card, .toolbar, .phone-key'),
      (element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { x0: left, y0: top, x1: right, y1: bottom };
      },
    ),
  onZoomOutPastLimit: () => void enterCity(),
  onProbe: (point) => {
    trackEvent('dig_checked', { city: state.region.id, depth_ft: state.digDepthFt });
    state.probing = false;
    state.probe = point;
    sheet.set('half');
    renderCard();
    renderScene();
    scene.lookAtDig(point);
  },
};

/** A Blender model from public/models, by the names of the meshes it must have. */
const fetchModel = async <Part extends string>(
  name: string,
  parts: Part[],
): Promise<Record<Part, MeshData>> => {
  const response = await fetch(`${import.meta.env.BASE_URL}models/${name}.glb`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const meshes = parseGlbMeshes(await response.arrayBuffer());
  const missing = parts.filter((part) => !meshes.has(part));
  if (missing.length) throw new Error(`${name}.glb has no ${missing.join(', ')} mesh`);
  return Object.fromEntries(parts.map((part) => [part, meshes.get(part)!])) as Record<
    Part,
    MeshData
  >;
};

// The models load beside the data without holding anything up. Until the hydrant arrives, or if
// it fails, the code-built one stands in; signals keep their pins.
Promise.all([fetchModel('hydrant', ['body', 'trim']), sceneReady])
  .then(([hydrant, loaded]) => loaded.setHydrant(hydrant))
  .catch((error: unknown) => console.error('[subsola] hydrant model failed', error));
Promise.all([fetchModel('signal', ['pole', 'heads', 'lenses']), sceneReady])
  .then(([signal, loaded]) => loaded.setSignal(signal))
  .catch((error: unknown) => console.error('[subsola] signal model failed', error));

/* Rendering */

const selectedRef = () => (state.view.kind === 'ref' ? state.view.ref : null);
const emphasizedUtility = () =>
  state.view.kind === 'utility'
    ? state.view.utility
    : state.view.kind === 'ref'
      ? (state.inspectables.get(state.view.ref)?.utility ?? null)
      : null;

const assessment = () =>
  state.probe ? assessDig(state.probe, state.digDepthFt, state.scene.runs) : null;

const probeView = (): ProbeView | null => {
  const result = assessment();
  if (!result || !state.probe) return null;
  return {
    position: state.probe,
    depthFt: result.depthFt,
    hits: result.hits.map((hit) => ({
      utility: hit.utility,
      depthFt: hit.standard.shallowestFt,
      reach: hit.reach,
    })),
  };
};

const renderScene = () => {
  // Everything drawn comes from state, so the first update after the scene loads catches up.
  if (!sceneLoaded) return;
  scene.update({
    data: state.scene,
    stretch: state.stretch,
    ground: state.ground,
    photo: (state.photo ?? []).flatMap((tile) =>
      tile.image ? [{ image: tile.image, bounds: tile.bounds }] : [],
    ),
    hidden: state.hidden,
    workZones: state.workZones,
    probe: probeView(),
    probing: state.probing,
    motion: !reduceMotion(),
    selectedRef: selectedRef(),
    emphasizedUtility: emphasizedUtility(),
    since: state.since,
    address:
      state.place && state.frame
        ? {
            label: prettyAddress(state.place.label.split(',')[0]!),
            position: state.frame.toLocal(state.place.lngLat),
          }
        : null,
  });
};

const yearRange = (): YearRange => {
  const firsts = state.summaries.map((s) => s.firstYear).filter((y): y is number => y !== null);
  return { start: firsts.length ? Math.min(...firsts) : CURRENT_YEAR - 30, end: CURRENT_YEAR };
};

const renderCard = ({ missed = false } = {}) => {
  const view = state.view;
  const dig = assessment();
  if (view.kind === 'city')
    ui.card.innerHTML = cityCard(
      state.address ? prettyAddress(state.address.label.split(',')[0]!) : null,
      cityMap.region(),
      REGIONS.filter((other) => other !== cityMap.region()),
      missed,
    );
  else if (view.kind === 'probe')
    ui.card.innerHTML = dig ? probeCard(dig, state.region) : probePromptCard();
  else if (view.kind === 'about') ui.card.innerHTML = aboutCard(state.statuses, state.region);
  else if (view.kind === 'feedback') {
    // Cards redraw as records arrive; a half-written note mustn't be wiped.
    if (ui.card.querySelector('#feedback-form')) return;
    void showFeedback();
  } else if (view.kind === 'ref')
    ui.card.innerHTML = state.inspectables.get(view.ref)?.card() ?? '';
  else if (view.kind === 'utility') {
    const summary = state.summaries.find((s) => s.utility === view.utility);
    ui.card.innerHTML = summary ? utilityCard(summary, yearRange(), state.since) : '';
  } else {
    const address = state.place;
    const [line, hood] = address ? address.label.split(',').map((s) => s.trim()) : ['', ''];
    ui.card.innerHTML = homeCard({
      title: address ? prettyAddress(line!) : 'Finding the street…',
      neighborhood: hood || address?.borough || 'New York City',
      summaries: state.summaries,
      loading: !state.permitsLoaded,
      failed: state.permitsFailed,
      hydrants:
        state.region === CHI || state.region === DAL || state.region === SJ
          ? null
          : state.assets.filter((a) => a.properties.kind === 'hydrant' && nearPlace(a.geometry))
              .length,
      catchBasins:
        state.region === CHI || state.region === DAL
          ? null
          : state.assets.filter((a) => a.properties.kind === 'catch-basin' && nearPlace(a.geometry))
              .length,
      active: state.active
        .filter(({ groupIndex }) => nearPlace(state.permitGroups[groupIndex]!.geometry))
        .map(liveWork),
      records: state.recordsBuiltAt ? recordsFreshness(state.recordsBuiltAt, new Date()) : null,
      guide: !guideSeen,
      beta: state.region.beta,
      region: state.region,
      since: state.since,
      currentYear: CURRENT_YEAR,
    });
  }
  ui.card.scrollTop = 0;
  // The visual tests wait on this before taking their pictures.
  document.body.dataset.records = state.permitsLoaded ? 'loaded' : 'loading';
  renderLayers();
};

/** The feedback form, whose code loads the first time someone opens it. */
const showFeedback = async () => {
  const { feedbackCard, mountFeedback } = await import('./ui/feedback');
  // Another card may have opened while the form loaded, or a redraw already mounted it.
  if (state.view.kind !== 'feedback' || ui.card.querySelector('#feedback-form')) return;
  ui.card.innerHTML = feedbackCard(backButton);
  mountFeedback(
    ui.card,
    import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined,
    () => `${location.pathname}${location.search}`,
    () => trackEvent('feedback_sent', { city: state.region.id }),
  );
};

const ASSET_LAYERS: { kind: AssetKind; label: string }[] = [
  { kind: 'hydrant', label: 'Hydrants' },
  { kind: 'catch-basin', label: 'Catch basins' },
  { kind: 'manhole', label: 'Manholes' },
  { kind: 'linknyc', label: 'LinkNYC kiosks' },
  { kind: 'street-lamp', label: 'Street lamps' },
  { kind: 'traffic-signal', label: 'Traffic signals' },
  { kind: 'outfall', label: 'Outfalls' },
  { kind: 'electric-structure', label: 'Con Edison structures' },
];

const shortDate = (isoDate: string | undefined) =>
  isoDate
    ? new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : 'soon';

const liveWork = ({ groupIndex, record }: ActiveWork): LiveWork => ({
  ref: `permit-${groupIndex}`,
  title: `${UTILITY_STYLES[record.utility].label} work, ${ownerName(record.permittee)}`,
  detail: `${prettyAddress(record.street.split(' between ')[0] ?? record.street)}, until ${shortDate(record.workEnd)}`,
});

/** A utility with permits here, or a mapped main of its own (LA's sewers file no permits). */
const presentUtilities = (): UtilityKind[] => {
  const present = new Set([
    ...state.summaries
      .filter((s) => depthStandards()[s.utility] && s.permitCount)
      .map((s) => s.utility),
    ...state.mains.map((main) => main.utility),
  ]);
  return UTILITY_KINDS.filter((utility) => present.has(utility));
};

function renderLayers() {
  const underground: LayerRow[] = presentUtilities().map((utility) => ({
    key: utility,
    label: UTILITY_STYLES[utility].label,
    color: UTILITY_STYLES[utility].color,
  }));
  const onStreet: LayerRow[] = ASSET_LAYERS.flatMap(({ kind, label }) => {
    const matching = state.assets.filter((a) => a.properties.kind === kind);
    if (!matching.length) return [];
    // Manholes carry whichever utility their cover says; the row rings only when they agree.
    const rings = new Set(matching.map((a) => networkOf(kind, a.properties.utility)));
    const ring = rings.size === 1 ? [...rings][0] : null;
    return [
      {
        key: kind,
        label:
          kind === 'electric-structure' && state.region.id === 'sea'
            ? 'City Light structures'
            : label,
        color: 'var(--feature)',
        feature: { ring: ring ? UTILITY_STYLES[ring].color : null },
        detail: String(matching.length),
      },
    ];
  });
  const waterServices = state.scene.services.filter((s) => s.utility === 'water');
  const lead = waterServices.filter((s) => s.lot.material === 'lead').length;
  if (waterServices.length && underground.some((row) => row.key === 'water')) {
    const { detail, note, title } = waterServicesRow(waterServices.length, lead);
    underground.push({
      key: 'services',
      label: 'Water services',
      color: UTILITY_STYLES.water.color,
      detail,
      ...(note ? { note } : {}),
      detailTitle: title,
    });
  }
  if (state.mains.some(isRecycled) && underground.some((row) => row.key === 'water'))
    underground.push({ key: 'recycled', label: RECYCLED_WATER.label, color: RECYCLED_WATER.color });
  const houseSewers = state.scene.services.filter((s) => s.utility === 'sewer');
  if (houseSewers.length && underground.some((row) => row.key === 'sewer')) {
    underground.push({
      key: 'house-sewers',
      label: 'House sewers',
      color: UTILITY_STYLES.sewer.color,
      detail: String(houseSewers.length),
    });
  }
  const anyFlow =
    waterServices.length || houseSewers.length || state.scene.pieces.some((piece) => piece.flow);
  if (anyFlow && !reduceMotion())
    underground.push({ key: 'flow', label: 'Flow direction', color: '#7c8796' });
  const digSpots: LayerRow[] = state.scene.digSpots.length
    ? [
        {
          key: 'dig-spots',
          label: 'Excavation locations',
          color: 'var(--ink)',
          detail: String(state.scene.digSpots.length),
        },
      ]
    : [];
  const work: LayerRow[] = state.active.length
    ? [
        {
          key: 'work',
          label: 'Active work',
          color: 'var(--ink)',
          detail: String(state.active.length),
        },
      ]
    : [];
  ui.layers.innerHTML = layersPanel(
    underground,
    [...work, ...digSpots, ...onStreet],
    state.hidden,
    !state.permitsLoaded,
  );
  renderPhoneKey();
}

/* The phone's color key (ui/phoneKey.ts) */

let phoneKeyClosed = keyDismissed();
let phoneKeyShown = '';

function renderPhoneKey() {
  const show = phone.matches && !phoneKeyClosed && state.permitsLoaded;
  ui.phoneKey.hidden = !show;
  if (!show) return;
  const html = phoneKeyHtml(presentUtilities(), state.mains.some(isRecycled));
  // Cards redraw often as records arrive; the key only when what it lists has changed.
  if (phoneKeyShown === html) return;
  ui.phoneKey.innerHTML = html;
  phoneKeyShown = html;
}

phone.addEventListener('change', renderPhoneKey);
ui.phoneKey.addEventListener('click', (event) => {
  const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'explainer') return openExplainer('phone key');
  if (action !== 'close-key') return;
  phoneKeyClosed = true;
  rememberKeyDismissed();
  ui.phoneKey.hidden = true;
  // The ? among the round buttons is where the full explainer lives from now on.
  ui.help.focus();
});

ui.layers.addEventListener('click', (event) => {
  const target = (event.target as Element).closest<HTMLElement>('[data-layer]');
  if (!target) return;
  const key = target.dataset.layer as LayerKey;
  // A new set, so the scene can tell by identity that visibility changed.
  const hidden = new Set(state.hidden);
  if (hidden.has(key)) hidden.delete(key);
  else hidden.add(key);
  state.hidden = hidden;
  layerChoices = withChoice(layerChoices, key, !hidden.has(key));
  saveLayerChoices(layerChoices);
  trackEvent('layer_toggled', { layer: key, on: !hidden.has(key), city: state.region.id });
  renderLayers();
  ui.layers.querySelector<HTMLElement>(`[data-layer="${key}"]`)?.focus();
  renderScene();
});

function open(view: CardView, options: { focus: boolean } = { focus: true }) {
  // Whatever the user opens wins over a shared card still waiting for its records.
  pendingPick = null;
  const opening =
    view.kind !== state.view.kind ||
    (view.kind === 'ref' && state.view.kind === 'ref' && view.ref !== state.view.ref);
  if (view.kind !== 'home' && opening)
    trackEvent('card_opened', { ...cardProperties(view), city: state.region.id });
  state.view = view;
  if (view.kind !== 'probe') {
    state.probing = false;
    state.probe = null;
  }
  // On a phone: a picked feature or a dig result needs room; picking the spot needs the map.
  if (view.kind === 'probe') sheet.set(state.probe ? 'half' : 'peek');
  else if (view.kind !== 'home' && view.kind !== 'city') sheet.set('half');
  renderCard();
  renderScene();
  if (view.kind === 'ref' && options.focus) {
    const item = state.inspectables.get(view.ref);
    if (item) scene.focusOn(item.center);
  }
  writeUrl();
}

/**
 * What an opened card is about, for analytics. A line's card also says which utility and whether
 * the depth it gives was measured there or estimated, which is what most taps on the map are for.
 */
function cardProperties(view: CardView): AnalyticsProperties {
  if (view.kind !== 'ref') return { card: view.kind };
  const utility = state.inspectables.get(view.ref)?.utility ?? null;
  const line = lineKindOf(view.ref);
  if (!line) return { card: refFamily(view.ref), utility };
  const main = line === 'main' ? state.mains[Number(view.ref.slice('main-'.length))] : undefined;
  return {
    card: refFamily(view.ref),
    utility,
    line,
    depth: depthBasis(line, main?.depthFt ?? null),
  };
}

/* Shared links */

const pickOf = (view: CardView): SharedPick | null => {
  if (view.kind === 'about') return { kind: 'about' };
  if (view.kind === 'utility') return { kind: 'utility', utility: view.utility };
  if (view.kind !== 'ref' || !state.frame) return null;
  const item = state.inspectables.get(view.ref);
  if (!item) return null;
  const [lng, lat] = state.frame.toLngLat(item.center);
  return { kind: 'item', family: refFamily(view.ref), lngLat: [lng!, lat!] };
};

const cameraOf = (): SharedCamera | null => {
  if (!cameraPlaced || !state.frame) return null;
  const { target, zoom, tilt, bearing } = scene.pose();
  const [lng, lat] = state.frame.toLngLat(target);
  return { lngLat: [lng!, lat!], zoom, tilt, bearing };
};

function writeUrl() {
  if (!state.address || inCity()) return;
  const search = sharedViewSearch({
    address: state.address.label,
    camera: cameraOf(),
    pick: pendingPick ?? pickOf(state.view),
    since: state.since,
  });
  if (search !== location.search) history.replaceState(null, '', search);
}

// Safari stops honoring replaceState past about 100 calls in 30 seconds; camera moves fire per frame.
function scheduleUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(writeUrl, 500);
}

/** Opens the shared card once its feature has loaded. True when it opened one. */
function openPendingPick(): boolean {
  const pick = pendingPick;
  if (!pick || !state.frame) return false;
  if (pick.kind === 'about') {
    open({ kind: 'about' });
    return true;
  }
  if (pick.kind === 'feedback') {
    open({ kind: 'feedback' });
    return true;
  }
  if (pick.kind === 'utility') {
    if (!state.summaries.some((summary) => summary.utility === pick.utility)) return false;
    open({ kind: 'utility', utility: pick.utility });
    return true;
  }
  const ref = findPicked(pick.family, state.frame.toLocal(pick.lngLat), state.inspectables);
  if (!ref) return false;
  // The link's camera already frames it.
  open({ kind: 'ref', ref }, { focus: false });
  return true;
}

const copyLink = async () => {
  trackEvent('link_copied', {
    city: state.region.id,
    view:
      document.querySelector<HTMLElement>('[data-preset][aria-pressed="true"]')?.dataset.preset ??
      'moved',
    side: document.body.dataset.side ?? 'above',
    card: state.view.kind,
    method: phone.matches && 'share' in navigator ? 'share sheet' : 'clipboard',
  });
  clearTimeout(urlTimer);
  writeUrl();
  const done = ui.share.querySelector('.share-done')!;
  try {
    // Phones get their share sheet, which is how people send a link there.
    if (phone.matches && navigator.share) {
      await navigator.share({ title: document.title, url: location.href });
      return;
    }
    await navigator.clipboard.writeText(location.href);
    done.textContent = 'Link copied';
    ui.share.dataset.copied = 'true';
    setTimeout(() => delete ui.share.dataset.copied, 1800);
  } catch (error) {
    // Closing the share sheet rejects too; that one isn't a failure.
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('[subsola] copy link failed', error);
    done.textContent = 'Copy the link from the address bar';
    ui.share.dataset.copied = 'true';
    setTimeout(() => delete ui.share.dataset.copied, 3000);
  }
};
ui.share.addEventListener('click', () => void copyLink());

const startProbing = () => {
  state.probing = true;
  state.probe = null;
  open({ kind: 'probe' });
};

const setDigDepth = (feet: number) => {
  state.digDepthFt = feet;
  renderCard();
  renderScene();
};

// The slider redraws the shaft while it moves and rebuilds the card only on release, so the
// slider keeps focus mid-drag.
ui.card.addEventListener('input', (event) => {
  const slider = event.target;
  if (!(slider instanceof HTMLInputElement) || slider.id !== 'dig-depth') return;
  state.digDepthFt = Number(slider.value);
  const output = slider.nextElementSibling;
  if (output) output.textContent = formatFeet(state.digDepthFt);
  renderScene();
});
ui.card.addEventListener('change', (event) => {
  if (event.target instanceof HTMLSelectElement && event.target.matches('[data-since]')) {
    state.since = event.target.value ? Number(event.target.value) : null;
    // The picker sits mid-card; jumping back to the top would lose the table it just changed.
    const scroll = ui.card.scrollTop;
    renderCard();
    ui.card.scrollTop = scroll;
    renderScene();
    writeUrl();
    ui.card.querySelector<HTMLSelectElement>('[data-since]')?.focus();
    return;
  }
  const slider = event.target;
  if (!(slider instanceof HTMLInputElement) || slider.id !== 'dig-depth') return;
  renderCard();
  ui.card.querySelector<HTMLInputElement>('#dig-depth')?.focus();
});

ui.card.addEventListener('click', (event) => {
  // A plain link that navigates away: counted here, and the browser follows it as usual.
  const mcpLink = (event.target as Element).closest<HTMLElement>('[data-mcp-link]');
  if (mcpLink)
    return trackEvent('mcp_link_clicked', {
      city: state.region.id,
      from: mcpLink.dataset.mcpLink ?? null,
    });
  const target = (event.target as Element).closest<HTMLElement>(
    '[data-action], [data-utility], [data-ref], [data-dig-depth]',
  );
  if (!target) return;
  if (target.dataset.digDepth) return setDigDepth(Number(target.dataset.digDepth));
  if (target.dataset.ref) return open({ kind: 'ref', ref: target.dataset.ref });
  if (target.dataset.action === 'probe') return startProbing();
  if (target.dataset.utility)
    return open({ kind: 'utility', utility: target.dataset.utility as UtilityKind });
  if (target.dataset.action === 'back') return open({ kind: 'home' });
  if (target.dataset.action === 'about') return open({ kind: 'about' });
  if (target.dataset.action === 'feedback') return open({ kind: 'feedback' });
  if (target.dataset.action === 'guide-done') return dismissGuide();
  if (target.dataset.action === 'explainer') return openExplainer('card');
  if (target.dataset.action === 'open-city') return void enterCity();
  if (target.dataset.action === 'beta') {
    const reason = ui.card.querySelector<HTMLElement>('#beta-reason');
    if (!reason) return;
    reason.hidden = !reason.hidden;
    target.setAttribute('aria-expanded', String(!reason.hidden));
    return;
  }
  if (target.dataset.action === 'report') return void openReport();
  if (target.dataset.action === 'street') return backToStreet();
  if (target.dataset.action === 'other-city') {
    const city = REGIONS.find((candidate) => candidate.id === target.dataset.region);
    if (city) trackEvent('city_switched', { from: cityMap.region().id, to: city.id });
    return city && cityMap.switchTo(city);
  }
  if (target.dataset.action === 'retry' && state.address) void loadAddress(state.address.label);
});

/* Lot report */

const renderReport = async () => {
  const address = state.place;
  if (!address) return;
  // Most visits never open a report, so its layout code loads when one is first asked for.
  const { lotReportHtml } = await import('./ui/report');
  const [line, hood] = address.label.split(',').map((part) => part.trim());
  // Outer rings of the loaded buildings, for an address set far back from its street.
  const buildings = (state.groundData?.buildings.features ?? []).flatMap((feature) =>
    ringsOf(feature.geometry).flatMap((polygon) => (polygon[0] ? [polygon[0]] : [])),
  );
  const report = lotReportAt(
    state.frame!,
    address,
    { ...state, buildings },
    state.scene,
    state.active,
  );
  ui.report.innerHTML = lotReportHtml(report, {
    address: prettyAddress(line!),
    // DC files every address under one "borough", the city itself, which the label already names.
    neighborhood: [hood, address.borough]
      .filter(
        (part, index, parts) =>
          part && parts.findIndex((p) => p?.toLowerCase() === part.toLowerCase()) === index,
      )
      .join(', '),
    readOn: recordsFreshness(state.recordsBuiltAt ?? new Date().toISOString(), new Date())!.date,
    link: location.href,
    region: state.region,
  });
};

const openReport = async () => {
  trackEvent('report_opened', { city: state.region.id });
  // The printed link should be this view, not one from half a second ago.
  clearTimeout(urlTimer);
  writeUrl();
  try {
    await renderReport();
  } catch (error) {
    console.error('[subsola] the lot report failed to load', error);
    return;
  }
  ui.report.hidden = false;
  ui.report.scrollTop = 0;
  ui.report.focus();
  // Browsers name a saved PDF after the page title, so it says which address the report is for.
  const address = ui.report.querySelector('h1')?.textContent?.trim();
  if (address) document.title = `Subsola: ${address}`;
};

const MAP_TITLE = document.title;

const closeReport = () => {
  ui.report.hidden = true;
  document.title = MAP_TITLE;
  ui.card.querySelector<HTMLElement>('[data-action="report"]')?.focus();
};

ui.report.addEventListener('click', (event) => {
  const target = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (target?.dataset.action === 'close-report') closeReport();
  if (target?.dataset.action === 'print-report') {
    trackEvent('report_printed', { city: state.region.id });
    window.print();
  }
});

/* Data to scene */

const centerOf = (frame: LocalFrame, geometry: Geometry): Vec2 => {
  const coords = [...linesOf(geometry).flat(), ...pointsOf(geometry)];
  if (!coords.length) return [0, 0];
  const local = coords.map(frame.toLocal);
  return [
    local.reduce((s, p) => s + p[0], 0) / local.length,
    local.reduce((s, p) => s + p[1], 0) / local.length,
  ];
};

/** How current the loaded records are, for the cards: the build's date, or null when read live. */
const recordsAsOf = () =>
  state.recordsBuiltAt ? (recordsFreshness(state.recordsBuiltAt, new Date())?.date ?? null) : null;

/** The permit datasets behind a utility's lines here, for lines inferred from them. */
const permitSourcesFor = (utility: UtilityKind): SourceKey[] => [
  ...new Set(
    state.permitGroups
      .filter((group) => group.properties.utility === utility)
      .flatMap((group) => group.properties.permits.map((permit) => permit.dataset)),
  ),
];

const indexPermits = (frame: LocalFrame) => {
  state.permitGroups.forEach((group, index) => {
    const utility = group.properties.utility;
    const standard = depthStandards()[utility];
    const live = state.active.find((work) => work.groupIndex === index);
    state.inspectables.set(`permit-${index}`, {
      card: () =>
        runCard(
          group.properties,
          state.scene.runs.find((run) => run.ref === `permit-${index}`)?.digSpots ?? 0,
          live ? shortDate(live.record.workEnd) : undefined,
          state.scene.runs.find((run) => run.ref === `permit-${index}`)?.flow,
          recordsAsOf(),
        ),
      callout: live
        ? {
            title: liveWork(live).title,
            detail: `Permitted until ${shortDate(live.record.workEnd)}. Select for permit details.`,
          }
        : {
            title: `${UTILITY_STYLES[utility].label}${standard ? `, ${describeDepth(standard).toLowerCase()}` : ''}`,
            detail: `${group.properties.count ? plural(group.properties.count, 'permit') : 'Manhole permits only'} on this block. Select for records.`,
          },
      confidence: 'block-level',
      center: centerOf(frame, group.geometry),
      utility,
    });
  });
};

const indexMains = (frame: LocalFrame) => {
  state.mains.forEach((main, index) => {
    state.inspectables.set(`main-${index}`, {
      card: () => mainCard(main, recordsAsOf()),
      callout: mainCallout(main),
      confidence: SOURCES[main.source].confidence,
      center: centerOf(frame, main.line),
      utility: main.utility,
    });
  });
};

const indexAssets = (frame: LocalFrame) => {
  const origin = state.address!.lngLat;
  // Same rule the scene uses to draw them, so the card agrees with the picture. Worked out when a
  // card first opens, not on every rebuild.
  const { points, runs } = state.scene;
  let linked: Set<string> | null = null;
  const isLinked = (ref: string) => {
    linked ??= new Set(linkAssets(points, runs).map((link) => link.ref));
    return linked.has(ref);
  };
  state.assets.forEach((asset, index) => {
    const feet = feetFromMeters(distanceMeters(origin, asset.geometry));
    const ref = `asset-${index}`;
    state.inspectables.set(ref, {
      card: () => assetCard(asset.properties, feet, isLinked(ref), state.region),
      callout: { title: asset.properties.title, detail: `${Math.round(feet)} ft from the address` },
      confidence: SOURCES[asset.properties.sourceKey].confidence,
      center: frame.toLocal(asset.geometry.coordinates),
      // A lamp draws power but isn't an electric line: selecting it shouldn't light up the grid.
      utility: networkOf(asset.properties.kind, asset.properties.utility),
    });
  });
};

const indexServices = () => {
  for (const line of state.scene.services) {
    const permits = state.connectionPermits.get(line.lot.bbl) ?? [];
    const address = prettyAddress(line.lot.address);
    state.inspectables.set(line.ref, {
      card: () => serviceCard(line, permits, recordsAsOf()),
      callout:
        line.utility === 'water'
          ? {
              title: `Water service, ${serviceLabel(line.lot).toLowerCase()}`,
              detail: `${address}. ${serviceBasis(line.lot.basis)}.`,
            }
          : { title: `House sewer, ${houseSewerSummary(permits).short}`, detail: address },
      confidence:
        line.utility === 'sewer' && houseSewerStatus(permits).kind === 'assumed'
          ? 'inferred'
          : 'lot-level',
      center: [(line.a[0] + line.b[0]) / 2, (line.a[1] + line.b[1]) / 2],
      utility: line.utility,
    });
  }
};

const indexContinuations = (continuations: Continuation[]) => {
  for (const run of continuations) {
    const style = UTILITY_STYLES[run.utility];
    state.inspectables.set(run.ref, {
      card: () =>
        continuationCard(
          run,
          state.scene.runs.find((other) => other.ref === run.ref)?.flow,
          recordsAsOf(),
          permitSourcesFor(run.utility),
        ),
      callout: {
        title: style.label,
        detail: `No ${style.label.toLowerCase()} permit on this block; continued from adjacent blocks.`,
      },
      confidence: 'inferred',
      center: midpoint(run.path),
      utility: run.utility,
    });
  }
};

const indexJunctions = (junctions: Junction[]) => {
  for (const run of junctions) {
    const style = UTILITY_STYLES[run.utility];
    state.inspectables.set(run.ref, {
      card: () => junctionCard(run, recordsAsOf(), permitSourcesFor(run.utility)),
      callout: {
        title: `${style.label}, intersection connection`,
        detail: 'Main connections are not in public records.',
      },
      confidence: 'inferred',
      center: run.path[1]!,
      utility: run.utility,
    });
  }
};

const indexDigSpots = () => {
  for (const spot of state.scene.digSpots) {
    const group = state.permitGroups[Number(spot.permitRef.slice('permit-'.length))];
    const year = spot.issued?.slice(0, 4);
    state.inspectables.set(spot.ref, {
      card: () => digSpotCard(spot),
      callout: {
        title: `${UTILITY_STYLES[spot.utility].label} excavation${year ? `, ${year}` : ''}`,
        detail: spot.note.length > 90 ? `${spot.note.slice(0, 88)}…` : spot.note,
      },
      confidence: 'block-level',
      center: spot.position,
      utility: group?.properties.utility ?? spot.utility,
    });
  }
};

// The overview counts what's around the place, however far the camera has loaded.
const summarizePlace = () => {
  state.summaries = summarize(
    state.permitGroups.filter((group) => nearPlace(group.geometry)),
    state.assets.filter((asset) => nearPlace(asset.geometry)),
  );
};

// The rebuild's steps each take tens of milliseconds; run back to back they froze the page for a
// third of a second on a laptop and over a second on a phone. Between steps it hands the browser
// a turn, so scrolling and taps get through. Each rebuild has a number, and one that a newer
// rebuild (or a new address) has overtaken stops at its next pause without writing anything.
let rebuildNumber = 0;
let latestRebuild: Promise<void> = Promise.resolve();
const browserTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const refresh = (): Promise<void> => {
  const number = ++rebuildNumber;
  latestRebuild = rebuild(number).catch((error: unknown) =>
    console.error('[subsola] rebuilding the scene failed', error),
  );
  return latestRebuild;
};

const rebuild = async (number: number): Promise<void> => {
  const frame = state.frame;
  if (!frame) return;
  const overtaken = async () => {
    await browserTurn();
    return number !== rebuildNumber || state.frame !== frame;
  };
  // A newer rebuild's callers and this one's both want the finished scene, so wait for that one.
  const handOff = () => (number === rebuildNumber ? undefined : latestRebuild);
  summarizePlace();
  const steps = placeStreetSteps(frame, { ...state, curbs: state.scene.curbs });
  let step = steps.next();
  for (; !step.done; step = steps.next()) if (await overtaken()) return handOff();
  if (await overtaken()) return handOff();
  const { runs, points, continuations, junctions, services, digSpots } = step.value;
  state.scene = {
    ...state.scene,
    runs,
    pieces: runs.flatMap(piecesOf),
    points: [...points, ...buildAssets(frame, state.assets)],
    services,
    digSpots,
  };
  indexPermits(frame);
  indexContinuations(continuations);
  indexJunctions(junctions);
  indexAssets(frame);
  indexServices();
  indexMains(frame);
  indexDigSpots();
  if (openPendingPick()) return;
  if (state.view.kind !== 'ref') renderCard();
  // Records keep arriving after the report opens; it fills in rather than going stale.
  if (!ui.report.hidden) void renderReport();
  await browserTurn();
  renderScene();
};

let refreshQueued = false;
/** Cells loading while the view moves can land several per frame; they share one rebuild. */
const requestRefresh = () => {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    void refresh();
  });
};

/** The street point in front of the address: the nearest piece of pipe. */
const frontageOf = (data: SceneData): { point: Vec2 } | null => {
  let best: { piece: (typeof data.pieces)[number]; distance: number } | null = null;
  for (const piece of data.pieces) {
    const distance = Math.hypot(...piece.a);
    if (!best || distance < best.distance) best = { piece, distance };
  }
  return best ? { point: best.piece.a } : null;
};

interface PhotoTile {
  url: string;
  bounds: [number, number, number, number];
  image: HTMLImageElement | null;
}

// The state's ortho server renders exports on demand; small tiles come back fast and in parallel.
const PHOTO_GRID = 4;
// About 120 m a tile in San Francisco, half a meter a pixel, as fine as the export tiles.
const PHOTO_TILE_ZOOM = 18;

/** More photo tiles for the loaded street. A tile server's tiles span cells, so none twice. */
const withPhoto = (tiles: PhotoTile[]) => {
  const known = new Set((state.photo ?? []).map((tile) => tile.url));
  return [...(state.photo ?? []), ...tiles.filter((tile) => !known.has(tile.url))];
};

/** The city's aerial photo for the area as a grid of tiles positioned in local meters. */
const photoFor = (
  frame: LocalFrame,
  [west, south, east, north]: [number, number, number, number] = [
    -CONTEXT_RADIUS_M,
    -CONTEXT_RADIUS_M,
    CONTEXT_RADIUS_M,
    CONTEXT_RADIUS_M,
  ],
  grid = PHOTO_GRID,
): PhotoTile[] => {
  const R = 6378137;
  const tileTemplate = state.region.photoTiles;
  const toMercator = ([lng, lat]: number[]) => [
    (R * lng! * Math.PI) / 180,
    R * Math.log(Math.tan(Math.PI / 4 + (lat! * Math.PI) / 360)),
  ];
  const fromMercator = ([x, y]: number[]) => [
    (x! / R) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(y! / R)) - Math.PI / 2) * (180 / Math.PI),
  ];
  const [x0, y0] = toMercator(frame.toLngLat([west, south]));
  const [x1, y1] = toMercator(frame.toLngLat([east, north]));
  if (tileTemplate) {
    // A tile server's own grid, at about the detail of the export tiles: every tile the box
    // touches, whole.
    const half = Math.PI * R;
    const size = (2 * half) / 2 ** PHOTO_TILE_ZOOM;
    const tiles: PhotoTile[] = [];
    for (let x = Math.floor((x0! + half) / size); x <= Math.floor((x1! + half) / size); x++) {
      for (let y = Math.floor((half - y1!) / size); y <= Math.floor((half - y0!) / size); y++) {
        const [tx0, ty1] = [x * size - half, half - y * size];
        const [left, bottom] = frame.toLocal(fromMercator([tx0, ty1 - size]));
        const [right, top] = frame.toLocal(fromMercator([tx0 + size, ty1]));
        tiles.push({
          url: tileTemplate
            .replace('{z}', String(PHOTO_TILE_ZOOM))
            .replace('{x}', String(x))
            .replace('{y}', String(y)),
          bounds: [left!, bottom!, right!, top!],
          image: null,
        });
      }
    }
    return tiles;
  }
  const step = [(x1! - x0!) / grid, (y1! - y0!) / grid];
  const tiles: PhotoTile[] = [];
  for (let col = 0; col < grid; col++) {
    for (let row = 0; row < grid; row++) {
      const [tx0, ty0] = [x0! + col * step[0]!, y0! + row * step[1]!];
      const [tx1, ty1] = [tx0 + step[0]!, ty0 + step[1]!];
      const [left, bottom] = frame.toLocal(fromMercator([tx0, ty0]));
      const [right, top] = frame.toLocal(fromMercator([tx1, ty1]));
      tiles.push({
        url: `${state.region.photoServer}?bbox=${tx0},${ty0},${tx1},${ty1}&bboxSR=3857&imageSR=3857&size=512,512&format=jpg&f=image`,
        bounds: [left!, bottom!, right!, top!],
        image: null,
      });
    }
  }
  return tiles;
};

/* Loading */

const setStatus = (key: SourceKey, status: SourceStatus) => {
  state.statuses.set(key, status);
  if (state.view.kind !== 'about') return;
  // Only the list changes, so a reader's open disclosures and scroll survive each answer.
  const list = ui.card.querySelector('#about-sources');
  if (list)
    list.outerHTML = aboutSources(state.statuses, list.querySelector('details')?.open ?? false);
  else renderCard();
};

/**
 * Runs one data source, records its status, and never lets one failure blank the scene.
 * `optional` sources fill in extras; their failure is a warning, not an error, in the console.
 */
const track = async <T>(
  keys: SourceKey[],
  task: () => Promise<T>,
  count: (result: T) => number[],
  { optional = false }: { optional?: boolean } = {},
) => {
  keys.forEach((key) => setStatus(key, { state: 'loading' }));
  try {
    const result = await task();
    const counts = count(result);
    keys.forEach((key, i) => setStatus(key, { state: 'ok', count: counts[i] ?? 0 }));
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    (optional ? console.warn : console.error)(`[subsola] ${keys.join(', ')} failed`, error);
    const message = error instanceof Error ? error.message : String(error);
    keys.forEach((key) => setStatus(key, { state: 'error', message }));
    return null;
  }
};

const bboxAround = (frame: LocalFrame, meters: number): Bbox => {
  const [west, south] = frame.toLngLat([-meters, -meters]);
  const [east, north] = frame.toLngLat([meters, meters]);
  return [west!, south!, east!, north!];
};

let controller: AbortController | null = null;

// The live permit query parses DOT's State Plane geometry with proj4, so it loads only for a
// street outside the citywide build.
const livePermits = () => import('./sources/permits');

/** The block a live permit covers, as a band along the street with its marker in the middle. */
const workZoneOf = (frame: LocalFrame, geometry: Geometry, ref: string): WorkZone => {
  const line = linesOf(geometry)[0];
  const path = line ? line.map(frame.toLocal) : pointsOf(geometry).map(frame.toLocal);
  return { ref, path, position: path.length > 1 ? midpoint(path) : (path[0] ?? [0, 0]) };
};

// The long dive plays once per visit; later searches get a quicker one.
let firstDive = true;
// A search lands in the 3D view above the street until the user picks another view; later
// searches then land in the one they picked.
let arrivalPreset: Preset = 'angled';

const DIVE_WAIT_MS = 5000;
// The longest the dive waits for the staged first draw to finish.
const SETTLE_WAIT_MS = 3000;
// The camera is held high over the photo until the street has loaded and drawn once.
let pendingDive: { to: CameraPose | undefined; timer: ReturnType<typeof setTimeout> } | null = null;

// Past the longest dive, with a margin for the dive's own wait.
const CITY_MAP_DELAY_MS = 6000;

/**
 * Readies the city map out of sight, so zooming out to it later doesn't wait on tiles. Its
 * setup compiles shaders too, which would stall a dive, so it waits until the dive is over.
 */
const prepareCityMapLater = (lngLat: [number, number]) => {
  // A second WebGL context and its tile workers are too much memory to hold ahead of time on a
  // touch device; there the map builds when it's first opened.
  if (window.matchMedia('(pointer: coarse)').matches) return;
  setTimeout(() => cityMap.prepare(lngLat), CITY_MAP_DELAY_MS);
};

/** Resolves after the browser has painted a frame with whatever was just handed to the scene. */
const nextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

/**
 * Dives from the hold to the street in front of the address (`frontage`), or to a shared link's
 * camera. False when the dive already went: the wait ran out, or the user took the camera.
 */
async function landDive(frontage: Vec2 | null): Promise<boolean> {
  const dive = pendingDive;
  if (!dive) return false;
  pendingDive = null;
  clearTimeout(dive.timer);
  // Let the first full draw, and its shader compiling, happen while the camera is still. It's
  // staged over several frames (scene/staging.ts), so wait for the last of them.
  markStage('first draw');
  // Never held up for long, though: a tab in the background draws no frames at all.
  await Promise.race([
    scene.whenSettled(),
    new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MS)),
  ]);
  await nextPaint();
  markStage('diving');
  const target = dive.to?.target ?? frontage ?? [0, 0];
  // The camera lands on the street out front, which can be well off the address point (one set
  // back on a big lot); the card keeps to the searched address until the user moves on.
  askedAt = target;
  const landed = scene.descend(target, {
    motion: !reduceMotion(),
    to: dive.to,
    preset: arrivalPreset,
  });
  if (landed && !dive.to) markPreset(arrivalPreset);
  cameraPlaced = true;
  writeUrl();
  return landed;
}

/**
 * Waits for the 3D code on the first load. False when it failed to download, which leaves the
 * card saying so, or when a newer search took over meanwhile.
 */
const sceneArrived = async (signal: AbortSignal): Promise<boolean> => {
  try {
    await sceneReady;
  } catch (error) {
    console.error('[subsola] the 3D view failed to load', error);
    ui.card.innerHTML = `<h1 class="card-title">The 3D view didn't load</h1><p class="hero-line">Check the connection and reload the page.</p>`;
    return false;
  }
  if (signal.aborted) return false;
  renderScene();
  return true;
};

/**
 * Says plainly that a search landed nowhere Subsola can show (ui/coverage.ts), instead of an
 * empty street that could pass for a clear one.
 */
function showCoverageMiss(miss: CoverageMiss, backTo: string | null, from: SearchSource) {
  trackEvent('coverage_missed', {
    reason: miss.kind,
    from,
    city: miss.kind === 'no-records' ? miss.region.id : null,
  });
  ui.card.innerHTML = coverageCard(miss, backTo);
  ui.card.scrollTop = 0;
  // On a phone the message needs more than the sheet's peek.
  sheet.set('half');
}

/** Loads the street around an address, or around the address nearest a point on the city map. */
const loadAddress = async (
  // Typed text, a point on the city map, or a row picked from the search box's suggestions,
  // whose city is already known.
  query: string | [number, number] | CitySuggestion,
  // Where the city map was when it was zoomed in to load this, so the street takes over from it.
  arrival?: { lngLat: [number, number]; zoom: number; bearing: number },
  // From a shared link: where to put the camera and which card to open. Also passed, without an
  // address, for the street the map opens on.
  shared?: { address?: string | null; camera: SharedCamera | null; pick: SharedPick | null },
) => {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  if (pendingDive) clearTimeout(pendingDive.timer);
  pendingDive = null;
  if (inCity() && !arrival) revealStreet();

  // Only a typed search is checked against the places Subsola covers; the city map and shared
  // links already point inside a city. The check's place lists load while the geocoders work.
  const typed = typeof query === 'string' && !arrival && !shared ? query : null;
  const coverageCheck = typed ? import('./ui/outsideCoverage') : null;
  const backTo = state.address ? prettyAddress(state.address.label.split(',')[0]!) : null;

  let address: GeocodedAddress;
  let region: Region;
  try {
    if (typeof query === 'string') ({ address, region } = await geocodeAnywhere(query, signal));
    else if (!Array.isArray(query))
      ({ address, region } = await geocodeIn(query.region, query.query, signal, query.magicKey));
    else {
      region = regionAt(query) ?? NYC;
      address = await region.reverseGeocode(query, signal);
    }
  } catch (error) {
    if (signal.aborted) return;
    console.error('[subsola] geocode failed', error);
    const from = searchSource(Boolean(arrival), shared);
    trackEvent('address_searched', { from, found: false });
    trackEvent('address_not_found', { from });
    if (arrival) {
      // Zoomed in on the city map just past the city line, such as Jersey City inside New
      // York's box. The map stays up for the next try.
      renderCard({ missed: true });
      cityMap.resume();
      return;
    }
    const text = typeof query === 'string' ? query : Array.isArray(query) ? '' : query.query;
    const outside = coverageCheck && (await coverageCheck).outsideCoverage(text, null);
    if (signal.aborted) return;
    showCoverageMiss(outside ?? { kind: 'not-found', typed: text }, backTo, from);
    return;
  }

  if (typed && coverageCheck) {
    const outside = (await coverageCheck).outsideCoverage(typed, { address, region });
    if (signal.aborted) return;
    if (outside) {
      const from = searchSource(false, shared);
      trackEvent('address_searched', { from, found: false });
      trackEvent('address_not_found', { from });
      return showCoverageMiss(outside, backTo, from);
    }
  }

  trackEvent('address_searched', {
    from: searchSource(Boolean(arrival), shared),
    found: true,
    city: region.id,
  });
  const frame = createFrame(address.lngLat);
  state.region = region;
  useDepthStandards(region.depths);
  ui.call811.href = region.markout.url;
  ui.call811.title = `${region.markout.law} requires a free ${region.markout.center} request at least ${region.markout.notice} before digging`;
  Object.assign(state, {
    address,
    place: address,
    frame,
    permitGroups: [],
    assets: [],
    spots: [],
    serviceLots: [],
    mains: [],
    connectionPermits: new Map(),
    streets: [],
    summaries: [],
    scene: emptyScene(),
    statuses: new Map(),
    view: { kind: 'home' },
    permitsLoaded: false,
    permitsFailed: false,
    recordsBuiltAt: null,
    active: [],
    workZones: [],
    probing: false,
    probe: null,
    photo: photoFor(frame),
    groundData: null,
  });
  // The address loads the middle cell itself; the rest load as the camera reaches them.
  loadedCells = new Set([cellAt(0, 0).key]);
  placeController?.abort();
  askedAt = [0, 0];
  state.inspectables.clear();
  ui.report.hidden = true;
  ui.input.value = '';
  ui.input.placeholder = prettyAddress(address.label.split(',')[0]!);
  pendingPick = shared?.pick ?? null;
  cameraPlaced = false;
  writeUrl();
  renderCard();
  renderScene();
  if (arrival) {
    if (!(await sceneArrived(signal))) return;
    // Under the city map, at exactly its view; the map stays up until there's ground to show.
    scene.holdAbove(
      frame.toLocal(arrival.lngLat),
      sceneZoomFor(arrival.zoom, arrival.lngLat[1]),
      arrival.bearing,
    );
    cameraPlaced = true;
    setTimeout(() => {
      if (!signal.aborted && inCity()) revealStreet();
    }, ARRIVAL_WAIT_MS);
  } else {
    // Always fetched now: the dive starts over the aerial photo.
    loadPhoto();
    const bearing = await streetGridBearing(address, frame, signal);
    if (!(await sceneArrived(signal))) return;
    const camera = shared?.camera;
    const to = camera
      ? {
          target: frame.toLocal(camera.lngLat),
          zoom: camera.zoom,
          tilt: camera.tilt,
          bearing: camera.bearing,
        }
      : undefined;
    scene.poise(to ? to.target : [0, 0], { first: firstDive, bearing: to?.bearing ?? bearing });
    firstDive = false;
    pendingDive = {
      to,
      // Records that take this long shouldn't keep the camera waiting; it slides over later.
      timer: setTimeout(() => void landDive(null), DIVE_WAIT_MS),
    };
  }

  cellIndex = await builtCells();
  if (signal.aborted) return;
  const built = cellIndex ? builtCellsAround(frame, [0, 0], CONTEXT_RADIUS_M, cellIndex.cells) : [];
  // Outside the build (or with no build) the address loads live, as before.
  if (built.length) {
    state.recordsBuiltAt = cellIndex!.builtAt;
    return loadAddressFromBuild(
      address,
      built,
      signal,
      arrival,
      Boolean(shared?.camera),
      searchSource(Boolean(arrival), shared),
    );
  }
  // The live sources are NYC's; anywhere else the street comes from the build or not at all.
  if (region !== NYC) {
    showCoverageMiss(
      { kind: 'no-records', address: prettyAddress(address.label.split(',')[0]!), region },
      null,
      searchSource(Boolean(arrival), shared),
    );
    void landDive(null);
    return;
  }

  const center = address.lngLat;
  const contextBox = bboxAround(frame, CONTEXT_RADIUS_M);
  const addAssets = (assets: AssetFeature[] | null) => {
    if (!assets || signal.aborted) return;
    state.assets = mergeAssets(state.assets, assets);
    void refresh();
  };

  const streetsTask = track(
    ['centerline'],
    () => fetchStreets(contextBox, signal),
    (r) => [r.length],
  );

  await Promise.all([
    Promise.all([
      streetsTask,
      track(
        ['curbs', 'roadbed', 'sidewalks', 'buildings'],
        () => fetchStreetGeometry(contextBox, signal),
        (g) => [
          g.curbs.features.length,
          g.roadbed.features.length,
          g.sidewalks.features.length,
          g.buildings.features.length,
        ],
      ),
    ]).then(([streets, geometry]) => {
      if (signal.aborted) return;
      state.streets = mergeBy(state.streets, streets ?? [], streetKey);
      if (geometry) {
        state.groundData = mergeGround(state.groundData, geometry);
        state.scene = { ...state.scene, ...buildGround(frame, state.groundData, state.streets) };
        // Curb valves are placed on the curbs, so the service lines are redone with them.
        void refresh();
      }
      if (arrival && inCity()) revealStreet();
      prepareCityMapLater(address.lngLat);
    }),
    track(
      ['permitsCurrent', 'permitsHistoric'],
      async () => {
        const streets = await streetsTask;
        // Without street names the permit query would quietly match nothing and look like a clean street.
        if (!streets)
          throw new Error('Street names did not load, so permits could not be looked up');
        // Permits are filed by street name, so ask for the streets inside the search area.
        const nearby = streets.filter((s) =>
          s.geometry.coordinates.some((line) =>
            line.some((p) => Math.hypot(...frame.toLocal(p)) <= SEARCH_RADIUS_M * 1.4),
          ),
        );
        const names = [...new Set(nearby.map((s) => s.permitName))];
        const { fetchUtilityPermits } = await livePermits();
        return fetchUtilityPermits(
          center,
          address.borough,
          names,
          CELL_REACH_M,
          blockLocator(streets),
          signal,
        );
      },
      (groups) => {
        const records = groups.flatMap((g) => g.properties.permits);
        return [
          records.filter((r) => r.dataset === 'permitsCurrent').length,
          records.filter((r) => r.dataset === 'permitsHistoric').length,
        ];
      },
    ).then(async (groups) => {
      if (signal.aborted) return;
      state.permitsLoaded = true;
      state.permitsFailed = groups === null;
      addPermitGroups(frame, groups ?? []);
      await refresh();
      // The geocoded point is the middle of the lot; the interesting part is the street out front.
      const frontage = frontageOf(state.scene);
      // Arriving from the city map, the camera stays where the user zoomed in, and a shared link
      // keeps its own camera. A search dives to the street, or slides over if it already dove.
      const landed = await landDive(frontage?.point ?? null);
      // After the dive starts, so the cells beyond wait for it to land.
      extendView();
      if (frontage && !landed && !arrival && !shared?.camera)
        landOn(frontage.point, reduceMotion() ? 0 : 1600);
    }),
    track(
      ['serviceLines'],
      () => fetchServiceLots(bboxAround(frame, SEARCH_RADIUS_M), signal),
      (r) => [r.length],
    ).then(async (lots) => {
      if (!lots || signal.aborted) return;
      state.serviceLots = mergeBy(state.serviceLots, lots, (lot) => lot.bbl);
      await refresh();
      const permits = await track(
        ['connectionPermits', 'connectionPermitsHistoric'],
        () =>
          fetchConnectionPermits(
            lots.map((lot) => lot.bbl),
            signal,
          ),
        (byLot) => {
          const all = [...byLot.values()].flat();
          return [
            all.filter((p) => p.dataset === 'current').length,
            all.filter((p) => p.dataset === 'historic').length,
          ];
        },
      );
      if (!permits || signal.aborted) return;
      state.connectionPermits = new Map([...state.connectionPermits, ...permits]);
      await refresh();
    }),
    track(
      ['hydrants'],
      () => fetchHydrants(center, CELL_REACH_M, signal),
      (r) => [r.length],
    ).then(addAssets),
    track(
      ['catchBasins'],
      () => fetchCatchBasins(center, CELL_REACH_M, signal),
      (r) => [r.length],
    ).then(addAssets),
    track(
      ['linkNyc'],
      () => fetchLinkNyc(center, CELL_REACH_M, signal),
      (r) => [r.length],
    ).then(addAssets),
    track(
      ['outfalls'],
      () => fetchOutfalls(center, SEARCH_RADIUS_M * 3, signal),
      (r) => [r.length],
    ).then(addAssets),
    track(
      ['conEdStructures'],
      () => fetchConEdStructures(center, CELL_REACH_M, signal),
      (r) => [r.length],
    ).then(addAssets),
    track(
      ['signalsLpi', 'signalsAccessible', 'signalsExclusive'],
      () => fetchSignalRows(center, CELL_REACH_M, signal),
      (r) => [r.signalsLpi.length, r.signalsAccessible.length, r.signalsExclusive.length],
    ).then((rows) => addAssets(rows && signalsFromRows(rows))),
  ]);
};

/** Slides the camera over the street out front, keeping the card on the searched address. */
function landOn(point: Vec2, duration: number) {
  askedAt = point;
  scene.focusOn(point, duration);
}

/* Loading more as the camera moves */

// Cells already loaded or loading for this address, by key.
let loadedCells = new Set<string>();
// Two at a time: each cell is a dozen requests to NYC Open Data.
const CELLS_AT_ONCE = 2;
// Past this the scene gets heavy to rebuild on every arrival; a new search starts afresh.
const MAX_CELLS = 48;
// However zoomed out, cells farther than this from the middle of the view wait until it's nearer.
const MAX_REACH_M = 450;
let cellsLoading = 0;
let extendTimer: ReturnType<typeof setTimeout> | undefined;

/** Ground features from two overlapping loads, each kept once. */
const mergeGround = (existing: GroundData | null, incoming: GroundData): GroundData => {
  if (!existing) return incoming;
  const merge = <C extends { features: { geometry: unknown }[] }>(a: C, b: C): C => ({
    ...a,
    features: mergeBy(a.features, b.features, (f) => JSON.stringify(f.geometry)),
  });
  return {
    curbs: merge(existing.curbs, incoming.curbs),
    roadbed: merge(existing.roadbed, incoming.roadbed),
    sidewalks: merge(existing.sidewalks, incoming.sidewalks),
    buildings: merge(existing.buildings, incoming.buildings),
  };
};

const nearPlace = (geometry: Geometry) =>
  state.place ? distanceMeters(state.place.lngLat, geometry) <= SEARCH_RADIUS_M : false;

/** New permit blocks join the end of the list, so earlier blocks keep their `permit-N` refs. */
const addPermitGroups = (frame: LocalFrame, groups: Feature<Geometry, PermitGroupProperties>[]) => {
  state.permitGroups = mergeBy(state.permitGroups, groups, (group) => group.properties.key);
  state.active = activeWork(state.permitGroups, todayIn(state.region.timeZone));
  state.workZones = state.active.map(({ groupIndex }) =>
    workZoneOf(frame, state.permitGroups[groupIndex]!.geometry, `permit-${groupIndex}`),
  );
};

/** One run of a loader for a cell; a failure is logged and leaves the rest of the cell going. */
const forCell = async <T>(
  cell: { key: string },
  what: string,
  signal: AbortSignal,
  task: () => Promise<T>,
): Promise<T | null> => {
  try {
    return await task();
  } catch (error) {
    if (signal.aborted) return null;
    console.error(`[subsola] ${what} for cell ${cell.key} failed`, error);
    return null;
  }
};

/** Loads everything for one cell and merges it in, the same sources the address loads. */
const loadCell = async (cell: Cell, signal: AbortSignal) => {
  const frame = state.frame;
  const address = state.address;
  if (!frame || !address) return;
  const [west, south] = frame.toLngLat([cell.bounds[0], cell.bounds[1]]);
  const [east, north] = frame.toLngLat([cell.bounds[2], cell.bounds[3]]);
  const bbox: Bbox = [west!, south!, east!, north!];
  const center = frame.toLngLat(cell.center);

  const [streets, geometry] = await Promise.all([
    forCell(cell, 'streets', signal, () => fetchStreets(bbox, signal)),
    forCell(cell, 'street geometry', signal, () => fetchStreetGeometry(bbox, signal)),
  ]);
  if (signal.aborted) return;
  state.streets = mergeBy(state.streets, streets ?? [], streetKey);
  if (geometry) {
    state.groundData = mergeGround(state.groundData, geometry);
    state.scene = { ...state.scene, ...buildGround(frame, state.groundData, state.streets) };
  }
  state.photo = withPhoto(photoFor(frame, cell.bounds, 1));
  if (state.ground === 'photo') loadPhoto();
  await refresh();

  const names = [...new Set((streets ?? []).map((street) => street.permitName))];
  const [groups, lots, ...assets] = await Promise.all([
    names.length
      ? forCell(cell, 'permits', signal, async () =>
          (await livePermits()).fetchUtilityPermits(
            center,
            address.borough,
            names,
            CELL_REACH_M,
            blockLocator(state.streets),
            signal,
          ),
        )
      : null,
    forCell(cell, 'service lines', signal, () => fetchServiceLots(bbox, signal)),
    forCell(cell, 'hydrants', signal, () => fetchHydrants(center, CELL_REACH_M, signal)),
    forCell(cell, 'catch basins', signal, () => fetchCatchBasins(center, CELL_REACH_M, signal)),
    forCell(cell, 'LinkNYC', signal, () => fetchLinkNyc(center, CELL_REACH_M, signal)),
    forCell(cell, 'Con Edison structures', signal, () =>
      fetchConEdStructures(center, CELL_REACH_M, signal),
    ),
    forCell(cell, 'traffic signals', signal, async () =>
      signalsFromRows(await fetchSignalRows(center, CELL_REACH_M, signal)),
    ),
  ]);
  if (signal.aborted) return;
  addPermitGroups(frame, groups ?? []);
  state.assets = mergeAssets(
    state.assets,
    assets.flatMap((list) => list ?? []),
  );
  const known = new Set(state.serviceLots.map((lot) => lot.bbl));
  const newLots = (lots ?? []).filter((lot) => !known.has(lot.bbl));
  state.serviceLots = [...state.serviceLots, ...newLots];
  await refresh();

  if (!newLots.length) return;
  const permits = await forCell(cell, 'connection permits', signal, () =>
    fetchConnectionPermits(
      newLots.map((lot) => lot.bbl),
      signal,
    ),
  );
  if (!permits || signal.aborted) return;
  state.connectionPermits = new Map([...state.connectionPermits, ...permits]);
  await refresh();
};

/* Loading from the citywide build */

// Where the citywide build's cells are served. Without it everything loads live from NYC Open Data.
const CELLS_URL = (import.meta.env.VITE_CELLS_URL as string | undefined)?.replace(/\/$/, '');
// A built cell is one small file, so more can load at once and more can be kept. Phones get
// fewer: an iPhone kills the tab past its memory budget, which reloads the page mid-visit.
// Subsola's own type-ahead index, beside the cells unless pointed elsewhere for testing.
const ADDRESSES_URL =
  (import.meta.env.VITE_ADDRESSES_URL as string | undefined)?.replace(/\/$/, '') ?? CELLS_URL;
const addressIndex = ADDRESSES_URL ? createAddressIndex(ADDRESSES_URL) : null;
const inApp = isInAppBrowser(navigator.userAgent);
const builtCellsAtOnce = () => (inApp ? 2 : phone.matches ? 3 : 6);
const maxBuiltCells = () => (inApp ? 24 : phone.matches ? 48 : 120);
let cellIndexTask: Promise<CellIndex | null> | null = null;
let cellIndex: CellIndex | null = null;

/** The list of built cells, fetched once; null when there is no build to read. */
const builtCells = () =>
  (cellIndexTask ??= CELLS_URL
    ? fetchCellIndex(CELLS_URL).catch((error: unknown) => {
        console.error('[subsola] citywide build index failed, loading live instead', error);
        return null;
      })
    : Promise.resolve(null));

/**
 * Which way to turn the map so the streets at the address run straight up and across, from the
 * built cell under it. The browser keeps the cell, so the full load doesn't fetch it again.
 * North up without a build, or if the cell can't be read.
 */
const streetGridBearing = async (
  address: GeocodedAddress,
  frame: LocalFrame,
  signal: AbortSignal,
): Promise<number> => {
  const index = await builtCells();
  const cell = gridCellOf(address.lngLat);
  if (!index || !CELLS_URL || !(cell.key in index.cells)) return 0;
  try {
    const { streets } = await fetchCell(CELLS_URL, cell, signal);
    const paths = streets.flatMap((street) =>
      street.geometry.coordinates.map((line) => line.map((point) => frame.toLocal(point))),
    );
    return gridBearing(paths, [0, 0]);
  } catch (error) {
    if (!signal.aborted) console.warn('[subsola] street grid unknown, keeping north up', error);
    return 0;
  }
};

/** Merges one built cell in, the same as a live cell load but from one file. */
const loadGridCell = async (
  cell: GridCell,
  signal: AbortSignal,
  { rebuild = true }: { rebuild?: boolean } = {},
) => {
  const frame = state.frame;
  if (!frame || !CELLS_URL) return;
  const data = await forCell(cell, 'built cell', signal, () => fetchCell(CELLS_URL, cell, signal));
  if (!data || signal.aborted) return;
  state.streets = mergeBy(state.streets, data.streets, streetKey);
  state.groundData = mergeGround(state.groundData, data.ground);
  state.scene = { ...state.scene, ...buildGround(frame, state.groundData, state.streets) };
  addPermitGroups(frame, data.permitGroups);
  state.serviceLots = mergeBy(state.serviceLots, data.serviceLots, (lot) => lot.bbl);
  // A main crossing several cells comes in each of them.
  state.mains = mergeBy(state.mains, data.mains, (main) => main.id);
  state.connectionPermits = new Map([...state.connectionPermits, ...data.connectionPermits]);
  state.assets = mergeAssets(state.assets, data.assets);
  state.spots = mergeBy(state.spots, data.spots, (spot) => spot.lngLat.join(','));
  const [west, south, east, north] = gridCellBounds(cell);
  const [left, bottom] = frame.toLocal([west, south]);
  const [right, top] = frame.toLocal([east, north]);
  state.photo = withPhoto(photoFor(frame, [left, bottom, right, top], 1));
  if (state.ground === 'photo') loadPhoto();
  if (rebuild) requestRefresh();
};

/** What the sources card shows for a built load: everything came from the build at once. */
const markBuiltStatuses = () => {
  if (state.region === SF) return markBuiltSfStatuses();
  if (state.region === LA) return markBuiltLaStatuses();
  if (state.region === SD) return markBuiltSdStatuses();
  if (state.region === SEA) return markBuiltSeaStatuses();
  if (state.region === DEN) return markBuiltDenStatuses();
  if (state.region === CHI) return markBuiltChiStatuses();
  if (state.region === DAL) return markBuiltDalStatuses();
  if (state.region === SJ) return markBuiltSjStatuses();
  if (state.region !== NYC) return markBuiltDcStatuses();
  const ground = state.groundData;
  const records = state.permitGroups.flatMap((group) => group.properties.permits);
  const connections = [...state.connectionPermits.values()].flat();
  const counts: Partial<Record<SourceKey, number>> = {
    centerline: state.streets.length,
    curbs: ground?.curbs.features.length ?? 0,
    roadbed: ground?.roadbed.features.length ?? 0,
    sidewalks: ground?.sidewalks.features.length ?? 0,
    buildings: ground?.buildings.features.length ?? 0,
    permitsCurrent: records.filter((record) => record.dataset === 'permitsCurrent').length,
    permitsHistoric: records.filter((record) => record.dataset === 'permitsHistoric').length,
    serviceLines: state.serviceLots.length,
    connectionPermits: connections.filter((permit) => permit.dataset === 'current').length,
    connectionPermitsHistoric: connections.filter((permit) => permit.dataset === 'historic').length,
    hydrants: state.assets.filter((asset) => asset.properties.kind === 'hydrant').length,
    catchBasins: state.assets.filter((asset) => asset.properties.kind === 'catch-basin').length,
    linkNyc: state.assets.filter((asset) => asset.properties.kind === 'linknyc').length,
    outfalls: state.assets.filter((asset) => asset.properties.kind === 'outfall').length,
    conEdStructures: state.assets.filter((asset) => asset.properties.kind === 'electric-structure')
      .length,
    ...(cellIndex?.osm
      ? {
          osm: state.assets.filter(
            (asset) =>
              asset.properties.sourceKey === 'osm' || asset.properties.signal?.osmNodes.length,
          ).length,
        }
      : {}),
    ...Object.fromEntries(
      (['signalsLpi', 'signalsAccessible', 'signalsExclusive'] as const).map((key) => [
        key,
        state.assets.filter((asset) => asset.properties.signal?.sources.includes(key)).length,
      ]),
    ),
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** DC's sources card: its own layers, counted from what the build brought in. */
const markBuiltDcStatuses = () => {
  const ground = state.groundData;
  const fromSource = (key: SourceKey) =>
    state.assets.filter(
      (asset) =>
        asset.properties.sourceKey === key || asset.properties.signal?.sources.includes(key),
    ).length;
  const counts: Partial<Record<SourceKey, number>> = {
    dcPermits: state.permitGroups.flatMap((group) => group.properties.permits).length,
    dcBlocks: state.streets.length,
    dcCurbs: ground?.curbs.features.length ?? 0,
    dcRoads: ground?.roadbed.features.length ?? 0,
    dcSidewalks: ground?.sidewalks.features.length ?? 0,
    dcBuildings: ground?.buildings.features.length ?? 0,
    dcElevations: state.spots.length,
    dcHydrants: fromSource('dcHydrants'),
    dcInlets: fromSource('dcInlets'),
    dcOutfalls: fromSource('dcOutfalls'),
    dcLights: fromSource('dcLights'),
    dcSignals: fromSource('dcSignals'),
    dcServiceLines: state.serviceLots.length,
    dcMains: state.mains.length,
    dcLots: state.serviceLots.length,
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** San Francisco's sources card, counted the same way. */
const markBuiltSfStatuses = () => {
  const ground = state.groundData;
  const fromSource = (key: SourceKey) =>
    state.assets.filter((asset) => asset.properties.sourceKey === key).length;
  const counts: Partial<Record<SourceKey, number>> = {
    sfPermits: state.permitGroups.flatMap((group) => group.properties.permits).length,
    sfStreets: state.streets.length,
    sfCurbs: ground?.curbs.features.length ?? 0,
    sfRoads: ground?.roadbed.features.length ?? 0,
    sfBuildings: ground?.buildings.features.length ?? 0,
    sfSewerNodes: fromSource('sfSewerNodes'),
    sfHydrantsLow: fromSource('sfHydrantsLow'),
    sfHydrantsHigh: fromSource('sfHydrantsHigh'),
    sfLights: fromSource('sfLights'),
    sfSignals: fromSource('sfSignals'),
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** Los Angeles's sources card, counted the same way. */
const markBuiltLaStatuses = () => {
  const ground = state.groundData;
  const fromSource = (key: SourceKey) =>
    state.assets.filter((asset) => asset.properties.sourceKey === key).length;
  const counts: Partial<Record<SourceKey, number>> = {
    laPermitsArchived: state.permitGroups.flatMap((group) => group.properties.permits).length,
    laStreets: state.streets.length,
    laBuildings: ground?.buildings.features.length ?? 0,
    laSidewalks: ground?.sidewalks.features.length ?? 0,
    laSewers: state.mains.filter((main) => main.source === 'laSewers').length,
    laSideSewers: state.mains.filter((main) => main.source === 'laSideSewers').length,
    laStormDrains: state.mains.filter((main) => main.source === 'laStormDrains').length,
    laSewerStructures: fromSource('laSewerStructures'),
    laHydrants: fromSource('laHydrants'),
    laInlets: fromSource('laInlets'),
    laLights: fromSource('laLights'),
    laSignals: fromSource('laSignals'),
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** San Diego's sources card, counted the same way. */
const markBuiltSdStatuses = () => {
  const ground = state.groundData;
  const fromSource = (key: SourceKey) =>
    state.assets.filter((asset) => asset.properties.sourceKey === key).length;
  const records = state.permitGroups.flatMap((group) => group.properties.permits);
  const counts: Partial<Record<SourceKey, number>> = {
    sdPermits: records.length,
    sdStreets: state.streets.length,
    sdBuildings: ground?.buildings.features.length ?? 0,
    sdSewers: state.mains.filter((main) => main.source === 'sdSewers').length,
    sdWaterMains: state.mains.filter((main) => main.source === 'sdWaterMains').length,
    sdStormDrains: state.mains.filter((main) => main.source === 'sdStormDrains').length,
    sdRecycledMains: state.mains.filter((main) => main.source === 'sdRecycledMains').length,
    sdServiceLines: state.serviceLots.length,
    sdSewerManholes: fromSource('sdSewerManholes'),
    sdHydrants: fromSource('sdHydrants'),
    sdInlets: fromSource('sdInlets'),
    sdLights: fromSource('sdLights'),
    sdSignals: fromSource('sdSignals'),
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** Seattle's sources card, counted the same way. */
const markBuiltSeaStatuses = () => {
  const ground = state.groundData;
  const fromSource = (key: SourceKey) =>
    state.assets.filter((asset) => asset.properties.sourceKey === key).length;
  const counts: Partial<Record<SourceKey, number>> = {
    seaPermits: state.permitGroups.flatMap((group) => group.properties.permits).length,
    seaStreets: state.streets.length,
    seaBuildings: ground?.buildings.features.length ?? 0,
    seaSewers: state.mains.filter((main) => main.source === 'seaSewers').length,
    seaWaterMains: state.mains.filter((main) => main.source === 'seaWaterMains').length,
    seaServiceLines: state.serviceLots.length,
    seaSideSewers: state.mains.filter((main) => main.source === 'seaSideSewers').length,
    seaElectricStructures: fromSource('seaElectricStructures'),
    seaElectricLines: state.mains.filter((main) => main.source === 'seaElectricLines').length,
    seaSewerHoles: fromSource('seaSewerHoles'),
    seaCatchBasins: fromSource('seaCatchBasins'),
    seaLights: fromSource('seaLights'),
    seaSignals: fromSource('seaSignals'),
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** Denver's sources card, counted the same way. */
const markBuiltDenStatuses = () => {
  const ground = state.groundData;
  const fromSource = (key: SourceKey) =>
    state.assets.filter(
      (asset) =>
        asset.properties.sourceKey === key || asset.properties.signal?.sources.includes(key),
    ).length;
  const counts: Partial<Record<SourceKey, number>> = {
    denPermits: state.permitGroups.flatMap((group) => group.properties.permits).length,
    denStreets: state.streets.length,
    denBuildings: ground?.buildings.features.length ?? 0,
    denSewers: state.mains.filter((main) => main.source === 'denSewers').length,
    denStormDrains: state.mains.filter((main) => main.source === 'denStormDrains').length,
    denServiceLines: state.serviceLots.length,
    denSewerManholes: fromSource('denSewerManholes'),
    denStormManholes: fromSource('denStormManholes'),
    denInlets: fromSource('denInlets'),
    denSignals: fromSource('denSignals'),
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** Chicago's sources card: permits and the ground, since the city publishes no pipes. */
const markBuiltChiStatuses = () => {
  const counts: Partial<Record<SourceKey, number>> = {
    chiPermits: state.permitGroups.flatMap((group) => group.properties.permits).length,
    chiStreets: state.streets.length,
    chiBuildings: state.groundData?.buildings.features.length ?? 0,
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** Dallas's sources card: permits, the ground and the service line inventory; no pipes. */
const markBuiltDalStatuses = () => {
  const records = state.permitGroups.flatMap((group) => group.properties.permits).length;
  const counts: Partial<Record<SourceKey, number>> = {
    dalPermits: records,
    dalPermitLines: records,
    dalPermitPoints: records,
    dalStreets: state.streets.length,
    dalBuildings: state.groundData?.buildings.features.length ?? 0,
    dalServiceLines: state.serviceLots.length,
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** San Jose's sources card: permits, the ground, sewers, storm drains and street assets. */
const markBuiltSjStatuses = () => {
  const records = state.permitGroups.flatMap((group) => group.properties.permits).length;
  const fromSource = (key: SourceKey) =>
    state.assets.filter((asset) => asset.properties.sourceKey === key).length;
  const counts: Partial<Record<SourceKey, number>> = {
    sjPermits: records,
    sjPermitPoints: records,
    sjPermitParcels: records,
    sjStreets: state.streets.length,
    sjBuildings: state.groundData?.buildings.features.length ?? 0,
    sjSewers: state.mains.filter((main) => main.source === 'sjSewers').length,
    sjStormDrains: state.mains.filter((main) => main.source === 'sjStormDrains').length,
    sjSewerManholes: fromSource('sjSewerManholes'),
    sjStormManholes: fromSource('sjStormManholes'),
    sjInlets: fromSource('sjInlets'),
    sjLights: fromSource('sjLights'),
    sjSignals: fromSource('sjSignals'),
  };
  for (const [key, count] of Object.entries(counts))
    setStatus(key as SourceKey, { state: 'ok', count });
};

/** The address's first load from the citywide build: the cells around it, all at once. */
const loadAddressFromBuild = async (
  address: GeocodedAddress,
  cells: GridCell[],
  signal: AbortSignal,
  arrival: { lngLat: [number, number] } | undefined,
  sharedCamera: boolean,
  from: SearchSource,
) => {
  cells.forEach((cell) => loadedCells.add(cell.key));
  markStage(`loading ${cells.length} cells around the address`);
  // Rebuilding the scene is the slow part of a load, so it waits for the whole batch.
  await Promise.all(cells.map((cell) => loadGridCell(cell, signal, { rebuild: false })));
  if (signal.aborted) return;
  markStage('building the street');
  await refresh();
  markStage('street built');
  trackEvent('street_loaded', {
    city: state.region.id,
    cells: cells.length,
    seconds: Math.round(performance.now() / 100) / 10,
    from,
  });
  state.permitsLoaded = true;
  markBuiltStatuses();
  renderCard();
  if (arrival && inCity()) revealStreet();
  prepareCityMapLater(address.lngLat);
  const frontage = frontageOf(state.scene);
  const landed = await landDive(frontage?.point ?? null);
  // After the dive starts, so the cells beyond wait for it to land.
  extendView();
  if (frontage && !landed && !arrival && !sharedCamera)
    landOn(frontage.point, reduceMotion() ? 0 : 1600);
};

/** Starts loading the cells the view reaches that haven't loaded, nearest first. */
function extendView() {
  const signal = controller?.signal;
  const frame = state.frame;
  if (!signal || signal.aborted || !frame || !state.permitsLoaded || inCity()) return;
  // Each cell that lands rebuilds the scene, a few hundred ms that stalls the dive's frames into
  // jumps. The dive only shows the street around the address, which is already loaded.
  const diving = scene.diveRemaining();
  if (diving) {
    clearTimeout(extendTimer);
    extendTimer = setTimeout(extendView, diving);
    return;
  }
  const reach = Math.min(scene.viewRadius(), MAX_REACH_M);
  const index = cellIndex;
  const wanted = (
    index
      ? builtCellsAround(frame, scene.center(), reach, index.cells).map((cell) => ({
          key: cell.key,
          load: () => loadGridCell(cell, signal),
        }))
      : cellsAround(scene.center(), reach).map((cell) => ({
          key: cell.key,
          load: () => loadCell(cell, signal),
        }))
  ).filter((cell) => !loadedCells.has(cell.key));
  for (const cell of wanted) {
    if (cellsLoading >= (index ? builtCellsAtOnce() : CELLS_AT_ONCE)) return;
    if (loadedCells.size >= (index ? maxBuiltCells() : MAX_CELLS)) return;
    loadedCells.add(cell.key);
    cellsLoading += 1;
    void cell.load().finally(() => {
      cellsLoading -= 1;
      markStage(`loading cells around the view, ${loadedCells.size} so far`);
      // The camera may have moved on while this cell loaded.
      if (!signal.aborted) extendView();
    });
  }
}

/** Waits for the camera to settle before loading, so a fling across the map doesn't load its path. */
const scheduleExtend = () => {
  clearTimeout(extendTimer);
  extendTimer = setTimeout(() => {
    extendView();
    void followView();
  }, 350);
};

// About half a block face: closer than this, the address in view hasn't changed enough to ask.
const FOLLOW_STEP_M = 40;
let askedAt: Vec2 = [0, 0];
let placeController: AbortController | null = null;

/** Points the card at the address nearest the middle of the view, once the camera settles. */
async function followView() {
  const frame = state.frame;
  if (!frame || !state.address || inCity()) return;
  const center = scene.center();
  if (distance2(center, askedAt) < FOLLOW_STEP_M) return;
  askedAt = center;
  placeController?.abort();
  placeController = new AbortController();
  const { signal } = placeController;
  let place: GeocodedAddress;
  try {
    place = await state.region.reverseGeocode(frame.toLngLat(center) as [number, number], signal);
  } catch (error) {
    if (!signal.aborted) console.error('[subsola] reverse geocode failed', error);
    return;
  }
  // A new search may have started while this was out.
  if (signal.aborted || state.frame !== frame || place.label === state.place?.label) return;
  state.place = place;
  summarizePlace();
  if (state.view.kind === 'home') renderCard();
  if (!ui.report.hidden) void renderReport();
  renderScene();
}

/* Controls */

const PHOTO_TRIES = 2;
const PHOTO_RETRY_MS = 1500;

/** Loads each aerial tile once, with CORS so WebGL may use them as textures. */
const requestedTiles = new WeakSet<PhotoTile>();
const loadPhoto = () => {
  for (const tile of state.photo ?? []) {
    if (requestedTiles.has(tile)) continue;
    requestedTiles.add(tile);
    const fetchTile = (attempt: number) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = tile.url;
      image
        .decode()
        .then(() => {
          if (!state.photo?.includes(tile)) return;
          tile.image = image;
          renderScene();
        })
        .catch((error: unknown) => {
          // Busy photo servers drop the odd tile; one more try usually fills it.
          if (attempt < PHOTO_TRIES) {
            setTimeout(() => fetchTile(attempt + 1), PHOTO_RETRY_MS);
            return;
          }
          console.error('[subsola] aerial tile failed', tile.url.split('?')[0], error);
        });
    };
    fetchTile(1);
  }
};

const setGround = (ground: Ground) => {
  state.ground = ground;
  if (ground === 'photo') loadPhoto();
  ui.groundPhoto.setAttribute('aria-checked', String(ground === 'photo'));
  renderScene();
};

const cycleStretch = () => {
  const index = STRETCH_STEPS.indexOf(state.stretch);
  state.stretch = STRETCH_STEPS[(index + 1) % STRETCH_STEPS.length]!;
  ui.stretchValue.textContent = `${state.stretch}×`;
  renderScene();
};

ui.dig.addEventListener('click', startProbing);
const toggleAerialPhoto = () => setGround(state.ground === 'photo' ? 'plan' : 'photo');
ui.groundPhoto.addEventListener('click', toggleAerialPhoto);
ui.stretch.addEventListener('click', cycleStretch);
const presetButtons = document.querySelectorAll<HTMLButtonElement>('[data-preset]');
const markPreset = (preset: Preset) =>
  presetButtons.forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.preset === preset)),
  );
const goTo = (preset: Preset) => {
  if (!sceneLoaded) return;
  trackEvent('view_changed', { view: preset, city: state.region.id, from_city_map: inCity() });
  arrivalPreset = preset;
  if (inCity()) return backToStreet(preset);
  scene.goTo(preset);
  markPreset(preset);
};
presetButtons.forEach((button) =>
  button.addEventListener('click', () => goTo(button.dataset.preset as Preset)),
);
/* City map */

const cityMap = createCityMap(ui.city, {
  onEnter: (lngLat, zoom, bearing) => enterStreet(lngLat, zoom, bearing),
  onRegion: () => {
    if (state.view.kind === 'city') renderCard();
  },
});

// The street view levels off and zooms out before the city map fades in over it, this long per
// zoom level or quarter turn it has to cover.
const FLATTEN_MS_PER_STEP = 300;
// A view picked on the city map is eased into after it fades.
const LAND_MS = 1300;
// A new street slow to load still takes over from the city map after this long.
const ARRIVAL_WAIT_MS = 5000;

let cityShown = false;
let handingOver = false;
// A view tab pressed on the city map, to ease into once back on the street. Otherwise the
// street keeps exactly the map's view: turning or tilting on its own is disorienting.
let landIn: Preset | null = null;

function inCity() {
  return cityShown;
}

const markCityMode = (shown: boolean) => {
  cityShown = shown;
  document.body.dataset.mode = shown ? 'city' : 'street';
  ui.cityTab.setAttribute('aria-pressed', String(shown));
  presetButtons.forEach((button) =>
    button.setAttribute('aria-pressed', String(!shown && button.dataset.preset === landIn)),
  );
};

/** Levels the street view off, then fades the city map in over it at the same spot and scale. */
const enterCity = async () => {
  if (cityShown || handingOver || !sceneLoaded) return;
  trackEvent('city_map_opened', { city: state.region.id });
  handingOver = true;
  ui.report.hidden = true;
  const here = state.address?.lngLat ?? null;
  cityMap.setCurrent(here);
  await scene.flatten(reduceMotion() ? 0 : FLATTEN_MS_PER_STEP);
  const looking: [number, number] = state.frame
    ? (state.frame.toLngLat(scene.center()) as [number, number])
    : (here ?? [-73.94, 40.73]);
  markCityMode(true);
  open({ kind: 'city' });
  try {
    await cityMap.show(looking, mapZoomFor(scene.zoom(), looking[1]), scene.bearing());
    // The card went up before the map knew which city it's showing.
    if (state.view.kind === 'city') renderCard();
  } catch (error) {
    // Most likely offline: the map's code downloads on first use. Stay on the street.
    console.error('[subsola] city map failed to load', error);
    markCityMode(false);
    open({ kind: 'home' });
  } finally {
    handingOver = false;
  }
};

/** Fades the city map away over the street, which tips down into its view. */
function revealStreet() {
  cityMap.hide();
  const preset = landIn ?? 'above';
  markCityMode(false);
  presetButtons.forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.preset === preset)),
  );
  if (state.view.kind === 'city') open({ kind: 'home' });
  if (landIn) scene.land(reduceMotion() ? 0 : LAND_MS, landIn);
  landIn = null;
}

/** Zoomed in to street scale on the city map: the loaded street if it's that close, else a new one. */
const enterStreet = (lngLat: [number, number], zoom: number, bearing: number) => {
  const frame = state.frame;
  const local = frame?.toLocal(lngLat);
  if (frame && local && Math.hypot(...local) <= SEARCH_RADIUS_M) {
    scene.holdAbove(frame.toLocal(lngLat), sceneZoomFor(zoom, lngLat[1]), bearing);
    return revealStreet();
  }
  void loadAddress(lngLat, { lngLat, zoom, bearing });
};

/** Back to the loaded street the same way as zooming in: the city map flies there first. */
const backToStreet = (preset: Preset | null = null) => {
  landIn = preset;
  if (state.address) cityMap.flyTo(state.address.lngLat);
};

ui.cityTab.addEventListener('click', () => (inCity() ? backToStreet() : void enterCity()));

ui.compass.addEventListener(
  'click',
  withScene((loaded) => loaded.northUp()),
);
ui.side.addEventListener('click', () =>
  goTo(document.body.dataset.side === 'below' ? 'angled' : 'underground'),
);
document.querySelectorAll<HTMLButtonElement>('[data-rotate]').forEach((button) =>
  button.addEventListener(
    'click',
    withScene((loaded) => loaded.rotate(Number(button.dataset.rotate))),
  ),
);

attachSuggestions({
  form: ui.form,
  input: ui.input,
  // The city being looked at: the city map's when it's up, else the loaded street's.
  ask: (text, signal) =>
    suggestAddresses(
      text,
      inCity() ? cityMap.region() : state.region,
      signal,
      SUGGESTION_LIMIT,
      addressIndex ?? undefined,
    ),
  onPick: (row) => {
    // Which city, never what was picked: the address stays on the device.
    trackEvent('suggestion_picked', { city: row.region.id });
    void loadAddress(row);
    ui.input.blur();
  },
});

ui.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = ui.input.value.trim();
  if (text) void loadAddress(text);
  ui.input.blur();
});

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /INPUT|TEXTAREA/.test(target.tagName));

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    ui.input.focus();
    return;
  }
  if (event.key === 'Escape') {
    if (!ui.explainer.hidden) return closeExplainer();
    if (isTyping(event.target)) return ui.input.blur();
    if (!ui.report.hidden) return closeReport();
    if (inCity()) return backToStreet();
    return open({ kind: 'home' });
  }
  if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
  if (!ui.report.hidden) return;
  if (event.key === '?') return ui.explainer.hidden ? openExplainer('keyboard') : closeExplainer();
  const key = event.key.toLowerCase();
  if (key === '5') return inCity() ? backToStreet() : void enterCity();
  // The street view's keys would act on a scene nobody can see, or one still loading.
  if (inCity() || !sceneLoaded) return;
  if (key === 'd') startProbing();
  if (key === 'q') scene.rotate(-45);
  if (key === 'e') scene.rotate(45);
  if (key === 'n') scene.northUp();
  if (key === '1') goTo('above');
  if (key === '2') goTo('angled');
  if (key === '3') goTo('underground');
  if (key === '4') toggleAerialPhoto();
});

// Dev-only handle for poking at the scene from the console.
if (import.meta.env.DEV)
  Object.assign(window, {
    subsola: {
      get scene() {
        return scene;
      },
      state,
      cityMap,
      sheet,
    },
  });

if (new URLSearchParams(location.search).has('debug'))
  void import('./ui/debug').then(({ showDebugPanel }) =>
    showDebugPanel(() => ({
      'cells loaded': loadedCells.size,
      'cells loading': cellsLoading,
      'cell limit': maxBuiltCells(),
      'in-app browser': inApp ? 'yes' : 'no',
      'permit records': state.permitGroups.reduce((sum, group) => sum + group.properties.count, 0),
      assets: state.assets.length,
    })),
  );

const shared = readSharedView(location.search);
state.since = shared.since;
// "Finding the street" goes up at once, while the address is looked up.
renderCard();
void loadAddress(shared.address ?? DEFAULT_ADDRESS, undefined, shared);
