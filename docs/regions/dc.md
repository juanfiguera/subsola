# Washington, DC

Subsola's second city. Chosen in a survey of 16 US cities (November 2026) because DC publishes
what NYC does, and in places more: DDOT's excavation permits name the utility itself and the
exact work, DC Water publishes service line material by address, and DC GIS publishes curbs,
sidewalks, roadway blocks, spot elevations and street assets.

## Approach

DC's data is converted in the pipeline into the same cell bundles NYC uses, so the drawing
code (lanes, continuations, corners, services, fixtures) stays one code path. The app learns
about regions only where they really differ: the geocoder, aerial photo, depth standards,
wording, source credits and the city map's starting view. DC loads from the nightly build only;
the live per-source path stays NYC-only.

## Sources (verified 2026-11-02)

| Input                                       | Layer                                                                                                                   | Notes                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excavation permits                          | `maps2.dcgis.dc.gov/dcgis/rest/services/DDOT/TOPS/MapServer/0`, `IsExcavation=1`                                        | 468k rows since about 2011. `TypeDetailNames` lists the work ("Excavation; Gas Main Line (Trench)"), `PermitteeName` the utility. One row per location: an address or a "800 - 899 BLOCK OF F STREET NW" range, with a point snapped to the street (`OnSegX/Y`). |
| Blocks                                      | `.../DCGIS_DATA/Transportation_WebMercator/MapServer/163` (Roadway Block)                                               | 13,833 intersection-to-intersection blocks with street name, cross streets, address ranges, sidewalk and roadway widths. The unit permits are grouped by.                                                                                                        |
| Service lines                               | `geo.dcwater.com/arcgis/rest/services/Public/WaterServiceInfo_new/MapServer/0`                                          | 128k premises with public and private side material, as points. Joined to lots to draw the line from main to building.                                                                                                                                           |
| Lots                                        | `.../Property_and_Land_WebMercator/MapServer/40` (Owner Polygons)                                                       | 137k tax lots. Only `SSL` and the outline are read; the layer also carries owner names, which stay out of the build.                                                                                                                                             |
| Curbs, sidewalks, roads                     | Transportation layers 115, 83, 61                                                                                       |                                                                                                                                                                                                                                                                  |
| Buildings                                   | `.../Facility_and_Structure_WebMercator/MapServer/1`                                                                    |                                                                                                                                                                                                                                                                  |
| Spot elevations                             | `.../Elevation_WebMercator/MapServer/1`                                                                                 | 291k, for sewer flow.                                                                                                                                                                                                                                            |
| Hydrants, inlets, outfalls, lights, signals | Public_Safety 5, Facility_and_Structure 5, Environment_Stormwater_Management 68, DDOT/Streetlights 0, DDOT/DdotAssets 5 |                                                                                                                                                                                                                                                                  |
| Large water mains                           | `geo.dcwater.com/.../Viewer/DWS16inLargeMain/MapServer/4`                                                               | Mains 16 in and up only. A surveyed line where it exists.                                                                                                                                                                                                        |

## Phases

1. **Pipeline adapter.** Done 2026-11-03. `pipeline/dc/`: the DC layers download with the
   others (ArcGIS paging, about 2 minutes), permits are classified from their work items and
   permittee (`permits.ts`), matched to the nearest Roadway Block on the street they name
   (`blocks.ts`), and written into the same cells (`build.ts`). First full build: 409,676 utility
   permits of 468,446 excavation rows, in 43,300 block groups; rooftop spot elevations dropped.
2. **Regions in the app.** Done 2026-11-03. `src/regions.ts` picks the geocoder (DC GIS's MAR
   locator, keyless), aerial photo (DC's 2025 orthophoto, 3 in), depth standards, 811 center
   (Miss Utility, four working days), sources card and report wording by location. DC streets
   outside the build say so instead of loading NYC's live sources.
3. **Service lines.** Done 2026-11-04. `pipeline/dc/services.ts`: DC Water's 127,835 premises
   are matched to the tax lot they sit in (Owner Polygons, layer 40, read for SSL and outline
   only), 99.4% of them; a lot with several premises keeps its worst line. Each keeps both
   sides, public (main to property line) and private, verified or suspected. Galvanized iron
   that DC Water files under lead is called galvanized, as NYC's inventory does. Water only:
   DC publishes nothing on house sewers, and the 18 in curb valve is DEP's rule, so neither is
   drawn.
4. **QA.** Done 2026-11-04. 800 F St NW is in the visual tests (street, underground, lot
   report) from its own recording, `tests/visual/dc-network.har.zip`. A hand check of 12
   random DC permits against DDOT's own rows put all 12 on the right block; three sat 25 to
   28 m back from the line, where DDOT places a permit at the building's address point.
   Recording also showed DC GIS's geocoder failing about one request in five with a 503, now
   retried.
5. **City map.** Done 2026-11-03. The map holds to whichever city is in view, with a button
   to switch.

6. **Large mains.** DC Water's mains 16 in and larger (`Viewer/DWS16inLargeMain/MapServer/4`,
   about 6,400 active segments) drawn on their mapped routes, sized by diameter, with material
   and install year on the card. They sit beside the permit-placed water line rather than
   replacing it, since a street can have both, and service lines don't tap them. The layer
   never gives depth, so they're drawn at DC Water's minimum cover. Only fields describing the
   pipe are read; the layer's criticality and vulnerability scores stay out.

## Settled

- **Depths** (`src/depth.ts`, `DC_DEPTH_STANDARDS`): water 4 ft minimum cover (DC Water Project
  Design Manual Vol. 3, §4.3.3, §4.8.2); sewers about 10 ft 6 in to invert, 4 ft minimum in
  isolated reaches, storm 5 ft 6 in (§5.6.1.3, Fig. 4-2); gas 24 in for pipelines (15 DCMR
  §2305.2) and 18 in federal for services. Pepco, Verizon and Comcast publish none.
- **Geocoder**: `maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_APPS/DCGIS_MAR/GeocodeServer`. The
  MAR 2.2 API needs a key. SSL comes from `Property_and_Land_WebMercator/MapServer/40` by point.
- **811**: Miss Utility, 96 hours excluding weekends and holidays, D.C. Code §34-2704(a).
- **Spot elevations** are in meters and include rooftops with no code to tell them apart, so the
  build drops any spot inside a building footprint.
