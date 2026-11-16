/**
 * Real answers for the docs page, trimmed from live calls to https://subsola.com/mcp on
 * 2026-11-11 ("[...]" marks lines left out), and prompts people might try, each with a real
 * address in a covered city.
 */

import type { UtilityKind } from '../../src/utilities';

/** Each tool in a line, and what its answer holds, for the tool cards. */
export const TOOL_SUMMARIES: Record<string, { purpose: string; returns: string[] }> = {
  whats_under: {
    purpose: "What's likely under the street in front of one address.",
    returns: [
      'Each utility in the street: distance from the lot line, expected depth and the standard behind it',
      'How each line was placed (the owner’s map, permits, or inferred) and how sure that is',
      'The water service line’s lead status, where the city publishes it, and the house sewer',
      'Digging permitted there today, and the newest permits out front with their street and distance',
      'The nearest hydrant, catch basin and manhole',
    ],
  },
  recent_digs: {
    purpose: 'Who has dug up the street around one address, newest first.',
    returns: [
      'Excavation permits in the radius, with the total found',
      'Utility, permit holder and what the work was',
      'Issue date (or start, where a city publishes none), work window, and whether digging is permitted today or scheduled',
      'The street and how far away it is',
      'Permits that don’t cut the street (opening a manhole, storing material) are left out',
    ],
  },
};

/**
 * Short readings of each parameter for the tool cards. The full descriptions, which list every
 * city, are what assistants read and stay in the schema; the cards show the city ids as chips.
 */
export const PARAM_NOTES: Record<string, string> = {
  address: 'House number, street and city, as in "200 N Spring St, Los Angeles".',
  city: 'Search only this city, and rule out a lookalike address elsewhere. Its id, or its name as people write it.',
  radius_m: 'How far around the address to look, in meters.',
  since_year:
    'Only permits issued in this year or later, or starting then where a city publishes no issue date.',
  utility: 'Only this kind of work.',
  permitted_today: 'true for only the permits whose work window includes today.',
};

/** The conversation at the top of the page, drawn from the whats_under answer below. */
export const DEMO = {
  prompt: "We're trenching for an EV charger at 1420 5th Ave, Seattle. What's under there?",
  address: '1420 5th Ave, Seattle, WA',
  asOf: '2026-11-11',
  lines: [
    {
      utility: 'electric',
      label: 'Electric',
      where: '5 ft from the lot line',
      depth: 'Depth not published',
      from: 'City Light’s map',
    },
    {
      utility: 'water',
      label: 'Water, 6 in',
      where: '23 ft out',
      depth: '2 ft 2 in to 5 ft down',
      from: 'SPU’s map',
    },
    {
      utility: 'telecom',
      label: 'Telecom',
      where: '41 ft out',
      depth: 'Depth not published',
      from: 'permits on the block',
    },
    {
      utility: 'gas',
      label: 'Gas',
      where: '46 ft out',
      depth: '1 ft 6 in to 4 ft down',
      from: 'permits on the block',
    },
  ] satisfies { utility: UtilityKind; label: string; where: string; depth: string; from: string }[],
  facts: [
    ['Lead service line', 'Unknown: SPU hasn’t recorded the material'],
    ['Digging today', 'Puget Sound Energy, gas work until 2027-04-16'],
  ],
  call811: 'Washington 811, two full business days before digging',
};

export const EXAMPLE_CALLS: Record<string, { args: Record<string, unknown>; answer: string }> = {
  whats_under: {
    args: { address: '1420 5th Ave, Seattle' },
    answer: `What public records show under the street at 1420 5th Ave, Seattle, WA (Seattle), Parcel 197570-0080. Records as of 2026-11-11.

Utilities in the street in front:
- Electric: about 5 ft from the lot line as drawn, depth not published; treat it as possible anywhere in the top 6 ft. Position from: Seattle City Light's map of its underground lines. Confidence: From city records.
- Water, 6 in: about 23 ft from the lot line as drawn, expected 2 ft 2 in to 5 ft down (city standard: Seattle Standard Specifications 7-10.3(5); SPU developer installed main guide). Position from: Seattle Public Utilities' map of its mains. Confidence: From city records.
- Gas: about 46 ft from the lot line as drawn, expected 1 ft 6 in to 4 ft down (federal minimum: 49 CFR 192.327 and 192.361). Position from: Excavation permits on this block, drawn at a standard offset in the street. Confidence: From permits. 3 permits on this block (2020 to 2026). Most often filed by: Puget Sound Energy
[...]
Water service line (lead status): Unknown. Seattle Public Utilities has not recorded the material of all of its part of this water service. [...]

Digging permitted today on the block: Puget Sound Energy, gas work on 5TH AVE between UNION ST and PIKE ST until 2027-04-16.
[...]
This is public-records evidence, not a survey, and not a substitute for calling 811. [...]
Before any digging, request a free markout from Washington 811 at least two full business days ahead: https://washington811.com/
See this spot on Subsola: https://subsola.com/?q=1420%205th%20Ave%2C%20Seattle%2C%20WA`,
  },
  recent_digs: {
    args: { address: '33 Union Square West, New York, NY' },
    answer: `1719 utility digs on record within 150 m of 33 Union Square West, New York, NY (New York City); the newest 25 are listed. Records as of 2026-11-11.
Date | utility | permit holder | work | street | work window | permit
- issued 2026-10-30 | Sewer | Jlj Iv Enterprises,Inc. | DEP Contractor Major Installation Sewer | EAST 17 STREET between 5 AVENUE and BROADWAY, 52 m away | work window 2026-10-30 to 2026-12-31, permitted today | permit M012026303A63
- issued 2026-10-26 | Gas | Consolidated Edison | GAS SERVICE | EAST 16 STREET between 5 AVENUE and UNION SQUARE WEST, 24 m away | work window 2026-10-26 to 2026-11-20, permitted today | permit M012026299B74
- issued 2026-10-05 | Gas | Consolidated Edison | GAS MAIN | UNION SQUARE WEST between EAST 15 STREET and EAST 16 STREET, 39 m away | work window 2026-10-05 to 2026-11-14, permitted today | permit M012026278B94
[...]
This is public-records evidence, not a survey, and not a substitute for calling 811. [...]
Before any digging, request a free markout from New York 811 at least two full working days ahead: https://www.newyork-811.com/`,
  },
};

export const EXAMPLE_PROMPTS: { who: string; prompt: string }[] = [
  {
    who: 'Early site research',
    prompt:
      "We're scoping a new building at 33 E Bayaud Ave, Denver. Which utilities run in the street in front, how was each one mapped, and how deep are they expected to be?",
  },
  {
    who: 'Scoping a trench',
    prompt:
      "I'm planning a 3 ft trench at 1420 5th Ave, Seattle. Which utilities run in the street in front, how far from the lot line, and how deep are they expected to be?",
  },
  {
    who: 'Due diligence on a purchase',
    prompt:
      "We're buying 800 F St NW, Washington, DC. Does the city list the water service line as lead, and has the block seen much utility work lately?",
  },
  {
    who: 'Coordinating street work',
    prompt:
      'We have a street opening planned outside 33 Union Square West in Manhattan. Who else holds permits on the block now or soon, and are any jobs dragging on?',
  },
  {
    who: 'Planning a conduit run',
    prompt:
      "We're running conduit for chargers at 200 N Spring St, Los Angeles. What's in the street there, and which utilities have dug it since 2020?",
  },
  {
    who: 'Managing a building',
    prompt:
      "We manage 100 W Broadway, San Diego. What does the city's lead service line inventory say about it, and what runs in the street out front?",
  },
];
