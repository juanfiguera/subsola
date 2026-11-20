import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir } from '../paths';
import { CITIES, figure, round, type City, type Figure } from './common';

/**
 * Street assets per city and per street mile, from the counts the build placed (data/stats.json).
 * Only kinds a city publishes in full are listed; NYC's signal layers cover special signals
 * (leading pedestrian intervals, accessible and exclusive phases), not every signal, and NYC
 * streetlights come from OpenStreetMap, so neither is counted.
 */

const ASSETS: Record<City, Record<string, string[]>> = {
  nyc: {
    hydrants: ['hydrants'],
    catchBasins: ['catchBasins'],
    conEdStructures: ['conEdStructures'],
  },
  dc: {
    hydrants: ['dcHydrants'],
    catchBasins: ['dcInlets'],
    lights: ['dcLights'],
    signals: ['dcSignals'],
  },
  sf: {
    hydrants: ['sfHydrantsLow', 'sfHydrantsHigh'],
    lights: ['sfLights'],
    signals: ['sfSignals'],
  },
  la: {
    hydrants: ['laHydrants'],
    catchBasins: ['laInlets'],
    lights: ['laLights'],
    signals: ['laSignals'],
    sewerManholes: ['laSewerStructures'],
  },
  sd: {
    hydrants: ['sdHydrants'],
    catchBasins: ['sdInlets'],
    lights: ['sdLights'],
    signals: ['sdSignals'],
    sewerManholes: ['sdSewerManholes'],
  },
  sea: {
    catchBasins: ['seaCatchBasins'],
    lights: ['seaLights'],
    signals: ['seaSignals'],
    sewerManholes: ['seaSewerHoles'],
  },
  den: {
    catchBasins: ['denInlets'],
    signals: ['denSignals'],
    sewerManholes: ['denSewerManholes'],
  },
  // Chicago publishes none of its hydrants, inlets, lights or signals.
  chi: {},
  // Dallas publishes no hydrants, inlets or manholes; its lights and signal cabinets aren't built.
  dal: {},
};

export const assetInsights = async (streetMiles: Record<City, Figure<number>>) => {
  const stats = JSON.parse(await readFile(join(dataDir, 'stats.json'), 'utf8')) as {
    datasets: Record<string, { placed: number }>;
  };
  return Object.fromEntries(
    CITIES.map((city) => [
      city,
      Object.fromEntries(
        Object.entries(ASSETS[city]).map(([kind, datasets]) => {
          const count = datasets.reduce(
            (sum, name) => sum + (stats.datasets[name]?.placed ?? 0),
            0,
          );
          return [
            kind,
            figure(
              { count, perStreetMile: round(count / streetMiles[city].value, 1) },
              { datasets, filter: 'rows the build placed, from data/stats.json' },
            ),
          ];
        }),
      ),
    ]),
  );
};
