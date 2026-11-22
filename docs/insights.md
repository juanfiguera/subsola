# Insights page

`https://subsola.com/insights` shows what the records say across the ten cities: how often a
block is dug again, who digs in New York, the most-dug blocks, pipe materials and lead service
lines. Every number on it is read from `insights.json` when the page loads; none is typed into the
markup.

## How it is fed

1. The nightly (`.github/workflows/nightly.yml`) runs `pnpm build-cells`, then `pnpm insights`
   (`pipeline/insights.ts`), which reads the built cells and writes `data/insights.json`. The step
   is `continue-on-error`, so a failure there never holds back the map's cells.
2. `pnpm upload-cells` (`pipeline/upload.ts`) sends `data/insights.json` to the R2 bucket as
   `insights.json` at its root, after `index.json`, with `Content-Type: application/json` and
   `Cache-Control: public, max-age=300`, the same as the index. It is only sent when its bytes
   changed. A night without the file leaves the published copy alone: `insights.json` is never
   removed by the upload's clean-up of old cells (`planUpload`'s `keep` set in `pipeline/r2.ts`).
3. The page fetches `https://data.subsola.com/insights.json` (`VITE_CELLS_URL` plus
   `/insights.json`), checks it against `src/insights/schema.ts` and draws it. If the fetch or the
   check fails, it says so and offers to try again rather than drawing empty charts.

The nightly also attaches `data/insights.json` to the run's `stats` artifact.

## What the page reads

- `permits.<city>.reopening`: repeat digs within 1 and 3 years, median days between digs, digs
  within 90 days of another utility, and the most-visited blocks. Only NYC, DC, SF, Seattle,
  Denver, Chicago, Dallas and San Jose are charted; LA and San Diego file one permit per job, often for a whole street.
- `permits.nyc.topHolders` and `streetOpenings`: New York's largest permit holders. The page
  combines a company's old names (KeySpan and Brooklyn Union Gas into National Grid) and leaves out
  the group of names that may be a person's.
- `pipes.<source>`: miles, median install year and material shares for LA sewers, San Diego water
  and sewers, Seattle water and sewers, Denver and San Jose sanitary sewers and storm drains, SF sewers and
  DC's 16 in and larger water mains.
- `leadServiceLines.<city>.summary`: one shape per city (`unit`, `total`, `lead`, `galvanized`,
  `unknown` and their shares) from `pipeline/insights/lead.ts`. DC's galvanized is null, since DC
  Water files galvanized pipe under lead, as does Denver Water; Denver's, Chicago's, Dallas's and
  San Jose's figures are optional in the schema, so a file from before any of them joined still
  loads. San Jose Water's inventory is paused, so San Jose has permit and pipe figures only.
  Chicago publishes no pipes and no inventory, so it has permit figures only; Dallas publishes no
  pipes, so it has permit and lead line figures. A city whose inventory didn't download has a total of 0
  and is left off the chart.
- `models.licenses`: the name, publisher, license and link of each dataset, for the sources list.
- `cellsBuiltAt`: the "Figures as of" date.

The derivations (street name tidying, holder names, material names, which systems and cities
appear) are pure functions in `src/insights/derive.ts` and `src/insights/figures.ts`, tested in
`src/insights/derive.test.ts`. The test also checks that every `data-fig` slot in `insights.html`
has a figure.

## Privacy

`insights.json` is public. It holds counts, street segments and company names: block names are
public street segments, never addresses; NYC permittees that don't read as a company or agency are
grouped as "Holder not shown (may be a person)", and so are Chicago's (the build does it, from
`pipeline/chi/permits.ts`); Dallas's holders are only the owners the portal finds in the company
field, or the first contractor that reads as a company (`pipeline/dal/permits.ts`), and Dallas's
block names are the street and its block's address range; San Jose's holders are fixed company
names worked out from the permit number and description, never text from the permit
(`pipeline/sj/permits.ts`), and its block names are the street and its address range; the lead
line figures are counts only.
`pnpm insights` also refuses to write the file if any string in it looks like an email address or
phone number (`pipeline/insights/privacy.ts`).

## Working on it locally

`insights.html` is a second Vite page (`build.rollupOptions.input` in `vite.config.ts`), served by
Pages at `/insights`. With a local build:

```sh
pnpm insights                               # needs data/cells from pnpm build-cells
VITE_CELLS_URL=/cells pnpm dev              # then open http://localhost:5173/insights.html
```

The dev server answers `/cells/insights.json` with `data/insights.json`. Without local cells, put
any `insights.json` in the shape `pipeline/insights.ts` writes in a folder and point
`SUBSOLA_DATA_DIR` at it.
