export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const centerDistance = (a: Box, b: Box) =>
  Math.hypot((a.x0 + a.x1 - b.x0 - b.x1) / 2, (a.y0 + a.y1 - b.y0 - b.y1) / 2);

/** Items with the same key keep at least `gap` pixels between centers, so a tag isn't repeated. */
export interface Spacing<T> {
  keyOf: (item: T) => string;
  gap: number;
}

/**
 * Places items in priority order. Each item offers candidate boxes, best first; it takes the
 * first one clear of everything already placed, or is dropped if none are (or all are off
 * screen, given as null). `reserved` boxes are space already taken.
 */
export const placeFirstFit = <T>(
  items: T[],
  boxesOf: (item: T) => (Box | null)[],
  reserved: Box[] = [],
  spacing?: Spacing<T>,
): { item: T; choice: number }[] => {
  const placed = [...reserved];
  const placedByKey = new Map<string, Box[]>();
  const result: { item: T; choice: number }[] = [];
  for (const item of items) {
    const key = spacing?.keyOf(item);
    const sameKey = key === undefined ? [] : (placedByKey.get(key) ?? []);
    const boxes = boxesOf(item);
    const choice = boxes.findIndex(
      (box) =>
        box &&
        !placed.some((other) => overlaps(box, other)) &&
        sameKey.every((other) => centerDistance(box, other) >= spacing!.gap),
    );
    if (choice < 0) continue;
    placed.push(boxes[choice]!);
    if (key !== undefined) placedByKey.set(key, [...sameKey, boxes[choice]!]);
    result.push({ item, choice });
  }
  return result;
};

/**
 * Vertical nudges for a column of labels so each sits at least `gap` pixels below the one above.
 * `ys` are the screen positions the labels want, top to bottom; the result lines up with them.
 */
export const stackOffsets = (ys: number[], gap: number): number[] => {
  let floor = -Infinity;
  return ys.map((y) => {
    const placed = Math.max(y, floor);
    floor = placed + gap;
    return placed - y;
  });
};

/** Rough box for a 12 px bold Barlow label, enough to tell whether two labels collide. */
export const labelBox = (x: number, bottom: number, text: string): Box => {
  const width = text.length * 6.6 + 14;
  return { x0: x - width / 2, x1: x + width / 2, y0: bottom - 20, y1: bottom };
};
