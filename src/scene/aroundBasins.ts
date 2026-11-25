import type { AssetLink } from './assetLinks';
import type { PipeRun } from './build';
import { BASIN_CHAMBER_M } from './fixtures';
import type { Vec2 } from './local';
import { FEET_TO_METERS } from '../depth';
import { radiusOf } from './tubes';

/** A catch basin's chamber, as fixtures.ts draws it: from the grate down to its lead's depth. */
export interface Chamber {
  position: Vec2;
  /** Radians; the chamber's first side runs this way, toward the main its lead joins. */
  heading: number;
  bottomFt: number;
}

const CLEARANCE_M = 0.15;

export const chambersOf = (links: AssetLink[]): Chamber[] =>
  links
    .filter((link) => link.kind === 'catch-basin')
    .map((link) => ({
      position: link.from,
      heading: Math.atan2(link.to[1] - link.from[1], link.to[0] - link.from[0]),
      bottomFt: link.depthFt,
    }));

/**
 * The path stepped around one chamber, or the same path when it already clears it. Where the
 * line would cross the chamber (grown by the pipe's radius and a little room), it runs along the
 * chamber's walls instead, the shorter way round, with an elbow at each corner, the way crews
 * offset a line around a structure. A run's end inside the chamber moves straight out to the
 * nearest wall, which depends only on where the end is, so two runs that meet at a corner basin
 * move their shared end to the same place and stay joined.
 */
export const stepAround = (
  path: Vec2[],
  chamber: Chamber,
  halfX: number,
  halfY: number,
): Vec2[] => {
  if (path.length < 2) return path;
  const [cos, sin] = [Math.cos(chamber.heading), Math.sin(chamber.heading)];
  const [cx, cy] = chamber.position;
  const toLocal = ([x, y]: Vec2): Vec2 => [
    (x - cx) * cos + (y - cy) * sin,
    -(x - cx) * sin + (y - cy) * cos,
  ];
  const toWorld = ([x, y]: Vec2): Vec2 => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  const inside = ([x, y]: Vec2) => Math.abs(x) < halfX && Math.abs(y) < halfY;
  const toWall = (point: Vec2): Vec2 => {
    const [x, y] = point;
    if (!inside(point)) return point;
    // Straight out from the middle; dead center has no way out of its own, so it goes +x.
    const scale = Math.max(Math.abs(x) / halfX, Math.abs(y) / halfY);
    return scale ? [x / scale, y / scale] : [halfX, 0];
  };
  // Distance counterclockwise round the walls from the corner at (halfX, -halfY).
  const perimeter = 4 * (halfX + halfY);
  const aroundAt = ([x, y]: Vec2) => {
    if (Math.abs(x - halfX) < 1e-9) return y + halfY;
    if (Math.abs(y - halfY) < 1e-9) return 2 * halfY + (halfX - x);
    if (Math.abs(x + halfX) < 1e-9) return 2 * halfY + 2 * halfX + (halfY - y);
    return 4 * halfY + 2 * halfX + (x + halfX);
  };
  const corners: [number, Vec2][] = [
    [2 * halfY, [halfX, halfY]],
    [2 * halfY + 2 * halfX, [-halfX, halfY]],
    [4 * halfY + 2 * halfX, [-halfX, -halfY]],
    [perimeter, [halfX, -halfY]],
  ];
  const wrap = (s: number) => ((s % perimeter) + perimeter) % perimeter;
  const local = path.map(toLocal);
  let changed = false;
  const out: Vec2[] = [];
  for (let i = 0; i < local.length; i++) {
    const a = local[i]!;
    const moved = toWall(a);
    if (moved !== a) changed = true;
    out.push(moved);
    const b = local[i + 1];
    if (!b) continue;
    // The part of the segment inside the chamber (Liang-Barsky clipping), as t in [0, 1].
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    let [t0, t1] = [0, 1];
    for (const [p, q] of [
      [-dx, a[0] + halfX],
      [dx, halfX - a[0]],
      [-dy, a[1] + halfY],
      [dy, halfY - a[1]],
    ] as const) {
      if (Math.abs(p) < 1e-12) {
        if (q <= 0) t0 = Infinity;
        continue;
      }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (t0 >= t1) continue;
    changed = true;
    const enter = toWall([a[0] + dx * t0, a[1] + dy * t0]);
    const leave = toWall([a[0] + dx * t1, a[1] + dy * t1]);
    const from = aroundAt(enter);
    const forward = wrap(aroundAt(leave) - from);
    const counterclockwise = forward <= perimeter / 2;
    const span = counterclockwise ? forward : perimeter - forward;
    const passed = corners
      .map(([s, corner]) => ({
        corner,
        along: counterclockwise ? wrap(s - from) : wrap(from - s),
      }))
      .filter(({ along }) => along > 1e-9 && along < span - 1e-9)
      .sort((p, q) => p.along - q.along)
      .map(({ corner }) => corner);
    // A segment end inside the chamber is already on the wall, pushed out above or below.
    // Coming in from outside, the line leaves its course as far before the chamber as the first
    // corner sits to its side, so it cuts across at about 45 degrees instead of turning square
    // twice within a few feet; the same on the way out.
    const length = Math.hypot(dx, dy);
    const aside = (corner: Vec2 | undefined) =>
      corner ? Math.abs((corner[0] - a[0]) * dy - (corner[1] - a[1]) * dx) / length : 0;
    const offCourse = (t: number, back: number): Vec2[] => {
      const shifted = t + back / length;
      if (shifted <= 0 || shifted >= 1) return [];
      return [[a[0] + dx * shifted, a[1] + dy * shifted]];
    };
    const inbound = t0 > 0 ? (passed.length ? offCourse(t0, -aside(passed[0])) : [enter]) : [];
    const outbound = t1 < 1 ? (passed.length ? offCourse(t1, aside(passed.at(-1))) : [leave]) : [];
    out.push(...inbound, ...passed, ...outbound);
  }
  return changed ? out.map(toWorld) : path;
};

/**
 * Lines placed from permits sit at a standard offset and depth, so one can land on a catch basin
 * the city mapped, and was drawn straight through its chamber. The estimate gives way: it steps
 * around the chamber at the same depth. Surveyed lines keep their mapped route, and sewers are
 * left alone, since basins drain into them. Only the drawing moves, like `clearOfSlab`.
 */
export const aroundBasins = (runs: PipeRun[], chambers: Chamber[], stretch: number): PipeRun[] => {
  if (!chambers.length) return runs;
  const metersPerFoot = FEET_TO_METERS * stretch;
  return runs.map((run) => {
    if (run.surveyed || run.utility === 'sewer') return run;
    const radius = radiusOf(run);
    const room = radius + CLEARANCE_M;
    let path = run.path;
    for (const chamber of chambers) {
      // A pipe whose top sits below the chamber floor passes under it.
      if (run.depthFt * metersPerFoot - radius >= chamber.bottomFt * metersPerFoot) continue;
      path = stepAround(
        path,
        chamber,
        BASIN_CHAMBER_M[0] / 2 + room,
        BASIN_CHAMBER_M[1] / 2 + room,
      );
    }
    return path === run.path ? run : { ...run, path };
  });
};
