# Los Angeles

Subsola's fourth city, the City of Los Angeles (not the county). Nearly everything comes from one
keyless ArcGIS server, `maps.lacity.org/lahub`, verified 2026-11-08.

## Approach

As with DC and San Francisco: the pipeline converts LA's layers into the same cell bundles, and
the app learns about the city only where it differs.

## Sources

| Input                     | Layer (`maps.lacity.org/lahub/rest/services/...`)                                                                        | Notes                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excavation permits        | `Public_Way_Reservations/MapServer/` 3 (active), 7 (archived), 5 (archived points), 6 (archived lines), `PermitType='U'` | About 283k permits since 2002. Since about 2016 each dig spot is its own small polygon. No company or purpose field: the utility is read from the domain of the contact's email, and nothing else of the contact is kept.                                                                                                                                                                    |
| Blocks                    | `Street_Information/MapServer/36`                                                                                        | 85k centerline segments (`SECT_ID`). Permits are matched to the nearest segment on the street their location names.                                                                                                                                                                                                                                                                          |
| Buildings                 | `Landbase_Information/MapServer/9`                                                                                       | 1.1M LARIAC footprints.                                                                                                                                                                                                                                                                                                                                                                      |
| Sewers                    | `Sewer_Information/MapServer/9` and `/0`                                                                                 | 148k pipes in service with size, material and year, and upstream and downstream invert elevations; maintenance hole lids give the street's height, so depth is measured.                                                                                                                                                                                                                     |
| House connections         | `Sewer_Information/MapServer/6`                                                                                          | 539,363 laterals and sewer taps, each from the sewer to the property line. Route only: no address, size, material or depth is filled in (2 of 539k have a size).                                                                                                                                                                                                                             |
| Storm drains              | `Stormwater_Information/MapServer/10`                                                                                    | 180,476 pipes; 173,995 drawn: main lines, catch basin connectors, culverts, subdrains, low flow and private drains. Open channels, swales, ditches, natural watercourses, abandoned pipes and anything built of channel or dirt are left out. Size, material and owner (city 86k, county 61k, Caltrans 12k, private 6k). Inverts at both ends on 48k; no install year to speak of (16 rows). |
| Storm structures          | `Stormwater_Information/MapServer/8`                                                                                     | 130,163 structures; 75,605 catch basins and 22,264 storm drain maintenance holes drawn. Junctions, transitions, outlets and the rest are fittings on the pipe and aren't drawn. Only 2,451 record a lid elevation.                                                                                                                                                                           |
| Sidewalks                 | StreetsLA `services5.arcgis.com/7nsPwEMP38bSkCjy/.../Sidewalks_Mapped_Areas/FeatureServer/6`                             | 1,030,760 polygons (sidewalk, driveway crossing, corner ramp), one per parcel frontage, traced in 2017 from 2014 LARIAC imagery and not updated since. Same GeoHub owner (boegis_lahub); a disclaimer, no restriction. Only the shape is read.                                                                                                                                               |
| Hydrants, lights, signals | `Fire_Department/0`, `Bureau_of_Street_Lighting/0`, `LADOT/30`                                                           |                                                                                                                                                                                                                                                                                                                                                                                              |
| Geocoder                  | LA County `geocode.gis.lacounty.gov/.../CAMS_Locator/GeocodeServer`                                                      | Countywide; only City of Los Angeles answers count.                                                                                                                                                                                                                                                                                                                                          |
| Aerial photo              | USGS NAIP Plus `exportImage`                                                                                             | 2022, 60 cm, public domain. LA County's LARIAC 2020 imagery (10 cm) states no license for public use.                                                                                                                                                                                                                                                                                        |

Not public: water mains, gas, electric and telecom. LADWP reports no lead service lines needing
replacement and publishes none by lot. The substructure pilot (phase 4) answers queries but isn't
published as open data; see below.

## Phases

1. **Pipeline adapter and region.** Done 2026-11-08. Permits, streets, buildings, sewers with
   depth and street assets in the cells; the app's geocoder, NAIP photo, depths, DigAlert and
   wording. 499k utility dig records since 2002 (88% on a block), 148k sewers (95% with a
   measured depth), 1.1M buildings.
2. **Storm drains.** Done 2026-11-09. 173,995 pipes drawn as sewers on their own routes, named
   storm drains, with their owner when it isn't the city. Depth: the invert at an end, less the
   lid there, less the pipe. A storm structure's own lid at the same point is used first, else the
   nearest sewer maintenance hole lid within 10 m; 21,062 (12%) are measured, limited mostly by
   the inverts (recorded at 116k of 348k ends). The rest sit at the sewers' drawn depth. Catch
   basins and storm drain maintenance holes connect only to storm drains. Catch basins drop from
   130k (every storm structure) to 75,605 real ones.
3. **House connections.** Done 2026-11-09. 539,363 laterals drawn as house sewers on their mapped
   routes, at 4 ft (LAMC 64.17), as thin as the house sewers drawn from permits. The layer names
   no building, so the lot report and the MCP server take the nearest connection within 30 m of
   the address point (typically 15 to 30 ft off) and say it's the nearest, not a match.
4. **Substructures pilot.** Skipped 2026-11-09.
   `maps.lacity.org/arcgis/rest/services/External/SubstructuresPilot` answers anonymous queries:
   about 140k lines across three pilots (old pilot 119,586; phase 1 3,390; phase 2 19,459) in
   Koreatown, Downtown, Mid-City and South LA, with owner codes (SCG, DWPPS, DWPWS, PTT, ...),
   size, depth and offset from the property line. It is not in the GeoHub catalog, data.lacity.org
   or ArcGIS Online, states no license, and sits in the folder BOE uses for its own viewers. Gas
   and power routes by owner aren't something to publish from an unlisted service; left out until
   the city publishes it.
5. **Sidewalks.** Done 2026-11-09. 1,030,760 StreetsLA polygons as ground for the low views, cut
   to cells. Curbs (1.66M 6 in strips in the same service) aren't read: the app wants curb lines.

## Settled

- **Who dug.** By email domain: socalgas.com and semprautilities.com are SoCalGas, att.com AT&T,
  water.ladwp.com LADWP water, and so on (`pipeline/la/permits.ts`). Plain ladwp.com, about 224k
  permits, doesn't say water or power; it's filed as water and marked as assumed, since every LA
  street has a water main (decided 2026-11-08). Contractors and personal mail are left out.
- **811**: DigAlert (USA South), at least two working days ahead (Gov. Code §4216.2).
- **Depths**: water 30 to 42 in of cover for mains under 12 in (LADWP Design Standards 2023); gas,
  electric and telecom as in San Francisco (49 CFR 192, CPUC GO 128); sewers measured, and house
  connections at least 4 ft deep at the property line (LAMC 64.17).
- **Sewer datum.** LA's sewer elevations state no vertical datum. Only differences are used
  (lid less invert), so it doesn't matter here.
- **Storm drain depth from sewer lids.** The storm and sewer layers share a datum: where a storm
  structure lid and a sewer lid sit within 10 m of each other (547 pairs) they differ by 0.1 ft at
  the median, -3 to +1.5 ft at the 10th and 90th percentiles, which is the street's slope over
  that distance (`pipeline/la/drains.ts`).
- **Storm drain sizes.** `DIAMETER_HEIGHT` is inches. A box or arch under 12 in is a height
  entered in feet (6 by 72), so it's left blank; past 144 in it's left blank as in San Diego.
- **Size of the new layers.** Downloads: sidewalks 107 MB, house connections 19 MB, storm drains
  15 MB, storm structures 3 MB (gzipped pages, about a minute in all; the server allows 1,000 rows
  a page, so they page by id like the rest). Built LA cells grow from 157 to 234 MB: sidewalks
  about 56 MB, house connections 14 MB, storm drains 10 MB. No freezing needed.
