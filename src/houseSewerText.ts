import { FEET_TO_METERS } from './depth';
import type { LotReport } from './report';

/**
 * What LA Sanitation's house connections say about a lot, in the words the lot report and the
 * MCP server share. The city maps each connection's route but not the building it serves, so
 * the nearest to the address stands in.
 */

const LA_DEPTH = 'City code (LAMC 64.17) puts it at least 4 ft deep at the property line.';

/** "about 25 ft", to the nearest 5 ft: the address point is only roughly where the lot is. */
const roughFeet = (meters: number) =>
  `about ${Math.max(5, Math.round(meters / FEET_TO_METERS / 5) * 5)} ft`;

export const laHouseSewerText = (nearby: LotReport['nearbySideSewer']) =>
  nearby
    ? {
        status: 'Mapped nearby',
        detail: `LA Sanitation maps a house connection ${roughFeet(nearby.distanceM)} from this address, running from the sewer in the street to the property line, as drawn on the map. The city does not record which building each connection serves, so this is the nearest, most likely this lot's. ${LA_DEPTH} The property owner owns and maintains it.`,
      }
    : {
        status: 'None mapped nearby',
        detail: `LA Sanitation maps house connections, but none within about 100 ft of this address. Nearly every building in the city drains to the public sewer. ${LA_DEPTH}`,
      };
