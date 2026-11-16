# Archives

Some cities only publish a rolling window of their records. Anything that drops out of the window
before Subsola covers the city is gone, so a few sources are archived every night ahead of any
map. Archives are kept, never rebuilt: each night's copy is merged into what is already there.

## Toronto utility cut permits

Toronto isn't on the map. Its utility cut permits are archived so that a future Toronto city starts
with more than 30 months of history.

- **Source:** City of Toronto open data, dataset
  [Utility Cut Permits](https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/utility-cut-permits)
  (Transportation Services), datastore resource `2ed91301-a4d6-4082-9164-e82917b9e5fc`, about
  90,000 permits, refreshed weekly. It covers permits whose proposed start is within roughly the
  last 30 months, and the oldest drop off each week.
- **Licence:** [Open Government Licence – Toronto](https://open.toronto.ca/open-data-licence/).
  Anything built on the archive must carry the attribution:
  "Contains information licensed under the Open Government Licence – Toronto".
- **Script:** `pnpm archive-toronto` (`pipeline/archive/toronto.ts`), run by the nightly after the
  cells go up. The step is `continue-on-error` and runs even when an earlier step failed, so the
  map and the archive never hold each other back. It needs only the R2 secrets the upload uses.

### Where it is

In the R2 bucket, so publicly at `https://data.subsola.com/archive/toronto/...`:

| Key                                             | What                                                      |
| ----------------------------------------------- | --------------------------------------------------------- |
| `archive/toronto/utility-cut-permits.jsonl.gz`  | Every permit ever seen, one JSON object a line, gzipped   |
| `archive/toronto/meta.json`                     | Counts, date range, last run, source and licence          |
| `archive/toronto/snapshots/YYYY-MM-DD.jsonl.gz` | The archive as it stood before that night's merge, weekly |

The archive was about 103,000 permits and 3.2 MB in November 2026. Snapshots are taken when the
newest is a week old and the newest eight are kept, about 26 MB in all. They are there to roll back
a bad merge: copy one over `utility-cut-permits.jsonl.gz`.

The map never reads `archive/`, and `pnpm upload-cells` never removes anything under it
(`ARCHIVE_PREFIX` in `pipeline/r2.ts`), though it removes every other object the cell build didn't
make.

### How a night merges

1. Every row of the datastore is fetched through `datastore_search`, 10,000 at a time. The run
   stops without writing if the row count changes between pages, the rows don't add up to the
   total, or a permit number appears twice.
2. The existing archive is read and checked line by line. A missing archive starts a new one; an
   archive that can't be read or parsed stops the run, so a single night never replaces the
   history. So does a `meta.json` with no archive beside it.
3. Merged by permit number:
   - a permit in tonight's copy takes tonight's fields and `lastSeen` becomes today;
   - a new permit gets `firstSeen` and `lastSeen` of today;
   - a permit no longer in the source stays exactly as it was last seen. `lastSeen` older than
     `meta.json`'s `lastRun` means it has dropped out of Toronto's window.
4. The run checks no permit was lost, writes the weekly snapshot if one is due, then the archive
   and `meta.json`.

The first run also seeded the archive from the datastore Toronto retired in July 2026
(`ebdec599-4522-4473-b276-fa07d8638248`, last refreshed 2026-07-10). It is still online and holds
about 12,800 permits from early 2024 that the current window had already dropped. Those carry
`firstSeen` and `lastSeen` of 2026-07-10.

Dates are UTC days. Proposed dates hold typos (years like 9960); `meta.json`'s `proposedFrom`
range leaves out anything more than five years past the last run, but the rows keep them as filed.

### Fields

| Archived                | Source field                             | Notes                                                    |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------- |
| `permit`                | `PERMIT_NUMBER`                          | The merge key                                            |
| `client`                | `CLIENT_NAME`                            | Utility, agency or company; null when it may be a person |
| `clientWithheld`        | (derived)                                | `true` when `client` was withheld; absent otherwise      |
| `work`                  | `INSTALLATION_TYPE_DESC`                 | "Pole Replacement", "Watermain break-repair", ...        |
| `status`                | `PERMIT_STATUS`                          |                                                          |
| `from`, `to`            | `PROPOSED_FROM_DATE`, `PROPOSED_TO_DATE` | As filed, `YYYY-MM-DD`                                   |
| `geoId`                 | `GEO_ID`                                 | Toronto Centreline segment                               |
| `location`              | `DISPLAY_DESC`                           | The address or street part only                          |
| `crossStreets`          | `DISPLAY_DESC`                           | "Between A AND B" or "Intersected By C"                  |
| `ward`                  | `CITY_WARD`                              |                                                          |
| `district`              | `DISTRICT`                               |                                                          |
| `firstSeen`, `lastSeen` | (archive)                                | First and last night the permit was in the source        |

The source has no coordinates; a dig is placed later from `geoId` on the Toronto Centreline, or
from the address.

Dropped:

- `_id`, the datastore's row number, which changes from one refresh to the next.
- The free-text description inside `DISPLAY_DESC` (`[ Description: ... ]`). It is typed by the
  applicant and has held city staff's names, phone numbers and email addresses. The address and
  cross streets around it are kept. A `location` or `crossStreets` that still looks like it holds
  an email address or phone number is set to null.
- Client names that may be a person's. Nearly every client is a utility, city division or
  contractor, but a handful of permits are filed under a private person's name. Like the NYC
  holders in `pipeline/insights`, only names that read as a company or agency are kept
  (`isCompanyName` in `pipeline/archive/permits.ts`); about ten permits in 103,000 are withheld,
  which includes a few small firms with no company word in their name.

The addresses are where the cut is, in the public right of way, as the City publishes them; the
City notes they are approximate.

### Running it locally

```sh
pnpm archive-toronto --out /tmp/archive   # fetches the live source, reads and writes /tmp/archive
```

`--out` never touches R2 and needs no credentials. Run it twice to see a merge into an existing
archive and a snapshot. Without `--out` it writes to the real bucket, which is the nightly's job.
