# Backlog

Ideas not yet scheduled, newest first.

- **San Jose Water's service line inventory** (added 2026-11-22). Paused for sjwater.com's terms;
  if SJW allows it, the build step still needs writing (the dataset spec is there). See
  docs/regions/sj.md.

- **Dallas alleys, street lights and signal cabinets** (added 2026-11-19). Many Dallas utility
  lines run in alleys, which the city publishes (`ALLEYS_SHAPEFILE` on its ArcGIS organization);
  drawing them as blocks would put alley permits where they are instead of on the nearest street.
  The city also publishes street lights and signal cabinets. See docs/regions/dal.md.

- **LA permit history back to 1987** (added 2026-11-11). The Bureau of Engineering's permit list,
  `data.lacity.org` dataset `j7mw-thyc`, has about 640k permits since 1987 under a public domain
  dedication. LA's map starts in 2000 today; this could add 13 more years of digs to repeat-dig
  figures. Check which rows are utility excavations, how they locate (address or street), and
  that no contact names or phones come with them before downloading.
- **Chicago's 811 tickets** (added 2026-11-11). `cygx-ui4j`, 18.5M Chicago 811 (DIGGER) tickets
  since 2018 with the utilities notified, would show who has lines under each block. Too big for
  the nightly as it is, and it holds callers' names; see docs/regions/chi.md.

- **Insights from the collected data** (added 2026-11-08). For social posts, blog posts and
  possibly training a model. `pnpm insights` writes data/insights.json from the built cells; every
  figure names its datasets and filter. Next: pick the stories, check each against the source
  before posting, and decide on a model (the next dig on a block is the strongest idea). LA,
  Seattle and the DC Water and SF sewer map services state no open license, so leave them out of
  any training set until cleared.

## Done

- **Tenth city: San Jose** (done 2026-11-22). See [regions/sj.md](regions/sj.md).
- **Ninth city: Dallas** (done 2026-11-19). See [regions/dal.md](regions/dal.md).
- **Seventh and eighth cities: Denver, then Chicago** (done 2026-11-11). See
  [regions/den.md](regions/den.md) and [regions/chi.md](regions/chi.md).
- **An MCP server for the data** (done 2026-11-08). `https://subsola.com/mcp`, with `whats_under`
  and `recent_digs`; see [mcp.md](mcp.md). Rate limited in D1 since 2026-11-10; documented at the URL itself.
