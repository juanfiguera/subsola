# Chicago

Subsola's eighth city, the City of Chicago. Permits, streets and buildings come from the City of
Chicago data portal (`data.cityofchicago.org`, Socrata); the geocoder asks Cook County's address
points (`datacatalog.cookcountyil.gov`). Verified 2026-11-11.

## Approach

As with New York, Chicago publishes no pipes, so everything under the street comes from permits:
the pipeline converts CDOT's public way opening permits into the same block groups as the other
cities, and the app draws each utility's line from them.

## Sources

| Input        | Dataset                                                                    | Notes                                                                                                                                                                                                                                                                                                                      |
| ------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permits      | Transportation Department Permits `pubx-yq2d`, `applicationtype='DOT_PWO'` | Public way openings ("GenOpening"), work begun before the permit ("WorkInAdv") and restorations ("Restorat"), less the cancelled and denied: 1,044,836 rows, from 2013 (a handful earlier), refreshed daily. One row per address range a permit opens; a permit can name several. Driveways and soil borings are left out. |
| Blocks       | Street Center Lines `pr57-gg9e`                                            | 56,338 segments, each with its address range on both sides and its cross streets. Last refreshed in 2021. Rivers, expressways and their ramps, unnamed lines and vacated or proposed streets aren't drawn (52,065 are).                                                                                                    |
| Buildings    | Building Footprints `syp8-uezg`, active                                    | 820,456 outlines. Last refreshed in 2015, so newer buildings are missing.                                                                                                                                                                                                                                                  |
| Geocoder     | Cook County Address Points `78yw-iddh`, `geocode_muni='CHICAGO'`           | Public domain, about 583,000 points in the city, answered to browsers. A typed address is split into number, direction, name and type and asked for exactly; the nearest point answers a click.                                                                                                                            |
| Aerial photo | USGS NAIP Plus `exportImage`                                               | Public domain. Cook County's sharper photos state no open license.                                                                                                                                                                                                                                                         |

License: the City of Chicago data portal's terms of use, which let anyone use the data as provided,
without warranty. Cook County's address points are public domain.

## Privacy

The permits dataset carries the applicant's first, middle and last name, street address, city,
state and ZIP, an emergency contact, and free-text name, comments and detail where applicants type
names and phone numbers. None of these is downloaded. `pipeline/chi/datasets.ts` builds the `$select`
from a zod schema of the fields it needs, and two of them are worked out on the portal:

- **The holder.** The company is filed in the last name field, and the first name is filled in only
  when the applicant is a person (755 of 1.09M rows). The download asks for
  `case(primarycontactfirst IS NULL, primarycontactlast)`, so the portal sends the last name only
  where no first name says it's a person's, and nothing otherwise.
- **The work.** Whether the permit's name or comments mention a few words (water, b-box, sewer,
  catch basin, gas, fiber, street light, main, tree and the like) is asked as true or false; the
  text itself never leaves the portal.

Some holders with no first name are still a person's name ("TERENCE COX"), and sole traders file
as "NAME DBA TRADE NAME". `chiHolderName` keeps only the trade name after "DBA" and shows a holder
only when it reads as a company or agency; the rest are "Holder not shown (may be a person)", on the
map and in insights.

## Phases

1. **Pipeline adapter and region.** Done 2026-11-11. Permits, streets and buildings in the cells;
   the app's geocoder, NAIP photo, depths, Chicago 811 and wording. 9,387 cells, 66 MB.

## Settled

- **What counts as a dig** (`pipeline/chi/permits.ts`). The company settles most permits: Water
  Management (DWM) is water, or sewer when the text names only sewer work (catch basins, gutter box
  inlets, private drains, manholes); Peoples Gas gas; ComEd electric; MWRD sewer; AT&T, Comcast,
  Verizon (MCI), Crown Castle, Zayo, Lumen (Level 3), Astound (RCN), WOW, Sunesys, Crosstown Fiber
  and other carriers telecom; CDOT's electrical crews electric (street lights and signals), CDOT's
  other crews the city's own work ("City rebuild"). A contractor counts only where the text names
  the utility, or its name says the one utility it works on (NPL and Miller Pipeline gas, fiber and
  communications firms telecom, electrical and lighting firms electric, sewer and drain firms
  sewer). Tree planting and stump removal, sidewalks, paving, signs and the CTA open the street too,
  and are left out. "Work in advance" permits count only for a utility: nearly all the rest are
  the city's paving contractors starting early.
- **CDOT's own openings ("City rebuild").** About 28,500 rows filed by CDOT's non-electrical
  crews, which the portal gives no more text for than "Opening In The Public Way". They aren't a
  pipe, so they are never drawn and never listed among the lines in front: they show only as
  permits, labelled "City rebuild", in `recent_digs`, the cards and the permit history, which tells
  someone coordinating street work that the city has opened the block (decided 2026-11-15).
- **DWM without a word.** About 117,800 DWM rows say neither water nor sewer (often only a ticket
  number); they're filed as water, its usual work, and marked "water or sewer not stated".
- **Restorations** repave a street another permit opened. They're kept as "Restoration only", which
  never counts as a dig (`NOT_OPENING` in `src/sources/permits.ts`, as for New York's manhole
  embargo permits), so a block with nothing else still shows the utility.
- **Counts** (build of 2026-11-11). Of 1,044,836 rows, 290,789 aren't a utility's dig and 13,243
  are paving contractors' work in advance; 3,477 found no block (0.5%). 737,327 rows were placed,
  737,120 by their point and 207 by address range: 59,858 restorations kept as no dig, and digs by
  utility water 237,313, gas 224,202, electric 84,424, sewer 59,237, telecom 43,809, the city's own
  28,484. 1,889 rows have a holder that isn't shown. Grouped by permit and block, that is 605,397
  permits on 158,756 block groups.
- **Placement.** The permit's point is the start of its address range, on the street it names; it
  finds the nearest block of that street within 40 m. Where it doesn't, the address range on the
  centerline does: Chicago numbers every street on one grid. A permit opening several stretches of
  one block is one record.
- **Download.** About 1.04M rows in 21 pages of 50,000, by offset in `:id` order. Socrata takes a
  minute for a page near the start and about three near the end; six at a time, the whole set comes
  down in 10 to 13 minutes (608 s and 789 s on two runs). That is short enough that no frozen cache
  of old years is needed, as New York's 3.7M rows need.
- **811**: inside the city limits the one-call center is the city's own, Chicago 811 (DIGGER,
  `ipi.cityofchicago.org/Digger`), not JULIE, which takes the rest of Illinois (220 ILCS
  50/2.1.8); a street on the city line takes both. At least 48 hours ahead, counted as two business
  days (220 ILCS 50/4(d) and 50/2.9).
- **Depths** (Water Management's Water Section Standard Notes, read from the Internet Archive's
  February 2026 copy, since chicago.gov turns away scripted downloads): services and hydrant
  branches 5 ft of cover; grid mains of 12 in and smaller 6 ft to the bottom of the pipe, so their
  top is about 5 ft down, where the line is drawn; feeder mains of 16 to 48 in about 6 ft to the
  bottom; feeders of 54 in and larger only about 3 ft of cover, so a dig counts water from 3 ft.
  Anything with less than 5 ft of cover is insulated (Standard Details, D-9). Sewers have no
  published depth or map; drawn at 8 ft, below the water mains. Gas by federal code; electric and
  telecom not published.

## Not public

- **Pipes.** Water Management publishes no water main or sewer map as open data. Peoples Gas,
  ComEd and the carriers keep their routes private.
- **Lead service lines.** Chicago has more lead service lines than any other US city, about
  400,000. DWM's inventory is searchable by address at leadsafechicago.org but isn't on the data
  portal, so the lot report says so instead of drawing a line.
- **Street assets.** No hydrant, catch basin, manhole, street light or traffic signal layer is on
  the portal (only 311 complaints about lights).

## Later

- **811 tickets** (`cygx-ui4j`, "Dig Ticket Notifications"). 18.5M rows since 2018, one per
  utility notified for each Chicago 811 ticket, with the midpoint of its address range: which
  utilities answered for a block would show who has lines there, permits or not. Too big for the
  nightly as it stands, and it carries the caller's first and last name, so it would need the same
  portal-side `case()` as the permits and an aggregate per block rather than rows.
