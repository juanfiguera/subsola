import type { FeatureCollection, Geometry, Position } from 'geojson';
import type { Region } from '../../src/regions';
import { useDepthStandards } from '../../src/depth';
import { fetchCell, type CellData, type CellIndex } from '../../src/sources/cells';
import { isRecycled } from '../../src/sources/mains';
import { streetKey } from '../../src/sources/merge';
import { streetsAgree, type StreetSegment } from '../../src/sources/streets';
import { builtCellsAround } from '../../src/grid';
import { mergeBy } from '../../src/tiles';
import { curbsOf } from '../../src/scene/build';
import { createFrame, type LocalFrame, type Vec2 } from '../../src/scene/local';
import { placeStreet, type StreetRecords } from '../../src/street';
import type { StreetPlan } from './draw';
import { VIEW_M } from './draw';

/**
 * The plan drawn in a shared street's preview: the cells around the spot, with every line placed
 * by the same code the map and the MCP server use.
 */

// Lines are placed from blocks; a block is stored in the cell its middle falls in, so cells a
// little past the view still hold lines that cross it.
const REACH_M = VIEW_M / 2 + 60;
const CELL_TIMEOUT_MS = 6_000;
const CELLS_AT_ONCE = 2;

const outerRings = (geometry: Geometry | null): Position[][] => {
  if (geometry?.type === 'Polygon') return geometry.coordinates.slice(0, 1);
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]!);
  return [];
};

/** What the plan needs of a cell: the services, assets and roadbed are dropped as it lands. */
const trim = (cell: CellData): CellData => ({
  ...cell,
  serviceLots: [],
  connectionPermits: new Map(),
  assets: [],
  ground: {
    curbs: cell.ground.curbs,
    roadbed: { type: 'FeatureCollection', features: [] },
    sidewalks: { type: 'FeatureCollection', features: [] },
    buildings: cell.ground.buildings,
  },
});

export interface PlanDeps {
  cellsUrl: string;
  cellIndex: () => Promise<CellIndex>;
}

export interface LoadedPlan {
  plan: StreetPlan;
  frame: LocalFrame;
  streets: StreetSegment[];
}

/** Null when no built cell reaches the spot or none of them loaded. */
export const loadPlan = async (
  lngLat: [number, number],
  region: Region,
  deps: PlanDeps,
): Promise<LoadedPlan | null> => {
  const frame = createFrame(lngLat);
  const index = await deps.cellIndex();
  const wanted = builtCellsAround(frame, [0, 0], REACH_M, index.cells);
  const cells: CellData[] = [];
  for (let start = 0; start < wanted.length; start += CELLS_AT_ONCE) {
    const batch = await Promise.allSettled(
      wanted
        .slice(start, start + CELLS_AT_ONCE)
        .map((cell) => fetchCell(deps.cellsUrl, cell, AbortSignal.timeout(CELL_TIMEOUT_MS))),
    );
    for (const result of batch) if (result.status === 'fulfilled') cells.push(trim(result.value));
  }
  if (!cells.length) return null;

  let curbs: FeatureCollection['features'] = [];
  let buildings: FeatureCollection['features'] = [];
  const records: StreetRecords = {
    permitGroups: [],
    streets: [],
    mains: [],
    serviceLots: [],
    spots: [],
    curbs: [],
  };
  for (const cell of cells) {
    records.permitGroups = mergeBy(
      records.permitGroups,
      cell.permitGroups,
      (g) => g.properties.key,
    );
    records.streets = mergeBy(records.streets, cell.streets, streetKey);
    records.mains = mergeBy(records.mains, cell.mains, (main) => main.id);
    records.spots = mergeBy(records.spots, cell.spots, (spot) => spot.lngLat.join(','));
    curbs = mergeBy(curbs, cell.ground.curbs.features, (f) => JSON.stringify(f.geometry));
    buildings = mergeBy(buildings, cell.ground.buildings.features, (f) =>
      JSON.stringify(f.geometry),
    );
  }
  records.curbs = curbsOf(frame, { type: 'FeatureCollection', features: curbs });

  // Synchronous from here: placement reads the city's depth standards from a shared slot.
  useDepthStandards(region.depths);
  const placed = placeStreet(frame, records);
  const toLocal = (ring: Position[]): Vec2[] => ring.map((point) => frame.toLocal(point));
  return {
    frame,
    streets: records.streets,
    plan: {
      lines: placed.runs.map((run) => ({
        utility: run.utility,
        path: run.path,
        assumed: Boolean(run.assumed),
        recycled: isRecycled(run.surveyed),
      })),
      streets: records.streets.flatMap((street) => street.geometry.coordinates.map(toLocal)),
      curbs: records.curbs,
      buildings: buildings.flatMap((feature) => outerRings(feature.geometry).map(toLocal)),
    },
  };
};

const distanceToLine = ([px, py]: Vec2, line: Vec2[]) => {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!;
    const [bx, by] = line[i]!;
    const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = lengthSq
      ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lengthSq))
      : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))));
  }
  return best;
};

/** How far a typed address's street may be from the spot and still be the street shown. */
const NEAR_STREET_M = 80;

/**
 * Whether the street a share link names runs near the spot, by the city's own street names. The
 * preview prints the typed address only then, so a crafted link can't put arbitrary words on an
 * image served from subsola.com.
 */
export const streetIsNear = (
  typedStreet: string,
  streets: StreetSegment[],
  frame: LocalFrame,
): boolean =>
  streets.some(
    (street) =>
      streetsAgree(typedStreet.toUpperCase(), street.permitName) &&
      street.geometry.coordinates.some(
        (line) =>
          distanceToLine(
            [0, 0],
            line.map((point) => frame.toLocal(point)),
          ) < NEAR_STREET_M,
      ),
  );

/** The street name nearest the spot, as the city files it, for when the typed one doesn't match. */
export const nearestStreetName = (streets: StreetSegment[], frame: LocalFrame): string | null => {
  let best: { name: string; distance: number } | null = null;
  for (const street of streets)
    for (const line of street.geometry.coordinates) {
      const distance = distanceToLine(
        [0, 0],
        line.map((point) => frame.toLocal(point)),
      );
      if (!best || distance < best.distance) best = { name: street.label, distance };
    }
  return best && best.distance < NEAR_STREET_M ? best.name : null;
};
