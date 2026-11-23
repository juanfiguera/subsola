import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join, normalize, resolve } from 'node:path';
import { defineConfig, preprocessCSS, runnerImport, type Plugin, type ResolvedConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import type * as Pages from './src/pages/build.ts';

const dataDir = resolve(process.env.SUBSOLA_DATA_DIR ?? 'data');
const cellDir = join(dataDir, 'cells');
// The nightly publishes it next to the cells; locally `pnpm insights` writes it beside them.
const insightsPath = join(dataDir, 'insights.json');

/**
 * Serves a local citywide build at /cells while developing, so VITE_CELLS_URL=/cells reads it.
 * Files go out as stored, still gzipped, the way a bucket would send them. /cells/insights.json is
 * data/insights.json, for the insights page.
 */
const localCells = (): Plugin => ({
  name: 'local-cells',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/cells', (req, res, next) => {
      const name = decodeURIComponent(req.url?.split('?')[0] ?? '');
      const path = name === '/insights.json' ? insightsPath : normalize(join(cellDir, name));
      if ((path !== insightsPath && !path.startsWith(cellDir)) || !existsSync(path)) return next();
      res.setHeader(
        'Content-Type',
        path.endsWith('.json') ? 'application/json' : 'application/gzip',
      );
      createReadStream(path).pipe(res);
    });
  },
});

const DEFAULT_CELLS_URL = 'https://data.subsola.com';
const PAGES_CSS = resolve('src/pages/pages.css');
const SHELL_CSS = resolve('src/pages/shell.css');

/**
 * The nightly figures the city pages quote, as JSON. A local build reads data/insights.json if
 * there is one; otherwise the published copy. Without either the pages leave the figures out
 * rather than failing the build: the text stands without them.
 */
const loadInsights = async (): Promise<unknown> => {
  if (existsSync(insightsPath)) return JSON.parse(readFileSync(insightsPath, 'utf8'));
  const base = process.env.VITE_CELLS_URL?.startsWith('https://')
    ? process.env.VITE_CELLS_URL
    : DEFAULT_CELLS_URL;
  const url = `${base.replace(/\/$/, '')}/insights.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    console.warn(`[site-pages] ${url}: ${String(error)}; city pages go out without figures`);
    return null;
  }
};

/**
 * The pages that are text rather than the map (src/pages/build.ts), written into dist/ so
 * crawlers read them without running a script, and served at the same paths while developing.
 * Also fills the city list into the map's search box label, so it follows REGIONS, and the shared
 * top bar and footer into insights.html (src/pages/shell.ts). The page code
 * is loaded through Vite's module runner rather than imported here, so the config stays free of
 * the app's extensionless imports.
 */
const sitePages = (): Plugin => {
  let pages: Promise<typeof Pages> | null = null;
  const loadPages = () =>
    (pages ??= runnerImport<typeof Pages>(resolve('src/pages/build.ts'), {
      configFile: false,
    }).then((result) => result.module));
  let insights: Promise<unknown> | null = null;
  let config: ResolvedConfig | null = null;
  // The sheets go out as single files, their @imports (shell.css, the theme switch) inlined.
  const stylesheet = async (path: string) => {
    if (!config) throw new Error('site-pages: the config has not resolved yet');
    return (await preprocessCSS(readFileSync(path, 'utf8'), path, config)).code;
  };
  const files = async (stylesheet: string) => {
    const { pageFiles, readFigures } = await loadPages();
    return pageFiles(stylesheet, readFigures(await (insights ??= loadInsights())));
  };
  return {
    name: 'site-pages',
    configResolved(resolved) {
      config = resolved;
    },
    transformIndexHtml: async (html) => {
      const { fillShell, searchCities } = await loadPages();
      return fillShell(html.replaceAll('__CITY_NAMES_OR__', searchCities()));
    },
    async generateBundle() {
      const css = this.emitFile({
        type: 'asset',
        name: 'pages.css',
        source: await stylesheet(PAGES_CSS),
      });
      // At a fixed name for /mcp, which is rendered by a Pages Function that can't know the
      // hashed one and links this under its nonce instead of carrying a copy.
      this.emitFile({ type: 'asset', fileName: 'shell.css', source: await stylesheet(SHELL_CSS) });
      for (const [fileName, source] of Object.entries(await files(this.getFileName(css))))
        this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '/';
        const name = /\.(txt|xml)$/.test(path) ? path.slice(1) : `${path.slice(1)}.html`;
        files('src/pages/pages.css')
          .then((all) => {
            const source = all[name];
            if (!source) return next();
            const type = name.endsWith('.html')
              ? 'text/html'
              : name.endsWith('.xml')
                ? 'application/xml'
                : 'text/plain';
            res.setHeader('Content-Type', type);
            res.end(source);
          })
          .catch(next);
      });
    },
  };
};

export default defineConfig({
  plugins: [localCells(), sitePages()],
  build: {
    rollupOptions: {
      // A second page: Pages serves dist/insights.html at /insights.
      input: { main: resolve('index.html'), insights: resolve('insights.html') },
    },
  },
  // .claude/worktrees holds whole copies of the repo while agents work in them.
  test: { exclude: [...configDefaults.exclude, '.claude/**'] },
});
