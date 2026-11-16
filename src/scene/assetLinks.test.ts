import { describe, expect, it } from 'vitest';
import type { PipeRun, ScenePoint } from './build';
import { linkAssets } from './assetLinks';

const main = (utility: PipeRun['utility'], y: number, depthFt: number): PipeRun => ({
  ref: `permit-${utility}`,
  utility,
  path: [
    [-50, y],
    [50, y],
  ],
  depthFt,
  digSpots: 0,
});

const point = (
  kind: ScenePoint['kind'],
  utility: ScenePoint['utility'],
  position: [number, number],
): ScenePoint => ({ ref: `asset-${kind}`, kind, utility, position });

const runs = [main('sewer', 0, 5), main('water', 2, 3.4), main('electric', -2, 0.5)];

describe('linkAssets', () => {
  it('runs a catch basin to the sewer, not the nearer water main', () => {
    const [link] = linkAssets([point('catch-basin', 'sewer', [10, 6])], runs);
    expect(link?.utility).toBe('sewer');
    expect(link?.to).toEqual([10, 0]);
    expect(link?.depthFt).toBe(5);
  });

  it('leaves a basin in a storm sewer area unconnected, since its storm line is not drawn', () => {
    const basin = { ...point('catch-basin', 'sewer', [10, 6]), stormSewer: true as const };
    expect(linkAssets([basin], runs)).toEqual([]);
  });

  it('puts the hydrant gate valve 1 ft from the water main', () => {
    const [link] = linkAssets([point('hydrant', 'water', [10, 6])], runs);
    expect(link?.to).toEqual([10, 2]);
    expect(link?.valve?.[1]).toBeCloseTo(2 + 0.3048);
  });

  it('follows a manhole tag to its own utility, and skips untagged ones', () => {
    const links = linkAssets(
      [point('manhole', 'electric', [10, 6]), point('manhole', null, [12, 6])],
      runs,
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.to).toEqual([10, -2]);
  });

  it('drains a San Diego inlet only to a storm drain, and feeds no hydrant recycled water', () => {
    const mapped = (use: string, y: number): PipeRun => ({
      ...main(use === 'storm' ? 'sewer' : 'water', y, 4),
      ref: `main-${use}`,
      surveyed: {
        id: use,
        utility: use === 'storm' ? 'sewer' : 'water',
        depthFt: null,
        use,
        address: null,
        source: use === 'storm' ? 'sdStormDrains' : 'sdRecycledMains',
        diameterIn: null,
        material: null,
        installedYear: null,
        line: { type: 'MultiLineString', coordinates: [] },
      },
    });
    const sanDiego = [main('sewer', 5, 8), mapped('storm', -10), mapped('recycled', 7), runs[1]!];
    const inlet = { ...point('catch-basin', 'sewer', [10, 6]), stormOnly: true as const };
    const [drain] = linkAssets([inlet], sanDiego);
    expect(drain?.to).toEqual([10, -10]);
    const [branch] = linkAssets([point('hydrant', 'water', [10, 6])], sanDiego);
    expect(branch?.to).toEqual([10, 2]);
    // Elsewhere a basin takes whichever sewer is nearest, storm or not.
    const [basin] = linkAssets([point('catch-basin', 'sewer', [10, -9])], sanDiego);
    expect(basin?.to).toEqual([10, -10]);
  });

  it('sits a Los Angeles storm drain maintenance hole on a storm drain, not the nearer sewer', () => {
    const storm: PipeRun = {
      ...main('sewer', -10, 9),
      ref: 'main-storm',
      surveyed: {
        id: 'la-storm-1',
        utility: 'sewer',
        depthFt: 9,
        use: 'storm',
        address: null,
        source: 'laStormDrains',
        diameterIn: 36,
        material: null,
        installedYear: null,
        line: { type: 'MultiLineString', coordinates: [] },
      },
    };
    const hole = { ...point('manhole', 'sewer', [10, 1]), stormOnly: true as const };
    const [link] = linkAssets([hole], [...runs, storm]);
    expect(link?.to).toEqual([10, -10]);
    // A sanitary maintenance hole still takes the sewer.
    const [sanitary] = linkAssets([point('manhole', 'sewer', [10, 1])], [...runs, storm]);
    expect(sanitary?.to).toEqual([10, 0]);
  });

  it('skips fixtures with no main of their utility nearby', () => {
    expect(linkAssets([point('catch-basin', 'sewer', [10, 60])], runs)).toEqual([]);
  });
});
