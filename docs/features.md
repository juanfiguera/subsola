# What the map does

A tour of the map's features, as built for New York first; the other cities share them where
their records allow. See the README for what Subsola is and its limits.

- **Check a spot** (`D`): tap where you want to dig, pick the job (garden bed, tree, fence post,
  or an exact depth) and a shaft drills down showing which utility layers it would reach.
- **Water services**: a line from the water main to every lot DEP lists in its lead service
  line inventory, with a marker at the lot: dark for lead or galvanized, blue for not lead,
  hollow for unknown. The card says how DEP knows. Size and route are not published, so the
  line is drawn straight at the main's depth.
  Each one gets a curb valve 18 inches behind the curb, where DEP has required one since 2021
  ([curb valve FAQ](https://www.nyc.gov/assets/dep/downloads/pdf/about/water-and-sewer-forms/curb-valve-faq.pdf)).
  Older lines may not have one.
- **House sewers**: a line from the sewer main to the same lots, drawn beside the water service.
  It's marked on record when DEP has a sewer permit for the lot (published from 2018 on),
  plugged when the newest one is a plug, and assumed otherwise. The card gives DEP's standard size
  (6 or 8 inch, Sewer Design Standards drawing SE-62). Each lot's card lists its water
  and sewer connection permits.
- **Flow**: light bands drift along the lines whose direction is known: into the building on
  water services, out to the sewer on house sewers and from the grate to the sewer on catch
  basin leads. Sewer mains drain by gravity, so they flow downhill along the street, estimated
  from the city's street spot elevations
  ([9uxf-ng6q](https://data.cityofnewyork.us/d/9uxf-ng6q), every intersection, mid-block and
  every 200 ft); a sewer whose street falls less than a foot gets no direction, and its card
  says the direction is an estimate. Water and gas mains don't move, since nobody publishes
  which way they run in a given street, and hydrant branches hold still water until the hydrant
  opens. Off with reduced motion, and switchable in the layer list.
- **Where catch basins drain**: about 40% of NYC has separate storm sewers, which carry street
  runoff straight to a waterway. A basin inside one of DEP's mapped storm sewer areas says which
  outfall and waterway it drains to, and isn't connected to the drawn sewer, since the drawn
  lanes come from permits that don't say storm or sanitary and the storm line's route isn't
  published. The map is as of August 2020, so newer storm sewers (like the one behind outfall
  NCB-642 at Huron St, Greenpoint) aren't on it. Outfalls along the shore are pins: combined
  sewer overflows, storm sewer outfalls and direct drains, with the waterway and owner.
- **Street fixtures to their mains**: each catch basin drops to a 12-inch lead into the sewer
  (DEP allows basins to join sewers under 60 inches only at a manhole, Sewer Design Standards
  SE1), each hydrant to a 6-inch branch with its gate valve 1 ft from the water main (DEP
  standard WM0020), and each OpenStreetMap manhole tagged with a utility down to that line. A
  manhole sits over its line, so a thin line shows how far the cover is from the drawn lane.
  Routes are drawn straight; the real ones aren't published.
- **Fixtures up close**: zoomed in, hydrants, catch basins and manhole covers are drawn as
  the real castings (silver NYC hydrant with blue caps and its pumper nozzle facing the
  street, an iron grate in the gutter with its curb piece and an open concrete basin under it,
  a 26-inch iron cover), about one and a half times true size. Street lamps are NYC davit
  poles with the arm over the street, at 0.6 times true height so they don't tower over the low
  building massing, and LinkNYC kiosks are stainless slabs with a screen on each face. The map
  pins step aside. The hydrant is modeled in Blender by `models/hydrant.py`; rebuild it with
  `pnpm models` (needs Blender on the PATH), which writes `public/models/hydrant.glb`.
- **Valves**: only the ones a published rule places are drawn: curb valves 18 inches behind
  the curb and hydrant gate valves 1 ft from the main. Main line valves go wherever each
  job's contract drawings put them (DDC water main specs), and those drawings aren't public.
- **Crew dig spots**: many DOT permits carry the crew's own note on where they opened the
  street, measured from two curbs (`0' NNC OF 28 AVE & 4' WEC OF 37TH ST` is at the north curb
  of 28th Ave, 4 ft in from the east curb of 37th St). Each note that names two crossing
  streets is placed on the city's curb lines and painted on the street as an X in the
  utility's color. A note marks where an opening started, not the pipe itself, so one note
  doesn't move anything. Where a block has two or more for one utility, that utility's lane
  moves to the middle of them (the median distance from the block centerline), and the card
  says how many notes placed it. Notes more than 12 m from the centerline are left out.
- **Being dug now**: permits whose DOT work window includes today show as hi-vis zones on the
  block and at the top of the card.
- **The dive**: each search starts over the aerial photo and drops to street level as the pipes
  spread out from the address. Any click or scroll skips it.

- **Traffic signals**: DOT doesn't publish a list of its signalized intersections, only the
  ones with leading pedestrian intervals, accessible push buttons or all-way walk phases. Those
  are combined with OpenStreetMap's signals, points within 30 m counted as one intersection.
  Signal cable runs in DOT conduit that isn't published, so nothing is drawn under them.

## Controls

On a phone or upright tablet (900 px wide or less, or a phone on its side), the card is a
bottom sheet: drag its handle, or tap it, to switch between a peek at the address, half the
screen and all of it. Drag to move, pinch to zoom, and two fingers turn and tilt. The round
buttons on the right open the city map and the layer list, turn north up and switch the
aerial photo; the camera tabs float above the sheet.

Drag to move around, like Google Maps. Right-drag or Ctrl-drag rotates and tilts, scroll zooms.
`D` checks a spot before digging. `1` `2` `3` switch the camera between Top down, 3D and
Underground, `4` turns the aerial photo on and off, `5` opens the city map, `Q` / `E` rotate,
`N` turns north up, `⌘K` searches, `Esc` goes back.

The Aerial photo switch lays the state's aerial photo under the pipes from any camera angle.
Whenever the photo is on, the white building blocks are hidden so the real roofs show.

The compass in the toolbar turns with the map. When the camera goes under the street, the
background turns soil-colored and the toolbar shows "Below street". From below, east and west
swap sides on screen; the compass's east dot shows that.

At street level the roadbed turns into a dark see-through slab with the street's name on it,
and the sidewalks on either side into a lighter one, so the slab runs building line to building
line like a street section.
Within 10° of level the view becomes a section: only a slice about 36 m wide through the view
center is drawn, so the streets behind the one you're looking at don't stack onto it.
