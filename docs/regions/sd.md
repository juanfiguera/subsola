# San Diego

Subsola's fifth city, the City of San Diego (not the county). Permits come from the city's open
data portal, `data.sandiego.gov`; street assets from its map server, `webmaps.sandiego.gov`;
streets, buildings and the city's own utility layers from SanGIS,
`geo.sandag.org/server/rest/services/Hosted`; the lead service line inventory from the city's
consultant's ArcGIS Online. Verified 2026-11-08; permits 2026-11-15.

## Approach

As with the other cities: the pipeline converts San Diego's layers into the same cell bundles, and
the app learns about the city only where it differs.

## Sources

| Input                  | Layer                                                                               | Notes                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Right of way permits   | Portal `approvals_issued_datasd.csv` (Accela, 2021 on, and PTS)                     | Construction permits in the street, 42k issued, cut from the one CSV of approvals. The holder is often a person ("SDGE, Betty Blanford"); the company is read from it, the title or scope; the person is never kept. No traffic control. |
| Blocks                 | SanGIS `Roads_All`, `ljurisdic` or `rjurisdic` = SD                                 | 57k road segments (`roadsegid`). Permits are matched to the nearest segment on the street their address names.                                                                                                                           |
| Buildings              | SanGIS `Building_Outlines`, inside the city's box                                   | Countywide layer; only buildings in cells the city's streets reach are kept. No heights.                                                                                                                                                 |
| Sewers                 | SanGIS `Sewer_Main_SD` and `Sewer_Manhole_SD`                                       | 77k mains with upstream and downstream inverts, 65k manholes with rim elevations, so depth is measured.                                                                                                                                  |
| Water mains            | SanGIS `Water_Main_SD`                                                              | 111k mains with size, material, year and distribution or transmission. No depth: drawn at the city's minimum cover.                                                                                                                      |
| Hydrants, inlets       | SanGIS `Water_Hydrants_SD`, `Drain_Structure` (types I, M)                          | Only inlets are drawn. Inlet and cleanout rims give the storm drains their depth.                                                                                                                                                        |
| Storm drains           | SanGIS `Drain_Conveyance`, status A, not types B or C                               | 60k pipes, box culverts, encased and force mains and underdrains; brow ditches and open channels run on the surface and are left out. Inverts at both ends; 34k (57%) meet an inlet or cleanout rim, so their depth is measured.         |
| Recycled water mains   | SanGIS `Recycled_Water_Main`                                                        | 2,623 purple pipe mains with size, material, year and owner (2,400 the city's, the rest Otay, Poway, other districts and private). No depth: drawn at the water mains' cover.                                                            |
| Service lines          | `services1.arcgis.com/EFYIRUToGCsM2IHN/.../COSD_Lead_Service_Line_Inventory_Public` | 286k meters, utility and customer side each with material, status and how it's known. 5,284 hydrant and floating meters have no point. Only address, parcel, material, status, source and method are read.                               |
| Street lights, signals | `Planning/PLN_Mobility/MapServer/1` and `/0`, status A                              | The city's own layers. SanGIS's lights and signals cover only the unincorporated county.                                                                                                                                                 |
| Geocoder               | `Locators/StreetAddress/GeocodeServer`                                              | The city's own addresses only, filed by ZIP. "San Diego" in the query lowers the score, so it's taken out first.                                                                                                                         |
| Aerial photo           | USGS NAIP Plus `exportImage`                                                        | 2022, 60 cm, public domain, as in LA. The city's 2014 tiles state no license.                                                                                                                                                            |

Licenses: the city's open data is ODC-PDDL. The map server falls under sandiego.gov's site
terms, which forbid mirroring and commercial use, so the permits come from the portal's CSV
instead; the lights and signals still come from the map server. SanGIS's services carry its end-user agreement, which
asks that reworked data be credited as derived from SanGIS; the sources say so. The service line
inventory states no license; it's the public inventory the EPA's Lead and Copper Rule requires the
city to publish, and it's credited to the city's Public Utilities.

Not public: house sewer laterals, gas, electric and telecom routes.

## Phases

1. **Pipeline adapter and region.** Permits, streets, buildings, sewers with depth, water mains
   and street assets in the cells; the app's geocoder, NAIP photo, depths, DigAlert and wording.
2. **Storm drains.** Done 2026-11-08. 59,618 pipes of the 64,304 in `Drain_Conveyance`, drawn
   as sewers on their own routes and named storm drains. Each end is matched to the inlet or
   cleanout drawn at the same point, and its rim less the invert there, less the pipe, is the
   cover: 34,170 (57%) are measured; the rest sit at the sewers' drawn depth. Sizes past 12 ft
   are left blank. Inlets connect only to storm drains.
3. **Service line inventory.** Done 2026-11-08. 281,006 meters with a point; no lead, 5
   galvanized lines to replace, 149 unknown (0.05%). Each address on a parcel keeps its worst line,
   273,973 drawn. The point mostly sits inside the lot (median 24 m from the street's centerline),
   not at the meter, so lines reach up to 45 m to the nearest distribution main. The card and lot
   report show both sides like DC's.
4. **Recycled water.** Done 2026-11-08. 2,623 mains, drawn in APWA purple as water, with their own
   layer switch, card and lot report row. No service or hydrant connects to them.

## Settled

- **Permits from the portal.** Moved off the map server's `DoIT_Public/DSDPermits/MapServer/0`
  and `/1` on 2026-11-15 for its terms. The portal's issued approvals CSV (580 MB, updated
  daily) holds the same records and columns: `PROJECT_TYPE` Right of Way - Dry Utilities or
  Minor - Rapid Review with an `APPROVAL_TYPE` starting Approval - Construction - Right Of Way
  (Accela, 9,516 rows), or an `APPROVAL_TYPE` of Right Of Way Permit, its Const Plan, or the
  undergrounding program (PTS, 32,332). Every issued permit the map server had is in it, plus
  those issued since; the map server also listed 7,311 never issued, which were dropped anyway.
  The point is `GIS_LATITUDE`/`GIS_LONGITUDE`, rounded to six places, so a permit not matched to
  a block can sit a meter off where the map server put it. Built against the map server's
  2026-11-08 pages: 31,679 utility records in 21,962 groups, against 31,496 in 21,929; all
  31,496 are still there.

- **Who dug.** By the company named in the holder, title or scope (`pipeline/sd/permits.ts`):
  SDG&E, AT&T (also Pacific Bell), Cox, Spectrum (Charter), Verizon, and other telecom
  providers. SDG&E's gas or electric is read from the work (a valve, cathodic protection or "gas"
  is gas; a pole, cable or "power" is electric; both when both are named), then a contractor's
  trade, the reading San Francisco and Denver share (`pipeline/gasOrElectric.ts`). Permits that
  say neither are filed as electric, its more common work in these permits, and marked as assumed. SDG&E's overhead to underground program is
  electric whoever filed it. Private water, sewer and gas service trenches count; driveways,
  sidewalks and potholing don't.
- **Placeholder.** Permits filed with no place of their own sit on the permit office, 1222 First
  Avenue; they're dropped.
- **Water and sewer permits are few.** The city's own pipe work doesn't need these permits. Its
  mapped networks stand in: with water and sewer mains on their routes, none is guessed from
  permits.
- **811**: DigAlert (USA South), at least two working days ahead (Gov. Code §4216.2).
- **Depths**: water mains at least 3 ft of cover, transmission mains 5 ft (Standard Drawing
  SDW-110); sewers measured, house laterals 5 to 7 ft below the top of the curb at the property
  line (Sewer Design Guide §2.5.2); gas, electric and telecom as in San Francisco.
- **Service line material.** The city's "Entire Service Line Status" decides the line where it's
  filled in; otherwise the worse side does (`pipeline/sd/services.ts`). On a side, the material
  wins over a status code that disagrees (two sides coded lead are named non-lead, as is the whole
  line). Galvanized counts as needing replacement only with status 3; otherwise the EPA files it
  as non-lead. The inventory marks nearly every side verified, a predictive model's guess
  included, so verified here means a record of the pipe or someone having looked at it.
- **Recycled water is water.** Not a utility kind of its own: it hides with water and takes water's
  depth rules, but it's drawn purple, as APWA paints it, and kept out of services and hydrants.
- **Sewer datum.** The elevations state no datum. Only differences are used (rim less invert),
  and zero means blank; near the bay a real invert can be below zero.
