import type { Vec2 } from './scene/local';

/**
 * The street view loads the city in square cells of this size, in meters around the searched
 * address, as the camera reaches them.
 */
export const CELL_M = 250;
/** From a cell's center to its corners: a circle this big around the center covers the cell. */
export const CELL_REACH_M = (CELL_M / 2) * Math.SQRT2;

export interface Cell {
  key: string;
  center: Vec2;
  /** [west, south, east, north] in local meters. */
  bounds: [number, number, number, number];
}

export const cellAt = (i: number, j: number): Cell => ({
  key: `${i},${j}`,
  center: [i * CELL_M, j * CELL_M],
  bounds: [(i - 0.5) * CELL_M, (j - 0.5) * CELL_M, (i + 0.5) * CELL_M, (j + 0.5) * CELL_M],
});

/** The cells within `reachM` of a point (any part of them), nearest first. */
export const cellsAround = ([x, y]: Vec2, reachM: number): Cell[] => {
  const span = Math.ceil(reachM / CELL_M) + 1;
  const [ci, cj] = [Math.round(x / CELL_M), Math.round(y / CELL_M)];
  const cells: { cell: Cell; distance: number }[] = [];
  for (let i = ci - span; i <= ci + span; i++) {
    for (let j = cj - span; j <= cj + span; j++) {
      const cell = cellAt(i, j);
      const [west, south, east, north] = cell.bounds;
      // From the point to the nearest part of the cell.
      const dx = Math.max(west - x, 0, x - east);
      const dy = Math.max(south - y, 0, y - north);
      const distance = Math.hypot(dx, dy);
      if (distance <= reachM) cells.push({ cell, distance });
    }
  }
  return cells
    .sort((a, b) => a.distance - b.distance || a.cell.key.localeCompare(b.cell.key))
    .map(({ cell }) => cell);
};

/** `existing` plus whichever of `incoming` it doesn't already have, by `keyOf`. */
export const mergeBy = <T>(existing: T[], incoming: T[], keyOf: (item: T) => string): T[] => {
  const seen = new Set(existing.map(keyOf));
  const added = incoming.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return added.length ? [...existing, ...added] : existing;
};
