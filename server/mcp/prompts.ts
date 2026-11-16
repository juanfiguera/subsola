import { ADDRESS_MAX } from '../../src/share';
import { SERVER_ICONS } from './meta';

/**
 * One prompt a person can pick in their client: a check before digging at an address. Prompts are
 * user-chosen templates, so this one may ask for both tools and a summary.
 */

export const CHECK_BEFORE_DIGGING = 'check_before_digging';

export const promptList = ({ icons = false }: { icons?: boolean } = {}) => [
  {
    name: CHECK_BEFORE_DIGGING,
    title: 'Check before digging',
    description:
      'Looks up what is under the street at an address and who has dug there lately, then sums it up with the 811 reminder.',
    arguments: [
      {
        name: 'address',
        description: 'The street address, with the city: "1420 5th Ave, Seattle".',
        required: true,
      },
    ],
    ...(icons && { icons: SERVER_ICONS }),
  },
];

export type PromptResult =
  { ok: true; result: Record<string, unknown> } | { ok: false; message: string };

export const getPrompt = (name: unknown, args: unknown): PromptResult => {
  if (name !== CHECK_BEFORE_DIGGING)
    return { ok: false, message: `Unknown prompt: ${String(name)}` };
  const address =
    args && typeof args === 'object' ? (args as Record<string, unknown>).address : undefined;
  if (typeof address !== 'string' || !address.trim())
    return { ok: false, message: 'check_before_digging needs an address argument.' };
  if (address.length > ADDRESS_MAX)
    return { ok: false, message: `address can be at most ${ADDRESS_MAX} characters.` };
  const place = address.trim();
  return {
    ok: true,
    result: {
      description: `Check before digging at ${place}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I'm planning to dig at ${place}. Use Subsola's whats_under and recent_digs tools for that address, then sum up in a few lines: which utilities are likely under the street in front and how deep, whether the water service line is lead, and any digging permitted there now or recently. End with the 811 reminder from the answer, since a free markout request is required before digging.`,
          },
        },
      ],
    },
  };
};
