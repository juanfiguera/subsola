# San Jose

Subsola's tenth city, the City of San Jose. Utility permits come from Public Works' map service
(`geo.sanjoseca.gov/server/rest/services/PLN/PLN_PermitsAndComplaints/MapServer`); streets,
sewers, storm drains, manholes, inlets, street lights, signals and the address points from the
city's open data service (`geo.sanjoseca.gov/server/rest/services/OPN/OPN_OpenDataService/MapServer`,
catalogued at `data.sanjoseca.gov`); buildings from the County of Santa Clara's lidar footprints.
Verified 2026-11-22.

## Approach

As in Denver, the city maps its own sanitary sewers and storm drains, and the water companies
publish no mains, so water, gas, electric and telecom lines come from permits. The pipeline turns
the utility permits into the same block groups as the other cities and draws the sewers and storm
drains at the depths their manholes give.

San Jose has three water providers: San Jose Water (a private company, most of the city), Great
Oaks Water (private, the south) and the city's own San Jose Municipal Water System (North San Jose,
Alviso, Evergreen, Edenvale, Coyote). None publishes its mains.

## Sources

| Input           | Dataset                                                                            | Notes                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permits         | `PLN_PermitsAndComplaints/MapServer/16` (street segments)                          | AMANDA utility permit folders since 2019, refreshed daily: 36,292 rows, one per folder, each on the city's street segment. `REFERENCEFILE` is the permit number ("E240101S"). `WORKDESC` is the city's pick list: Standard, Emergency, Special, Small Cell, Fiber. No company field.                                                   |
| Permit points   | `/15` (intersections, 960) and `/17` (parcels, 120)                                | The same fields, on an intersection's point or a parcel's outline.                                                                                                                                                                                                                                                                     |
| Blocks          | Streets `/60`, a side in the city                                                  | The city's centerline with each side's address range. Private streets, freeways, the county's expressways, ramps and driveways aren't drawn: 23,781 segments are.                                                                                                                                                                      |
| Sanitary sewers | Sanitary Gravity Mains `/312` (46,339) and Sanitary Manholes `/308`                | Each pipe names its upstream and downstream structure (`UPTYPE`, `UPID`) with the invert there (`UPELEV`); the manholes file the lid's surveyed elevation (`RIMELEV`, about 80%) or the terrain model's (`DEMELEV`). 36,981 sewers get a measured depth.                                                                               |
| Storm drains    | Storm Gravity Mains `/300` (31,858), Storm Manholes `/296`, Inlets `/295`          | The same, with inlets as structures too; 28,775 get a measured depth.                                                                                                                                                                                                                                                                  |
| Street assets   | Streetlight Pole `/427` (existing, 50,430), City Owned Traffic Signals `/506`      | Signals, beacons and flashers in service (1,069); radar and message signs left out.                                                                                                                                                                                                                                                    |
| Buildings       | County of Santa Clara, `opendata/SCCGISHUB/MapServer/40` (Buildings Footprints 2D) | Lidar rooftop outlines, read inside the city's box: 469,854 downloaded, 288,028 in cells the city's streets reach.                                                                                                                                                                                                                     |
| Service lines   | San Jose Water, `Service_Line_Material_Inventory_view/FeatureServer/2`             | **Paused** (`PAUSED_SOURCES`); see License. 169,000 points with the address and each side's material; layer 0, as first noted, no longer exists.                                                                                                                                                                                       |
| Geocoder        | Addresses `/36` (396,776 site address points), queried by number and name          | CORS answers subsola.com. A typed address is split into number, direction, name and type; the points with that number whose full street name holds the name come back, and the one whose name, direction, type and status agree best wins. Only the number and street parts are asked for, never the parcel, account or editor fields. |
| Aerial photo    | USGS NAIP Plus `exportImage`                                                       | Public domain. The city's and county's sharper photos state no open license.                                                                                                                                                                                                                                                           |

## License

- **Open data layers** (streets, sewers, storm drains, manholes, inlets, lights, signals, address
  points): `data.sanjoseca.gov` lists each under "Creative Commons Attribution" (CKAN `cc-by`, no
  version). The ArcGIS items carry the city's GIS disclaimer: as is, at your own risk. Credited to
  the City of San Jose with the license link (`src/attribution.ts`).
- **Utility permits**: the permit layers aren't in the city's catalog, and the map service states
  no license or terms. Nothing found allows or forbids reuse. The catalog says "no license stated,
  provided as is", and the city is credited as publisher. **Needs the owner's decision**, as Dallas
  did.
- **Buildings**: the county's item says the GIS data is provided as is; the older edition of the
  same lidar product states "no use limitations" and asks that the USGS be acknowledged. Credited
  to the County of Santa Clara.
- **San Jose Water's inventory**: the item itself carries only a disclaimer, but sjwater.com's
  Website Terms of Use (read 2026-11-22) say: "Except as expressly authorized by SJW, you agree not
  to reproduce, modify, rent, lease, loan, sell, distribute, mirror, frame, republish, download,
  transmit, or create derivative works of the Website content or services." The inventory map is
  linked from that site, so it is paused like Denver Water's and San Diego's: never downloaded,
  built or shown, and the lot report, city page and MCP answers link to SJW's own lookup.
  SJW's hydrants (about 20,000) fall under the same terms and aren't used. Every point in the
  inventory reads non-lead on both sides (about 3,000 with a lead gooseneck), counted by a
  statistics query only.

## Privacy

Each permit layer also carries the staff who issued and stamped it (`ISSUEUSER`, `STAMPUSER`), the
last editor and free notes. `pipeline/sj/datasets.ts` names its fields one by one and none of those
is among them (a test holds it). `FOLDERDESCRIPTION`, the crew's free text, is downloaded because
it is the only place the work is described; it is read in `classifySjPermit` and never written to
the cells, insights or answers. Cards show the street from the city's centerline and the segment's
two cross streets from `PROPERTYLOCATION` only when it reads "From X To Y". The holder shown is a
fixed company name from a list, never text from the permit.

## Phases

1. **Pipeline adapter and region.** Done 2026-11-22. Permits, streets, buildings, sewers, storm
   drains and street assets in the cells; the app's geocoder, NAIP photo, depths, USA North 811
   and wording. 6,114 cells, 37 MB.

## Settled

- **The utility** (`pipeline/sj/permits.ts`). Public Works letters each permit number by the kind
  of utility that filed it, and the 2019 to 2026 records bear the letters out: every E (and SE,
  special) permit that names a company names PG&E; W permits sit in San Jose Water's service area
  (5,749 street rows lie in it and 89 elsewhere, checked against the city's Water Service Provider layer `/348`)
  and G permits in Great Oaks Water's; T permits name only AT&T and H permits only Comcast; F is
  fiber, by anyone; SC is small cells. The city publishes no key to the letters, so this is read
  from the data. A permit whose description names another telecom company is filed under that
  company. A permit with no letter (most never issued) is read from its description alone.
- **Gas or electric** for PG&E comes from the description through `energyWork`, with San Jose's
  shorthand added: TX is a transformer; STL and PL mains and services, "service at main",
  insertion and bellholes are gas; capacitors, arms, ground rods, conductors, reclosers, panels
  and hot tie-ins are electric. Saying neither, it's filed as electric, the more common work, and
  marked "gas or electric not stated" (2,480).
- **Left out**: never issued (cancelled, intake, review, or no issue date: 3,716), replaced
  ("Upgraded", reissued under another number: 1,437), small cells (2,024), pole, lashing and tree
  work that says nothing of the ground (5,089), and 27 that name no utility.
- **No dig.** A description that says "no excavation" (and doesn't also name a dig, nor limit it
  to "on street" or "in asphalt", which still dig the parkstrip) is kept as "No excavation (access
  or traffic control)", which never counts as a dig (742).
- **Counts** (build of 2026-11-22). 37,372 rows read; 25,079 placed, 25,071 read by their letter
  and 8 from the description; 24,955 on a block. By utility: telecom 9,550, electric 5,962, water
  5,909, gas 3,816 (a permit for both gas and electric counts in each). By owner: PG&E 9,778, San
  Jose Water 5,792, AT&T 5,780, Comcast 1,796, other permit holders 1,884, Great Oaks Water 117,
  Sonic 32, Verizon 24, Zayo 20, T-Mobile 9, Lumen 5. No permit is filed for a city sewer: the
  city's own sewer work doesn't need one. 15,631 groups.
- **Sewer depth.** Cover is the lid less the invert at each end, averaged, less the pipe. A pipe
  end is read in the layer of the structure it names: manholes, inlets and cleanouts are numbered
  apart, and reading every id in one map once put an inlet's 200 ft lid on an 80 ft manhole,
  drawing downtown storm drains 68 ft down. Cleanouts and fittings publish no lid. Built sewers:
  median 7.2 ft, nine in ten under 12.2 ft; storm drains median 5.9 ft.
- **811**: USA North 811 (`usanorth811.org`), as for San Francisco. Gov. Code §4216.2(b): at least
  two working days before, not counting the day of the call, and no more than 14 days ahead.
- **Depths** (`SJ_DEPTH_STANDARDS` in `src/depth.ts`):
  - Water: the city's Standard Specifications, Section 101 (Pipe and Fittings), 101-3.01: "a
    minimum depth of cover from finished grade, of 36 inches for pipe 8 inches or less in diameter,
    and 42 inches for pipe greater than 8 inches"; 101-3.08: services at least 24 in at the gutter's
    flow line. Written for the San Jose Municipal Water System; San Jose Water and Great Oaks Water
    publish no standard. sanjoseca.gov turns away scripted downloads, so it was read from the
    Internet Archive's November 2021 copy. Drawn at 3 ft.
  - Sewer: measured. Of the sanitary manholes with both a lid and an invert (6,312), half measure
    8 ft or more and nine in ten more than 4 ft 4 in. Drawn at 8 ft where a pipe has no measured
    depth.
  - Gas: 49 CFR 192.327 and 192.361, as for San Francisco (California's GO 112-F adopts them).
  - Electric and telecom: CPUC General Order 128, as for San Francisco.

## Not public

- **Water mains and hydrants.** None of the three water providers publishes mains; San Jose
  Water's hydrants are under its terms. The home card says hydrants aren't published.
- **House laterals.** The city publishes none; its 2020 Sewer System Management Plan makes the
  property owner responsible for the whole lateral, connection included.

## Later

- **San Jose Water's inventory**, if the company allows it: the build step isn't written yet,
  since it was paused from the start (the dataset spec and its field allowlist are).
- **The city's Muni Water mains**, if the city ever publishes them.
- **Sanitary and storm laterals** (`/303` storm lateral lines) could be drawn as Seattle's side
  sewers are.
