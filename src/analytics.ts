import type { CaptureResult, PostHog } from 'posthog-js';
import { recordVisit } from './visits';

/**
 * Product analytics with PostHog, set up to know no one: PostHog keeps nothing on the device (no
 * cookies, no local storage, so no ID ties visits together), no session recording, and the
 * project is set to discard IPs. Events say what was done and in which city, never the address
 * typed or the spot looked at, since a home address is personal. Whether a visitor has been
 * before comes from a count kept apart from PostHog (see visits.ts). No key (local builds,
 * previews) means nothing is sent. docs/analytics.md lists every event and what it's for.
 *
 * Any page can use it: call `startAnalytics(key, { page })` once, which also records the
 * `$pageview`, then `track` for anything done on the page.
 */

export type AnalyticsEvent =
  | 'address_searched'
  | 'address_not_found'
  | 'suggestion_picked'
  | 'street_loaded'
  | 'view_changed'
  | 'layer_toggled'
  | 'card_opened'
  | 'report_opened'
  | 'report_printed'
  | 'city_map_opened'
  | 'city_switched'
  | 'dig_checked'
  | 'link_copied'
  | 'feedback_sent'
  | 'load_crashed'
  | 'map_unavailable'
  | 'explainer_opened'
  | 'coverage_missed'
  | 'mcp_link_clicked';

export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export interface PageOptions {
  /** Which page this is: 'map', 'insights', 'city'. Sent with every event from it. */
  page: string;
  /** The city a city page is about, as a region id ('nyc', 'dc'). */
  city?: string;
}

/** How a street came to be loaded. */
export type SearchSource = 'typed' | 'city map' | 'share link' | 'default';

/**
 * A search typed in the box, a street opened from the city map, a shared link's address, or the
 * street the map opens on when the link names none.
 */
export const searchSource = (
  arrival: boolean,
  shared: { address?: string | null } | undefined,
): SearchSource => {
  if (arrival) return 'city map';
  if (!shared) return 'typed';
  return shared.address ? 'share link' : 'default';
};

/** The kind of underground line a picked ref is; null for what isn't one (hydrants, digs). */
export type LineKind = 'permit' | 'main' | 'service' | 'assumed' | 'junction';

export const lineKindOf = (ref: string): LineKind | null => {
  if (/^permit-\d+$/.test(ref)) return 'permit';
  if (/^main-\d+$/.test(ref)) return 'main';
  if (/-service-\d+$/.test(ref)) return 'service';
  if (/^assumed-/.test(ref)) return 'assumed';
  if (/^junction-/.test(ref)) return 'junction';
  return null;
};

/**
 * Whether the depth a line's card gives was measured at that line, or estimated from a depth
 * standard. Only mapped mains with an invert and a rim close by have a measured depth.
 */
export const depthBasis = (kind: LineKind, measuredDepthFt: number | null) =>
  kind === 'main' && measuredDepthFt !== null ? 'measured' : 'estimated';

const withoutQuery = (url: string) => url.split(/[?#]/)[0]!;

/**
 * Every URL in an event without its query. A shared link's query holds the address, and PostHog
 * puts the page URL in more places than `$current_url`: the referrer, web vitals, and heatmaps,
 * whose data is keyed by URL.
 */
export const stripUrlQueries = (value: unknown): unknown => {
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? withoutQuery(value) : value;
  if (Array.isArray(value)) return value.map(stripUrlQueries);
  // Plain objects only: a Date (an event's timestamp) passes through as it is.
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        stripUrlQueries(key) as string,
        stripUrlQueries(inner),
      ]),
    );
  return value;
};

let client: PostHog | null = null;
// Events before PostHog has loaded, sent once it has with the time they happened.
const waiting: [AnalyticsEvent, AnalyticsProperties, Date][] = [];

/** After the page has loaded and the browser has a moment, so PostHog never slows the first view. */
const whenIdle = (task: () => void) => {
  const soon = () =>
    'requestIdleCallback' in window
      ? requestIdleCallback(task, { timeout: 3000 })
      : setTimeout(task, 1500);
  if (document.readyState === 'complete') soon();
  else window.addEventListener('load', soon, { once: true });
};

export const startAnalytics = (key: string | undefined, { page, city }: PageOptions) => {
  if (!key) return;
  const visit = recordVisit();
  whenIdle(() => {
    void import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(key, {
          api_host: 'https://us.i.posthog.com',
          persistence: 'memory',
          person_profiles: 'never',
          autocapture: false,
          // Dead clicks report the text of what was clicked, and cards show addresses.
          capture_dead_clicks: false,
          capture_pageview: true,
          capture_pageleave: true,
          disable_session_recording: true,
          disable_surveys: true,
          get_current_url: withoutQuery,
          before_send: (event: CaptureResult | null) =>
            event && {
              ...event,
              properties: stripUrlQueries(event.properties) as CaptureResult['properties'],
            },
          // On every event from this page load. Here rather than after init, which has already
          // sent the pageview by then.
          loaded: (loaded) => loaded.register({ page, ...(city ? { city } : {}), ...visit }),
        });
        client = posthog;
        for (const [event, properties, timestamp] of waiting.splice(0))
          posthog.capture(event, properties, { timestamp });
      })
      .catch((error: unknown) => console.info('[subsola] analytics did not load', error));
  });
};

export const track = (event: AnalyticsEvent, properties: AnalyticsProperties = {}) => {
  if (client) client.capture(event, properties);
  else if (waiting.length < 50) waiting.push([event, properties, new Date()]);
};
