/**
 * Writes the type-ahead index (src/sources/addressIndex.ts) from each city's downloaded address
 * points: data/addresses/v{version}/{city}/{key}.json.gz, which upload-cells sends to the bucket
 * under addresses/. A city whose addresses weren't downloaded tonight keeps no files, so its
 * search box falls back to the city's own lookup; see ADDRESS_SOURCES.
 *
 *   pnpm build-addresses
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  ADDRESS_INDEX_VERSION,
  ADDRESS_MANIFEST,
  buildAddressFiles,
  keyFile,
  type AddressManifest,
  type IndexedAddress,
} from '../../src/sources/addressIndex';
import type { RegionId } from '../../src/regions';
import { buildsCity } from '../city';
import { dataDir } from '../paths';
import { readRows } from '../raw';
import { ADDRESS_SOURCES } from './datasets';

export const addressesDir = join(dataDir, 'addresses');

const buildCity = async (city: RegionId) => {
  const source = ADDRESS_SOURCES[city];
  if (!source) return;
  const addresses: IndexedAddress[] = [];
  const counts = { read: 0, rejected: 0 };
  for await (const row of readRows(source.spec, counts)) addresses.push(...source.toAddresses(row));
  const dir = join(addressesDir, `v${ADDRESS_INDEX_VERSION}`, city);
  await rm(dir, { recursive: true, force: true });
  if (!addresses.length) {
    console.warn(`${city}: no addresses tonight; its search box will ask the city's own lookup`);
    return;
  }
  const files = buildAddressFiles(addresses);
  await mkdir(dir, { recursive: true });
  let bytes = 0;
  for (const [key, file] of files) {
    const gz = gzipSync(JSON.stringify(file));
    bytes += gz.length;
    await writeFile(join(dir, `${keyFile(key)}.json.gz`), gz);
  }
  console.log(
    `${city}: ${addresses.length.toLocaleString()} addresses from ${counts.read.toLocaleString()} rows ` +
      `(${counts.rejected} rejected), ${files.size.toLocaleString()} files, ${(bytes / 1e6).toFixed(1)} MB`,
  );
};

const fileKey = (file: string) =>
  file
    .replace(/\.json\.gz$/, '')
    .replace(/_/g, ' ')
    .replace(/~/g, '-');

/**
 * Which files each city has, from what's on disk, so a one-city build (CITY=sj) keeps the other
 * cities' entries. The browser reads it before asking for any file.
 */
const writeManifest = async () => {
  const root = join(addressesDir, `v${ADDRESS_INDEX_VERSION}`);
  const manifest: AddressManifest = { v: ADDRESS_INDEX_VERSION, cities: {} };
  if (existsSync(root))
    for (const city of (await readdir(root, { withFileTypes: true })).filter((e) =>
      e.isDirectory(),
    ))
      manifest.cities[city.name] = (await readdir(join(root, city.name)))
        .filter((file) => file.endsWith('.json.gz'))
        .map(fileKey)
        .sort();
  await mkdir(root, { recursive: true });
  await writeFile(join(dataDir, ADDRESS_MANIFEST), gzipSync(JSON.stringify(manifest)));
};

for (const city of Object.keys(ADDRESS_SOURCES) as RegionId[])
  if (buildsCity(city)) await buildCity(city);
await writeManifest();
