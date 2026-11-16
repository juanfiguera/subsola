import type { z } from 'zod';
import { streetMatchKey } from '../../src/sources/streets';
import type { chiStreetSchema } from './datasets';

/**
 * Chicago's street centerlines: one segment per block, with the address range on each side.
 * Chicago numbers every street on one grid, so a permit's address and street name find its block
 * even where its point doesn't.
 */

type ChiStreetRow = Pick<
  z.infer<typeof chiStreetSchema>,
  | 'pre_dir'
  | 'street_nam'
  | 'street_typ'
  | 'suf_dir'
  | 'l_f_add'
  | 'l_t_add'
  | 'r_f_add'
  | 'r_t_add'
  | 'class'
  | 'status'
>;

/** "W ADDISON ST", as permits and the county's address points write it. */
export const chiStreetName = (
  row: Pick<ChiStreetRow, 'pre_dir' | 'street_nam' | 'street_typ' | 'suf_dir'>,
) =>
  row.street_nam?.trim()
    ? [row.pre_dir, row.street_nam, row.street_typ, row.suf_dir]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ')
    : '';

/**
 * Streets a utility runs under. Rivers (RIV), unnamed lines (99), expressway ramps (9) and the
 * expressways themselves are in the layer too, as are vacated and proposed streets.
 */
export const isDrawnChiStreet = (row: Pick<ChiStreetRow, 'class' | 'status' | 'street_typ'>) =>
  !['RIV', '99', '9'].includes(row.class ?? '') &&
  !(row.class === '1' && row.street_typ === 'EXPY') &&
  !['V', 'P'].includes(row.status ?? '');

export interface ChiRange {
  key: string;
  /** The street's match key, as `streetMatchKey` spells it. */
  street: string;
  row: Pick<ChiStreetRow, 'l_f_add' | 'l_t_add' | 'r_f_add' | 'r_t_add'>;
}

const span = (row: ChiRange['row']): [number, number] | null => {
  const numbers = [row.l_f_add, row.l_t_add, row.r_f_add, row.r_t_add]
    .map(Number)
    .filter((number) => Number.isFinite(number) && number > 0);
  return numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : null;
};

/**
 * The block on `street` whose address range takes in `number`, by its key. Null when the street
 * has no such block, or the number is missing.
 */
export const chiAddressBlock = (ranges: ChiRange[]) => {
  const byStreet = new Map<string, { key: string; low: number; high: number }[]>();
  for (const { key, street, row } of ranges) {
    const numbers = span(row);
    if (!numbers) continue;
    const list = byStreet.get(street) ?? [];
    list.push({ key, low: numbers[0], high: numbers[1] });
    byStreet.set(street, list);
  }
  return (street: string, number: number): string | null => {
    if (!street || !Number.isFinite(number) || number <= 0) return null;
    const candidates = byStreet.get(streetMatchKey(street)) ?? [];
    // The narrowest range that holds it: a long segment's range can overlap a short one's.
    let best: { key: string; width: number } | null = null;
    for (const { key, low, high } of candidates)
      if (number >= low && number <= high && (!best || high - low < best.width))
        best = { key, width: high - low };
    return best?.key ?? null;
  };
};
