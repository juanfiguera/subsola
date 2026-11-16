/**
 * Cover over a sewer, rounded to a tenth of a foot, or null when it can't be real. City records
 * hold mistyped elevations that come out at hundreds or thousands of feet; 100 ft still allows
 * the deepest tunnels.
 */
export const plausibleDepth = (coverFt: number | null) =>
  coverFt !== null && coverFt > 0 && coverFt < 100 ? Math.round(coverFt * 10) / 10 : null;
