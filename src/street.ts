import type { Feature, Geometry, Position } from 'geojson';
import type { GeocodedAddress } from './sources/geocode';
import type { PermitGroupProperties } from './sources/permits';
import type { StreetSegment } from './sources/streets';
import { addressMatchKey, addressRangeKeys } from './sources/streets';
import { isRecycled, type SurveyedMain } from './sources/mains';
import type { ServiceLot } from './sources/services';
import type { ConnectionPermit } from './sources/connections';
import type { AssetFeature } from './sources/assets';
import type { Spot } from './sources/elevations';
import type { ActiveWork } from './work';
import { inPolygon } from './geo';
import { buildPipes, buildSurveyedMains, lanesFromDigSpots, type PipeRun } from './scene/build';
import { buildDigSpots, type DigSpot, type NamedStreet } from './scene/digSpots';
import { buildServices, type ServiceLine } from './scene/services';
import {
  continueAlongStreets,
  joinAtCorners,
  type Continuation,
  type Junction,
} from './scene/continuations';
import { groundLookup, sewerFlow } from './scene/slope';
import { distance2, type LocalFrame, type Vec2 } from './scene/local';
import { buildLotReport, type LotReport } from './report';
import { frontageLotLine } from './frontage';

/**
 * Where each line in the street goes, from the records loaded around an address. The app runs it
 * on every rebuild and the MCP server once per question, so both place lines the same way. It
 * reads the depth standards of the city in use (see `useDepthStandards`).
 */

// Context (buildings, streets, photo) reaches a bit past the search area so the edges don't feel
// cut off. An address first loads the built cells this far around it.
export const CONTEXT_RADIUS_M = 260;

export interface StreetRecords {
  permitGroups: Feature<Geometry, PermitGroupProperties>[];
  streets: StreetSegment[];
  mains: SurveyedMain[];
  serviceLots: ServiceLot[];
  spots: Spot[];
  curbs: Vec2[][];
}

export interface PlacedStreet {
  runs: PipeRun[];
  /** Permit points: a block recorded as a spot rather than a stretch of street. */
  points: ReturnType<typeof buildPipes>['points'];
  continuations: Continuation[];
  junctions: Junction[];
  services: ServiceLine[];
  digSpots: DigSpot[];
}

/** Each street's centerline pieces together, by DOT name, in local meters. */
export const namedStreets = (frame: LocalFrame, streets: StreetSegment[]): NamedStreet[] => {
  const byName = new Map<string, Vec2[][]>();
  for (const street of streets) {
    const paths = street.geometry.coordinates.map((line) => line.map((p) => frame.toLocal(p)));
    byName.set(street.permitName, [...(byName.get(street.permitName) ?? []), ...paths]);
  }
  return [...byName.entries()].map(([permitName, paths]) => ({ permitName, paths }));
};

/**
 * Places every line, pausing between the slow steps. The app hands the browser a turn at each
 * pause and drops a rebuild that a newer one has overtaken; see `placeStreet` to run it at once.
 */
export function* placeStreetSteps(
  frame: LocalFrame,
  records: StreetRecords,
): Generator<void, PlacedStreet> {
  const groups = records.permitGroups;
  const spaced = buildPipes(frame, groups);
  const pathsByRef = new Map<string, Vec2[][]>();
  for (const run of spaced.runs) {
    const paths = pathsByRef.get(run.ref);
    if (paths) paths.push(run.path);
    else pathsByRef.set(run.ref, [run.path]);
  }
  const digSpots = buildDigSpots(
    groups.map((group, index) => ({
      ref: `permit-${index}`,
      permits: group.properties.permits,
      paths: pathsByRef.get(`permit-${index}`) ?? [],
    })),
    namedStreets(frame, records.streets),
    records.curbs,
  );
  yield;
  const lanes = lanesFromDigSpots(frame, groups, digSpots);
  const pipes = lanes.size ? buildPipes(frame, groups, lanes) : spaced;
  const continuations = continueAlongStreets(frame, groups, pipes.runs, records.streets);
  yield;
  const junctions = joinAtCorners(frame, [...pipes.runs, ...continuations], records.streets);
  const ground = groundLookup(
    records.spots.map((spot) => ({
      position: frame.toLocal(spot.lngLat),
      elevationFt: spot.elevationFt,
    })),
  );
  const withFlow = (run: PipeRun) =>
    run.utility === 'sewer' ? { ...run, flow: sewerFlow(run.path, ground) } : run;
  const surveyed = buildSurveyedMains(frame, records.mains).map(withFlow);
  // A city that maps a whole network (San Francisco's sewers, San Diego's water) needs none of
  // that utility guessed from permits. DC's mapped water mains are only the largest, so its
  // permit-placed water stays, and so does electric: City Light maps only what runs underground,
  // and its permits are often for the overhead lines.
  const mapped = new Set(
    surveyed
      .filter((run) => run.surveyed?.source !== 'dcMains' && run.utility !== 'electric')
      .map((run) => run.utility),
  );
  const placed = [...pipes.runs, ...continuations, ...junctions]
    .filter((run) => !mapped.has(run.utility))
    .map(withFlow);
  yield;
  // Services tap the distribution mains. DC's mapped mains are too big to carry them; where a
  // city maps its whole water network (San Diego), services tap its distribution mains, never
  // the transmission mains or recycled water.
  const tapped = surveyed.filter(
    (run) =>
      run.surveyed?.source !== 'dcMains' &&
      run.surveyed?.use !== 'transmission' &&
      !isRecycled(run.surveyed),
  );
  const services = buildServices(frame, records.serviceLots, [...placed, ...tapped], records.curbs);
  return {
    runs: [...placed, ...surveyed],
    points: pipes.points,
    continuations,
    junctions,
    services,
    digSpots,
  };
}

/**
 * Every step in one go. A server answering for several cities at once needs this: the steps read
 * the city's depth standards, which another request could swap during a pause.
 */
export const placeStreet = (frame: LocalFrame, records: StreetRecords): PlacedStreet => {
  const steps = placeStreetSteps(frame, records);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
};

/**
 * DC's address locator gives no lot. The inventory's own entry for the address comes first: a
 * building across several lots is filed under one of them, not always the one its address
 * point falls in. Failing that, the lot the point falls in.
 */
export const lotOf = (address: GeocodedAddress, serviceLots: ServiceLot[]) => {
  const key = addressMatchKey(address.label.split(',')[0]!);
  // SPU files a service for a duplex under the range of its addresses.
  const keysOf = (lot: ServiceLot) =>
    lot.source === 'seaServiceLines'
      ? addressRangeKeys(lot.address)
      : [addressMatchKey(lot.address)];
  return (
    serviceLots.find((lot) => key && keysOf(lot).includes(key)) ??
    serviceLots.find((lot) =>
      lot.lot.coordinates.some((polygon) => inPolygon(address.lngLat, polygon)),
    )
  )?.bbl;
};

// Buildings farther than this from the address can't be its own, so they're never converted.
const OWN_BUILDING_SEARCH_M = 200;

/**
 * Buildings near the address, as outer rings in the frame's meters. `rings` are lng/lat outer
 * rings, from the app's loaded ground or the MCP server's trimmed cells.
 */
export const buildingsNear = (frame: LocalFrame, origin: Vec2, rings: Position[][]): Vec2[][] =>
  rings
    .map((ring) => ring.map((point) => frame.toLocal(point)))
    .filter((ring) => ring.some((point) => distance2(point, origin) <= OWN_BUILDING_SEARCH_M));

/** The lot report for an address, from the records around it and the street as placed. */
export const lotReportAt = (
  frame: LocalFrame,
  address: GeocodedAddress,
  records: {
    serviceLots: ServiceLot[];
    connectionPermits: Map<string, ConnectionPermit[]>;
    permitGroups: Feature<Geometry, PermitGroupProperties>[];
    assets: AssetFeature[];
    /** For an address set far back from its street, to find its frontage (frontage.ts). */
    streets?: StreetSegment[];
    /** Building outer rings in lng/lat, for the same. */
    buildings?: Position[][];
  },
  placed: Pick<PlacedStreet, 'runs' | 'services' | 'digSpots'>,
  active: ActiveWork[],
): LotReport => {
  // The card follows the view to the nearest address, which needn't be the one searched.
  const origin = frame.toLocal(address.lngLat);
  return buildLotReport({
    origin,
    frontage: frontageLotLine(
      address.label.split(',')[0]!,
      (records.streets ?? []).map((street) => ({
        label: street.label,
        paths: street.geometry.coordinates.map((line) => line.map((point) => frame.toLocal(point))),
      })),
      buildingsNear(frame, origin, records.buildings ?? []),
      origin,
    ),
    bbl: address.bbl ?? lotOf(address, records.serviceLots),
    services: placed.services,
    connectionPermits: records.connectionPermits,
    // Corner joins are a few meters long; the report is about the lines along the street.
    runs: placed.runs.filter((run) => !('meeting' in run)),
    groups: records.permitGroups,
    active,
    digSpots: placed.digSpots,
    address: address.label.split(',')[0],
    fixtures: records.assets.map((asset) => ({
      kind: asset.properties.kind,
      title: asset.properties.title,
      position: frame.toLocal(asset.geometry.coordinates),
    })),
  });
};
