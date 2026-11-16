import type { Position } from 'geojson';
import { createFrame, distance2, type LocalFrame, type Vec2 } from './scene/local';

/**
 * The citywide build cuts NYC into square cells of this size on one fixed grid, so a cell means
 * the same ground whichever address the app was opened at.
 */
export const GRID_CELL_M = 250;

// Near the middle of the five boroughs; the grid is flat meters east and north of here.
const GRID_FRAME = createFrame([-73.95, 40.7]);

export interface GridCell {
  key: string;
  i: number;
  j: number;
}

export const gridCell = (i: number, j: number): GridCell => ({ key: `${i}_${j}`, i, j });

export const gridCellOf = (lngLat: Position): GridCell => {
  const [x, y] = GRID_FRAME.toLocal(lngLat);
  return gridCell(Math.floor(x / GRID_CELL_M), Math.floor(y / GRID_CELL_M));
};

/** [west, south, east, north] in degrees. */
export const gridCellBounds = ({ i, j }: GridCell): [number, number, number, number] => {
  const [west, south] = GRID_FRAME.toLngLat([i * GRID_CELL_M, j * GRID_CELL_M]);
  const [east, north] = GRID_FRAME.toLngLat([(i + 1) * GRID_CELL_M, (j + 1) * GRID_CELL_M]);
  return [west!, south!, east!, north!];
};

/** Every cell a box in degrees touches. */
export const gridCellsInBox = ([west, south, east, north]: [
  number,
  number,
  number,
  number,
]): GridCell[] => {
  const low = gridCellOf([west, south]);
  const high = gridCellOf([east, north]);
  const cells: GridCell[] = [];
  for (let i = low.i; i <= high.i; i++)
    for (let j = low.j; j <= high.j; j++) cells.push(gridCell(i, j));
  return cells;
};

/** The box around any GeoJSON coordinates, however deeply nested. */
export const boxOfCoordinates = (coordinates: unknown): [number, number, number, number] => {
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number') {
      const [lng, lat] = value as number[];
      box[0] = Math.min(box[0], lng!);
      box[1] = Math.min(box[1], lat!);
      box[2] = Math.max(box[2], lng!);
      box[3] = Math.max(box[3], lat!);
      return;
    }
    for (const item of value) visit(item);
  };
  visit(coordinates);
  return box;
};

/** Built cells (keys of the build's index) within `reachM` of a point in a local frame, nearest first. */
export const builtCellsAround = (
  frame: LocalFrame,
  [x, y]: Vec2,
  reachM: number,
  built: Record<string, number>,
): GridCell[] => {
  const [west, south] = frame.toLngLat([x - reachM, y - reachM]);
  const [east, north] = frame.toLngLat([x + reachM, y + reachM]);
  const distanceTo = (cell: GridCell) => {
    const [cellWest, cellSouth, cellEast, cellNorth] = gridCellBounds(cell);
    return distance2(frame.toLocal([(cellWest + cellEast) / 2, (cellSouth + cellNorth) / 2]), [
      x,
      y,
    ]);
  };
  return gridCellsInBox([west!, south!, east!, north!])
    .filter((cell) => cell.key in built)
    .sort((a, b) => distanceTo(a) - distanceTo(b));
};
