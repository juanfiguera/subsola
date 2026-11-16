import { describe, expect, it } from 'vitest';
import { labelBox, placeFirstFit, stackOffsets } from './declutter';

describe('stackOffsets', () => {
  it('pushes crowded labels down to keep a minimum gap', () => {
    expect(stackOffsets([100, 104, 112], 22)).toEqual([0, 18, 32]);
  });

  it('leaves labels that already have room alone', () => {
    expect(stackOffsets([100, 140, 200], 22)).toEqual([0, 0, 0]);
  });
});

describe('placeFirstFit', () => {
  const at = (x: number, y: number, text: string) => labelBox(x, y, text);

  it('moves a colliding label to its next candidate spot', () => {
    const placed = placeFirstFit(
      [
        { text: 'Water, 3 ft 5 in', spots: [[100, 100]] },
        {
          text: 'Gas, 1 ft 6 in',
          spots: [
            [120, 108],
            [300, 108],
          ],
        },
      ],
      (label) => label.spots.map(([x, y]) => at(x!, y!, label.text)),
    );
    expect(placed.map((p) => p.choice)).toEqual([0, 1]);
  });

  it('drops a label with no clear spot, and respects reserved space', () => {
    const placed = placeFirstFit(
      [{ text: 'Sewer, 5 ft', spots: [[100, 100]] }],
      (label) => label.spots.map(([x, y]) => at(x!, y!, label.text)),
      [at(100, 100, '25-87 37th St')],
    );
    expect(placed).toEqual([]);
  });

  it('drops a repeat of the same tag nearby but keeps one far away', () => {
    const tags = [
      { text: 'Electric, depth unknown', x: 100, y: 100 },
      { text: 'Electric, depth unknown', x: 100, y: 200 },
      { text: 'Water, 3 ft 5 in', x: 100, y: 300 },
      { text: 'Electric, depth unknown', x: 900, y: 100 },
    ];
    const placed = placeFirstFit(tags, (tag) => [at(tag.x, tag.y, tag.text)], [], {
      keyOf: (tag) => tag.text,
      gap: 400,
    });
    expect(placed.map(({ item }) => [item.text, item.x, item.y])).toEqual([
      ['Electric, depth unknown', 100, 100],
      ['Water, 3 ft 5 in', 100, 300],
      ['Electric, depth unknown', 900, 100],
    ]);
  });

  it('skips spots that are off screen', () => {
    expect(placeFirstFit([1], () => [null, at(0, 0, 'x')])[0]?.choice).toBe(1);
  });
});
