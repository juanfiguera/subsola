import type { Feature, Geometry } from 'geojson';
import type { PermitGroupProperties, PermitRecord } from './sources/permits';
import { byPermitDayDesc } from './sources/permitDay';
import type { AssetKind } from './sources/assets';
import type { ConnectionPermit } from './sources/connections';
import type { PipeRun } from './scene/build';
import type { ServiceLine } from './scene/services';
import type { DigSpot } from './scene/digSpots';
import type { ActiveWork } from './work';
import type { UtilityKind } from './utilities';
import { closestOnPolyline, distance2, type Vec2 } from './scene/local';
import { isStormDrain, type SurveyedMain } from './sources/mains';
import { addressMatchKey } from './sources/streets';
import type { LotLine } from './frontage';

/** One utility's line in the street in front of the lot, as the map draws it. */
export interface MainOutFront {
  utility: UtilityKind;
  ref: string;
  /** From the lot line to the drawn line. Drawn, not surveyed. */
  distanceM: number;
  /** Crew notes that placed the lane; 0 means default spacing. */
  digSpots: number;
  /** No permit on this block; carried on from the rest of the street. */
  assumed: boolean;
  digs: number;
  firstYear: number | null;
  lastYear: number | null;
  /** Permittees by how often they dug this block, most first. */
  permittees: string[];
  /** On the utility's own surveyed route rather than placed from permits. */
  surveyed?: SurveyedMain;
}

export interface NearbyFixture {
  kind: AssetKind;
  title: string;
  distanceM: number;
}

export interface LotReport {
  /** Where everything is measured from, and how that was decided. */
  lotLine: LotLine;
  bbl: string | null;
  water: ServiceLine | null;
  sewer: ServiceLine | null;
  connectionPermits: ConnectionPermit[];
  mains: MainOutFront[];
  /** Permits open on the blocks out front today. */
  live: PermitRecord[];
  /** The newest permits on the blocks out front. */
  recent: PermitRecord[];
  digSpots: DigSpot[];
  fixtures: NearbyFixture[];
  /** The building's own sewer on its recorded route, where the city maps them (San Francisco, Seattle). */
  sideSewer: SurveyedMain | null;
  /**
   * The mapped house connection nearest the lot line, where the city maps them without the
   * address they serve (Los Angeles).
   */
  nearbySideSewer: { main: SurveyedMain; distanceM: number } | null;
}

export interface LotReportInput {
  bbl: string | undefined;
  services: ServiceLine[];
  connectionPermits: Map<string, ConnectionPermit[]>;
  runs: PipeRun[];
  groups: Feature<Geometry, PermitGroupProperties>[];
  active: ActiveWork[];
  digSpots: DigSpot[];
  fixtures: { kind: AssetKind; title: string; position: Vec2 }[];
  /** "1 DR CARLTON B GOODLETT PL", to find the building's side sewer by address. */
  address?: string;
  /**
   * The lot line from the building's frontage on its named street, for an address point set far
   * back from it (frontage.ts). Used only when no service line places the lot line.
   */
  frontage?: LotLine | null;
  /** The address point, in the frame's meters; the frame's origin unless the view moved on. */
  origin?: Vec2;
}

// About a wide street from the lot line: a line farther than this belongs to another street.
const FRONT_REACH_M = 25;
// Denver Water places a line by a point on the building, about 20 m back from the street, so the
// street out front reaches that much farther from it.
const DEN_FRONT_REACH_M = 45;
// Crew notes this close to the lot line describe digs in front of it.
const DIG_SPOT_REACH_M = 40;
const RECENT_PERMITS = 8;
// A Seattle side sewer starts at the building's plumbing; the geocoder's point sits on the
// building or its parcel. One farther than this serves a neighbour.
const SIDE_SEWER_REACH_M = 15;
// LA's house connections are mapped from the sewer to the property line, about a lot's depth from
// its address point, so the nearest one can sit farther off and still serve this lot.
const HOUSE_CONNECTION_REACH_M = 30;
const REPORTED_FIXTURES: AssetKind[] = ['hydrant', 'catch-basin', 'manhole'];

/**
 * Everything the public record says about one lot and the street in front of it. The lot line
 * is where its water service meets the lot; without one, the building's frontage on its street
 * when the address point is set far back (see `frontage`), or else the geocoded point.
 */
export const buildLotReport = (input: LotReportInput): LotReport => {
  const ofLot = (utility: ServiceLine['utility']) =>
    input.services.find((line) => line.lot.bbl === input.bbl && line.utility === utility) ?? null;
  const water = ofLot('water');
  const sewer = ofLot('sewer');
  const placedBy = water ?? sewer;
  const lotLineFrom: LotLine = placedBy
    ? { point: placedBy.b, from: 'service' }
    : (input.frontage ?? { point: input.origin ?? [0, 0], from: 'address' });
  const lotLine: Vec2 = lotLineFrom.point;
  const reach = water?.lot.source === 'denServiceLines' ? DEN_FRONT_REACH_M : FRONT_REACH_M;

  const nearest = new Map<UtilityKind, { run: PipeRun; distanceM: number }>();
  // The nearest mapped main of each utility: San Diego maps both its water and its sewers. Its
  // storm drains and recycled water get rows of their own, so they don't stand in for the
  // sewer or the water main that serve the lot.
  const surveyed = new Map<string, { run: PipeRun; distanceM: number }>();
  for (const run of input.runs) {
    // A building's own sewer isn't a main out front.
    if (run.surveyed?.use === 'side') continue;
    const { distance } = closestOnPolyline(run.path, lotLine);
    // Its own row: a street can have a large main and the smaller one that serves the lot.
    if (run.surveyed) {
      const key = `${run.utility}|${isStormDrain(run.surveyed) || run.surveyed.use === 'recycled' ? run.surveyed.source : ''}`;
      const best = surveyed.get(key);
      if (distance <= reach && (!best || distance < best.distanceM))
        surveyed.set(key, { run, distanceM: distance });
      continue;
    }
    const best = nearest.get(run.utility);
    if (distance <= reach && (!best || distance < best.distanceM))
      nearest.set(run.utility, { run, distanceM: distance });
  }

  const groupOf = (ref: string) => input.groups[Number(ref.slice('permit-'.length))];
  const mains = [...nearest.values()]
    .flatMap(({ run, distanceM }): MainOutFront[] => {
      if (run.assumed)
        return [
          {
            utility: run.utility,
            ref: run.ref,
            distanceM,
            digSpots: 0,
            assumed: true,
            digs: 0,
            firstYear: null,
            lastYear: null,
            permittees: [],
          },
        ];
      const group = groupOf(run.ref);
      if (!group) return [];
      const counts = new Map<string, number>();
      for (const permit of group.properties.permits)
        counts.set(permit.permittee, (counts.get(permit.permittee) ?? 0) + 1);
      return [
        {
          utility: run.utility,
          ref: run.ref,
          distanceM,
          digSpots: run.digSpots,
          assumed: false,
          digs: group.properties.count,
          firstYear: group.properties.firstYear,
          lastYear: group.properties.lastYear,
          permittees: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
        },
      ];
    })
    .concat(
      [...surveyed.values()].map(({ run, distanceM }) => ({
        utility: run.utility,
        ref: run.ref,
        distanceM,
        digSpots: 0,
        assumed: false,
        digs: 0,
        firstYear: null,
        lastYear: null,
        permittees: [],
        surveyed: run.surveyed,
      })),
    )
    .sort((a, b) => a.distanceM - b.distanceM);

  const frontRefs = new Set(mains.map((main) => main.ref));
  const frontPermits = mains.flatMap((main) => groupOf(main.ref)?.properties.permits ?? []);
  const recent = [...new Map(frontPermits.map((p) => [p.permitNumber, p])).values()]
    .sort(byPermitDayDesc)
    .slice(0, RECENT_PERMITS);

  const fixtures = REPORTED_FIXTURES.flatMap((kind) => {
    const closest = input.fixtures
      .filter((fixture) => fixture.kind === kind)
      .map((fixture) => ({ ...fixture, distanceM: distance2(fixture.position, lotLine) }))
      .sort((a, b) => a.distanceM - b.distanceM)[0];
    return closest ? [{ kind, title: closest.title, distanceM: closest.distanceM }] : [];
  });

  const addressKey = input.address ? addressMatchKey(input.address) : null;
  const sideRuns = input.runs.filter((run) => run.surveyed?.use === 'side');
  // San Francisco files each side sewer under an address. Seattle doesn't, so its nearest one to
  // the address point stands in, where the geocoder puts the building.
  const sideSewer =
    sideRuns.find(
      (run) =>
        addressKey !== null &&
        run.surveyed!.address !== null &&
        addressMatchKey(run.surveyed!.address) === addressKey,
    )?.surveyed ??
    sideRuns
      .filter((run) => run.surveyed!.address === null && run.surveyed!.source === 'seaSideSewers')
      .map((run) => ({
        run,
        distance: closestOnPolyline(run.path, input.origin ?? [0, 0]).distance,
      }))
      .filter(({ distance }) => distance <= SIDE_SEWER_REACH_M)
      .sort((a, b) => a.distance - b.distance)[0]?.run.surveyed ??
    null;

  let nearbySideSewer: LotReport['nearbySideSewer'] = null;
  for (const run of input.runs) {
    if (run.surveyed?.source !== 'laSideSewers') continue;
    const { distance } = closestOnPolyline(run.path, lotLine);
    if (
      distance <= HOUSE_CONNECTION_REACH_M &&
      (!nearbySideSewer || distance < nearbySideSewer.distanceM)
    )
      nearbySideSewer = { main: run.surveyed, distanceM: distance };
  }

  return {
    lotLine: lotLineFrom,
    sideSewer,
    nearbySideSewer,
    bbl: input.bbl ?? null,
    water,
    sewer,
    connectionPermits: input.bbl ? (input.connectionPermits.get(input.bbl) ?? []) : [],
    mains,
    live: input.active
      .filter((work) => frontRefs.has(`permit-${work.groupIndex}`))
      .map((work) => work.record),
    recent,
    digSpots: input.digSpots
      .filter((spot) => distance2(spot.position, lotLine) <= DIG_SPOT_REACH_M)
      .sort((a, b) => (b.issued ?? '').localeCompare(a.issued ?? '')),
    fixtures,
  };
};
