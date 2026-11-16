# Seattle

Subsola's sixth city. Nearly everything comes from the city's ArcGIS Online organization,
`services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services`, verified 2026-11-08. The Socrata
datasets at cos-data.seattle.gov only point back to these layers.

## Approach

As with the other cities: the pipeline converts Seattle's layers into the same cell bundles, and
the app learns about the city only where it differs.

## Sources

| Input                | Layer                                                                                              | Notes                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Street Use permits   | `SU_Permit_Data_Model_Relationships/FeatureServer/2`, Minor and Major Utility                      | One row for each block a permit reaches, about 203k rows since 2006 (Hansen, then Accela). `STREET_KEY` is the segment's `COMPKEY`, so no matching by name is needed. Revisions are left out.                                                                                                                                                |
| Blocks               | `Seattle_Streets_1/FeatureServer/0`                                                                | 24k SDOT segments (`COMPKEY`).                                                                                                                                                                                                                                                                                                               |
| Buildings            | `Building_Outlines_2023/FeatureServer/0`                                                           | 222k outlines, no heights.                                                                                                                                                                                                                                                                                                                   |
| Sewers               | `SPU_DWW_Mainlines_External/FeatureServer/10`                                                      | 63k pipes, combined, sanitary or drainage, each with its depth below the hole cover at both ends.                                                                                                                                                                                                                                            |
| Maintenance holes    | `SPU_DWW_Mainline_Points_External/FeatureServer/1`                                                 | Cover elevations give the street's height.                                                                                                                                                                                                                                                                                                   |
| Water mains          | `SPU_Water_Mains_and_Services/FeatureServer/1`, lifecycle C                                        | 62k distribution mains with size, material and year, none wider than 10 in: SPU leaves its transmission mains out of the public layer; depth recorded on about one in eight, mostly 3 ft.                                                                                                                                                    |
| Water services       | `SPU_Water_Mains_and_Services/FeatureServer/8`, lifecycle C, status ACT                            | 177,616 lines from the tap on the main to the meter, the layer behind SPU's own service line lookup map. Material of SPU's two pieces ("GI/CU": main to meter, meter to union), size, year, address and parcel. No Lead and Copper Rule status and nothing past the union. Meter, premise, account, route and comment fields are never read. |
| Side sewers          | `SPU_DWW_Non-Mainlines_Internal_view/FeatureServer/2`, Side Sewer, Connected, Sanitary or Combined | 1,351,432 short stretches of 1.95M non-SPU non-mainlines, joined by their upstream and downstream point keys into 149,643 networks. Material on about a third, size on some, no depth, no address. Service drains (roof and yard water) and footing drains are left out.                                                                     |
| Underground electric | `SCL_Lines/FeatureServer/2` (`CONDUCTORTYPE1 = 'UG'`), `SCL_Structures/FeatureServer/0`            | 39,768 lines and 19,032 handholes, manholes, vaults and pads, "generalized for public use" and "for planning purposes only". Route and structure type only: no voltage, size or depth. The 109k overhead lines are left out.                                                                                                                 |
| Street assets        | SPU catch basins, City Light poles with a streetlight, SDOT's active signals                       |                                                                                                                                                                                                                                                                                                                                              |
| Geocoder             | King County `Address/Address_Points_locator/GeocodeServer`                                         | Countywide; only answers in Seattle count.                                                                                                                                                                                                                                                                                                   |
| Aerial photo         | USGS NAIP Plus `exportImage`                                                                       | Public domain. The city's and King County's 2025 photos (3 in) are EagleView's, with no open license stated.                                                                                                                                                                                                                                 |

Terms: the city's layers come with a no-warranty disclaimer and no other restriction stated. City
Light adds that its generalized layers are for planning only, which the cards repeat.

Left out on purpose: SPU's hydrant layers, and the "DSO" and "Internal VIEW" copies of its side
sewer layer, which are marked for its own map and "approved exceptions by SPU only" (the
`Non-Mainlines_Internal_view` used here carries no such note); permit applicant and contact
names, and the project description, where crews type names and phone numbers.

Not public: a Lead and Copper Rule inventory. SPU says it has no known lead service lines; in 2016
it put its galvanized services at about 9,000, some 2,000 of them likely with a lead gooseneck at
the main, and its map doesn't say which. `Water_Services_SPU_and_Private` (2024) splits the same
services into an SPU and a "private" piece, but the private piece only repeats SPU's material.

## Phases

1. **Pipeline adapter and region.** Permits, streets, buildings, sewers with depth, water mains and
   street assets in the cells; the app's geocoder, NAIP photo, depths, Washington 811 and wording.
2. **Water services.** Done 2026-11-09. 177,616 active services: no lead, 8,110 galvanized
   (4.6%), 5,789 unknown (3.3%), the rest copper, plastic or iron. Each address keeps its worst,
   173,858 drawn, from the mapped tap (snapped to SPU's main within 10 m) to the meter. The card,
   lot report and MCP answer show both of SPU's pieces, size and year.
3. **Side sewers.** Done 2026-11-09. 149,643 house sewers (736,007 lines once runs of fittings are
   laid end to end; the largest network has 530 stretches), drawn like San Francisco's at the
   shallowest sewer depth. The report takes the nearest within 15 m of the address point.
4. **City Light.** Done 2026-11-09. Underground lines drawn as mapped electric; structures as
   electric structures with their own layer switch. Seattle's cells grew from 36 to 70 MB (median
   4.9 to 8.2 KB).

## Settled

- **Who dug.** By the company that held the permit (`pipeline/sea/permits.ts`): Puget Sound Energy
  is gas (it runs no power in Seattle), City Light electric, Enwave steam, and CenturyLink,
  Comcast, Zayo, Crown Castle, Verizon and Wave telecom. SPU's permits are sewer when the work
  names sewers or drainage, else water; when they say neither, water, marked as assumed. Side
  sewer contractors and permits of the Side Sewer/Drainage type are sewer.
- **Service line material** (`pipeline/sea/services.ts`). SPU's codes, two per service: CU and
  CS (copper setter) copper, PL, PE, PB (polybutylene, not lead), PVC, DI, CI and STL are not
  lead; GI and GS galvanized; I (iron) and SP (screw pipe) might be galvanized, so unknown, as is
  UNK or blank. The worse piece decides the line. Galvanized is shown as galvanized, not "needs
  replacing": SPU doesn't say, only that some of its galvanized services had lead goosenecks.
  Nothing is marked verified; it's SPU's record of what was installed.
- **Service addresses.** SPU writes a duplex as a range ("4512-14 SUNNYSIDE AVE N"); either
  address finds it. The parcel number (King County PIN, written 287210-0365) names the lot.
- **Side sewers by network** (`pipeline/sea/sideSewers.ts`). A stretch joins the one that starts at
  the point it flows into. Points where stretches only end (on the main) join nothing, so
  neighbours sharing a tee stay apart. SPU files none by address, so the lot report's side sewer
  is the nearest one to the address point; one network can serve several buildings.
- **Electric.** City Light's underground lines don't replace permit-placed electric, since overhead
  lines aren't mapped and many City Light permits are for them.
- **811**: Washington 811, at least two full business days ahead and no more than ten (RCW
  19.122.030).
- **Depths**: water mains 12 in and smaller at least 26 in of cover (Seattle Standard
  Specifications 7-10.3(5)), drawn at 3 ft; sewers recorded; gas by federal code; electric and
  telecom not published; side sewers not recorded, drawn at the shallowest sewer depth.
