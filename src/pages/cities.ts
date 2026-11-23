import { z } from 'zod';
import type { RegionId } from '../regions';
import type { SourceKey } from '../sources/catalog';

/**
 * What each city page says about where its lines come from. Names, publishers, links and
 * licenses are read from the source catalog; the figures (years of permits, miles of pipe, lead
 * lines) from the nightly insights.json when the site is built. What's written here is what the
 * catalog can't say: which of a city's sources play which part, and what the city doesn't
 * publish.
 */
export interface CityFacts {
  /** An address the page's big link opens the map at; a street with plenty on it. */
  mapAddress: string;
  /** The excavation or street use permits the gas, electric and telecom lines are placed from. */
  permits: SourceKey[];
  /** Pipes the city or utility maps on their own routes. */
  mains: SourceKey[];
  /** What the city doesn't map, said plainly, after the mapped sources are named. */
  unmapped: string;
  /** The service line inventory, if the city publishes one by address. */
  serviceLines: SourceKey | null;
  /** What the inventory counts, or why there's none to show. */
  serviceLineNote: string;
  /** What else the map draws there, where it isn't the usual street assets from open data. */
  alsoDraws?: string;
}

/**
 * Partial so a new region still builds; a test checks every region has an entry, and a page
 * for one without facts says only what the region itself knows.
 */
export const CITY_FACTS: Partial<Record<RegionId, CityFacts>> = {
  nyc: {
    mapAddress: '1 Times Square, New York, NY 10036',
    permits: ['permitsCurrent', 'permitsHistoric'],
    mains: [],
    unmapped:
      'New York publishes no water main or sewer locations at all, so every line here is placed from permits, with hydrants and catch basins from DEP marking where water and sewer must run.',
    serviceLines: 'serviceLines',
    serviceLineNote:
      "DEP's inventory gives the service line material for each tax lot, so the lot report says whether a building's water line is lead.",
  },
  dc: {
    mapAddress: '800 F St NW, Washington, DC',
    permits: ['dcPermits'],
    mains: ['dcMains'],
    unmapped:
      'DC Water publishes only its largest water mains, 16 inches and up, and no sewers, so smaller water lines and sewers come from permits.',
    serviceLines: 'dcServiceLines',
    serviceLineNote:
      "DC Water's inventory gives the public and private side material for each premise, and counts only lead it has verified.",
  },
  sf: {
    mapAddress: '1 Dr Carlton B Goodlett Pl, San Francisco',
    permits: ['sfPermits'],
    mains: ['sfSewerMains', 'sfSideSewers'],
    unmapped:
      'Public Works maps the whole sewer network, with depths. No one publishes the drinking water mains, so water comes from permits too.',
    serviceLines: null,
    serviceLineNote:
      'San Francisco lists lead service lines only at the addresses still waiting to be replaced, not an inventory of every line, so the map shows none.',
  },
  la: {
    mapAddress: '200 N Spring St, Los Angeles',
    permits: ['laPermitsActive', 'laPermitsArchived'],
    mains: ['laSewers', 'laSideSewers', 'laStormDrains'],
    unmapped: 'LADWP publishes no water mains, so water comes from permits too.',
    serviceLines: null,
    serviceLineNote:
      'LADWP reports no lead service lines needing replacement and publishes no inventory by address, so the map shows none.',
  },
  sd: {
    mapAddress: '100 W Broadway, San Diego',
    permits: ['sdPermits', 'sdPermitsOld'],
    mains: ['sdWaterMains', 'sdSewers', 'sdStormDrains', 'sdRecycledMains'],
    unmapped: 'Recycled water mains are drawn in purple, the color locators paint them.',
    serviceLines: 'sdServiceLines',
    serviceLineNote:
      "The city's inventory gives the utility and customer side material for each water meter.",
  },
  sea: {
    mapAddress: '1420 5th Ave, Seattle',
    permits: ['seaPermits'],
    mains: ['seaWaterMains', 'seaSewers', 'seaSideSewers', 'seaElectricLines'],
    unmapped:
      'The public water layer holds only distribution mains, 10 inches and smaller, so larger water mains come from permits. City Light generalizes its map for public use.',
    serviceLines: 'seaServiceLines',
    serviceLineNote:
      "SPU says it has no known lead service lines. Its layer gives the material of the city's part of each service, which the lot report shows.",
  },
  den: {
    mapAddress: '33 E Bayaud Ave, Denver',
    permits: ['denPermits'],
    mains: ['denSewers', 'denStormDrains'],
    unmapped: 'Denver Water publishes no mains, so water comes from permits too.',
    serviceLines: 'denServiceLines',
    serviceLineNote:
      "Denver Water's inventory gives the service line category for each premise it serves.",
  },
  chi: {
    mapAddress: '1060 W Addison St, Chicago',
    permits: ['chiPermits'],
    mains: [],
    unmapped:
      'Chicago publishes no water main, sewer, gas or electric maps, and no hydrants or catch basins, so every line here is placed from street opening permits.',
    serviceLines: null,
    serviceLineNote:
      'The Department of Water Management lets people look up one address at a time at leadsafechicago.org but publishes no inventory, so the map shows none.',
    alsoDraws: "The map also draws streets and buildings from the city's open data.",
  },
  dal: {
    mapAddress: '1500 Marilla St, Dallas',
    permits: ['dalPermits'],
    mains: [],
    unmapped:
      'Dallas publishes no water main, sewer, storm drain, gas or electric maps, and no manholes, inlets or hydrants, so every line here is placed from right of way permits. Many lines here run in alleys; a permit in an alley is drawn on the nearest street.',
    serviceLines: 'dalServiceLines',
    serviceLineNote:
      "Dallas Water Utilities' inventory gives the utility and customer side material for each service. It lists no lead and a handful of galvanized lines to replace; most customer sides are not yet known.",
    alsoDraws:
      "The map also draws streets from the city's open data and buildings from FEMA's USA Structures.",
  },
  sj: {
    mapAddress: '200 E Santa Clara St, San Jose',
    permits: ['sjPermits'],
    mains: ['sjSewers', 'sjStormDrains'],
    unmapped:
      'San Jose Water and Great Oaks Water, the private companies that serve most of the city, publish no mains, so water comes from permits, as do gas, electric and telecom lines.',
    serviceLines: 'sjServiceLines',
    serviceLineNote:
      "San Jose Water's inventory gives the company and customer side material for each service it lists.",
    alsoDraws:
      "The map also draws manholes, inlets, street lights and signals, and streets, from the city's open data, and buildings from the County of Santa Clara.",
  },
};

/**
 * The few figures the city pages quote from insights.json. Read loosely and city by city, so a
 * new city or a missing section drops that figure rather than the whole file.
 */
const figuresSchema = z.object({
  cellsBuiltAt: z.string(),
  permits: z
    .record(z.string(), z.object({ coveredYears: z.array(z.number()) }).partial())
    .catch({}),
  pipes: z
    .record(
      z.string(),
      z.object({ city: z.string(), utility: z.string(), miles: z.object({ value: z.number() }) }),
    )
    .catch({}),
  leadServiceLines: z
    .record(
      z.string(),
      z.object({
        summary: z.object({
          value: z.object({ unit: z.string(), total: z.number(), lead: z.number() }),
        }),
      }),
    )
    .catch({}),
});

export interface CityFigures {
  /** The first year with a real share of the city's permits, as the insights page counts it. */
  permitsSince: number | null;
  /** Miles of mapped pipe by utility: { sewer: 1193 }. */
  miles: Partial<Record<string, number>>;
  lead: { unit: string; total: number; lead: number } | null;
  asOf: string;
}

export type FiguresByCity = Partial<Record<string, CityFigures>>;

/** The figures per city, or none at all if the file isn't what the pages expect. */
export const readFigures = (json: unknown): FiguresByCity => {
  const parsed = figuresSchema.safeParse(json);
  if (!parsed.success) return {};
  const { cellsBuiltAt, permits, pipes, leadServiceLines } = parsed.data;
  const cities = new Set([...Object.keys(permits), ...Object.keys(leadServiceLines)]);
  for (const pipe of Object.values(pipes)) cities.add(pipe.city);
  const figures: FiguresByCity = {};
  for (const city of cities) {
    const miles: Partial<Record<string, number>> = {};
    for (const pipe of Object.values(pipes))
      if (pipe.city === city) miles[pipe.utility] = (miles[pipe.utility] ?? 0) + pipe.miles.value;
    const lead = leadServiceLines[city]?.summary.value;
    figures[city] = {
      permitsSince: permits[city]?.coveredYears?.[0] ?? null,
      miles,
      // A city whose inventory didn't download that night has a total of 0.
      lead: lead && lead.total > 0 ? lead : null,
      asOf: cellsBuiltAt.slice(0, 10),
    };
  }
  return figures;
};
