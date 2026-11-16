import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import type { Region, RegionId } from '../../src/regions';
import type { GeocodedAddress } from '../../src/sources/geocode';
import { fetchCell, fetchCellIndex, type CellData, type CellIndex } from '../../src/sources/cells';
import type { PermitGroupProperties } from '../../src/sources/permits';
import type { ConnectionPermit } from '../../src/sources/connections';
import type { AssetFeature } from '../../src/sources/assets';
import { mergeAssets, streetKey } from '../../src/sources/merge';
import { builtCellsAround, type GridCell } from '../../src/grid';
import { mergeBy } from '../../src/tiles';
import { curbsOf } from '../../src/scene/build';
import { createFrame, ringsOf, type LocalFrame } from '../../src/scene/local';
import { distanceMeters } from '../../src/geo';
import type { StreetRecords } from '../../src/street';
import { findAddress, type AddressProblem } from './findAddress';

/** Where the citywide build lives, the same bucket the site reads. */
export const CELLS_URL = 'https://data.subsola.com';
// Each upstream call (the geocoders together, the index, each cell) gets this long.
export const UPSTREAM_TIMEOUT_MS = 8_000;
// The bucket caches the index for 5 minutes too, so a fresher copy wouldn't come any sooner.
const INDEX_TTL_MS = 5 * 60_000;
// Cells load two at a time, each trimmed as it lands. All at once, a dense Manhattan view at
// 400 m peaked above the 128 MB a Worker gets; two at a time it stays near half that.
const CELLS_AT_ONCE = 2;

/**
 * Where the cells are for this deployment: CELLS_URL when set (a self-hosted copy points it at its
 * own files), else the public bucket. A relative path is read against the request's own origin.
 */
export const cellsUrlFor = (configured: string | undefined, requestUrl: string) =>
  new URL(configured?.trim() || CELLS_URL, requestUrl).href.replace(/\/$/, '');

const indexCaches = new Map<string, () => Promise<CellIndex>>();

/** One index cache per cells URL, kept for the isolate's life. */
export const indexCacheFor = (cellsUrl: string) => {
  let cache = indexCaches.get(cellsUrl);
  if (!cache) indexCaches.set(cellsUrl, (cache = createIndexCache(cellsUrl)));
  return cache;
};

/** The build's index, fetched at most once per 5 minutes per isolate. */
export const createIndexCache = (cellsUrl: string, now: () => number = Date.now) => {
  let cached: { at: number; task: Promise<CellIndex> } | null = null;
  return (): Promise<CellIndex> => {
    if (cached && now() - cached.at < INDEX_TTL_MS) return cached.task;
    const task = fetchCellIndex(cellsUrl, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS));
    const entry = { at: now(), task };
    cached = entry;
    // A failed fetch isn't kept, so the next question tries again.
    task.catch(() => {
      if (cached === entry) cached = null;
    });
    return task;
  };
};

export interface PlaceRecords extends StreetRecords {
  connectionPermits: Map<string, ConnectionPermit[]>;
  assets: AssetFeature[];
  /** Outer rings of the buildings around the address, in lng/lat (see `forStreetAt`). */
  buildings: Position[][];
}

export interface Place {
  address: GeocodedAddress;
  region: Region;
  frame: LocalFrame;
  /** When the build these records came from was made. */
  builtAt: string;
  records: PlaceRecords;
  /** Cells that failed to load, so an answer can say it may be missing something. */
  cellsMissing: number;
  /** Whether the address found reads differently from the one asked about. */
  differs: boolean;
}

export type LookupFailure = 'not-found' | 'timeout' | 'no-records' | 'data-unavailable';

export type Lookup =
  | { ok: true; place: Place }
  | {
      ok: false;
      reason: LookupFailure;
      problem?: AddressProblem | null;
      /** The city the address was found in, when it was found before the failure. */
      region?: RegionId;
    };

export interface LookupDeps {
  cellsUrl: string;
  cellIndex: () => Promise<CellIndex>;
}

const emptyRecords = (): PlaceRecords => ({
  permitGroups: [],
  streets: [],
  mains: [],
  serviceLots: [],
  spots: [],
  curbs: [],
  connectionPermits: new Map(),
  assets: [],
  buildings: [],
});

/** One more cell's records, each street, block, lot and main kept once. */
const mergeCell = (records: PlaceRecords, cell: CellData): PlaceRecords => ({
  ...records,
  permitGroups: mergeBy<Feature<Geometry, PermitGroupProperties>>(
    records.permitGroups,
    cell.permitGroups,
    (group) => group.properties.key,
  ),
  streets: mergeBy(records.streets, cell.streets, streetKey),
  // A main crossing several cells comes in each of them.
  mains: mergeBy(records.mains, cell.mains, (main) => main.id),
  serviceLots: mergeBy(records.serviceLots, cell.serviceLots, (lot) => lot.bbl),
  spots: mergeBy(records.spots, cell.spots, (spot) => spot.lngLat.join(',')),
  connectionPermits: new Map([...records.connectionPermits, ...cell.connectionPermits]),
  assets: mergeAssets(records.assets, cell.assets),
});

/** The cells' records together, with curbs in the frame's meters. */
export const mergeCells = (frame: LocalFrame, cells: CellData[]): PlaceRecords => {
  let records = emptyRecords();
  let curbs: FeatureCollection['features'] = [];
  let buildings: FeatureCollection['features'] = [];
  for (const cell of cells) {
    records = mergeCell(records, cell);
    curbs = mergeBy(curbs, cell.ground.curbs.features, (f) => JSON.stringify(f.geometry));
    buildings = mergeBy(buildings, cell.ground.buildings.features, (f) =>
      JSON.stringify(f.geometry),
    );
  }
  return {
    ...records,
    curbs: curbsOf(frame, { type: 'FeatureCollection', features: curbs }),
    buildings: buildings.flatMap((feature) =>
      ringsOf(feature.geometry).flatMap((polygon) => (polygon[0] ? [polygon[0]] : [])),
    ),
  };
};

/** What to keep of each cell; the rest is dropped as soon as the cell is read. */
export type CellFilter = (cell: CellData) => CellData;

const none = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

/** What the lot report reads: everything but the ground, apart from its curbs. */
export const forStreet: CellFilter = (cell) => ({
  ...cell,
  ground: {
    curbs: cell.ground.curbs,
    roadbed: none(),
    sidewalks: none(),
    buildings: { type: 'FeatureCollection', features: [] },
  },
});

// Only buildings this close to the address could be its own; a dense cell's thousands of others
// are dropped as it lands.
const OWN_BUILDING_M = 200;

/**
 * What the lot report reads: `forStreet`, plus the buildings around the address, whose
 * frontage places the lot line for an address set far back from its street (src/frontage.ts).
 */
export const forStreetAt =
  (origin: Position): CellFilter =>
  (cell) => {
    const kept = forStreet(cell);
    const near = cell.ground.buildings.features.filter((feature) =>
      ringsOf(feature.geometry).some(
        ([outer]) =>
          outer !== undefined &&
          distanceMeters(origin, { type: 'LineString', coordinates: outer }) <= OWN_BUILDING_M,
      ),
    );
    return {
      ...kept,
      ground: { ...kept.ground, buildings: { ...cell.ground.buildings, features: near } },
    };
  };

/** Only the permit blocks that pass `keep`. */
export const permitsOnly =
  (keep: (group: Feature<Geometry, PermitGroupProperties>) => boolean): CellFilter =>
  (cell) => ({
    streets: [],
    ground: {
      curbs: none(),
      roadbed: none(),
      sidewalks: none(),
      buildings: { type: 'FeatureCollection', features: [] },
    },
    permitGroups: cell.permitGroups.filter(keep),
    serviceLots: [],
    mains: [],
    connectionPermits: new Map(),
    assets: [],
    spots: [],
  });

const loadCells = async (deps: LookupDeps, cells: GridCell[], filter: CellFilter) => {
  const loaded: CellData[] = [];
  let failed = 0;
  for (let start = 0; start < cells.length; start += CELLS_AT_ONCE) {
    const batch = await Promise.allSettled(
      cells
        .slice(start, start + CELLS_AT_ONCE)
        .map((cell) => fetchCell(deps.cellsUrl, cell, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS))),
    );
    for (const result of batch) {
      if (result.status === 'fulfilled') loaded.push(filter(result.value));
      else failed += 1;
    }
  }
  return { loaded, failed };
};

/**
 * Finds the address (findAddress.ts) and loads the built cells within `reachM` of it, keeping what `filter`
 * (given the address's position) keeps. Never throws: a miss, a timeout or missing data comes
 * back as a reason the tool can explain.
 */
export const lookupPlace = async (
  text: string,
  reachM: number,
  deps: LookupDeps,
  filter: (origin: Position) => CellFilter = forStreetAt,
  city?: RegionId,
): Promise<Lookup> => {
  const found = await findAddress(text, {
    city,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    onMiss: (region) => console.info(`[subsola mcp] ${region.short} geocoder had no match`),
  });
  if (!found.ok)
    return found.reason === 'timeout'
      ? { ok: false, reason: 'timeout' }
      : { ok: false, reason: 'not-found', problem: found.problem };

  let index: CellIndex;
  try {
    index = await deps.cellIndex();
  } catch (error) {
    console.error('[subsola mcp] cell index failed', String(error));
    return { ok: false, reason: 'data-unavailable', region: found.region.id };
  }
  const frame = createFrame(found.address.lngLat);
  const wanted = builtCellsAround(frame, [0, 0], reachM, index.cells);
  if (!wanted.length) return { ok: false, reason: 'no-records', region: found.region.id };

  const { loaded, failed } = await loadCells(deps, wanted, filter(found.address.lngLat));
  // The count only: a cell's name says roughly where the address is.
  if (failed) console.error(`[subsola mcp] ${failed} of ${wanted.length} cells failed to load`);
  if (!loaded.length) return { ok: false, reason: 'data-unavailable', region: found.region.id };

  return {
    ok: true,
    place: {
      address: found.address,
      region: found.region,
      differs: found.differs,
      frame,
      builtAt: index.builtAt,
      records: mergeCells(frame, loaded),
      cellsMissing: failed,
    },
  };
};
