# San Francisco

Subsola's third city, and the first of four added in November 2026 (then Los Angeles, San Diego
and Seattle). San Francisco Public Works publishes every street excavation permit since 1998,
each tied to the block it was on, and the Bureau of Engineering publishes the city's whole sewer
network with rim and invert elevations.

## Approach

As with DC: the pipeline converts SF's data into the same cell bundles NYC uses, and the app
learns about the city only where it really differs (geocoder, aerial photo, depths, wording,
credits). SF loads from the nightly build only.

## Sources (verified 2026-11-08)

DataSF moved from data.sfgov.org to **data.sf.gov**. The old domain redirects in a way browsers
refuse, so everything uses the new one.

| Input                     | Source                                                                                                                   | Notes                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excavation permits        | `data.sf.gov` `b6tj-gt35` (Street-Use Permits), types Excavation, ExcStreet, Emergency                                   | About 385k utility rows since 1998, one row per permit per block (CNN). There is no utility field: the utility comes from the `agent` and `permit_purpose` (`permits.ts`). The point is the block's midpoint. `contact`, `agentphone`, `inspector` and `planchecker` carry people's names and numbers and are never read. |
| Blocks                    | `3psu-pn9h` (Streets, Active and Retired)                                                                                | 17k segments keyed by CNN, with street name and cross streets. 22% of permit rows name an intersection CNN instead, found in `vd6w-dq8r` (Street Nodes).                                                                                                                                                                  |
| Curbs, roadway, buildings | `emxt-b6yg` (2016), `h8n7-e4ns` right-of-way polygons (2014), `ynuv-fyni`                                                | Older than NYC's or DC's, but the streets haven't moved.                                                                                                                                                                                                                                                                  |
| Sewers                    | `gis.sf.gov/svc/rest/services/boe/SEWER_ASSETS_ALL_STATUS/FeatureServer`: 0 nodes, 1 side sewers, 2 mains                | 71k active mains with size, material, use (combined, storm, sanitary) and year. Manholes and catch basins carry rim and invert elevations, so sewer depth is measured, not assumed. The server has slow spells; the downloader retries and can skip a layer for a night.                                                  |
| Storm inlets              | `jtgq-b7c5`                                                                                                              | 24k                                                                                                                                                                                                                                                                                                                       |
| Hydrants                  | `services.arcgis.com/Zs2aNLFN00jrS4gG/.../Firefighting_ESF_4/FeatureServer` 3 (high pressure, AWSS) and 4 (low pressure) | A 2018 snapshot; SFPUC's current layer has queries turned off.                                                                                                                                                                                                                                                            |
| Streetlights              | same org, `SFPUC_Streetlights/FeatureServer/0`                                                                           | SFPUC's 25k poles only; PG&E's are not published.                                                                                                                                                                                                                                                                         |
| Signals                   | `ybh5-27n2`                                                                                                              | 1.5k intersections                                                                                                                                                                                                                                                                                                        |
| Lots                      | `acdm-wktn` (Parcels)                                                                                                    | `blklot` and outline; no owner field                                                                                                                                                                                                                                                                                      |
| Geocoder                  | `gis.sf.gov/svc/rest/services/loc/eas_addresses_gc_locator/GeocodeServer`, with EAS (`3mea-di5p`) by SoQL                | Keyless, browser-callable.                                                                                                                                                                                                                                                                                                |
| Aerial photo              | `tile.sf.gov/api/tiles/p2025_rgb8cm/{z}/{x}/{y}`                                                                         | The city's 2025 orthophoto at 8 cm, as XYZ tiles (no `export`).                                                                                                                                                                                                                                                           |

Not published anywhere: potable water mains, gas distribution, steam, telecom routes. Lead
service lines are published only for the ~970 addresses still to fix, so phase 4 is an overlay,
not a citywide layer like NYC's or DC's.

## Phases

1. **Pipeline adapter.** Done 2026-11-08. `pipeline/sf/`: the SF layers download with the others
   (about 2 minutes; offset paging works on the sewer server after all), permits are classified
   from their agent and purpose (`permits.ts`) and grouped by CNN, and streets, ground and point
   assets go into the same cells. First build: 284,425 utility rows of 375,812 excavation rows,
   in 63,454 block groups, all but 7 on a known block or intersection. 84,851 are PG&E rows that
   don't say gas or electric, filed as gas.
2. **Region in the app.** Done 2026-11-08. `src/regions.ts` adds SF with the city's locators
   (`src/sources/sfGeocode.ts`), the 2025 orthophoto as XYZ tiles (`photoTiles`), depths, USA
   North 811 and its own sources card and report wording.
3. **Sewers.** Done 2026-11-08, mains only. The 61,413 city sewers (PUC and Treasure Island;
   private, park and state sewers left out) are drawn on their mapped routes; 58,252 get a
   measured depth from the manholes at their ends, rim less invert less the pipe's height. With
   the whole network mapped, SF draws no sewers placed from permits. The 165,828 side sewers are drawn on
   their recorded routes at the shallowest sewer depth, and the lot report finds a building's by
   its address.
4. **QA.** A test street in the visual tests, and a hand check of random permits.

## Settled

- **Who dug.** PG&E, which runs both gas and electric, names the work on only about one permit
  in five. Gas or electric is read from the work first (leaks, valves, Kerotest, cathodic
  protection, MWC 14 and 50 gas main and service programs are gas; transformers, kV, switches,
  primary, conduits, vaults and joint trenches are electric unless the purpose says gas), then
  from a contractor's trade ("Phoenix Electric", "Sheeran Pipeline"), with the reading SD and
  Denver share (`pipeline/gasOrElectric.ts`). The rest are filed as gas, marked inferred, and the
  card says so: gas is the conservative guess for someone about to dig. A contractor's purpose
  that mentions PG&E is read the same way; "PG&E" alone never means gas, and where the purpose
  names other work but not gas or electric ("water main, relocate PG&E") PG&E is left out.
  Contractors otherwise count only when the purpose names the work (SFPUC water contracts "WD-",
  sewer contracts "WW-", "water main", "sewer"). Paving, curb ramps and sidewalk repair are left
  out.
- **811**: USA North 811, at least two working days ahead, not counting the day of the call, and
  no more than 14 calendar days (Gov. Code §4216.2).
- **Depths**: water 36 in to the top of 4 to 8 in mains (SFPUC CDD Standard Plans 2020, CDD-LP-002),
  gas mains 24 in and services 18 in (49 CFR 192.327, 192.361), electric 24 in under streets
  (CPUC GO 128 Rule 33.4-C), telecom 18 in (GO 128 App. A). Sewer from the network's own rim and
  invert.
