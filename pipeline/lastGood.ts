import type { DatasetSpec } from './datasets';

/**
 * Whether a dataset keeps a last good copy. Every optional layer does. So does every required
 * layer from a city's own server (ArcGIS, Socrata outside NYC, a CSV), since one city's outage
 * would otherwise stop every city's night; three nights in November 2026 were lost to LA's
 * permit server alone. NYC Open Data's required layers don't: their buildings, roadbed and
 * sidewalks run to gigabytes, and the historic permits already have their own cache.
 */
export const keepsLastGood = (
  spec: Pick<DatasetSpec, 'optional' | 'arcgis' | 'socrata' | 'csv'>,
): boolean => Boolean(spec.optional || spec.arcgis || spec.socrata || spec.csv);
