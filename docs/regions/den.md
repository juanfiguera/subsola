# Denver

Subsola's seventh city, the City and County of Denver. Nearly everything comes from the city's
open data on ArcGIS Online, `services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services`; the lead
service line inventory from Denver Water's, `services.arcgis.com/czCXlxn6hYtK4vdg`. Verified
2026-11-10.

## Approach

As with the other cities: the pipeline converts Denver's layers into the same cell bundles, and the
app learns about the city only where it differs.

## Sources

| Input             | Layer                                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Street occupancy  | `ODC_DEV_STREETOCCUPANCYPPERMITS_L/FeatureServer/297`                         | 261,146 rows, one for each stretch of street a permit closes, from Accela, updated daily. Only the 11 purposes that can mean a utility's street cut are downloaded (151,320 rows). The 47,978 rows with no purpose, nearly all 2018 to 2020 with no company either, can't be read. Real records start in 2020; a few begin dates are typing slips (1902, 2031) and are left blank.              |
| Blocks            | `ODC_TRANS_STREET_L/FeatureServer/145`                                        | 30,706 centerline segments. A permit's stretch is the city's own centerline, so its middle finds the block on the street it names: 99.99% land on one.                                                                                                                                                                                                                                          |
| Buildings         | `ODC_PROP_BUILDINGOUTLINES_A/FeatureServer/111`                               | 390,104 outlines. Heights are published but not drawn, as in the other cities.                                                                                                                                                                                                                                                                                                                  |
| Sanitary sewers   | `ODC_UTIL_SANMAIN_L/FeatureServer/353`, in service, not private, not stubouts | 42,354 mains with size, material, year, owner (Metro Water Recovery's interceptors named) and the invert at both ends.                                                                                                                                                                                                                                                                          |
| Sanitary manholes | `ODC_UTIL_SANMANHOLE_P/FeatureServer/286`, in service                         | 46,462, with the ground elevation, mostly read from a terrain model (43,608 "DEM", 3,495 as-built). The pump station site manager and phone fields are never read.                                                                                                                                                                                                                              |
| Storm drains      | `ODC_UTIL_STMMAIN_L/FeatureServer/288`, pipes and culverts, not private       | 51,841 of 88,142. Open channels, linear (trench) drains and the 36,165 private pipes are left out.                                                                                                                                                                                                                                                                                              |
| Storm manholes    | `ODC_UTIL_STMMANHOLE_P/FeatureServer/289`                                     | 24,899, nearly all with a ground elevation, which gives the storm drains their depth.                                                                                                                                                                                                                                                                                                           |
| Storm inlets      | `ODC_UTIL_STMINLET_P/FeatureServer/287`, not private                          | 27,906. Only 938 record a ground elevation.                                                                                                                                                                                                                                                                                                                                                     |
| Traffic signals   | `ODC_TRANS_TRAFFICSIGNAL_P/FeatureServer/147`, in use                         | 1,288.                                                                                                                                                                                                                                                                                                                                                                                          |
| Service lines     | Denver Water `LRP_Inventory_LCRR_DEMO/FeatureServer/0`, inside the city's box | 311,470 premises across Denver Water's service area, 226,085 in the box. Despite the name, it is the live layer behind Denver Water's own "Search by Address" lead map (web map "LRP Inventory Map - LCRR version", linked from denverwater.org/lead), republished daily. Only address, city, category and the parcel's year built are read; never the premise id, tap number or service point. |
| Geocoder          | `ODC_CITY_LOC_ADDRESSPUBLIC_P/FeatureServer/31`, queried by parts             | Denver publishes no locator. Its 416,594 active address points answer browsers, so a typed address is split into number, direction, name and type and asked for exactly.                                                                                                                                                                                                                        |
| Aerial photo      | USGS NAIP Plus `exportImage`                                                  | Public domain. The city's and DRCOG's sharper photos state no open license.                                                                                                                                                                                                                                                                                                                     |

Licenses: the city's open data catalog is CC BY 3.0, with a no-warranty, "not for engineering
purposes" constraint on every layer; the sources say so. Denver Water's inventory states no
license; it's the public inventory the EPA's Lead and Copper Rule requires, credited to Denver
Water.

Left out on purpose: the permits' free-text location details, project field and billing ("exempt")
note, where staff type people's names; the company is read only for the utility it names, as in San
Diego and Seattle, and never shown. Sidewalks (`ODC_TRANS_SIDEWALKS_L`) are lines, not the
polygons the app draws as ground.

Not public: Denver Water's mains. Its public layers hold only a few thousand park and specialty
mains (`Specialized_Mains`) and its replacement projects (`DW_Pipe_Replacement`), not the network,
so water mains are placed from permits, as in New York. Xcel's gas and electric and the telecom
routes aren't public either; no hydrant or streetlight layer is published by the city.

## Phases

1. **Pipeline adapter and region.** Done 2026-11-10. Permits, streets, buildings, sanitary sewers
   and storm drains with depth, the lead service line inventory and street assets in the cells;
   the app's geocoder, NAIP photo, depths, Colorado 811 and wording. 10,180 cells, 54 MB.

## Settled

- **What counts as a dig** (`pipeline/den/permits.ts`). Most occupancy permits close a lane for a
  crane, a dumpster, paving or an event. Kept: the purposes that name a utility ("Street Cut -
  Water", "Street Cut - Sewer", "Sanitary Sewer", "Fire Hydrant", "Fiber Optics", "Cable"), and
  "Utility", "Street Cut - Utilities", "ROW Construction", "Boring" and "Miscellaneous" only when
  the company is a utility or one of its known contractors. Pot holing, sewer lining, aerial cable
  and equipment installation are left out, as are the city's own jobs ("CCD (CPM Trans) & PCL")
  unless they name Denver Water or Denver's wastewater crews.
- **Who dug.** The purpose decides where it names the utility. Otherwise the company: Denver Water
  is water; Denver Wastewater (CPM WW) and Metro Water Recovery sewer; CenturyLink, Qwest and Lumen,
  Comcast, Zayo, Crown Castle, Verizon, AT&T and T-Mobile telecom, as are telecom contractors (Sage,
  Pauley, WYCO, ADB, Bluestream, Cablecom, MasTec and others); sewer and drain trades sewer.
- **Xcel's gas and power.** Xcel runs both, and its permits rarely say which. Its gas contractors
  (Mears, Sitewise, Q3, Miller Pipeline, the AMRP main replacement program) make it gas, its electric
  ones (Hooper, Sturgeon, D&D Power, Ward, PAR, Michels) electric, as does a holder whose name says
  its trade ("... Power", "... Pipeline", read by `pipeline/gasOrElectric.ts`); with none it's filed as gas,
  the more common work in the street, and marked "gas or electric not stated". Of 151,320 rows read,
  128,884 are utility digs (45,132 permits): water 9,861 permits, telecom 9,532, gas 15,079 (9,065
  of them assumed), sewer 7,835, electric 2,825. 22,436 rows aren't a utility's dig.
- **Placement.** Each row is a stretch of the city's centerline; its middle finds the block on the
  street it names. A permit closing several stretches of one block is one record.
- **Depth of sewers** (`pipeline/den/sewers.ts`). Each pipe names the manhole at each end; the
  ground there less the pipe's invert, averaged, less the pipe's height, is its cover. Elevations
  outside 5,000 to 6,000 ft are blanks or typing slips. 40,645 sanitary sewers (96%) and 32,101
  storm drains (62%) are measured; half the sanitary sewers lie 9 ft 4 in or more below the street,
  half the storm drains 5 ft 1 in. Since most grounds come from a terrain model, the cards say the
  depth is good to a foot or so.
- **Lead service lines** (`pipeline/den/services.ts`). Denver Water's four categories for the whole
  line: confirmed lead (lead, which takes in galvanized pipe downstream of lead), likely lead and
  unlikely lead (both unknown, told apart in its words), and not lead. No pipe material, no split
  into Denver Water's part and the owner's. In the city's cells: 9,534 confirmed lead, 6,752 likely,
  11,843 unlikely, 149,620 not lead; each address keeps its worst, 172,139 drawn. Denver Water writes
  a north-side address with or without its "N" ("15 N LOGAN ST", "4771 VINE ST"); both drop it, as
  the geocoder's label does, so the lot report finds its line. The point sits on the building, about
  23 m from the street's centerline, so a line reaches up to 32 m to a main, and the lot report looks
  45 m out for the street in front.
- **811**: Colorado 811, at least two business days ahead, not counting the day of the call
  (C.R.S. 9-1.5-103(3)(a)).
- **Depths**: water mains at least 4 1/2 ft of cover, service lines 4 1/2 to 6 ft (Denver Water
  Engineering Standards, 17th edition, §3.02 and §8.04); sanitary sewers designed at least 9 ft deep
  to the invert (Sanitary Sewer Design Technical Criteria Manual, PWES-006.0, §3.01.1), drawn at
  their measured depths; gas by federal code; electric and telecom not published.
