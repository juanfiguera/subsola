import { z } from 'zod';
import type { Position } from 'geojson';
import { pointSchema } from './socrata';

/** A planimetric spot elevation on a street centerline, in feet above sea level. */
export const elevationSchema = z.object({ the_geom: pointSchema, elevation: z.string() });

// Code 3000 is spot elevations; sub-code 300020 marks bridge decks, which aren't the ground the
// sewer follows. Building roofs (3020) and water surfaces (3010) are in the same dataset.
export const STREET_SPOTS_FILTER = "feat_code='3000' AND sub_code='300000'";

export interface Spot {
  lngLat: Position;
  elevationFt: number;
}

export const spotsFromRows = (rows: z.infer<typeof elevationSchema>[]): Spot[] =>
  rows.flatMap((row) => {
    const elevationFt = Number(row.elevation);
    return Number.isFinite(elevationFt) ? [{ lngLat: row.the_geom.coordinates, elevationFt }] : [];
  });
