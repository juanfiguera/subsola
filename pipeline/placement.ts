import {
  boxOfCoordinates,
  gridCellBounds,
  gridCellOf,
  gridCellsInBox,
  type GridCell,
} from '../src/grid';
import type { Box } from './clip';

/** A row, or the piece of it inside, bound for one cell. */
export type Placement = [GridCell, unknown];

/** The whole row in every cell its shape touches. */
export const everyCell = (row: unknown, coordinates: unknown): Placement[] =>
  gridCellsInBox(boxOfCoordinates(coordinates)).map((cell) => [cell, row]);

/** The whole row in the one cell under the middle of its shape. */
export const middleCell = (row: unknown, coordinates: unknown): Placement[] => {
  const [west, south, east, north] = boxOfCoordinates(coordinates);
  return [[gridCellOf([(west + east) / 2, (south + north) / 2]), row]];
};

/** A piece of the shape in each cell it touches, as `clip` cuts it; cells left empty get none. */
export const piecesOf = <C>(
  coordinates: C,
  clip: (coordinates: C, box: Box) => unknown,
): Placement[] =>
  gridCellsInBox(boxOfCoordinates(coordinates)).flatMap((cell): Placement[] => {
    const piece = clip(coordinates, gridCellBounds(cell));
    return piece ? [[cell, piece]] : [];
  });
