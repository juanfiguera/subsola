# Site shell: routing, share previews, city pages

How subsola.com answers paths other than the map's own data, and how a shared link gets its
preview.

## Routing

Cloudflare Pages decides each request in this order:

1. **Functions**, for the paths in the `_routes.json` that `wrangler pages functions build`
   writes from `functions/`: `/` (`functions/index.ts`), `/og/street`, `/mcp`, `/api/feedback`.
2. **Static files** in `dist/`. Pages drops `.html`, so `dist/seattle.html` answers `/seattle`
   (and `/seattle.html` redirects there), `dist/insights.html` answers `/insights`.
3. **`dist/404.html`**, with status 404, for everything else. Its presence is what turns off
   Pages' single-page fallback, which used to answer every unknown path (`/robots.txt`,
   `/favicon.ico`, `/anything`) with the map and a 200.

The map is one page at `/`; share links are `/?q=...&cam=...` on that page, so nothing else
needs a fallback. Unknown `/.well-known/*` paths already get the 404 page. A new page plugs in
the same way: a static `dist/<name>.html` (a Vite input or an entry in `src/pages/build.ts`) or a
function file named for its path, such as `functions/privacy.ts` or
`functions/.well-known/mcp.json.ts`. Avoid a catch-all `functions/[[path]].ts` or a
`_middleware.ts` at the root: either would run for every request, shadow the 404 page and the
other functions, and add a function call to every asset.

`robots.txt` allows everything and points at `sitemap.xml`, which lists `/`, `/insights`, `/mcp`,
`/privacy` and each city page (`src/pages/siteFiles.ts`).

## Share previews

"Copy link" writes the address and view into the URL (`src/share.ts`). `functions/index.ts`
runs for `/` only: without a `q` it passes the static `index.html` through untouched; with one it
rewrites `<title>`, the description and the `og:` tags with HTMLRewriter as the file streams
(`server/share/meta.ts`). The address is cut to its first part, stripped to letters, digits and
`. ' # / -`, capped at 60 characters, and set as text; `og:url` is rebuilt from the parsed view.
The canonical link stays `https://subsola.com/`, so search engines treat share links as views of
the home page.

With a camera in the link, `og:image` points at `/og/street?at=<lat>,<lng>&q=<street>`
(`functions/og/street.ts`): a 1200x630 plan of the block with every line where the map places it
(`server/og/plan.ts` runs the same `placeStreet` as the map and the MCP server), in APWA colors,
beside the address (`server/og/draw.ts`). The SVG is rendered to PNG with `@resvg/resvg-wasm`
(about 950 KB compressed in the function bundle) using the Barlow fonts in `public/fonts`. The
typed address is printed only if the city's own street centerlines put a street of that name
within 80 m of the spot; otherwise the nearest street's name, so a crafted URL can't put
arbitrary words on an image from subsola.com. Each picture is cached in the data center's cache
for a day under its parsed parameters. Anything that fails (no cells there yet, a fetch timeout)
serves `/og.png` for ten minutes.

Measured locally (wrangler pages dev, cold isolate): 0.8 to 2.1 s per new picture, most of it
fetching cells; 70 to 370 ms of that is the resvg render. Cached: under 10 ms.

`public/og.png`, the picture for everything else, is a screenshot of `models/preview/og.html`
at 1200x630 (see `models/preview/cutaway.py`).

## City pages

`src/pages/build.ts` writes one page per region at `/<city-slug>` (`citySlug` in
`src/regions.ts`: `/new-york-city`, `/washington-dc`, `/seattle`, ...), plus the 404 page,
`robots.txt` and `sitemap.xml`. `vite.config.ts` loads it through Vite's module runner during the
build and serves the same files in `pnpm dev`. Names, publishers, links and licenses come from
`src/sources/catalog.ts`; 811 details from the region; which sources play which part, and what a
city doesn't publish, from `CITY_FACTS` in `src/pages/cities.ts` (a test fails until a new region
has an entry). The years of permits, miles of mapped pipe and lead line counts come from
`insights.json` at build time (`data/insights.json` locally, else the published copy); if it can't
be read the pages go out without those figures.

### Beta

`Region.beta` holds the reason a city's records are too thin to stand with the others; the city
pages print it and label the city in every list. The bar: street permits that reach back less
than about five years, or permits as the only source. Denver (permits read cleanly from 2020,
and Denver Water publishes no mains), Chicago (permits only) and Dallas (permits only, from late 2021) carry one.
