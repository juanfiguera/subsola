# Dallas

Subsola's ninth city, the City of Dallas. Permits, the service line inventory and the address
points come from the city's ArcGIS Online organization,
`services2.arcgis.com/rwnOSbfKSwyTBcwN/arcgis/rest/services`; streets from Dallas Open Data
(`www.dallasopendata.com`, Socrata); buildings from FEMA's USA Structures, since the city publishes
no footprints. Verified 2026-11-19.

## Approach

As in Chicago, Dallas publishes no pipes, manholes or inlets, so everything under the street comes
from permits: the pipeline converts Public Works' right of way permits into the same block groups
as the other cities, and the app draws each utility's line from them. Dallas Water Utilities' lead
service line inventory is drawn by address, as in San Diego.

## Sources

| Input         | Dataset                                                                                | Notes                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Permits       | `ROW/FeatureServer/2` ("Permit Detail"), the improvement types that can be a utility's | Every right of way permit issued since 2021-11-17, about a week behind; 89,896 of 90,107 rows are downloaded (ramps and "None" never are). One row per permit, keyed by `EXTERNALFILENUM` ("ROW-2022-384348"). The table carries everything the two shape layers do, and the permits with no shape too. Some issue dates are a few weeks ahead: those stand as scheduled work.                                           |
| Permit shapes | `ROW/FeatureServer/1` (lines, 23,032) and `/0` (points, 64,416)                        | Joined to the table by `EXTERNALFILENUM`; the two layers share one permit between them. A line's middle, or the point, finds the block.                                                                                                                                                                                                                                                                                  |
| Blocks        | Streets `exp2-seaw` and Major Streets `dja8-bezq`, either side in the city             | The city's routable centerline ("Dallas Area Roadways"), with the address range on each side. The arterials are a dataset of their own. Private drives, unbuilt "paper" streets, trails, walkways, freeways and ramps aren't drawn: 59,384 streets and 22,086 arterials are. Alleys are a third layer, not used yet.                                                                                                     |
| Buildings     | FEMA and ORNL USA Structures, inside the city's box with the postal city "DALLAS"      | CC BY 4.0. 396,373 outlines downloaded, 328,559 in cells the city's streets reach.                                                                                                                                                                                                                                                                                                                                       |
| Service lines | `ServiceLine_viewing_270d198a2a4f44cdbc63b617e6c52ff2/FeatureServer/0`                 | Dallas Water Utilities' inventory on the EPA's template, one point per service: 325,950. The utility side and the customer side each have a material, a status, how it's known and whether DWU verified it, plus DWU's call on the whole line and the building's year. No lead; 22 galvanized lines to replace; most customer sides unknown. The `accountid` field, which ties a line to a customer, is never asked for. |
| Geocoder      | `AddressPoints/FeatureServer/0` ("Main Address"), queried by parts                     | Dallas publishes no locator for the public. Its 396,004 main address points answer browsers, so a typed address is split into number, direction, name and type and asked for exactly; the nearest point answers a click. Units are a separate layer, never asked. The account, parcel and editor fields are never read.                                                                                                  |
| Aerial photo  | USGS NAIP Plus `exportImage`                                                           | Public domain. The city's sharper photos state no open license.                                                                                                                                                                                                                                                                                                                                                          |

## License

The city's layers set no license, and Dallas Open Data names none for these datasets (679 of its
1,087 assets set none). The ArcGIS items carry only the city's standard disclaimer: the data is
"as is", not for legal, engineering or surveying use, and users indemnify the city; it bans no
reuse. The catalog labels them "City of Dallas open data; no license stated, provided as is", and
the city is credited as publisher (`src/attribution.ts`).

One open question: the city website's disclaimer (dallascityhall.com) says commercial use of "the
materials" on that server is prohibited without written permission. It doesn't say whether that
reaches the GIS services or the open data portal. Subsola is free; read it again before any paid
use. Nothing found forbids republishing.

FEMA's USA Structures is CC BY 4.0, credited with the city's.

## Privacy

The permits carry the applicant's name, the applicant's company as typed by hand (crew names ride
along in it: "Atmos Energy Corp James Tidwell"), the contractors, a free-text work description
where crews type phone numbers, and location notes. Only the work, the dates, the work site and the
contractors are downloaded. `pipeline/dal/datasets.ts` asks the portal to work out the rest, as
Chicago's download does:

- **The holder.** The portal is asked which of a list of known owners the company names (Atmos
  Energy, Oncor, Dallas Water Utilities, AT&T, Charter, the City of Dallas and the other carriers),
  as a `CASE` in `outFields`, and sends that name or nothing. The company as typed never comes down.
- **The work.** Whether the description mentions a few words (pole, aerial, conduit, bore, trench,
  cross bore, main, water, sewer and the like) comes back as 1 or 0; the text stays on the portal.
- **The contractors** come down, and only the first one that reads as a company is shown, for a
  permit whose holder is no known owner (`dalContractor`, the same test as Chicago's holders, plus
  Dallas's big pipeline, underground and infrastructure firms). A person's name never is.

The worked-out columns make the query longer than the 2,000 characters Dallas's server takes in a
query string, so the download sends long ArcGIS queries as a form (`fetchArcgis` in
`pipeline/download.ts`).

Cards show a permit's first work site as the city files it ("2653 Custer Dr"), as Chicago's show
the address range. Insights name blocks by the street and its block's address range, never a
house.

## Phases

1. **Pipeline adapter and region.** Done 2026-11-19. Permits, streets, buildings and service lines
   in the cells; the app's geocoder, NAIP photo, depths, Texas811 and wording. 10,981 cells, 43 MB.

## Settled

- **What counts as a dig** (`pipeline/dal/permits.ts`). The city's own pick list, "improvement
  type", says the utility: Gas, Water, Wastewater (sewer), Stormwater (sewer), Electric,
  Telecommunications. Gas and power are different companies here (Atmos Energy, Oncor), so gas or
  electric is never a guess and `energyWork` isn't needed. Atmos is the only gas utility in the
  city, so a contractor's gas dig is filed under Atmos; other utilities keep the holder, or the
  first contractor that reads as a company, or "Other permit holder".
- **Overhead work is left out.** Oncor's pole, crossarm, capacitor and streetlight swaps and the
  cable companies' lashing are filed as Electric and Telecommunications too. A permit whose
  description names overhead work and nothing underground (no bore, trench, conduit, cut, vault,
  riser, pedestal and the like) is left out: 7,565 of them, most of Oncor's.
- **Small cells are left out** (556): radios and poles on streetlights and wooden poles.
- **"Other"** (dumpsters, license plate cameras, soil borings, driveways) counts only when a utility
  holds it and, for DWU, when it names water or sewer work; DWU files its creek erosion repairs
  there too. 855 are left out.
- **Atmos's cross bore checks.** About 3,700 Wastewater permits are Atmos's contractors running a
  camera down the sewer after a gas bore, to check it didn't go through. They show the sewer is
  there without opening the street, so they're kept as "Sewer camera check for gas line bores",
  which never counts as a dig (`NOT_OPENING` in `src/sources/permits.ts`).
- **A utility's own paving permit** (Street Paving, Alley Paving, Sidewalk, Drive Approach filed by
  Atmos, Oncor, DWU or a carrier) is the street put back after its dig: kept as "Paving after a
  utility dig", no dig, like Chicago's restorations. DWU's say neither water nor sewer, so they're
  filed as water and marked "water or sewer not stated" (1,576). Everyone else's paving and
  driveways are left out.
- **Placement.** The shape's middle finds the nearest block on a street the permit names within
  40 m, trying each street a permit names; failing that, the address on the centerline's ranges
  does; failing that, a shape off every block (an alley, a parcel set far back) stands as a point
  group of its own, as Denver's do.
- **Counts** (build of 2026-11-19). Of 89,896 rows: 16,335 not a utility's, 7,565 overhead, 855
  "Other" naming no utility, 556 small cells, 48 with no place at all. 64,537 placed: 14,646 on a
  block by line, 46,167 by point, 2,754 by address range, 970 at their own point. Digs by utility:
  gas 28,588, sewer 11,952, water 8,274, telecom 6,960, electric 2,844; 5,919 kept as no dig
  (camera checks and paving). Grouped by permit and block, that is 40,784 groups; a no-dig record
  on a block that has digs isn't stored, so 62,537 permits are in the cells.
- **Service lines.** 325,753 read, 4,000 outside the city's streets, 289,199 addresses drawn: no
  lead, 22 galvanized to replace, 250,097 unknown, 71,634 not lead. A side is verified where DWU
  marks it so, or where it was read from a record of the pipe (a deadhead card, construction plans,
  or the records San Diego's inventory counts); a side read off DWU's standard drawings is
  suspected. The points sit about 27 m from the street's centerline (a sample of 400: three in four
  within 31 m), so the scene reaches 36 m for the main, and the lot report 45 m.
- **811**: Texas811 (`texas811.org`). Tex. Util. Code §251.151(a): notify "not earlier than the
  14th day before the date the excavation is to begin or later than the 48th hour before the time
  the excavation is to begin, excluding Saturdays, Sundays, and legal holidays". Texas811 writes
  its own name as one word.
- **Depths** (`DAL_DEPTH_STANDARDS` in `src/depth.ts`):
  - Water: DWU's Water and Wastewater Procedures and Design Manual (October 2015), Table 2.5.2:
    mains 12 in and smaller at least 4 ft of cover under a paved street and 6 ft in an alley or
    unpaved ground; 16 in 5 ft and 6 ft; 20 in and larger 6 ft and 7 ft. Under 3 ft needs a special
    review. No service line depth is published (§2.13, Standard Drawings 2024). Drawn at 4 ft.
  - Sewer: the same manual, Table 4.5.2, the same cover as water mains; house laterals at least 2 ft
    (§4.12.4). Storm drains at least 2 ft over the crown (Drainage Design Manual, September 2019,
    §3.6.2). No deepest depth is published; 20 ft is the drawing range. Drawn at 6 ft, the alley
    minimum, so sewers sit below the water mains.
  - Gas: 49 CFR 192.327 (mains, 24 in) and 192.361 (services, 18 in under streets). Texas adopts
    Part 192 as it stands (16 TAC §8.1(b)(1)) with no cover rule of its own; Atmos publishes no
    depth.
  - Electric and telecom: the city's Pavement Cut and Repair Standards Manual (October 2003, the
    newest online), Part 1 §II.3.a: no utility line less than 12 in below the pavement's base;
    §III.3.b: bores at least 24 in below the surface. Oncor's DDS-2 (Revision 15, November 2023),
    Detail Sheet 2: primary conduit at least 30 in, secondary 24 in; electric drawn at 2 ft 6 in,
    telecom at 2 ft. The city sets no telecom depth of its own.

## Not public

- **Pipes and structures.** Dallas Water Utilities publishes no water main, sewer or storm drain
  map, and no manholes, inlets or hydrants. Atmos, Oncor and the carriers keep their routes
  private. The map says so on the city page and in every card that would show a hydrant or catch
  basin count.

## Later

- **Alleys.** Many Dallas lines run in alleys, which the city publishes (`ALLEYS_SHAPEFILE`). Today a
  permit in an alley finds the nearest street, or stands as a point; alley blocks would put it
  where it is.
- **Street lights and signal cabinets** (`StreetLights`, `TRN_SignalCabinetsCD_Public`) are public
  and could be drawn as the other cities' are.
- **The Socrata copies** of the permits (`bw6g-a3ur`, `xd3q-ipis`) lag the ArcGIS layers by about a
  month; use them only if ArcGIS goes away.
