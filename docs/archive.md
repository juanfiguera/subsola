# Archives

Some cities only publish a rolling window of their records. Anything that drops out of the window
before Subsola covers the city is gone, so a few sources are archived every night ahead of any
map. Toronto's archive is merged night into night and sits in the public cells bucket; Boston's
and Cambridge's are kept as whole nightly snapshots in a private bucket.

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

## Boston and Cambridge permits (private snapshots)

Neither city is on the map. Their permits are copied every night so a future Boston or Cambridge
city starts with history the sources may no longer hold. Nothing here is served: not on the map,
the MCP server or the site.

- **Boston:** the City's Street Access Awareness layers on ArcGIS Online, all three:
  [expired](https://services.arcgis.com/sFnw0xNflSi8J0uh/arcgis/rest/services/Analytics_Street_Access_Awareness_Expired_Permits/FeatureServer/0),
  [active](https://services.arcgis.com/sFnw0xNflSi8J0uh/arcgis/rest/services/Analytics_Street_Access_Awareness_Active_Permits/FeatureServer/0)
  and [future](https://services.arcgis.com/sFnw0xNflSi8J0uh/arcgis/rest/services/Analytics_Street_Access_Awareness_Future_Permits/FeatureServer/0)
  street permits (excavation, emergency, driveway and street occupancy), with a point each. The
  expired layer is a rolling window: in November 2026 every permit in it ended in 2025 or later.
  The layers state no licence, so check before publishing anything built on them.
- **Cambridge:** [Excavation Permits](https://data.cambridgema.gov/d/nuxx-d95m) on Cambridge's
  Socrata portal (Department of Public Works), every permit since 2019-04-01, under the
  [PDDL](https://opendatacommons.org/licenses/pddl/). It isn't a rolling window; the copies guard
  against rows being edited or removed.
- **Script:** `pnpm archive-snapshots` (`pipeline/archive/snapshots.ts`), run by the nightly after
  `archive-toronto`, `continue-on-error`, and run even when an earlier step failed. One city
  failing doesn't stop the other; a failure shows as a warning on the run, never a failed night.

### Where it is

In a separate R2 bucket named by the `R2_ARCHIVE_BUCKET` secret, never the cells bucket.
data.subsola.com serves the whole cells bucket to anyone, `archive/` included, so a prefix there
would not be private. The archive bucket must have no custom domain and no r2.dev address. The
script refuses to write when `R2_ARCHIVE_BUCKET` names the cells bucket, and writes nothing (with a
warning) while the secret is unset. It uses the same R2 credentials as the upload, so the token
needs access to the archive bucket too.

| Key                                                          | What                                             |
| ------------------------------------------------------------ | ------------------------------------------------ |
| `snapshots/boston/street-permits/YYYY-MM-DD.jsonl.gz`        | Every permit in the three layers that night      |
| `snapshots/cambridge/excavation-permits/YYYY-MM-DD.jsonl.gz` | Every permit in the dataset that night           |
| `snapshots/<city>/meta.json`                                 | Source, licence, fields, last run, counts, bytes |

Each file is the full pull, gzipped JSON Lines, one permit a line, sorted (Boston by layer then
`permit_number`, Cambridge by `id`) so the same pull makes the same bytes and consecutive nights
diff line by line. Nothing is merged or removed; history is rebuilt later from the stack of
nights. In November 2026 a night was about 1.1 MB for Boston (29,660 permits) and 0.7 MB for
Cambridge (9,433), about 650 MB a year together. Dates are UTC days. A run stops for that city
without writing if the row count changes between the first and last page, the rows don't add up
to the count, or the source sends none.

### Fields

Only an explicit allowlist is requested (`outFields` for ArcGIS, `$select` for Socrata), so the
fields left out never leave the city's server. The rows are cut to the allowlist again on arrival.
`pipeline/archive/massachusetts.test.ts` fails if an allowlist gains a field whose name looks like
a person, contact or licence field.

Boston keeps `permit_number`, `permit_type_code`, `permit_type`, `permit_work_type_code`,
`permit_work_type`, `permit_start_date`, `permit_end_date` (epoch milliseconds, as served),
`company_name`, `length_estimated`, `squarefootage_estimated`, `sam_id`, `sam_full_address`, plus
`layer` (`expired`, `active` or `future`) and `lon`/`lat` (WGS84). Left out: `permit_description`,
free text that holds the names and phone numbers of crews, police details and neighbours; the
`*_for_map` labels, which restate the type fields; `ObjectId`.

Cambridge keeps the permit's `id`, `full_address`, `latitude`, `longitude`, `mbl`, `status`,
`permit_type`, the submit, issue, start and end dates, `work_between_standard_hours`, the three
company fields, `work_performed_by_a`, `performing_utility_work`, `utilities`, `new_gas_main`,
`dig_safe_number`, `viewpoint_id`, `city_contract`, `department_responsible_for`, the public and
private roadway, sidewalk, sewer, stormwater, water, utility/comm and site work flags,
`approved_curb_cut`, `cutting_the_street_and_or`, and every street cut's length, width, depth and
area and sidewalk cut's length, width and material. Left out: `applicant_name`; the hoisting
licence number, grade and expiry; `contractor` (the firm's city licence number); `on_behalf` and
`attestat_date`; the FEMA descriptions, `other_utility`, `city_contract_name` and the utility and
water permit numbers, all free text that has held people's names; `location_flags`, the computed
regions and `coordinates`, derived from the point; parking sign counts. `dig_safe_number` is cut
down to the ticket numbers in it.

Company names are kept only when they read as a firm or agency. Boston's `company_name` and
Cambridge's company, client and subcontractor fields include sole traders and people
("Firm - Jane Doe", "Jane Doe dba Firm", "Firm (PM: Jane Doe)"), so every piece of the value has to
read as a company on its own (`isMassachusettsCompany` in `pipeline/archive/massachusetts.ts`).
Anything else is written as `null` with `<field>_withheld: true`. In November 2026 that withheld
1,675 Boston values (mostly street occupancy and crane permits; the utilities and large
contractors all pass) and 865 across Cambridge's three fields. Any other text that looks like it
holds a phone number or email address is set to null.

### Running it locally

```sh
pnpm archive-snapshots --out /tmp/snapshots   # fetches the live sources, writes /tmp/snapshots
```

`--out` never touches R2 and needs no credentials.
