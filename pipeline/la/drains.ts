/**
 * Los Angeles's storm drains as LA Sanitation publishes them (`Stormwater_Information/10`): the
 * material's words, the size, and who owns the pipe. See docs/regions/la.md.
 */

// Words the layer spells out in a way the card shouldn't: acronyms and a combined name.
const MATERIALS: Record<string, string> = {
  'Polyvinyl Chloride (P.V.C.)': 'PVC',
  'High Density Polyethylene Pipe (HDPE)': 'Plastic (HDPE)',
  'Acrylonitrile-Butadiene-Styrene (A.B.S.)': 'ABS plastic',
  'Cast/Ductile Iron Pipe (C.I.P.)': 'Cast or ductile iron',
  'Cured-In-Place Pipe Liner (CIPP)': 'Cured in place liner',
};

/**
 * "Reinforced Concrete Pipe (R.C.P.)" to "Reinforced concrete", "Reinforced Concrete Box
 * (R.C.B.)" to "Reinforced concrete box". Null when it's unknown or just "Other".
 */
export const laStormDrainMaterial = (description: string | null | undefined): string | null => {
  const trimmed = description?.trim();
  if (!trimmed || trimmed === 'Unknown' || trimmed === 'Other') return null;
  const named = MATERIALS[trimmed];
  if (named) return named;
  const words = trimmed
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\s+Pipe$/i, '')
    .toLowerCase();
  return words ? `${words[0]!.toUpperCase()}${words.slice(1)}` : null;
};

// Past 12 ft it's a flood control culvert or a mistyped size; drawn that big it would swallow
// the street, so the size is left blank, as in San Diego.
const MAX_SIZE_IN = 144;
// No storm drain box is this short. The few under a foot are boxes whose height was entered
// in feet (6 by 72 in), so they're left blank rather than drawn as a 6 in pipe.
const MIN_BOX_IN = 12;

/** Inches across, or tall for a box or arch. Null when it isn't recorded or can't be trusted. */
export const laStormDrainSizeIn = (
  height: number | null | undefined,
  shape: string | null | undefined,
): number | null => {
  if (!height || height <= 0 || height > MAX_SIZE_IN) return null;
  const round = !shape || shape === 'Round';
  return round || height >= MIN_BOX_IN ? height : null;
};

// The agencies named on the card. The city's own drains, and "Other", name no one.
const OWNERS: Record<string, string> = {
  'County of Los Angeles': 'Los Angeles County',
  'State of California': 'State of California',
  Private: 'Private',
  'US Army Corps of Engineers': 'US Army Corps of Engineers',
  'The Port of Los Angeles': 'Port of Los Angeles',
};

/** Who owns a storm drain, where it isn't the City of Los Angeles. */
export const laStormDrainOwner = (owner: string | null | undefined): string | null =>
  (owner && OWNERS[owner.trim()]) ?? null;

// Degrees to meters around Los Angeles, close enough over 10 m.
const M_PER_DEGREE_Y = 111_320;
const M_PER_DEGREE_X = M_PER_DEGREE_Y * Math.cos((34 * Math.PI) / 180);

/**
 * Lid elevations by place, to find the street's height over a storm drain's end. Only about
 * 2,400 of the city's storm structures record a lid, so a sewer maintenance hole's lid close by
 * stands in: where both are recorded within 10 m they agree to a tenth of a foot at the median,
 * so the two layers share a datum.
 */
export const createLidIndex = (reachM: number) => {
  const cellX = reachM / M_PER_DEGREE_X;
  const cellY = reachM / M_PER_DEGREE_Y;
  const cells = new Map<string, [x: number, y: number, lid: number][]>();
  const cellKey = (column: number, row: number) => `${column},${row}`;
  return {
    add([x, y]: number[], lid: number) {
      const key = cellKey(Math.floor(x! / cellX), Math.floor(y! / cellY));
      const list = cells.get(key);
      if (list) list.push([x!, y!, lid]);
      else cells.set(key, [[x!, y!, lid]]);
    },
    /** The lid of the nearest structure within reach, or undefined. */
    nearest([x, y]: number[]): number | undefined {
      const column = Math.floor(x! / cellX);
      const row = Math.floor(y! / cellY);
      let best: { distance: number; lid: number } | undefined;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const [lx, ly, lid] of cells.get(cellKey(column + dx, row + dy)) ?? []) {
            const distance = Math.hypot((lx - x!) * M_PER_DEGREE_X, (ly - y!) * M_PER_DEGREE_Y);
            if (distance <= reachM && (!best || distance < best.distance)) best = { distance, lid };
          }
      return best?.lid;
    },
  };
};
