/**
 * Reads what the nightly build produced and writes data/insights.json: who digs, when and how
 * often streets are reopened, how old and deep the mapped pipes are, and the street assets per
 * mile, city by city, each figure with the datasets and filter it came from. For blog posts and
 * social media, to scope models the data could train, and for subsola.com/insights, which reads
 * the copy the nightly publishes (docs/insights.md). Needs `pnpm build-cells` first.
 *
 *   pnpm insights
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assetInsights } from './insights/assets';
import { readCells } from './insights/cells';
import { CITY_NAMES } from './insights/common';
import { modelIdeas } from './insights/models';
import { permitInsights, permitRates } from './insights/permits';
import { leadServiceInsights, pipeInsights } from './insights/pipes';
import { contactDetailsIn } from './insights/privacy';
import { readStreets } from './insights/streets';
import { dataDir } from './paths';

const main = async () => {
  const started = performance.now();
  const seconds = () => `${Math.round((performance.now() - started) / 1000)}s`;

  const { builtAt, digs, mains } = await readCells();
  console.log(
    `${digs.length.toLocaleString()} permits, ${mains.length.toLocaleString()} pipes, ${seconds()}`,
  );
  const streets = await readStreets();
  console.log(`streets read, ${seconds()}`);

  const permits = permitInsights(digs, streets.blockNames);
  console.log(`permits done, ${seconds()}`);
  const insights = {
    generatedAt: new Date().toISOString(),
    cellsBuiltAt: builtAt,
    cities: CITY_NAMES,
    streetMiles: streets.miles,
    permits,
    permitRates: permitRates(permits, streets.miles),
    pipes: pipeInsights(mains),
    leadServiceLines: await leadServiceInsights(),
    assets: await assetInsights(streets.miles),
    models: modelIdeas(digs, mains),
    caveats: [
      'Permit counts are permits the build placed on the map; a few percent the build could not place are left out (see data/stats.json).',
      'A permit is permission to open the street, not proof it was opened, and cities file differently: NYC one per block and phase, Seattle one row per block a permit reaches, Denver one row per stretch of street a permit closes, Chicago one row per address range a permit opens, Dallas one per permit, San Jose one row per street segment a permit names, LA and San Diego one per job.',
      'Each city covers different years; compare cities only over the shared window in permitRates.',
      'Pipe figures cover only what each city maps: NYC, Chicago and Dallas publish no mains; DC only water; San Francisco, LA, Denver and San Jose only sewers and storm drains; San Diego and Seattle both.',
      'Install years and depths are as recorded; placeholder values can set the oldest and deepest figures.',
    ],
  };
  // Published to data.subsola.com by upload-cells, so nothing personal may go out with it.
  const leaks = contactDetailsIn(insights);
  if (leaks.length)
    throw new Error(
      `insights.json would publish contact details at ${leaks.slice(0, 5).join(', ')}`,
    );
  const path = join(dataDir, 'insights.json');
  await writeFile(path, JSON.stringify(insights, null, 2));
  console.log(`Wrote ${path}, ${seconds()}`);
};

await main();
