import { describe, expect, it } from 'vitest';
import { aroundBasins, stepAround, type Chamber } from './aroundBasins';
import type { PipeRun } from './build';
import type { Vec2 } from './local';

const STRETCH = 6;
const steamRun = (path: Vec2[], depthFt = 4.5): PipeRun => ({
  ref: 'permit-0',
  utility: 'steam',
  path,
  depthFt,
  digSpots: 0,
});
const basinAt = (position: Vec2, bottomFt = 6): Chamber => ({ position, heading: 0, bottomFt });
const straight: Vec2[] = [
  [-10, 0],
  [10, 0],
];
const crossesBox = (path: Vec2[], [cx, cy]: Vec2, halfX: number, halfY: number) =>
  path.slice(1).some((b, i) => {
    const a = path[i]!;
    for (let k = 1; k < 50; k++) {
      const [x, y] = [a[0] + ((b[0] - a[0]) * k) / 50, a[1] + ((b[1] - a[1]) * k) / 50];
      if (Math.abs(x - cx) < halfX - 1e-6 && Math.abs(y - cy) < halfY - 1e-6) return true;
    }
    return false;
  });

describe('stepAround', () => {
  it('runs along the walls of a chamber it would cross, then back on its line', () => {
    const stepped = stepAround(straight, basinAt([0, 0.3]), 1, 1);
    expect(crossesBox(stepped, [0, 0.3], 1, 1)).toBe(false);
    expect(stepped[0]).toEqual([-10, 0]);
    expect(stepped.at(-1)).toEqual([10, 0]);
    // The shorter way round is below a chamber set just above the line: across at 45 degrees
    // to its two lower corners and back.
    expect(stepped.slice(1, -1)).toEqual(
      [
        [-1.7, 0],
        [-1, -0.7],
        [1, -0.7],
        [1.7, 0],
      ].map(([x, y]) => [expect.closeTo(x!, 9), expect.closeTo(y!, 9)]),
    );
  });

  it('turns with the chamber', () => {
    const turned: Chamber = { position: [0, 0], heading: Math.PI / 4, bottomFt: 6 };
    const stepped = stepAround(straight, turned, 0.5, 0.8);
    const local = stepped.map(([x, y]): Vec2 => [
      x * Math.cos(-Math.PI / 4) - y * Math.sin(-Math.PI / 4),
      x * Math.sin(-Math.PI / 4) + y * Math.cos(-Math.PI / 4),
    ]);
    expect(crossesBox(local, [0, 0], 0.5, 0.8)).toBe(false);
  });

  it('leaves a line that already clears the chamber', () => {
    expect(stepAround(straight, basinAt([0, 3]), 1, 1)).toBe(straight);
  });

  it('moves a shared end the same way for both runs, so a corner stays joined', () => {
    const corner: Vec2 = [0, 0];
    const chamber = basinAt([0.4, 0.2]);
    const along = stepAround([[-10, 0], corner], chamber, 1, 1);
    const across = stepAround([corner, [0, 10]], chamber, 1, 1);
    expect(along.at(-1)).toEqual(across[0]);
    expect(crossesBox(along, [0.4, 0.2], 1, 1)).toBe(false);
    expect(crossesBox(across, [0.4, 0.2], 1, 1)).toBe(false);
  });
});

describe('aroundBasins', () => {
  it('steps an estimated steam line clear of a basin chamber', () => {
    const [run] = aroundBasins([steamRun(straight)], [basinAt([0, 0.2])], STRETCH);
    expect(crossesBox(run!.path, [0, 0.2], 0.45, 0.6)).toBe(false);
  });

  it('lets a line pass under a chamber that ends above it', () => {
    const run = steamRun(straight, 9);
    expect(aroundBasins([run], [basinAt([0, 0.2], 4)], STRETCH)[0]).toBe(run);
  });

  it('keeps surveyed routes and sewers where they are', () => {
    const sewer = { ...steamRun(straight), utility: 'sewer' as const };
    const surveyed = {
      ...steamRun(straight),
      surveyed: { source: 'sfSewerMains' } as PipeRun['surveyed'],
    };
    const runs = aroundBasins([sewer, surveyed], [basinAt([0, 0.2])], STRETCH);
    expect(runs[0]).toBe(sewer);
    expect(runs[1]).toBe(surveyed);
  });
});
