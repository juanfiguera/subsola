import { REGIONS, cityNames } from '../regions';
import type { FiguresByCity } from './cities';
import { cityPage, cityPath } from './cityPage';
import { notFoundPage, robotsTxt, sitemapXml } from './siteFiles';
import { privacyPage } from './privacy';
import { creditsPage } from './credits';

/**
 * What the build writes beside the map, by file name in dist/: one page per city (seattle.html,
 * which Pages serves at /seattle), the privacy and credits pages, the 404 page, robots.txt and sitemap.xml. vite.config.ts loads
 * this through Vite's module runner, so the config itself doesn't import the app's code.
 */

export { readFigures } from './cities';

export const pageFiles = (stylesheet: string, figures: FiguresByCity): Record<string, string> => ({
  ...Object.fromEntries(
    REGIONS.map((region) => [
      `${cityPath(region).slice(1)}.html`,
      cityPage(region, figures[region.id], stylesheet),
    ]),
  ),
  '404.html': notFoundPage(stylesheet),
  'privacy.html': privacyPage(stylesheet),
  'credits.html': creditsPage(stylesheet),
  'robots.txt': robotsTxt(),
  'sitemap.xml': sitemapXml(),
});

/** "New York City, Washington, DC, ... or Denver", for the map's search box label. */
export const searchCities = () => cityNames('or');
