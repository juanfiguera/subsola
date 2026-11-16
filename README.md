# Subsola

What public records say is under city streets, mapped.

Subsola reads what cities, counties and utilities publish (excavation permits, utility maps,
lead service line inventories, street fixtures) and draws the street in 3D with each utility
likely under it at its expected depth. Type an address in New York City, Washington, DC, San
Francisco, Los Angeles, San Diego, Seattle, Denver or Chicago and you get the lines out front,
who has dug there and when, and a lot report you can print. The same records answer AI
assistants through an MCP server at `/mcp`.

It runs at [subsola.com](https://subsola.com). This repository is the whole thing: the map, the
MCP server, and the nightly pipeline that downloads the records and builds the files both read.

## What it is not

Read this before trusting a line on the map.

- **Not a utility locate.** Nothing here replaces the mark-out the law requires before digging.
  Call 811 (each city's one-call center is linked on its map and in every answer) at least two
  working days ahead.
- **Positions are approximate unless an owner publishes them.** Where a utility publishes its
  own map (San Francisco's and Los Angeles's sewers, Seattle's water, sewer and electric, San
  Diego's sewer and water, Denver's sewers), lines follow it. Everywhere else a line means
  excavation permits show that utility on that block, and it is drawn at a standard offset in
  the street, not where the pipe is. Every card says which.
- **Depths are code minimums unless measured.** Depth comes from installation standards (federal
  gas rules, city water and sewer specifications), drawn at the shallowest depth a digger could
  meet the line, except where an owner publishes a measured depth (sewer inverts and rims in
  several cities). Electric, telecom and steam owners publish no burial depths, so those are
  marked unknown.
- **Absence proves nothing.** A line no one has dug up since the records begin won't appear, and
  gas, electric and telecom companies keep their routes private.
- **Records lag.** They are rebuilt nightly from each city's published data, which has its own
  delays and errors; every answer gives its records-as-of date.

More on what the map shows: [docs/features.md](docs/features.md). City by city:
[docs/regions/](docs/regions/).

## Cities and sources

| City           | Main sources                                                                                                                | Credit required                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| New York       | NYC Open Data (DOT permits, DEP hydrants, catch basins, lead service lines, connection permits; OTI streets), OpenStreetMap | None by law today; Subsola names each dataset                                                          |
| Washington, DC | Open Data DC (DDOT permits, OCTO streets, OTR lots, DOEE outfalls)                                                          | "Source: Open Data DC, [agency]; CC BY 4.0; modified by Subsola"                                       |
| San Francisco  | DataSF (Public Works permits, streets, SFMTA signals), the City's sewer and hydrant map services                            | None required                                                                                          |
| Los Angeles    | City of Los Angeles GeoHub (Engineering permits, Sanitation sewers and storm drains), LA County eGIS                        | None required                                                                                          |
| San Diego      | City of San Diego open data (permits), SanGIS (streets, sewers, water mains, storm drains)                                  | "GIS data derived, modified, reduced, and/or processed from SanGIS downloadable data - www.sangis.org" |
| Seattle        | City of Seattle open data (SDOT permits, Seattle Public Utilities, Seattle City Light)                                      | None required                                                                                          |
| Denver         | City of Denver Open Data Catalog (permits, Wastewater sewers and storm drains)                                              | "City of Denver Open Data Catalog", CC BY 3.0, both linked                                             |
| Chicago        | City of Chicago data portal (CDOT permits), Cook County address points                                                      | Chicago's disclaimer, word for word (below)                                                            |

The full credits, as the site shows them, are at [subsola.com/credits](https://subsola.com/credits)
and in `src/attribution.ts`. If you run your own copy, you owe the same credits; the app shows
them for you.

## Data terms and attribution

Subsola republishes derived public records (drawn lines, permit lists, lot reports) on the site,
in the cell files at data.subsola.com and through the MCP server. Each publisher's terms were read
on 2026-11-15; this is a reading of the terms, not legal advice. "Paid" says whether the terms
allow charging for access.

| City or layer  | Source and terms                                                                                                   | Republish                                                                                       | Paid                                                 | Attribution                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New York       | NYC Open Data; NYC Admin. Code §23-502(d): "no restrictions on their use" (no license, not formally public domain) | Yes                                                                                             | Yes                                                  | None now; the City may require naming the dataset, its version and our changes, so cards cite each dataset                                                            |
| New York       | NYS ITS orthoimagery                                                                                               | Not stated                                                                                      | Not stated                                           | Courtesy: "NYS ITS Geospatial Services"                                                                                                                               |
| New York       | Con Edison structures map                                                                                          | **No** without written consent (coned.com terms)                                                | **No**                                               | None                                                                                                                                                                  |
| Washington, DC | Open Data DC; each layer CC BY 4.0                                                                                 | Yes                                                                                             | Yes                                                  | **Required**: "Source: Open Data DC (opendata.dc.gov), [agency]; CC BY 4.0; modified by Subsola"                                                                      |
| Washington, DC | DC Water mains and lead service lines (geo.dcwater.com)                                                            | **No**: "not for any commercial, legal or other use"                                            | **No**                                               | None                                                                                                                                                                  |
| San Francisco  | DataSF, PDDL 1.0                                                                                                   | Yes                                                                                             | Yes                                                  | Not required; credit San Francisco Public Works, SFMTA                                                                                                                |
| San Francisco  | City ArcGIS services (sewers, hydrants, lights, aerial tiles)                                                      | Not stated                                                                                      | Not stated                                           | Courtesy: City and County of San Francisco                                                                                                                            |
| Los Angeles    | GeoHub layers (permits, sewers, storm drains, hydrants, lights, signals, sidewalks)                                | Not stated (`license: none`)                                                                    | Not stated                                           | Courtesy: City of Los Angeles, Bureau of Engineering                                                                                                                  |
| Los Angeles    | LA County eGIS (buildings, geocoder)                                                                               | Yes, "commercial and/or personal use"                                                           | Yes                                                  | Not required; no implied County endorsement                                                                                                                           |
| San Diego      | data.sandiego.gov, PDDL (permits)                                                                                  | Yes                                                                                             | Yes                                                  | Not required                                                                                                                                                          |
| San Diego      | webmaps.sandiego.gov layers (lights, signals)                                                                      | **Not for commercial use or mirroring** (sandiego.gov terms; PDDL covers only portal downloads) | **No**                                               | None                                                                                                                                                                  |
| San Diego      | SanGIS layers (streets, buildings, sewers, water, hydrants, storm drains)                                          | Allowed, "discouraged"                                                                          | Yes, except insurance and emergency response uses    | **Required wording**: "GIS data derived, modified, reduced, and/or processed from SanGIS downloadable data - www.sangis.org"; never SanGIS as the sole source         |
| San Diego      | Lead service line inventory                                                                                        | **No**: "any sale, reproduction or distribution... expressly prohibited"                        | **No**                                               | None                                                                                                                                                                  |
| Seattle        | Seattle open data terms                                                                                            | Yes                                                                                             | Yes, except data that works as a list of individuals | None required                                                                                                                                                         |
| Seattle        | King County geocoder                                                                                               | Yes                                                                                             | **No sale** without a written agreement              | None                                                                                                                                                                  |
| Denver         | Denver Open Data, CC BY 3.0                                                                                        | Yes                                                                                             | Yes                                                  | **Required**: "City of Denver Open Data Catalog" linked to data.denvergov.org, and "CC BY 3.0" linked to the license; sewer layers say "not for engineering purposes" |
| Denver         | Denver Water lead service line map                                                                                 | **No**: "reproduction or distribution... expressly prohibited"                                  | **No**                                               | None                                                                                                                                                                  |
| Chicago        | City of Chicago data portal terms                                                                                  | Yes, as a modified-data application                                                             | Not addressed                                        | **Required disclaimer**, verbatim, where the app is accessed (below)                                                                                                  |
| Chicago        | Cook County address points (geocoder)                                                                              | Yes, public domain                                                                              | Yes                                                  | Courtesy: Cook County GIS                                                                                                                                             |
| All            | OpenStreetMap, ODbL 1.0                                                                                            | Yes, share-alike                                                                                | Yes, but OSM-derived data must stay free to download | **Required**: "© OpenStreetMap contributors" linked to openstreetmap.org/copyright, in the map and inside the cell files                                              |
| All            | OpenFreeMap basemap (OpenMapTiles schema, CC BY 4.0)                                                               | Yes                                                                                             | Yes                                                  | **Required**: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (MapLibre shows it from the tiles)                                                                 |
| Some cities    | USGS NAIP imagery                                                                                                  | Yes, public domain                                                                              | Yes                                                  | Courtesy: "U.S. Geological Survey"                                                                                                                                    |
| All            | Google Fonts (Barlow), SIL OFL 1.1                                                                                 | Yes                                                                                             | Yes                                                  | None                                                                                                                                                                  |

**Where credits appear.** The wording lives in `src/attribution.ts` and is used everywhere: the
[credits page](https://subsola.com/credits) (every city, Chicago's disclaimer, what is paused),
linked from the map's corner links and every page footer; the foot of each city's card on the map
(that city's credit and aerial photo credit); each lot report's sources footer; a `credits` field
and "Data credits" line in every MCP answer; and a `credits` entry in each cell file and in
`index.json` on data.subsola.com, with the ODbL notice for the OpenStreetMap-derived layers. The
city map shows OpenFreeMap's and OpenStreetMap's credit through MapLibre's attribution control.

**Chicago's required disclaimer**, to appear wherever the app can be accessed:

> This site provides applications using data that has been modified for use from its original
> source, www.cityofchicago.org, the official website of the City of Chicago. The City of
> Chicago makes no claims as to the content, accuracy, timeliness, or completeness of any of the
> data provided at this site. The data provided at this site is subject to change at any time.
> It is understood that the data provided at this site is being used at one's own risk.

**Conditions nearly every publisher shares**: the data comes as is, unverified and not for
engineering, surveying or legal use; no implying a city or utility endorses Subsola; and, for
DataSF, San Diego, SanGIS, SANDAG and LA County, an indemnity. The site and every MCP answer
already say the data is public-records evidence, not a survey, and to call 811.

**OpenStreetMap share-alike.** The `osm` layer in each cell file, and city signals de-duplicated
against OSM, are an ODbL derivative database: they must stay under ODbL and free to download,
with the attribution and a license link inside the data, whatever a paid tier charges for.
OpenStreetMap points come only from Geofabrik's daily extract in the nightly build; the app
never queries the volunteer-run Overpass servers, whose usage policy rules out commercial use.

**Paused for their terms** (2026-11-15): Con Edison structures, DC Water mains and lead service
lines, Denver Water's and San Diego's lead service line inventories, and San Diego's street lights
and signals (from webmaps.sandiego.gov, whose terms forbid mirroring). `PAUSED_SOURCES` in
`src/sources/catalog.ts` holds them back from every payload: the nightly build skips them, cells
built before the pause are filtered as they load (map, lot reports, MCP, share images), and lot
reports and answers say the record is paused and link to the publisher's own map. Permission has
been asked of each publisher; removing an entry brings the source back with the next build. San
Diego's permits moved to the city's open data portal (PDDL) instead of being paused.

## Self-hosting

One command runs the map, the MCP server and the nightly ingestion for one city:

```sh
git clone https://github.com/juanfiguera/subsola.git && cd subsola
docker compose up
```

Then open http://localhost:8080 once the `ingest` service logs `is live`. The first build of
Seattle, the default, downloads about 70 MB of public records and takes a few minutes. The MCP
server answers at http://localhost:8080/mcp.

What runs:

- **ingest** downloads one city's records from the publishers, builds the 250 m cells the map and
  the MCP server read, swaps them in whole, then waits a day and does it again
  (`selfhost/ingest.sh`). A failed night keeps the last good cells.
- **web** serves the built map, the MCP server and the cells on Cloudflare's local Pages runtime
  (`wrangler pages dev`), the same code that runs on subsola.com (`selfhost/web.sh`). The
  feedback form and the MCP rate limits keep their rows in a local SQLite copy of D1.

Settings, as environment variables for `docker compose`:

| Variable                         | Default      | What it does                                                            |
| -------------------------------- | ------------ | ----------------------------------------------------------------------- |
| `CITY`                           | `sea`        | The city to build: `nyc`, `dc`, `sf`, `la`, `sd`, `sea`, `den` or `chi` |
| `PORT`                           | `8080`       | Where the map and `/mcp` listen                                         |
| `INGEST_EVERY_SECONDS`           | `86400`      | How long ingest waits between builds                                    |
| `FEEDBACK_SALT`, `REQUESTER_KEY` | placeholders | Secrets that hash IPs for rate limits and stats; set your own           |

Cells go to `./selfhost-data`. New York is the largest city by far (3.7 million permits, about
an hour to download) and also needs `osmium-tool` for its OpenStreetMap points; the other cities
build in minutes. Error reporting, analytics and the feedback form's bot check stay off unless
you build with your own `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY` and `VITE_TURNSTILE_SITE_KEY`.

The sources paused for their terms (see above) stay paused in your copy too. Each publisher's
terms apply to your copy as they do to subsola.com.

Without Docker, the same steps by hand:

```sh
pnpm install
CITY=sea pnpm download      # one city's records into data/raw
CITY=sea pnpm build-cells   # data/cells
echo "VITE_CELLS_URL=/cells" > .env.local
pnpm dev                    # http://localhost:5173; the dev server serves data/cells at /cells
```

## Development

```sh
pnpm install
pnpm dev          # http://localhost:5173; without VITE_CELLS_URL, NYC loads live from NYC Open Data
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Optional: `VITE_SOCRATA_APP_TOKEN` in `.env` (see `.env.example`) raises NYC Open Data's rate
limits.

**The full build.** `pnpm download` fetches every city's datasets (it resumes if stopped),
`pnpm download-osm` cuts OpenStreetMap's manholes, lamps and signals from Geofabrik's New York
extract (needs `osmium-tool`), `pnpm build-cells` writes about 80,000 cells to `data/cells`, and
`pnpm insights` writes `data/insights.json` for the Insights page. On subsola.com the nightly
workflow (`.github/workflows/nightly.yml`) runs these and `pnpm upload-cells`, which sends the
changed cells to a Cloudflare R2 bucket (credentials in `.env.r2`), and every push to `main`
deploys the site to Cloudflare Pages (`.github/workflows/deploy.yml`).

**Visual tests** (`pnpm test:visual`) replay recorded network captures in `tests/visual` and
compare screenshots; only Linux baselines from CI are kept.

## Depth

No NYC dataset publishes pipe depths, so the scene uses installation standards and draws each
pipe at its **shallowest expected depth**: the depth a digger would hit it first.

| Utility                  | Range drawn                 | Basis                                                                                                                                                                           |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gas                      | 1.5 to 4 ft                 | [49 CFR 192.327(b)](https://www.law.cornell.edu/cfr/text/49/192.327) (24 in mains), [192.361](https://www.law.cornell.edu/cfr/text/49/192.361) (18 in services in streets)      |
| Water                    | 3.4 to 5 ft                 | [NYC DDC Water Main Standard Specifications](https://www.nyc.gov/assets/ddc/downloads/publications/infrastructure/watermain_std_specs_090801.pdf), p. 89 (3'-5" to 4'-0" cover) |
| Sewer                    | 5 to 25 ft                  | [NYC DEP Sewer Design Standards](https://www.nyc.gov/assets/dep/downloads/pdf/about/water-and-sewer-forms/sewer-design-standards.pdf) (details for 5 to 25 ft cover)            |
| Electric, telecom, steam | 0.5 to 6 ft, marked unknown | Owners do not publish burial specs                                                                                                                                              |

Depth is stretched 6x by default (1x, 2x, 4x, 6x, 8x or 10x) because real depths look flat at street
scale; every label stays in real feet. Utilities are drawn side by side because their exact
position in the street is not public, except where crew dig notes place a lane (see Crew dig
spots).

## Layout

- `src/sources/` one module per data source, all validated with Zod
- `src/scene/` the 3D world: `local.ts` (meters around the address), `build.ts` (data to
  geometry), `scene.ts` (deck.gl orthographic orbit view and layers), `pins.ts` (map pin icons)
- `src/ui/` details cards, layer list, history chart
- `src/depth.ts` depth standards with citations
- `src/brief.ts` per-utility summary

## License

Subsola is free software under the [GNU Affero General Public License v3.0](LICENSE): you can
use, change and share it, and if you run a changed version for others over a network, you must
offer them its source. See [NOTICE](NOTICE). The Subsola name and logo are not covered by this
license.

The public records it reads belong to their publishers and carry their own terms; see "Data
terms and attribution" above.
