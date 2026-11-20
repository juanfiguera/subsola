import type { z } from 'zod';
import type { streetRowSchema } from '../../src/sources/streets';
import { DATASETS, type DatasetSpec } from '../datasets';
import type { dcBlockSchema } from '../dc/datasets';
import type { laStreetSchema } from '../la/datasets';
import type { sdStreetSchema } from '../sd/datasets';
import type { seaStreetSchema } from '../sea/datasets';
import type { denStreetSchema } from '../den/datasets';
import type { chiStreetSchema } from '../chi/datasets';
import { chiStreetName, isDrawnChiStreet } from '../chi/streets';
import type { dalStreetSchema } from '../dal/datasets';
import { dalStreetName } from '../dal/build';
import { DRAWN_LAYERS, isActive } from '../sf/build';
import type { sfStreetSchema } from '../sf/datasets';
import { readRows } from '../raw';
import { figure, miles, round, type City, type Figure } from './common';

/**
 * Street miles per city, to put permits and assets per mile, and a readable name for each block
 * id the permits were matched to. Names are public streets only.
 */

const specOf = (name: string): DatasetSpec => {
  const spec = DATASETS.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(`No dataset spec for ${name}`);
  return spec;
};

const rowsOf = <S extends z.ZodObject>(name: string) =>
  readRows(specOf(name)) as AsyncIterable<z.infer<S>>;

const clean = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

export interface Streets {
  miles: Record<City, Figure<number>>;
  blockNames: Map<string, string>;
}

export const readStreets = async (): Promise<Streets> => {
  const blockNames = new Map<string, string>();
  const total: Record<City, number> = {
    nyc: 0,
    dc: 0,
    sf: 0,
    la: 0,
    sd: 0,
    sea: 0,
    den: 0,
    chi: 0,
    dal: 0,
  };

  for await (const row of rowsOf<typeof streetRowSchema>('centerline'))
    if (row.the_geom) total.nyc += miles(row.the_geom.coordinates);

  for await (const row of rowsOf<typeof dcBlockSchema>('dcBlocks')) {
    total.dc += miles(row.geometry.paths);
    blockNames.set(
      `dc|${row.BLOCKKEY}`,
      clean(
        row.ROUTENAME,
        row.FROMSTREET && `from ${row.FROMSTREET}`,
        row.TOSTREET && `to ${row.TOSTREET}`,
      ),
    );
  }

  for await (const row of rowsOf<typeof sfStreetSchema>('sfStreets')) {
    if (!row.line?.coordinates.length) continue;
    if (!isActive(row.active) || !DRAWN_LAYERS.test(row.layer ?? '') || !row.streetname) continue;
    total.sf += miles([row.line.coordinates]);
    blockNames.set(
      `sf|${row.cnn}`,
      clean(row.streetname, row.f_st && `between ${row.f_st}`, row.t_st && `and ${row.t_st}`),
    );
  }

  for await (const row of rowsOf<typeof laStreetSchema>('laStreets')) {
    total.la += miles(row.geometry.paths);
    if (row.SECT_ID != null)
      blockNames.set(`la|${row.SECT_ID}`, clean(row.TDIR, row.STNAME, row.STSFX));
  }

  for await (const row of rowsOf<typeof sdStreetSchema>('sdStreets')) {
    total.sd += miles(row.geometry.paths);
    if (row.roadsegid != null) blockNames.set(`sd|${row.roadsegid}`, clean(row.rd30full));
  }

  for await (const row of rowsOf<typeof seaStreetSchema>('seaStreets')) {
    total.sea += miles(row.geometry.paths);
    if (row.COMPKEY != null) blockNames.set(`sea|${row.COMPKEY}`, clean(row.UNITDESC));
  }

  for await (const row of rowsOf<typeof denStreetSchema>('denStreets')) {
    total.den += miles(row.geometry.paths);
    blockNames.set(
      `den|${row.OBJECTID}`,
      clean(row.FULLNAME, row.FROMNAME && `from ${row.FROMNAME}`, row.TONAME && `to ${row.TONAME}`),
    );
  }

  // "800|E|73RD|ST|": the address where the cross street meets, then its name in parts.
  // A dead end or the city line has a direction but no name: "2000|N|||".
  const crossName = (cross: string | null | undefined) => {
    const parts = cross?.split('|') ?? [];
    return parts[2]?.trim() ? parts.slice(1, 4).filter(Boolean).join(' ') : null;
  };
  for await (const row of rowsOf<typeof chiStreetSchema>('chiStreets')) {
    const name = chiStreetName(row);
    if (!row.the_geom || !name || !isDrawnChiStreet(row)) continue;
    total.chi += miles(row.the_geom.coordinates);
    const from = crossName(row.f_cross);
    const to = crossName(row.t_cross);
    blockNames.set(`chi|${row.objectid}`, clean(name, from && `from ${from}`, to && `to ${to}`));
  }

  // Dallas's centerline names no cross streets, so a block reads by its address range.
  for (const [dataset, prefix] of [
    ['dalStreets', ''],
    ['dalMajorStreets', 'm'],
  ] as const)
    for await (const row of rowsOf<typeof dalStreetSchema>(dataset)) {
      const name = dalStreetName(row);
      if (!row.the_geom || !name) continue;
      total.dal += miles(row.the_geom.coordinates);
      const numbers = [row.l_f_add, row.l_t_add, row.r_f_add, row.r_t_add]
        .map(Number)
        .filter((number) => Number.isFinite(number) && number > 0);
      const range = numbers.length ? `${Math.min(...numbers)} to ${Math.max(...numbers)}` : null;
      blockNames.set(`dal|${prefix}${row.objectid}`, clean(name, range && `(${range})`));
    }

  const source = (datasets: string[], filter: string) => ({ datasets, filter });
  return {
    blockNames,
    miles: {
      nyc: figure(round(total.nyc), source(['centerline'], 'every CSCL centerline row'), {
        note: 'CSCL includes highways, ramps and some paths, so NYC per-mile figures run low.',
      }),
      dc: figure(round(total.dc), source(['dcBlocks'], 'every DDOT street block')),
      sf: figure(
        round(total.sf),
        source(
          ['sfStreets'],
          'active segments on the drawn STREETS layers, as the build draws them',
        ),
      ),
      la: figure(round(total.la), source(['laStreets'], 'every City of LA street segment')),
      sd: figure(
        round(total.sd),
        source(['sdStreets'], 'SanGIS road segments with either side in the City of San Diego'),
      ),
      sea: figure(round(total.sea), source(['seaStreets'], 'every SDOT street segment')),
      den: figure(
        round(total.den),
        source(['denStreets'], 'every City and County of Denver street centerline'),
      ),
      chi: figure(
        round(total.chi),
        source(
          ['chiStreets'],
          'City of Chicago street centerlines, less rivers, expressways and their ramps, vacated and proposed streets',
        ),
      ),
      dal: figure(
        round(total.dal),
        source(
          ['dalStreets', 'dalMajorStreets'],
          'Dallas street centerlines with a side in the city, less private, unbuilt and freeway segments, trails and walkways',
        ),
      ),
    },
  };
};
