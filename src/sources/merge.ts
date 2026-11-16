import type { StreetSegment } from './streets';
import type { AssetFeature } from './assets';
import { mergeSignals } from './signals';
import { mergeBy } from '../tiles';

/** A street piece is the same piece whichever cell or load brought it. */
export const streetKey = (street: StreetSegment) =>
  `${street.permitName}|${JSON.stringify(street.geometry.coordinates)}`;

const assetKey = (asset: AssetFeature) =>
  `${asset.properties.kind}|${asset.geometry.coordinates.map((c) => c.toFixed(6)).join(',')}`;

const isSignal = (asset: AssetFeature) => asset.properties.kind === 'traffic-signal';

/** Assets kept once each; a signal's points from DOT and OpenStreetMap become one intersection. */
export const mergeAssets = (existing: AssetFeature[], incoming: AssetFeature[]) => [
  ...mergeBy(
    existing.filter((asset) => !isSignal(asset)),
    incoming.filter((asset) => !isSignal(asset)),
    assetKey,
  ),
  ...mergeSignals(existing.filter(isSignal), incoming.filter(isSignal)),
];
