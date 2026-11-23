# Subsola MCP server

A public, read-only [MCP](https://modelcontextprotocol.io) server at `https://subsola.com/mcp`,
so AI assistants can ask Subsola what's under a street. It reads the same cell bundles on
data.subsola.com that the map does and answers with what the site's lot report says. No account,
no key, and the addresses asked about are never stored.

Opened in a browser, the same URL shows the server's documentation page
(`server/mcp/page.ts`): the endpoint with a copy button, a trimmed real answer as a short
conversation, a client picker (tabs) with steps and one-click installs, two tool cards, prompts
to copy, a coverage matrix, one-line facts on 811, freshness, limits and privacy (details behind
"More"), and troubleshooting, the changelog and contact at the bottom. It follows the system's
light or dark setting. See "How it works" for how a
browser is told apart from an MCP client.

## Add it

The docs page has the steps for each client with copy buttons; they live in
`server/mcp/clients.ts`, each checked against that client's own docs (links in the file's
comment). In short:

- **Claude** (claude.ai and the desktop app): Customize > Connectors > Add > Add custom
  connector, URL `https://subsola.com/mcp`, sign-in "No sign-in".
- **Claude Code**: `claude mcp add --transport http subsola https://subsola.com/mcp`
- **Cursor**: the `cursor://anysphere.cursor-deeplink/mcp/install` link (config is base64 of
  `{"url":"https://subsola.com/mcp"}`), or `{"mcpServers":{"subsola":{"url":...}}}` in
  `.cursor/mcp.json`.
- **VS Code**: the `https://vscode.dev/redirect/mcp/install?name=subsola&config=...` link
  (config is URL-encoded `{"type":"http","url":...}`), `code --add-mcp`, or `.vscode/mcp.json`
  with `{"servers":{"subsola":{"type":"http","url":...}}}`.
- **OpenAI Codex**: `codex mcp add subsola --url https://subsola.com/mcp`.
- **ChatGPT** (web): chatgpt.com/plugins > + > Add custom MCP server, authentication "No
  authentication".
- **Windsurf** (now Devin Desktop): `{"mcpServers":{"subsola":{"serverUrl":...}}}` in
  `~/.config/devin/mcp_config.json`.
- **Anything else** that speaks Streamable HTTP: point it at `https://subsola.com/mcp`.

## The two tools

### `whats_under`

Input: `address` (string, up to 200 characters), a street address in one of the cities in
`REGIONS` (`src/regions.ts`), and optionally `city`, to search only that city: a region id, or
the city's name, short name or a common alias ("Los Angeles", "NYC", "Brooklyn", "D.C."), in any
case and punctuation (`server/mcp/cityInput.ts`). An unknown city is an argument error that lists
the cities covered.

Answers what the lot report says for that address:

- each utility likely in the street in front, its distance from the lot line as drawn, its
  expected depth and the code or standard that depth comes from (or the measured depth where the
  owner publishes one);
- how each line was placed (the utility's own surveyed map, excavation permits, or inferred from
  the rest of the street) and the confidence label the map shows for it;
- the water service line's lead status where the city publishes it by lot (NYC DEP, DC Water),
  and what is known about the house sewer;
- digging permitted today on the block, the newest permits out front (each with its street and
  its distance from the address, measured as `recent_digs` does), the latest crew location note
  nearby (as scrubbed for the site) and the nearest hydrant, catch basin and manhole.

### `recent_digs`

Input: `address` (string), `city` (optional), `radius_m` (10 to 400, default 150), `since_year`
(optional), `utility` (optional, one of the utility kinds answers use: electric, gas, telecom,
water, sewer, steam, capital) and `permitted_today` (optional boolean).

Answers with the excavation permits on and around the address, newest first, at most 25, with
`total` and `shown` in `structuredContent` (`found` is kept, equal to `total`, for 1.0 clients).
When the list is cut short the text says how many more there are and to narrow with
`since_year`, `radius_m`, `utility` or `permitted_today`. Each gives the utility, the permit holder, the issue date, the work window,
whether digging is permitted today, the street and the distance. Permits that don't cut the street
(opening a manhole, storing material) are left out. Crew location notes are not included.

### Repeated jobs

A permit allows the street open for a few weeks, so a job that drags on is permitted again and
again: Con Edison's "Repair Steam - 201804340" on Water St opened the street on 50 permits,
February 2018 to June 2022 (NYC's data marks 37 of them "Renew" and 7 "Extend"). `permitJobs`
(`src/sources/jobs.ts`) groups permits into jobs: the same holder and utility with the same work
order (a bare 7 to 12 digit number in the purpose), each permit starting within 180 days of the
last one's end; or, with no work order, the same holder, utility, words and street within 45
days. Both tools give a permit in a job of three or more a `job` field (work order, permits, its
place, first start, last end) and add "Same job permitted 50 times, Feb 2018 to Jun 2022" to its
line; jobs are read before `since_year` and the other filters, so earlier permits still count.
The site's permit lists flag the newest listed permit of such a job. New York marks each permit
New, Renew, Extend or Emergency (`applicationtypeshortdesc`); renewals and extensions are kept as
`renews` on the record, and a job counts them in `renewals` ("44 filed by the city as renewals
or extensions"). Elsewhere `renewals` is null: the city doesn't say, so the job rests on the
matching permits alone.

### Permit dates

`issued` is only ever a real issue or approval date. Los Angeles's and Denver's permit layers
have none (only the window the street may be open), so their permits carry `issued: null` and a
`workStart`. Both tools sort, and `since_year` filters, by the issue date or else the work's
start (`permitDay` in `src/sources/permits.ts`), and the text says "issued 2026-10-01" or, with no
issue date, "starts 2026-11-16". A permit whose work starts after today (New York's date, as for
"permitted today") is `scheduled: true` and reads "scheduled, starts 2026-11-20". San Diego's
approvals with no issue date (created, opened, in review or cancelled) are left out of the build,
as DC's unissued applications are.

Both return text and `structuredContent` that matches the tool's `outputSchema`. Every answer
ends with a statement that it is public-records evidence, not a survey and not a substitute for
calling 811, the city's 811 link, and a link to the spot on subsola.com.

## Which address an answer is for

City geocoders answer with their nearest guess as confidently as a real match: "100 Main St,
Boston" came back from NYC GeoSearch as 190C Main St in the Bronx, and "200 N Spring St" as
200 Spring St in Manhattan. The site shows where its map landed; an assistant can't see that, so
`server/mcp/findAddress.ts` checks every geocoder answer before using it, and a city whose answer
fails is passed over for the next:

- **House number** (`match.ts`): the number typed must be the number found. "190" and "190C"
  count as the same building (and the answer says it matched 190C). A range like "4512-14" (how
  Seattle writes duplexes) covers 4512 to 4514; in New York "25-87" is one Queens address and must
  match whole. No number typed means no number check, and the answer says what it matched.
- **Street**: the street must agree (`streetsAgree`), and a direction typed before the name ("N
  Spring St", "W 4th St") must be the found street's too. "West St" alone is a street named West.
- **Place** (`placeNames.ts`, `places.ts`): a state or ZIP code outside the matched city is a miss,
  as before. A borough or neighborhood named must be in the matched city (and, in New York, the
  matched borough: "117 West St, Brooklyn" is not Manhattan's West St). Named places narrow which
  geocoders are asked at all ("Hollywood" asks only Los Angeles). A place Subsola doesn't list is a
  miss unless the found address carries it (GeoSearch labels Queens addresses "Astoria, NY").
  City names come from `REGIONS`, so a new city is known without an edit; neighborhoods are a
  hand-kept list.
- **`city` input**: only that city's geocoder is asked, and a named place in another city is an
  error.

Every answer carries `requestedAddress`, `matchedAddress` and `matchDiffers`, and its text starts
"Matched to <matched> (you asked for <requested>)." when they differ beyond formatting. A miss is
an `isError` result (`misses.ts`) that names the closest match and why it didn't count, the
covered cities, and how to fix the call.

Free text in answers (permit purposes, crew location notes and the street fields some cities type
by hand) goes through `scrubContacts` again at answer time, in case a build predates a fix.

## Limits

- Public records only. Utilities don't publish exact positions or depths; lines are placed from
  permits and standards unless the owner publishes its map. A line nobody has dug up since records
  begin won't show.
- Only the cities in `REGIONS`. Every city list and count on the docs page, in the tool
  descriptions and in the server's instructions is generated from it with `cityNames()`, so a
  new city shows up everywhere when it's added there. An address elsewhere, or one the city
  geocoders can't find, comes back as a tool error (`isError`) naming the cities covered.
- Arguments that don't fit a tool's schema come back as a tool error (`isError`) in plain
  sentences from `server/mcp/argErrors.ts`, such as "radius_m must be between 10 and 400 (got
  5000). Try 400.", so the model can fix the call; since 2025-11-25 the spec files input
  validation under tool execution errors (SEP-1303). An unknown tool stays a JSON-RPC -32602.
- "Today" is New York's date, the same day the map uses.
- Records are as fresh as the nightly build; each answer says when it was built.
- Each upstream call (the geocoders together, the index, each cell) times out after 8 seconds.
  The index is cached for 5 minutes per isolate.
- A call costs around half a second of CPU and up to roughly 60 MB of memory in dense Manhattan,
  so it needs the Workers Paid plan's CPU limit; the Free plan's 10 ms is far too little.

## How it works

`functions/mcp.ts` hands each request to `server/mcp/protocol.ts`, a small JSON-RPC handler for
the Streamable HTTP transport, stateless: one JSON-RPC message per POST, one JSON reply, no
sessions and no SSE. It is hand-written rather than built on `@modelcontextprotocol/sdk`, whose
server pulls in Express, Hono and Ajv; a handful of methods don't need them. It serves both eras
of the protocol on one URL (versions in `server/mcp/protocolVersions.ts`):

- **2026-07-28** ("modern"): no handshake. A request carrying
  `params._meta["io.modelcontextprotocol/protocolVersion"]` is served on its own. Its
  `MCP-Protocol-Version`, `Mcp-Method` and (for `tools/call` and `prompts/get`) `Mcp-Name`
  headers must match the body, or it's a 400 with `-32020` (HeaderMismatch); `Mcp-Name` may be
  `=?base64?...?=`. An unsupported version is a 400 with `-32022` and the supported list.
  Methods: `server/discover`, `tools/list`, `tools/call`, `prompts/list`, `prompts/get`; anything
  else (`ping` included) is a 404 with `-32601`. Results carry `resultType: "complete"` and
  `_meta["io.modelcontextprotocol/serverInfo"]`; lists and discover carry `ttlMs` and
  `cacheScope: "public"`.
- **2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05** ("legacy"): `initialize` negotiates the
  version, then `ping`, `tools/list`, `tools/call`, `prompts/list` and `prompts/get`. A request
  with no `MCP-Protocol-Version` is read as 2025-03-26. Icons (server, tools, prompt) and the
  server's `description` and `websiteUrl` go only to clients on 2025-11-25, which introduced
  them; older clients get name, title and version.

`serverInfo` comes from `server/mcp/meta.ts`; its version is the newest entry in
`server/mcp/changelog.ts`. The one prompt, `check_before_digging` (`prompts.ts`), takes an
address and asks for both tools and a short summary ending with the 811 reminder.

**Origin** (`http.ts`): the transport spec says servers MUST validate `Origin` and answer an
invalid one with 403; its concern is DNS rebinding against servers on a private network. This
server is public, keeps no accounts or cookies and allows any origin by CORS, so any https
origin is accepted, as is `http://localhost` and `127.0.0.1` (MCP Inspector), and no Origin at
all (desktop and server clients). Turned away with 403 and a JSON-RPC error with no id: an
opaque `null` origin, anything that isn't a URL, and plain http from anywhere else.

GET and DELETE are 405, with one exception: a GET whose `Accept` header names `text/html`
outright, at least as strongly as `application/json`, and doesn't ask for `text/event-stream` gets
the documentation page (`server/mcp/page.ts`, status 200, `text/html; charset=utf-8`). Browsers
send that; MCP clients don't. The Streamable HTTP spec (2025-06-18) has a client open its event
stream with a GET that accepts `text/event-stream`, and that still gets the 405 that tells it this
server offers no stream. `curl` and `fetch` send `*/*`, which isn't a browser, so they get the 405
too. POST, OPTIONS (204) and DELETE are unchanged.

The page is one self-contained HTML string (`page.ts`), with its stylesheet in `pageStyle.ts` and
a small script in `pageScript.ts` for the client tabs (ARIA tabs with arrow keys, Home and End),
the copy buttons and the section nav. Without the script every client's steps show stacked.
Colors are tokens in one block of `pageStyle.ts`, swapped under `prefers-color-scheme: dark` or
`data-theme="dark"` on the root, so a site-wide theme toggle can set them later. APWA paint
colors appear only where they mean a utility. Its
limits come from `server/mcp/limit.ts`, its tool reference from `toolList()` (the same schemas
`tools/list` sends), its coverage matrix from `REGIONS`, the catalog and `server/mcp/coverage.ts`,
its example answers and prompts from `server/mcp/examples.ts` (trimmed from live calls), and its
changelog from `server/mcp/changelog.ts`, whose newest version is the server's version. Pages
Functions responses don't get the site's `public/_headers`, so the page sets its own content
security policy (`default-src 'none'`, a fresh nonce per response for its style and script, Google
Fonts, `frame-ancestors 'none'`), the other security headers and `Vary: Accept`. When the browser
refuses the clipboard, the copy button selects the text and says to press Ctrl+C.

`server/mcp/lookup.ts` geocodes with `geocodeAnywhere` and loads the built cells around the
address two at a time. `whats_under` then runs the app's own placement (`placeStreet` in
`src/street.ts`) and lot report (`lotReportAt`), so the answer matches the site's report.
`server/mcp/answers.ts` turns the report into text and structured content.

Addresses are never stored or logged. The address text does go to the city's geocoder, which is
how it's found. Each call leaves one stats row (see "Monitoring" below) of labels and numbers,
an anonymous requester ID (a keyed hash of the IP, never the IP) and the network and country
Cloudflare reports, kept 90 days; beyond that the server logs counts and error names only. The rate limiter keeps a
salted hash of the caller's IP and a count per minute and per day, deleted after two days
(`KEEP_SECONDS`). The docs page and subsola.com/privacy state all of this under Privacy.

## Operating it

- Rate limit: 30 questions a minute and 600 a day from one address, and 300 a minute in all (`server/mcp/limit.ts`). Counted in D1 (`mcp_hits` in `subsola-feedback`) because the zone's one rate-limiting rule is spent on the map data and Pages Functions can't use the rate-limit binding. Connecting and listing tools aren't counted. Over the limit, the answer is a tool error saying how long to wait.
- Tests: `pnpm test` covers both protocol eras, the browser page versus 405 decision, the answers, address matching, the server card and the registry file,
  with the network mocked.
- Try it locally: `pnpm build && pnpm exec wrangler pages dev dist`, then POST to
  `http://localhost:8788/mcp`.

## Monitoring

Three pieces: a stats row per call, a health check, and a private page that reads both.

**Stats rows.** Every JSON-RPC request with an id (not notifications, the docs page, OPTIONS or
the 405s) writes one row to `mcp_calls` in `subsola-feedback` (`migrations/0003_mcp_calls.sql`).
`server/mcp/protocol.ts` builds it (`callRecord`) and hands it to `deps.record`;
`functions/mcp.ts` adds the caller's requester ID, network and country (`requesterOf` in
`server/mcp/requester.ts`) and writes it with `saveCall` (`server/mcp/callLog.ts`) through
`waitUntil`, after the answer has gone out. It can't share the limiter's `FEEDBACK_DB.batch`: that batch runs before
the answer, and the row needs the answer's outcome and timing. A failed write is caught and
logged (`mcp stats: write failed`) and never touches the answer. About one write in 200 also
deletes rows older than 90 days (`CALL_KEEP_SECONDS`), in the same batch.

| Column         | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at`           | Unix seconds when the request arrived                                                                                                                                                                                                                                                                                                                                                                                                        |
| `method`       | A known MCP method (`initialize`, `tools/call`, ...), `other` for any other name, `invalid` when the body wasn't JSON-RPC                                                                                                                                                                                                                                                                                                                    |
| `tool`         | `whats_under` or `recent_digs` for tools/call, `check_before_digging` for prompts/get; null for a name the server doesn't have                                                                                                                                                                                                                                                                                                               |
| `region`       | The city id the answer was for, or the `city` input on a miss; null otherwise                                                                                                                                                                                                                                                                                                                                                                |
| `outcome`      | One of the values below                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `duration_ms`  | From arrival to reply. Workers move the clock only on I/O, so it is mostly time spent waiting on geocoders and cells                                                                                                                                                                                                                                                                                                                         |
| `client`       | An app family: `claude`, `openai`, `cursor`, `windsurf`, `vscode`, `cline`, `zed`, `goose`, `gemini`, `inspector`, `python`, `node`, `go`, `curl`, `browser`, `other` or `none`. On initialize it's matched from `clientInfo.name`, otherwise from the User-Agent; a name or User-Agent outside the families is never stored, only its family or `other`. `subsola-health` for the health check, whatever the method (`server/mcp/calls.ts`) |
| `protocol`     | The `MCP-Protocol-Version` header, or the version asked for on initialize, when it is date-shaped                                                                                                                                                                                                                                                                                                                                            |
| `missed_place` | Only for `outside_coverage`: the city and state from `server/mcp/missedPlace.ts`'s fixed list ("Boston, MA", or "Portland" when the state isn't given), or a state code alone when it holds no covered city ("TX"). Null when nothing on the list is named. Nothing typed is stored: only list entries can come out                                                                                                                          |
| `requester`    | The first 12 hex characters of HMAC-SHA256 of `CF-Connecting-IP` under the `REQUESTER_KEY` Pages secret (`server/mcp/requester.ts`, migration `0004`). The same caller groups together; the IP is never stored, and without the key a guessed IP can't be checked against it. It is not the limiter's `FEEDBACK_SALT`, so the two hashes can't be joined. Null without a key or an IP, and on rows from before 0004                          |
| `network`      | `request.cf.asOrganization`, the network's org name ("Anthropic, PBC", "Comcast Cable"), whitespace collapsed and cut to 80 characters; null when Cloudflare gives none                                                                                                                                                                                                                                                                      |
| `country`      | `request.cf.country`, two letters ("US", "T1" for Tor); null otherwise                                                                                                                                                                                                                                                                                                                                                                       |

Outcomes (`OUTCOMES` in `calls.ts`):

- `answered`: a tool answered, or any other method succeeded (`tools.ts`, `protocol.ts`).
- `no_match`: the address wasn't matched in a covered city: house number, street, borough, a
  place in another covered city, or a `city` input that conflicts (`missFacts` in `tools.ts`).
- `outside_coverage`: the matcher found a state or place Subsola doesn't cover, or nothing matched
  (or only a lookalike outside every city) and the text names a place on the missed-place list
  (`missFacts`). This is how "100 Main St, Boston" lands here, as "Boston, MA".
- `no_records`: found, but no built cells reach it (`missFacts`).
- `bad_args`: arguments that fail the schema, an unknown tool, or a bad prompts/get (`callTool`,
  `answer` in `protocol.ts`).
- `upstream_error`: the geocoders timed out, or the cell index or every cell failed to load
  (`missFacts`).
- `rate_limited`: over a limit in `limit.ts` (`answer`).
- `server_error`: a tool threw (`callTool`).
- `protocol_error`: a parse error, an invalid request, an unknown method, a header mismatch or an
  unsupported version (`protocol.ts`).

**Health check.** The `subsola-health` Worker (`workers/health`, its own `wrangler.toml`) runs
on a Cron Trigger every 5 minutes (`*/5 * * * *`), with no public URL (`workers_dev = false`). It
replaced the GitHub schedule, which never fired on time. The check itself is
`server/mcp/healthCheck.ts`: `initialize`, then a `whats_under` for `117 West St, New York, NY
10007` against https://subsola.com/mcp, with `User-Agent: subsola-health/1`. A run passes on HTTP
200, no JSON-RPC error or `isError`, an answer with "Records as of" and the "Before any digging
... 811" line, and a tool call under 10 seconds. Its tool calls count toward the 300-a-minute
total limit like anyone's.

Each run writes one row to `health_checks` in `subsola-feedback` (migration `0004`): `at`, `ok`,
`duration_ms` (the whole run), and on a failure `reason`, a short code (`FAILURE_NOTES` in
`healthCheck.ts`: `unreachable`, `http_status`, `not_json`, `rpc_error`, `bad_initialize`,
`tool_error`, `no_records_date`, `no_811`, `slow`) and `message`, one short line. Never a response
body. About one run in 250 deletes rows older than 30 days (`workers/health/src/record.ts`).

Alerts go by email through the Worker's `send_email` binding (`ALERT_EMAIL`, destination
`hello@subsola.com`, sender `health@subsola.com`). The state comes from `health_checks`, read in the
same D1 batch as the insert: one email when the check fails twice in a row ("Subsola MCP is
failing: <reason>"), one when it passes again ("Subsola MCP has recovered"), none in between and
none for a single failure. A refused send is logged and the run still counts. The message is
hand-built MIME (`workers/health/src/email.ts`), no packages.

By hand: `node .github/scripts/mcp-health.mjs` (Node 22.18 or later, which loads the TypeScript
check directly; `MCP_URL` and `MCP_HEALTH_ADDRESS` override the defaults), or the "MCP health"
workflow (`.github/workflows/mcp-health.yml`, manual only now). To run the Worker locally against a
local copy of the database, with emails written to `workers/health/.wrangler/tmp/email` instead of
sent:

```sh
wrangler d1 migrations apply subsola-feedback --local --persist-to /tmp/subsola-state
wrangler dev -c workers/health/wrangler.toml --test-scheduled --persist-to /tmp/subsola-state
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"   # one check
curl "http://localhost:8787/__scheduled?cron=test-alert"    # one test email, nothing recorded
```

`test-alert` is never a real schedule, so only a dev session can reach that path, and a remote dev
session can't reach the email binding. To send a real test email from Cloudflare, deploy once with
`--var SEND_TEST_ALERT:1` (every run then sends one as well as checking), wait for a run, and
deploy again without it:

```sh
wrangler deploy -c workers/health/wrangler.toml --var SEND_TEST_ALERT:1
wrangler tail -c workers/health/wrangler.toml   # "sent the test alert to hello@subsola.com"
wrangler deploy -c workers/health/wrangler.toml
```

The token that deploys it needs Workers Scripts Edit on the account.

**Stats page.** `https://subsola.com/mcp/stats` (`functions/mcp/stats.ts`,
`server/mcp/statsRoute.ts`, `stats.ts`, `statsPage.ts`) asks for HTTP Basic auth: any user name,
the password in the `STATS_PASSWORD` Pages secret, compared in constant time
(`server/mcp/basicAuth.ts`). With no secret set it refuses everyone. Every reply, the 401 too,
sends `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`, and the page is in neither
the sitemap nor robots.txt. It shows the last 24 hours, 7 days or 30 days (`?range=24h|7d|30d`,
default 7d, whole UTC hours or days), with health-check rows left out: calls, tool calls, success
(answered over tool calls), median and p95 tool-call time, calls per hour or day, and breakdowns
by tool, city, outcome, client and method, plus missed places, most asked first. **Requesters**
lists the top 50 anonymous callers in the range, most calls first: ID, network, country, calls,
tool calls, success, the cities asked about (three, then "+N"), app families, first and last seen,
with the number of distinct requesters above it; one active on 3 or more distinct UTC days is
marked a regular. **Rate limited by network** groups `rate_limited` calls by network, with how
many distinct requesters were limited and the network's calls in all: hosted assistants call from
a few shared IPs, so many people can share one per-IP limit, and this is where that shows. A panel
at the top reads `health_checks`: the latest run, the 24-hour pass rate and the last failure with
its reason, and warns when the latest run is over 15 minutes old. All of it is one D1 batch. Server-rendered, no script, the docs page's tokens and
dark theme (`baseStyle()` in `pageStyle.ts`).

## Releasing a new server version

Add an entry at the top of `CHANGELOG` in `server/mcp/changelog.ts` (the server reports its
version as `serverInfo.version`, on the server card and on the docs page), then set the same
`version` in `server.json`; `server/mcp/registry.test.ts` fails until they agree.

## Discovery: server card and AI catalog

The MCP Server Cards extension (SEP-2127; marked Final on modelcontextprotocol.io, though the
`ext-server-card` repository still calls itself experimental and its `$schema` URL returned 404
when checked on 2026-11-11) puts a server's card at `<streamable-http-url>/server-card` and lists
it from the site's `/.well-known/ai-catalog.json`. Both are served by Pages Functions
(`functions/mcp/server-card.ts`, `functions/.well-known/[[path]].ts`, logic in
`server/mcp/card.ts`), built from the same constants as `serverInfo`:

- `https://subsola.com/mcp/server-card`: `application/mcp-server-card+json`, with `name`
  `com.subsola/subsola`, `version`, `description` (at most 100 characters), `websiteUrl`, `icons`
  and one `streamable-http` remote listing the supported protocol versions.
- `https://subsola.com/.well-known/ai-catalog.json`: `application/ai-catalog+json`, one entry
  pointing at the card.

Both send `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=3600` and an `ETag`,
and answer `If-None-Match` with 304. Any other `/.well-known/*` path is a plain-text 404 instead
of the map's HTML; a real file the site ships under `public/.well-known/` (an
`mcp-registry-auth`, say) still goes through, because the function only replaces an HTML
response.

## Publishing to the MCP Registry

Published 2026-11-15 as `com.subsola/subsola` 1.2.2 on the official registry
(https://registry.modelcontextprotocol.io, in preview), from `server.json` at the repository root:
one remote of type `streamable-http` at `https://subsola.com/mcp`, schema
`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`. Domain proof is the
HTTP file `public/.well-known/mcp-registry-auth`; the matching private key is
`MCP_REGISTRY_PRIVATE_KEY` in `.env.cloudflare`. A listing can be updated but not really
withdrawn, since other directories copy from the registry. The steps, for a new key or a rebuild
(https://modelcontextprotocol.io/registry/quickstart and /registry/authentication):

1. Install the publisher: `brew install mcp-publisher`.
2. Prove you control `subsola.com`. A `com.subsola/*` name needs domain authentication; GitHub
   login only grants `io.github.<user>/*`. Generate a key pair once and keep `key.pem` private
   (never commit it):

   ```sh
   openssl genpkey -algorithm Ed25519 -out key.pem
   PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
   PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n' | head -c 64)"
   ```

   Then either:
   - **DNS**: add a TXT record on `subsola.com` with the value
     `v=MCPv1; k=ed25519; p=${PUBLIC_KEY}`, wait for it to propagate, and run
     `mcp-publisher login dns --domain subsola.com --private-key "${PRIVATE_KEY}"`.
   - **HTTP**: serve the line `v=MCPv1; k=ed25519; p=${PUBLIC_KEY}` at
     `https://subsola.com/.well-known/mcp-registry-auth` (as `public/.well-known/mcp-registry-auth`;
     the .well-known function passes it through), deploy, and run
     `mcp-publisher login http --domain subsola.com --private-key "${PRIVATE_KEY}"`.

   The record or file holds only the public key; the private key stays with whoever publishes.

3. From the repository root: `mcp-publisher publish`.
4. Check: `curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.subsola/subsola"`.

Publish again after each version bump. The login token is short-lived, so log in first each time:
`set -a; source .env.cloudflare; set +a; mcp-publisher login http --domain subsola.com --private-key "$MCP_REGISTRY_PRIVATE_KEY" && mcp-publisher publish`.

## Claude's connector directory (submitted 2026-11-15)

Submitted through the developer portal at claude.ai/directory/manage (Submit new > MCP connector,
any paid plan), following https://claude.com/docs/connectors/building/submission and
/review-criteria (read 2026-11-15). The server meets the requirements for a remote, public-data
connector: HTTPS, no sign-in, both tools with a `title` and `readOnlyHint: true`, names under 64
characters, descriptions that say what each tool does without instructing Claude, specific
argument errors, capped answers, no MCP App (so no screenshots and no allowed link URIs). No terms
page is asked for. A listing goes up as Community after an automatic scan; some get a person's
review. Escalations: mcp-review@anthropic.com. Submitted 2026-11-15 under Central Park Labs, LLC;
status and reviewer feedback show at claude.ai/directory/manage.

What each portal step takes:

1. **Connection**: `https://subsola.com/mcp`, one URL for everyone.
2. **Tools**: synced from the server; `whats_under`, `recent_digs` and the `check_before_digging`
   prompt, all read-only.
3. **Listing**:
   - Name: `Subsola`
   - One-liner (200 max): `What public records say is under city streets: utility lines and
their expected depths, lead service lines, and recent excavation permits, in 10 US cities.`
   - Description (2,000 max):

     > Subsola reads city and utility public records to answer what is likely under the street at
     > an address in New York City, Washington DC, San Francisco, Los Angeles, San Diego, Seattle,
     > Denver, Chicago, Dallas and San Jose.
     >
     > Ask about an address and Subsola returns each utility likely in the street in front (water,
     > sewer, storm drain, gas, electric, telecom, steam), how far it runs from the lot line, its
     > expected depth and the code or standard behind that depth, and how the line was placed: the
     > owner's published map, excavation permits on the block, or inferred. It also gives the
     > water service line's lead status where the city publishes it, digging permitted on the
     > block today, and the newest excavation permits nearby, including jobs that have been
     > re-permitted month after month.
     >
     > Built for early site research by engineers and architects, for contractors and installers
     > scoping a trench or conduit run, for due diligence by buyers, lenders and property
     > managers, and for crews coordinating work in the street: who else holds permits on the
     > block, and which jobs keep getting renewed.
     >
     > Every answer is public-records evidence with a records-as-of date, not a survey or a
     > utility locate, and ends with the city's 811 notice: call 811 before any digging.
     > Read-only, no account or sign-in. Records are rebuilt nightly.

   - Categories (one to five, from the portal's list): the closest to maps or location, public
     data or research, and construction or real estate.
   - Documentation URL: `https://subsola.com/mcp`
   - Privacy policy URL: `https://subsola.com/privacy`
   - Support contact: `hello@subsola.com`
   - Icon: `public/icon-512.png` (also at https://subsola.com/icon-512.png)
   - Slug: `subsola` (permanent once published)
4. **Use cases**: early site research (which utilities run in front of a lot, how each was
   mapped, how deep they are expected to be, before ordering a survey); scoping an excavation
   (a trench, foundation, conduit run or EV charger) before the 811 call; due diligence on a
   property (lead service line, house sewer, recent and long-running utility work on the block);
   coordinating street work (who else holds permits on the block now or soon). Prerequisites:
   none, no account. Reads data only.
5. **Company**: Central Park Labs, LLC (the operator the privacy page names, `OPERATOR` in
   `src/site.ts`), website `https://subsola.com`; primary contact for review updates is the
   owner or `hello@subsola.com`.
6. **Authentication**: not required; no sign-in.
7. **Data handling**: the API is Subsola's own (subsola.com/mcp, answering from data Subsola builds
   nightly from city and utility open data, and each city's own address lookup). No personal
   health data, no sponsored content.
8. **Test & launch**: every tool and the prompt were run through MCP Inspector CLI 2.15.0 against
   the live server on 2026-11-15. The owner also adds it as a custom connector in Claude (steps on
   https://subsola.com/mcp) and calls both tools before ticking the box. No credentials.
9. **Compliance**: seven acknowledgments for the owner to read and accept. For conversation data:
   the server keeps no addresses or conversation text, only the per-call stats rows described on
   the privacy page.
10. **Review and submit**.
