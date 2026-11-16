/**
 * Hands deck.gl the scene's layers a few at a time. A layer's first draw compiles its shaders
 * and fills its buffers, and a street's first full draw did that for some forty layers in one
 * frame: one main-thread task of half a second to over a second on a phone, during which taps
 * and scrolls waited. Staged, each frame takes on at most a few new layers (or a few big data
 * changes) and the browser gets a turn between frames.
 *
 * Layers whose data is still empty wait without costing a turn: there's nothing to draw, and
 * compiling them early only adds to the first frame. Once on the map a layer stays, so a layer
 * that empties out for a moment isn't torn down and rebuilt.
 */

export interface StageableLayer {
  id: string;
  props: { data?: unknown };
  /** A new instance with the same props, as deck.gl layers make; see `stageLayers`. */
  clone: (props: object) => unknown;
}

export interface Staged<L> {
  layers: L[];
  /** Layers this frame held back, or kept at their previous data; compose again next frame. */
  deferred: boolean;
  committed: Map<string, L>;
}

/**
 * What a frame may take on, in turns. A new layer costs a turn for its shaders, plus one for each
 * `HEAVY_DATA` items it fills buffers for; a data change that big costs the same. Two turns kept
 * each frame near 30 ms on a laptop and under 200 ms on a 4x-slowed phone profile, and a frame
 * always takes at least one thing, however big, so the scene never stalls.
 */
export const HEAVY_DATA = 2000;
export const TURNS_PER_FRAME = 2;

const lengthOf = (data: unknown) => (Array.isArray(data) ? data.length : 0);
const costOf = (data: unknown) => 1 + Math.floor(lengthOf(data) / HEAVY_DATA);

export const stageLayers = <L extends StageableLayer>(
  next: L[],
  committed: Map<string, L>,
  sameData: (next: unknown, previous: unknown) => boolean,
  turns = TURNS_PER_FRAME,
  // Lower goes first: the layers worth seeing soonest (the pipes) claim a frame's turns before
  // the ground under them. Layers are still drawn in their list order.
  priorityOf: (id: string) => number = () => 0,
): Staged<L> => {
  let left = turns;
  let taken = 0;
  let deferred = false;
  /** Spends the turns `data` costs, if this frame has them left. */
  const afford = (data: unknown) => {
    const cost = costOf(data);
    if (taken > 0 && cost > left) return false;
    left -= cost;
    taken += 1;
    return true;
  };
  const chosen = new Map<L, L>();
  const byPriority = next
    .map((layer, index) => ({ layer, index, priority: priorityOf(layer.id) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index);
  for (const { layer } of byPriority) {
    const previous = committed.get(layer.id);
    if (!previous) {
      if (Array.isArray(layer.props.data) && layer.props.data.length === 0) continue;
      if (afford(layer.props.data)) chosen.set(layer, layer);
      else deferred = true;
      continue;
    }
    const changed = !sameData(layer.props.data, previous.props.data);
    if (!changed || lengthOf(layer.props.data) < HEAVY_DATA || afford(layer.props.data)) {
      chosen.set(layer, layer);
      continue;
    }
    // Drawn as it was for one more frame; its new data waits for a turn. A fresh instance,
    // since deck.gl expects a new layer object each time it's handed the list.
    chosen.set(layer, previous.clone({}) as L);
    deferred = true;
  }
  const layers = next.flatMap((layer) => {
    const taken = chosen.get(layer);
    return taken ? [taken] : [];
  });
  return { layers, deferred, committed: new Map(layers.map((layer) => [layer.id, layer])) };
};
