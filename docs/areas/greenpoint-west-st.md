# West St, Greenpoint (Brooklyn 11222)

Checked 2026-10-25. West St runs north-south for about 1 km (numbers 1 to 232, from about
40.7262 to 40.7354). The app covers 500 ft around one address, so it was walked in four stops.

| Stop        | Permits | Gas | Electric | City (DDC) | Sewer | Water | Telecom | Lots | Lead | Dig spots |
| ----------- | ------: | --: | -------: | ---------: | ----: | ----: | ------: | ---: | ---: | --------: |
| 20 West St  |     910 | 300 |      226 |        197 |    81 |    71 |      35 |   76 |    9 |        12 |
| 85 West St  |     765 | 268 |      108 |        184 |    68 |    81 |      56 |   45 |    1 |         7 |
| 150 West St |   1,652 | 681 |      287 |        265 |   154 |   152 |     113 |  133 |   24 |         9 |
| 213 West St |     175 |  50 |       26 |         39 |    15 |    16 |      29 |    6 |    0 |         2 |

Stops overlap, so the rows don't add up to a total for the street.

## What the data says

- **Gas is National Grid here.** Permits are filed as "KeySpan Energy Delivery" and
  "Brooklyn Union Gas d/b/a National Grid", and Con Edison files only electric. Cards now show
  both old names as National Grid.
- **West St was rebuilt by the city in 2015 to 2017.** 138 of the 266 permits on West St itself
  fall in those three years: 60 are DDC major reconstruction by Perfetto Contracting, the rest
  gas, electric and telecom installs alongside. City contracts aren't drawn as a pipe, so the
  water and sewer lanes here come only from DEP and plumber permits.
- **Lead is rarer than in Astoria.** 34 of 260 lots across the stops are listed as lead (13%,
  against 23% around 25-87 37th St), and none near the north end. Most lead calls are still
  from records rather than inspection.
- **Activity is uneven.** Around 85 West St (Greenpoint Ave and Kent St to the water) there
  were 538 permits in the 2010s and 56 so far in the 2020s.
- **Waterfront streets break block placement.** Permits filed as "Kent Street between Body of
  Water and West Street" or "Greenpoint Avenue between Dead End and West Street" have no
  second corner, so newer permits without geometry on those blocks can't be placed.
- **House sewers are mostly assumed.** Only 16 of the 229 house sewers drawn have a sewer permit on record (records start in 2018).

## Problems found and fixed

- National Grid manhole work was classified as electric; it is gas (National Grid runs gas only
  in NYC).
- Old gas company names on cards (see above).
- OpenStreetMap (manholes, street lamps) failed at every stop. The app now tries a second
  Overpass server and says which servers failed. Both were down this night, and the mirror
  showed no manholes mapped near 150 West St anyway.

## Still open

- No manholes or lamps for West St until Overpass recovers.
- The 213 West St stop is mostly industrial waterfront: 6 lots, no hydrants in DEP's data.
- WebGL "primcount < 0" warnings (seen everywhere, not specific to this area).
