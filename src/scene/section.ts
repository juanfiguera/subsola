import type { Vec2 } from './local';

/**
 * A vertical slice through the scene, like an engineering section drawing. Seen side-on, every
 * street behind the one you are looking at stacks onto it; the slice keeps only what is within
 * `halfWidth` meters of the cut, measured along the line of sight.
 */
export interface Section {
  center: Vec2;
  /** Unit vector on the ground pointing along the line of sight. */
  depth: Vec2;
  halfWidth: number;
}

const along = (point: Vec2, section: Section) =>
  (point[0] - section.center[0]) * section.depth[0] +
  (point[1] - section.center[1]) * section.depth[1];

export const inSection = (point: Vec2, section: Section) =>
  Math.abs(along(point, section)) <= section.halfWidth;

/** True when any part of the shape lies in the slice, including a line that passes through it. */
export const crossesSection = (points: Vec2[], section: Section) => {
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    const distance = along(point, section);
    low = Math.min(low, distance);
    high = Math.max(high, distance);
  }
  return high >= -section.halfWidth && low <= section.halfWidth;
};

/**
 * Where a line heading into the screen passes through the cut, which is where it shows on
 * screen as a ring. Null for a line running across the view, which shows along its length.
 */
export const crossingOf = (path: Vec2[], section: Section): Vec2 | null => {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const [from, to] = [along(a, section), along(b, section)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Mostly across the view: no single crossing point worth pinning a tag to.
    if (!length || Math.abs(to - from) < length * 0.5) continue;
    if ((from > 0 && to > 0) || (from < 0 && to < 0)) continue;
    const t = from / (from - to);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  return null;
};

/** Cuts a polygon ring down to the part inside the slice, so a crossing road ends at the cut. */
export const clipToSection = (ring: Vec2[], section: Section): Vec2[] => {
  const clipSide = (points: Vec2[], sign: 1 | -1): Vec2[] => {
    // Inside means at most halfWidth from the center on this side.
    const offset = (p: Vec2) => section.halfWidth - sign * along(p, section);
    const result: Vec2[] = [];
    points.forEach((current, i) => {
      const previous = points[(i + points.length - 1) % points.length]!;
      const [from, to] = [offset(previous), offset(current)];
      if (from >= 0 !== to >= 0) {
        const t = from / (from - to);
        result.push([
          previous[0] + (current[0] - previous[0]) * t,
          previous[1] + (current[1] - previous[1]) * t,
        ]);
      }
      if (to >= 0) result.push(current);
    });
    return result;
  };
  return clipSide(clipSide(ring, 1), -1);
};
