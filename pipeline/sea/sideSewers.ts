import type { z } from 'zod';
import type { BuiltMainRow } from '../../src/sources/mains';
import { everyCell } from '../placement';
import type { DcBuildTools } from '../dc/build';
import type { seaSideSewerSchema } from './datasets';

/**
 * Seattle's side sewers, each building's own sewer to the main, as SPU maps them: about 1.35M
 * short stretches, joined at the points between them. Each joined network is drawn as one house
 * sewer, so a building's line is one record rather than a dozen fittings.
 */

type Key = number | null | undefined;

/**
 * Which network each stretch belongs to: the index of one stretch in it. A stretch flows into
 * the point at its downstream end; where another stretch starts at that point, the two are one
 * network. A point where stretches only end, on the main, joins nothing, so neighbours sharing
 * a connection on the main stay apart.
 */
export const sideSewerNetworks = (stretches: { ups: Key; dns: Key }[]): Int32Array => {
  const parent = new Int32Array(stretches.length).map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    // Pointing the path at its root keeps later finds short.
    while (parent[index] !== root) {
      const next = parent[index]!;
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const join = (a: number, b: number) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const startsAt = new Map<number, number>();
  stretches.forEach(({ ups }, index) => {
    if (ups == null) return;
    const first = startsAt.get(ups);
    if (first === undefined) startsAt.set(ups, index);
    else join(first, index);
  });
  stretches.forEach(({ dns }, index) => {
    const next = dns == null ? undefined : startsAt.get(dns);
    if (next !== undefined) join(index, next);
  });
  return parent.map((_, index) => find(index));
};

type Point = [number, number];

const pointKey = (point: Point) => `${point[0]!.toFixed(7)},${point[1]!.toFixed(7)}`;

/**
 * Stretches laid end to end where one ends at the point the next starts, so a run of fittings
 * draws as one line. Branches stay lines of their own.
 */
export const stitchPaths = (paths: Point[][]): Point[][] => {
  const startingAt = new Map<string, number[]>();
  paths.forEach((path, index) => {
    const key = pointKey(path[0]!);
    startingAt.set(key, [...(startingAt.get(key) ?? []), index]);
  });
  const endsAt = new Map<string, number>();
  for (const path of paths) {
    const key = pointKey(path.at(-1)!);
    endsAt.set(key, (endsAt.get(key) ?? 0) + 1);
  }
  const used = new Set<number>();
  const follow = (index: number) => {
    const line = [...paths[index]!];
    used.add(index);
    for (;;) {
      const key = pointKey(line.at(-1)!);
      const next = startingAt.get(key);
      // Only a plain run continues: one stretch in, one out.
      if (next?.length !== 1 || endsAt.get(key) !== 1 || used.has(next[0]!)) return line;
      used.add(next[0]!);
      line.push(...paths[next[0]!]!.slice(1));
    }
  };
  const lines: Point[][] = [];
  // Start where no plain run leads in, then pick up any loop left over.
  paths.forEach((path, index) => {
    const key = pointKey(path[0]!);
    const fedByOne = endsAt.get(key) === 1 && startingAt.get(key)?.length === 1;
    if (!fedByOne && !used.has(index)) lines.push(follow(index));
  });
  paths.forEach((_, index) => {
    if (!used.has(index)) lines.push(follow(index));
  });
  return lines;
};

const MATERIALS: Record<string, string> = {
  'Polyvinyl Chloride': 'PVC',
  'Acrylonitrile Butadiene Styrene': 'ABS plastic',
  'High Density Polyethylene': 'Plastic (HDPE)',
};

/** SPU's words for a material, shorter: "Cast Iron Pipe" to "Cast iron". Null when unknown. */
export const sideSewerMaterial = (text: string | null | undefined): string | null => {
  const words = text?.trim();
  if (!words || words === 'Unknown' || words === 'Other') return null;
  if (MATERIALS[words]) return MATERIALS[words];
  const plain = words.replace(/ Pipe$/, '').toLowerCase();
  return `${plain[0]!.toUpperCase()}${plain.slice(1)}`;
};

const lengthOf = (path: Point[]) => {
  let total = 0;
  for (let i = 1; i < path.length; i++)
    total += Math.hypot(path[i]![0]! - path[i - 1]![0]!, path[i]![1]! - path[i - 1]![1]!);
  return total;
};

interface Network {
  paths: Point[][];
  objectId: number;
  /** Length of each known material, to name the network by the most of it. */
  materials: Map<string, number>;
  widthIn: number | null;
  year: number | null;
  left: number;
}

/**
 * Reads the stretches twice: once for the keys that join them, then for their shapes, writing each
 * network out once its last stretch is in.
 */
export const buildSeaSideSewers = async (
  readRows: DcBuildTools['readRows'],
  shards: DcBuildTools['shards'],
) => {
  const keys: { ups: Key; dns: Key }[] = [];
  for await (const raw of readRows('seaSideSewers')) {
    const row = raw as z.infer<typeof seaSideSewerSchema>;
    keys.push({ ups: row.NMNL_UPS_FEATURE_KEY, dns: row.NMNL_DNS_FEATURE_KEY });
  }
  const network = sideSewerNetworks(keys);
  const startsAt = new Set(keys.map(({ ups }) => ups).filter((ups) => ups != null));
  const sizes = new Map<number, number>();
  for (const root of network) sizes.set(root, (sizes.get(root) ?? 0) + 1);

  const open = new Map<number, Network>();
  const counts = { stretches: 0, networks: 0, paths: 0 };
  let index = 0;
  for await (const raw of readRows('seaSideSewers')) {
    const row = raw as z.infer<typeof seaSideSewerSchema>;
    const root = network[index]!;
    // The stretch that leaves the network, at the main, gives its size and year.
    const outlet = row.NMNL_DNS_FEATURE_KEY == null || !startsAt.has(row.NMNL_DNS_FEATURE_KEY);
    index += 1;
    counts.stretches += 1;
    const entry: Network = open.get(root) ?? {
      paths: [],
      objectId: row.OBJECTID,
      materials: new Map(),
      widthIn: null,
      year: null,
      left: sizes.get(root)!,
    };
    open.set(root, entry);
    entry.left -= 1;
    const paths = (row.geometry.paths as Point[][]).filter((path) => path.length > 1);
    entry.paths.push(...paths);
    const stretchMaterial = sideSewerMaterial(row.NMNL_MATERIAL_TYPE);
    if (stretchMaterial)
      entry.materials.set(
        stretchMaterial,
        (entry.materials.get(stretchMaterial) ?? 0) +
          paths.reduce((sum, path) => sum + lengthOf(path), 0),
      );
    const width = row.NMNL_WIDTH_IN_NBR;
    if (width && width > 0 && width <= 24 && (outlet || entry.widthIn === null))
      entry.widthIn = width;
    const year = row.NMNL_INSTALL_DATE ? new Date(row.NMNL_INSTALL_DATE).getUTCFullYear() : 0;
    if (year > 1800 && (outlet || entry.year === null)) entry.year = year;
    if (entry.left > 0) continue;
    open.delete(root);
    if (!entry.paths.length) continue;
    const lines = stitchPaths(entry.paths);
    const material = [...entry.materials].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const main: BuiltMainRow = {
      id: `seas-${entry.objectId}`,
      utility: 'sewer',
      diameter_in: entry.widthIn,
      material,
      installed_year: entry.year,
      depth_ft: null,
      use: 'side',
      source: 'seaSideSewers',
      the_geom: { type: 'MultiLineString', coordinates: lines },
    };
    counts.networks += 1;
    counts.paths += lines.length;
    for (const [cell, piece] of everyCell(main, lines)) await shards.add(cell.key, 'mains', piece);
  }
  console.log(
    `seaSideSewers: ${counts.stretches.toLocaleString()} stretches joined into ${counts.networks.toLocaleString()} house sewers, ${counts.paths.toLocaleString()} lines; the largest has ${[...sizes.values()].reduce((most, size) => Math.max(most, size), 0).toLocaleString()} stretches`,
  );
};
