# Address index

The search box's suggestions for street addresses come from Subsola's own index instead of each
city's lookup service. Typing a house number and the start of a street ("233 Broa") downloads one
small file per city and matches it in the browser, so what's typed never leaves the page, and an
address is found in any of the ten cities from any map. Landmarks and corners ("Times Square")
still ask the city's lookup, and picking a suggestion still geocodes it once with the city's own
service, so lots, service lines and reports load exactly as before.

## How it's built

- `pnpm download` fetches every city's address points with the rest of its data, as optional
  datasets with a last good copy (pipeline/addresses/datasets.ts). Only the house number and the
  street are asked for: no units, owners, or anything else on the point.
- `pnpm build-addresses` turns them into `data/addresses/v1/{city}/{key}.json.gz`, where the key
  is the first three characters of the address in one spelling ("233", "12 " for a whole 12,
  "104" for Queens' 104-20). Each file lists each street once with its house numbers. A manifest,
  `data/addresses/v1/index.json.gz`, says which files each city has, so the browser never asks
  for one that isn't there.
- `pnpm upload-cells` sends them to the bucket under `addresses/`, the manifest last. A night
  whose address build failed sends nothing, and last night's index stays up.
- The shared rules (one spelling for "Street" and "St", "52nd" and "52", the file key, matching)
  are in src/sources/addressIndex.ts, used by both the build and the browser.

Sizes from the first full build (2026-11-25): about 4.6 million addresses in 12,300 files, 15 MB
gzipped. The largest file is about 10 KB; the median is under 1 KB.

## Sources

| City          | Source                                                                      | Filter                                         | License and cautions                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New York      | NYC OTI Address Points, NYC Open Data `uf93-f8nk`                           | none                                           | NYC Open Data terms.                                                                                                                                                                                                     |
| Washington    | DC Master Address Repository, `DCGIS_DATA/Location_WebMercator/MapServer/0` | `STATUS='ACTIVE' AND ADDRESS_TYPE='ADDRESS'`   | CC BY 4.0. Pages by offset: the map server gives no id range.                                                                                                                                                            |
| San Francisco | Enterprise Addressing System, data.sf.gov `3mea-di5p`                       | none (base addresses only)                     | PDDL. The portal moved from data.sfgov.org to data.sf.gov.                                                                                                                                                               |
| Los Angeles   | LA County CAMS, `eGIS_Addressing_ADDRESS_POINTSv2/FeatureServer/0`          | `LegalComm='Los Angeles' AND UnitName IS NULL` | eGIS terms allow copying, publishing and adapting, with no County endorsement. Filter on LegalComm, never PostComm1 (it includes unincorporated areas). Picks send the ZIP, which the locator needs.                     |
| San Diego     | SanGIS `Hosted/Address_Points/FeatureServer/0`                              | `addrjur='SD' AND addrunit IS NULL`            | SanGIS "discourages, but does not prohibit" redistribution; only the derived index is published, credited as derived from SanGIS. One row per address and parcel, so condos repeat; house number 0 placeholders dropped. |
| Seattle       | King County `ADDRESS_POINT_642/FeatureServer/0`                             | `CTYNAME='Seattle'`                            | Free to copy and use, but **not to be sold** without a written agreement with King County. The layer also carries USPS ZIP+4 and carrier route fields, which are never read.                                             |
| Denver        | `ODC_CITY_LOC_ADDRESSPUBLIC_P/FeatureServer/31`                             | none                                           | CC BY 3.0.                                                                                                                                                                                                               |
| Chicago       | Cook County Address Points `78yw-iddh`                                      | `geocode_muni='CHICAGO'`                       | Public domain.                                                                                                                                                                                                           |
| Dallas        | `AddressPoints/FeatureServer/0`                                             | none                                           | No license stated, credited to the city as published.                                                                                                                                                                    |
| San Jose      | `OPN/OPN_OpenDataService/MapServer/36`                                      | `Status='Active'`                              | CC BY.                                                                                                                                                                                                                   |

For the four cities whose geocoder already queries address points (Chicago, Dallas, Denver and
San Jose), the build reuses that geocoder's suggestion parser, so the index spells an address
exactly the way the lookup reads it back. The other six build the street from their own fields:
New York from its full street name, and the five locator cities from the parts their locators
use.

## Known gaps

- An address missing from a city's own list can't be suggested. San Diego's list has no
  100 W Broadway, for one. Typing it in full and pressing Enter still finds it through the city's
  lookup.
- A half address ("516 1/2") files under its whole number.
- If address search ever moves behind a paid tier, Seattle needs a written agreement with King
  County first.
