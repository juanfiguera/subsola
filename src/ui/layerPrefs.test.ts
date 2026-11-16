import { describe, expect, it } from 'vitest';
import { DEFAULT_OFF, hiddenLayers, parseLayerChoices, withChoice } from './layerPrefs';

describe('layer defaults', () => {
  it('opens on the pipes: utilities, services and active work on, street features off', () => {
    const hidden = hiddenLayers({});
    for (const on of ['water', 'sewer', 'gas', 'electric', 'telecom', 'steam', 'work', 'services'])
      expect(hidden.has(on as never)).toBe(false);
    for (const off of ['hydrant', 'catch-basin', 'manhole', 'street-lamp', 'traffic-signal'])
      expect(hidden.has(off as never)).toBe(true);
    expect(hidden.has('linknyc')).toBe(true);
    expect(hidden.has('electric-structure')).toBe(true);
    expect(hidden.has('dig-spots')).toBe(true);
  });

  it('lays choices over the defaults', () => {
    const hidden = hiddenLayers({ hydrant: true, gas: false });
    expect(hidden.has('hydrant')).toBe(false);
    expect(hidden.has('gas')).toBe(true);
    expect(hidden.has('street-lamp')).toBe(true);
  });
});

describe('withChoice', () => {
  it('records a switch flipped away from its default', () => {
    expect(withChoice({}, 'hydrant', true)).toEqual({ hydrant: true });
    expect(withChoice({}, 'water', false)).toEqual({ water: false });
  });

  it('forgets a switch flipped back, so it follows the defaults again', () => {
    expect(withChoice({ hydrant: true }, 'hydrant', false)).toEqual({});
    expect(withChoice({ water: false }, 'water', true)).toEqual({});
  });

  it('leaves the choices it was given alone', () => {
    const before = { hydrant: true };
    withChoice(before, 'manhole', true);
    expect(before).toEqual({ hydrant: true });
  });
});

describe('parseLayerChoices', () => {
  it('reads what was saved', () => {
    expect(parseLayerChoices('{"hydrant":true,"gas":false}')).toEqual({
      hydrant: true,
      gas: false,
    });
  });

  it('drops layers this version does not know', () => {
    expect(parseLayerChoices('{"hydrant":true,"trees":true}')).toEqual({ hydrant: true });
  });

  it('treats anything unreadable as no choices', () => {
    expect(parseLayerChoices(null)).toEqual({});
    expect(parseLayerChoices('not json')).toEqual({});
    expect(parseLayerChoices('["hydrant"]')).toEqual({});
    expect(parseLayerChoices('{"hydrant":"yes"}')).toEqual({});
  });

  it('keeps every default-off layer a known key', () => {
    const saved = Object.fromEntries([...DEFAULT_OFF].map((key) => [key, true]));
    expect(parseLayerChoices(JSON.stringify(saved))).toEqual(saved);
  });
});
