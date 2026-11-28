# Analytics

Subsola sends product events to PostHog (US cloud) from `src/analytics.ts`. Nothing is sent
without `VITE_POSTHOG_KEY`, so local builds and previews stay quiet.

## What is never sent

- The address typed, shared or looked at, or any spot on the map. Every URL in an event loses
  its query string before it leaves (`?q=` holds the address), including the referrer, web vitals
  and heatmap data.
- An ID that lasts beyond the tab. PostHog keeps its state in memory only (memory persistence),
  makes no person profiles, and the project discards IPs.
- Session recordings, autocaptured clicks or dead clicks (those carry the text of what was
  clicked, and cards show addresses).

## Every event carries

| Property                | Values                                      | Why                                        |
| ----------------------- | ------------------------------------------- | ------------------------------------------ |
| `page`                  | `map`, `insights`, `city` (city pages)      | Which page the event came from             |
| `city`                  | `nyc`, `dc`, `sf`, `la`, `sd`, `sea`, `den` | Where the visitor is looking (most events) |
| `returning`             | `true`, `false`                             | Whether this browser has been here before  |
| `visit_number`          | `1`, `2`, `3-5`, `6-10`, `11+`              | How often people come back                 |
| `days_since_last_visit` | `same day`, `1-7`, `8-30`, `31+`, or null   | How long between visits                    |

PostHog adds its own: browser, OS, device type, screen size, referring domain, and `$pathname`.

## Events

| Event               | Properties                                                                                                               | What it tells us about the first users                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$pageview`         | (the common ones)                                                                                                        | Visits per page and city page; referring domain shows where they heard of it (a neighborhood forum, a trade group, a news story)                                      |
| `address_searched`  | `from`: `typed`, `city map`, `share link`, `default`; `found`; `city` (when found)                                       | Typed searches mean someone has a specific property in mind (owners, contractors); `share link` arrivals show word of mouth; `default` with nothing after is a bounce |
| `address_not_found` | `from`                                                                                                                   | Kept from before `address_searched`; misses suggest people searching cities Subsola doesn't cover yet                                                                 |
| `suggestion_picked` | `city` (never the address or what was typed)                                                                             | Whether type-ahead suggestions get used, and in which cities; the load itself still sends `address_searched`                                                          |
| `street_loaded`     | `city`, `cells`, `seconds` (since page open), `from`                                                                     | How long the first street takes on real devices, per city                                                                                                             |
| `view_changed`      | `view`: `above`, `angled`, `underground`; `city`; `from_city_map`                                                        | Curious locals tend to spin into `underground` to look; engineers and contractors stay in `above` to read positions                                                   |
| `layer_toggled`     | `layer` (a utility like `gas`, or `hydrant`, `services`, `work`...), `on`, `city`                                        | Which utilities people care about: someone turning off everything but `gas` or `services` is planning work, not browsing                                              |
| `card_opened`       | `card` (`utility`, `about`, `probe`, `city`, `feedback`, or a map item family like `permit`, `main`, `asset`); `city`    | What people tap to read                                                                                                                                               |
|                     | for lines also `utility`, `line` (`permit`, `main`, `service`, `assumed`, `junction`), `depth` (`measured`, `estimated`) | Depth taps. Engineers and contractors open many lines and care whether `depth` is `measured`; owners open the `service` line to their own lot                         |
| `dig_checked`       | `city`, `depth_ft`                                                                                                       | The strongest contractor and owner signal: someone planning to dig                                                                                                    |
| `report_opened`     | `city`                                                                                                                   | Lot reports are for owners, buyers and contractors doing due diligence                                                                                                |
| `report_printed`    | `city`                                                                                                                   | They kept it: printing or saving a PDF is the clearest "this was useful" signal                                                                                       |
| `link_copied`       | `city`, `view` (pressed view tab, or `moved`), `side` (`above`, `below`), `card`, `method` (`share sheet`, `clipboard`)  | Who passes it on and what they share: a lot report or a dig check sent to a colleague reads as professional use, an underground view as curiosity                     |
| `city_map_opened`   | `city`                                                                                                                   | Exploring beyond one address: curious visitors more than people with a job to do                                                                                      |
| `city_switched`     | `from`, `to`                                                                                                             | Interest in other cities                                                                                                                                              |
| `feedback_sent`     | `city`                                                                                                                   | Engaged users; read the notes themselves in the feedback database                                                                                                     |
| `load_crashed`      | `seconds`, `stage`                                                                                                       | The previous load died (an iPhone running out of memory); see `src/crashes.ts`                                                                                        |
| `map_unavailable`   | none                                                                                                                     | The browser can't draw WebGL 2, so the map is replaced by a note; see `src/device.ts`                                                                                 |
| `explainer_opened`  | `city`, `from`: `button`, `card` (the first-visit note), `phone key`, `keyboard`                                         | Whether people look for what the colors mean, and where they look: many opens from `phone key` say the map alone isn't clear enough on a phone                        |
| `coverage_missed`   | `reason`: `not-found`, `other-state`, `unknown-place`, `no-records`; `from`; `city` (for `no-records`)                   | Searches that landed nowhere Subsola can show: misses in other states or cities point to where people want it next; `no-records` points to gaps in a covered city     |
| `mcp_link_clicked`  | `city`, `from`: `address card`, `site links`, `card links`                                                               | Whether the map sends people to the MCP server's page, and from where                                                                                                 |

PostHog's project settings also turn on heatmaps and web vitals; both go through the same URL
scrubbing.

## Returning visitors

`src/visits.ts` keeps `{ count, last }` (a number and a day) in local storage under
`subsola:visits`, and counts each browser tab once. Events report only the ranges above, so
PostHog can show how many visits are returns and how often people come back, but it can't link
one visit to another or follow a person. The trade-off: no per-person retention curves or
funnels across visits.

No consent banner: the record holds no identifier or personal data, nothing about it leaves the
browser except the ranges, and the site serves US cities. Strict EU rules (ePrivacy) treat any
analytics storage on a device as needing consent, so if Subsola starts addressing EU visitors,
skip `recordVisit` for them or ask first.

## Using it on a new page

```ts
import { startAnalytics, track } from '../analytics';

startAnalytics(import.meta.env.VITE_POSTHOG_KEY as string | undefined, {
  page: 'city',
  city: 'nyc',
});
```

That records the `$pageview` with `page` and `city` on it. Add any new event name to the
`AnalyticsEvent` union and to this file. PostHog loads once the page has finished loading and the
browser is idle, so it never slows the first view; events tracked before then are queued (up to 50) and sent when it arrives.
