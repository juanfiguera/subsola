import { describe, expect, it } from 'vitest';
import { findPicked, readSharedView, refFamily, sharedViewSearch, type SharedView } from './share';

describe('shared links', () => {
  const view: SharedView = {
    address: '33 Union Square West, New York, NY 10003',
    camera: { lngLat: [-73.9908412, 40.7355187], zoom: 3.304, tilt: 38, bearing: -29.04 },
    pick: { kind: 'item', family: 'water-service', lngLat: [-73.99081, 40.73551] },
    since: 2015,
  };

  it('round-trips the address, camera and picked feature', () => {
    const search = sharedViewSearch(view);
    expect(search).toBe(
      '?q=33%20Union%20Square%20West%2C%20New%20York%2C%20NY%2010003' +
        '&cam=40.7355187,-73.9908412,3.3,38,-29' +
        '&sel=water-service:40.73551,-73.99081' +
        '&since=2015',
    );
    const back = readSharedView(search);
    expect(back.address).toBe(view.address);
    expect(back.camera).toEqual({ ...view.camera, zoom: 3.3, bearing: -29 });
    expect(back.pick).toEqual(view.pick);
    expect(back.since).toBe(2015);
  });

  it('folds a spun bearing back into one turn', () => {
    const search = sharedViewSearch({ ...view, camera: { ...view.camera!, bearing: 765 } });
    expect(readSharedView(search).camera?.bearing).toBe(45);
  });

  it('reads utility and about cards', () => {
    expect(readSharedView('?q=x&sel=utility:gas').pick).toEqual({
      kind: 'utility',
      utility: 'gas',
    });
    expect(readSharedView('?sel=about').pick).toEqual({ kind: 'about' });
    expect(readSharedView('?sel=feedback').pick).toEqual({ kind: 'feedback' });
  });

  it('ignores what it cannot read instead of failing the load', () => {
    const view = readSharedView('?q=x&cam=40.7,-73.9,banana,38,0&sel=utility:lava');
    expect(view).toEqual({ address: 'x', camera: null, pick: null, since: null });
    expect(readSharedView('?since=15').since).toBeNull();
    expect(readSharedView('?since=').since).toBeNull();
    expect(readSharedView('?cam=140,-73.9,3,38,0').camera).toBeNull();
    expect(readSharedView('?sel=asset:40.7').pick).toBeNull();
    expect(readSharedView('?sel=Asset%3Cb%3E:40.7,-73.9').pick).toBeNull();
    expect(readSharedView('').address).toBeNull();
  });

  it('strips the load-order number from a ref', () => {
    expect(refFamily('asset-12')).toBe('asset');
    expect(refFamily('water-service-3')).toBe('water-service');
    expect(refFamily('junction-gas-0')).toBe('junction-gas');
  });

  it('picks the nearest feature of the same family within reach', () => {
    const candidates: [string, { center: [number, number] }][] = [
      ['asset-1', { center: [10, 0] }],
      ['asset-2', { center: [1, 0] }],
      ['permit-3', { center: [0, 0] }],
    ];
    expect(findPicked('asset', [0.5, 0], candidates)).toBe('asset-2');
    expect(findPicked('asset', [30, 0], candidates)).toBeNull();
    expect(findPicked('dig', [0, 0], candidates)).toBeNull();
  });
});
