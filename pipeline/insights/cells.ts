import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { MultiLineString } from 'geojson';
import { NOT_OPENING, type PermitGroupProperties } from '../../src/sources/permits';
import type { BuiltMainRow } from '../../src/sources/mains';
import { dataDir } from '../paths';
import { cityOfDataset, dayOf, miles, type City, type UtilityKind } from './common';

/**
 * The permits and mains as the nightly build placed them, read back from data/cells. Reading the
 * build's output rather than the raw downloads means every city's own classifier and block
 * matching (classifyPermit, classifySdPermit, classifySeaPermit and the rest) decided what counts,
 * exactly as on the map. Permits the build couldn't place on a block or spot aren't in the cells.
 */

export interface Dig {
  city: City;
  /** The block the permit was matched to, or null when it sits on a point or a partial block. */
  block: string | null;
  utility: UtilityKind;
  holder: string;
  dataset: string;
  issued: number | null;
  start: number | null;
  end: number | null;
  street: string;
  /** Whether the permit opens the street, rather than a manhole, storage or a stand. */
  opening: boolean;
}

export interface BuiltMain {
  city: City;
  source: NonNullable<BuiltMainRow['source']>;
  utility: 'water' | 'sewer' | 'electric';
  installedYear: number | null;
  material: string | null;
  depthFt: number | null;
  diameterIn: number | null;
  use: string | null;
  // The length only: keeping every pipe's route ran the nightly out of memory once LA's laterals
  // and Seattle's side sewers came in.
  miles: number;
}

interface PermitGroup {
  geometry: unknown;
  properties: PermitGroupProperties;
}

const MAIN_CITY: Record<BuiltMainRow['source'] & string, City> = {
  dcMains: 'dc',
  sfSewerMains: 'sf',
  sfSideSewers: 'sf',
  laSewers: 'la',
  laSideSewers: 'la',
  laStormDrains: 'la',
  sdSewers: 'sd',
  sdWaterMains: 'sd',
  sdStormDrains: 'sd',
  sdRecycledMains: 'sd',
  seaSewers: 'sea',
  seaWaterMains: 'sea',
  seaSideSewers: 'sea',
  seaElectricLines: 'sea',
  denSewers: 'den',
  denStormDrains: 'den',
};

/**
 * A permit group's block, without the utility in front. NYC keys name the street and both cross
 * streets ("QUEENS|258 STREET|EAST WILLISTON AVENUE|HILLSIDE AVENUE"); a missing cross street
 * means the build only had a point. Elsewhere it's the city's segment id on segment groups, and a
 * coordinate or intersection on point groups, which aren't blocks.
 */
const blockOf = ({ key, geometryKind }: PermitGroupProperties, city: City): string | null => {
  const place = key.slice(key.indexOf('|') + 1);
  if (city === 'nyc') {
    const parts = place.split('|');
    return parts.length === 4 && parts.every(Boolean) ? place : null;
  }
  if (geometryKind !== 'segment' || /\d\.\d+,-?\d/.test(place)) return null;
  // LA marks some segments' SECT_ID "none" or "private"; every such segment shares one key, so
  // permits from across the city pile onto it. Only real segment ids count as blocks.
  if (city === 'la' && !/^la\|\d+$/.test(place)) return null;
  return place;
};

export const readCells = async () => {
  const dir = join(dataDir, 'cells');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json.gz'));
  const seenGroups = new Set<string>();
  const mains = new Map<string, BuiltMain>();
  const digs: Dig[] = [];
  const builtAt = await readFile(join(dir, 'index.json'), 'utf8').then(
    (text) => (JSON.parse(text) as { builtAt: string }).builtAt,
    (error: unknown) => {
      throw new Error('No data/cells/index.json; run pnpm build-cells first', { cause: error });
    },
  );
  for (const [index, file] of files.entries()) {
    const bundle = JSON.parse(gunzipSync(await readFile(join(dir, file))).toString()) as {
      permitGroups?: PermitGroup[];
      mains?: BuiltMainRow[];
    };
    for (const { properties } of bundle.permitGroups ?? []) {
      // A block reaching into a neighbor cell is stored once, but a group is keyed per block and
      // utility, so this guards against any that slipped in twice.
      if (seenGroups.has(properties.key)) continue;
      seenGroups.add(properties.key);
      const city = cityOfDataset(properties.permits[0]!.dataset);
      const block = blockOf(properties, city);
      for (const permit of properties.permits)
        digs.push({
          city,
          block,
          utility: permit.utility,
          holder: permit.permittee.trim(),
          dataset: permit.dataset,
          issued: dayOf(permit.issued),
          start: dayOf(permit.workStart) ?? dayOf(permit.issued),
          end: dayOf(permit.workEnd),
          street: permit.street.trim(),
          opening: !NOT_OPENING.test(permit.type),
        });
    }
    // Mains are kept whole in every cell they cross.
    for (const row of bundle.mains ?? []) {
      if (mains.has(row.id)) continue;
      const source = row.source ?? 'dcMains';
      mains.set(row.id, {
        city: MAIN_CITY[source],
        source,
        utility: row.utility ?? 'water',
        installedYear: row.installed_year ?? null,
        material: row.material ?? null,
        depthFt: row.depth_ft ?? null,
        diameterIn: row.diameter_in ?? null,
        use: row.use ?? null,
        miles: miles((row.the_geom as MultiLineString).coordinates),
      });
    }
    if (index % 10_000 === 0) console.log(`  cells read: ${index.toLocaleString()}`);
  }
  return { builtAt, digs, mains: [...mains.values()] };
};
