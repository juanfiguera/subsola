import { REGIONS, type RegionId } from '../src/regions';

/**
 * CITY=sea limits download and build-cells to one city, for a self-hosted copy that doesn't need
 * all ten (see README, "Self-hosting"). Unset, every city is built, as the nightly does.
 */
const asked = process.env.CITY?.trim().toLowerCase() || undefined;
if (asked && !REGIONS.some((region) => region.id === asked))
  throw new Error(
    `CITY must be one of ${REGIONS.map((region) => region.id).join(', ')} (got ${asked})`,
  );

export const onlyCity = asked as RegionId | undefined;

export const buildsCity = (id: RegionId) => !onlyCity || onlyCity === id;
