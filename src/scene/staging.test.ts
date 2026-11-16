import { describe, expect, it } from 'vitest';
import { HEAVY_DATA, stageLayers, type StageableLayer } from './staging';

interface FakeLayer extends StageableLayer {
  version: number;
}

const layer = (id: string, data: unknown[], version = 0): FakeLayer => ({
  id,
  props: { data },
  version,
  clone() {
    return { ...this, version: this.version + 100 };
  },
});

const same = (a: unknown, b: unknown) => a === b;
const ids = (layers: StageableLayer[]) => layers.map((l) => l.id);

describe('stageLayers', () => {
  it('takes on a few new layers a frame, in order, and asks for another frame', () => {
    const wanted = ['a', 'b', 'c', 'd', 'e'].map((id) => layer(id, [1]));
    const first = stageLayers(wanted, new Map(), same, 2);
    expect(ids(first.layers)).toEqual(['a', 'b']);
    expect(first.deferred).toBe(true);
    const second = stageLayers(wanted, first.committed, same, 2);
    expect(ids(second.layers)).toEqual(['a', 'b', 'c', 'd']);
    const third = stageLayers(wanted, second.committed, same, 2);
    expect(ids(third.layers)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(third.deferred).toBe(false);
  });

  it('lets empty layers wait without spending a turn', () => {
    const staged = stageLayers([layer('empty', []), layer('a', [1])], new Map(), same, 1);
    expect(ids(staged.layers)).toEqual(['a']);
    expect(staged.deferred).toBe(false);
  });

  it('keeps a layer on once it has been, even when it empties', () => {
    const first = stageLayers([layer('a', [1])], new Map(), same, 1);
    const second = stageLayers([layer('a', [])], first.committed, same, 0);
    expect(ids(second.layers)).toEqual(['a']);
  });

  it('spreads big data changes over frames, drawing the old data meanwhile', () => {
    const big = Array.from({ length: HEAVY_DATA }, (_, i) => i);
    const before = [layer('a', [1]), layer('b', [2])];
    const committed = stageLayers(before, new Map(), same, 2).committed;
    const after = [layer('a', big, 1), layer('b', [...big], 1)];
    const staged = stageLayers(after, committed, same, 1);
    expect(staged.deferred).toBe(true);
    expect((staged.layers[0] as FakeLayer).version).toBe(1);
    // b is drawn with its old data, as a fresh instance.
    expect(staged.layers[1]!.props.data).toEqual([2]);
    expect((staged.layers[1] as FakeLayer).version).toBe(100);
  });

  it('lets the layers that matter most go first, still drawn in list order', () => {
    const wanted = [layer('roads', [1]), layer('buildings', [1]), layer('tubes', [1])];
    const staged = stageLayers(wanted, new Map(), same, 1, (id) => (id === 'tubes' ? 0 : 1));
    expect(ids(staged.layers)).toEqual(['tubes']);
    const next = stageLayers(wanted, staged.committed, same, 1, (id) => (id === 'tubes' ? 0 : 1));
    expect(ids(next.layers)).toEqual(['roads', 'tubes']);
  });

  it('passes small changes straight through', () => {
    const committed = stageLayers([layer('a', [1])], new Map(), same, 1).committed;
    const staged = stageLayers([layer('a', [1, 2], 1)], committed, same, 0);
    expect((staged.layers[0] as FakeLayer).version).toBe(1);
    expect(staged.deferred).toBe(false);
  });
});
