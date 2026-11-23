import { REGIONS } from '../../src/regions';
import { baseStyle } from './statsStyle';
import { FAILURE_NOTES } from './healthCheck';
import {
  RANGES,
  REGULAR_DAYS,
  type Count,
  type HealthCheck,
  type RangeId,
  type Stats,
} from './stats';

/**
 * The owner's view of how /mcp is doing, at /mcp/stats behind Basic auth: plain server-rendered
 * HTML in the docs page's look and theme, with no script at all. The range switch is links.
 */

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const number = (n: number) => n.toLocaleString('en-US');
const percent = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 1000) / 10}%` : 'none yet';
const ms = (value: number | null) => (value === null ? 'none yet' : `${number(value)} ms`);

const cityName = (id: string | null) =>
  id === null ? 'No city' : (REGIONS.find((region) => region.id === id)?.name ?? id);

const OUTCOME_NOTES: Record<string, string> = {
  answered: 'answered',
  no_match: 'no match in a covered city',
  outside_coverage: 'outside the covered cities',
  no_records: 'found, but no records there',
  bad_args: 'bad arguments',
  upstream_error: 'a city source or map data failed',
  rate_limited: 'over the rate limit',
  server_error: 'the tool threw',
  protocol_error: 'not a call the server serves',
};

const STYLE = `
.stats{max-width:1000px;margin:0 auto;padding:36px 24px 72px}
.stats header{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:12px;margin:0 0 24px}
.stats h1{font-size:44px}
.ranges{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--panel-3);list-style:none}
.ranges a{display:block;padding:7px 12px;border-radius:9px;color:var(--ink-2);font-weight:600;font-size:15px;text-decoration:none}
.ranges a:hover{color:var(--ink)}
.ranges a[aria-current=page]{background:var(--panel);color:var(--ink);box-shadow:0 1px 2px rgb(0 0 0/.12)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px;margin:0 0 16px}
.tile{padding:14px 16px}
.tile dt{color:var(--ink-3);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.tile dd{margin:2px 0 0;font:800 34px/1.1 var(--display)}
.tile dd small{display:block;color:var(--ink-3);font:600 14px var(--body)}
.panel{padding:18px 20px;margin:0 0 16px}
.panel h2{font-size:26px;margin:0 0 12px}
.chart{display:block;width:100%;height:auto;color:var(--ink-2)}
.chart .bar{fill:var(--ink-2)}
.chart .bar:hover{fill:var(--ink)}
.chart .base{stroke:var(--line-2);stroke-width:1}
.axis{display:flex;justify-content:space-between;margin:4px 0;color:var(--ink-3);font-size:13px;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px;align-items:start}
.sub{display:block;color:var(--ink-3);font-size:13px}
.grid .panel{margin:0}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{padding:7px 0;text-align:left;border-top:1px solid var(--line);vertical-align:middle}
thead th{border-top:0;color:var(--ink-3);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:12px}
td.share{width:30%;padding-left:12px}
.meter{display:block;width:100%;height:6px}
.meter rect{fill:var(--ink-3)}
.note{color:var(--ink-3);font-size:14px}
.footnote{margin:16px 0 0}
.empty{padding:28px 20px;text-align:center;color:var(--ink-2)}
.ok{color:var(--ok);font-weight:700}
.bad{color:var(--warn);font-weight:700}
.scroll{overflow-x:auto;margin:0 -4px;padding:0 4px}
.wide th,.wide td{padding-right:12px;white-space:nowrap}
.wide td.wrap{white-space:normal;min-width:140px}
.id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px}
.tag{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:var(--panel-3);color:var(--ink-2);font-size:12px;font-weight:700}
.lead{margin:0 0 12px}
@media (max-width:640px){.stats{padding:24px 16px 56px}.stats h1{font-size:36px}}
`;

/** One row per label, with a share bar; the SVG width keeps the CSP free of style attributes. */
const table = (
  title: string,
  rows: Count[],
  name: (label: string | null) => string,
  empty: string,
  note: (label: string | null) => string | null = () => null,
) => {
  const total = rows.reduce((sum, row) => sum + row.n, 0);
  const body = rows.length
    ? rows
        .map(
          (row) =>
            `<tr><td>${escapeHtml(name(row.label))}${note(row.label) ? `<small class="sub">${escapeHtml(note(row.label)!)}</small>` : ''}</td><td class="n">${number(row.n)}</td><td class="share"><svg class="meter" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect width="${total ? Math.max(1, (row.n / total) * 100).toFixed(1) : 0}" height="6" rx="3"/></svg></td></tr>`,
        )
        .join('')
    : `<tr><td colspan="3" class="note">${escapeHtml(empty)}</td></tr>`;
  return `<section class="card panel"><h2>${escapeHtml(title)}</h2><table><thead><tr><th>${escapeHtml(title.replace(/^By /, ''))}</th><th class="n">Calls</th><th class="share"><span hidden>Share</span></th></tr></thead><tbody>${body}</tbody></table></section>`;
};

const bucketLabel = (start: number, range: RangeId) => {
  const date = new Date(start * 1000);
  return range === '24h'
    ? `${date.toISOString().slice(11, 13)}:00`
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/** Calls per bucket as bars, each with a native tooltip, the peak and the ends labeled. */
const chart = (stats: Stats) => {
  const width = 960;
  const height = 160;
  // Labels are HTML around the SVG, so they stay readable when the chart shrinks on a phone.
  const top = 4;
  const bottom = 2;
  const plot = height - top - bottom;
  const peak = Math.max(1, ...stats.series.map((point) => point.n));
  const slot = width / Math.max(1, stats.series.length);
  const barWidth = Math.max(2, Math.min(40, slot - 2));
  const bars = stats.series
    .map((point, i) => {
      const barHeight = point.n ? Math.max(2, (point.n / peak) * plot) : 0;
      const x = i * slot + (slot - barWidth) / 2;
      const label = `${bucketLabel(Number(point.label), stats.range)}: ${number(point.n)} calls`;
      return `<g><title>${escapeHtml(label)}</title><rect class="hit" x="${(i * slot).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${plot}" fill="transparent"/>${barHeight ? `<rect class="bar" x="${x.toFixed(1)}" y="${(top + plot - barHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="${Math.min(4, barWidth / 2)}"/>` : ''}</g>`;
    })
    .join('');
  const first = stats.series[0];
  const last = stats.series.at(-1);
  const ends =
    first && last
      ? `<p class="axis"><span>${escapeHtml(bucketLabel(Number(first.label), stats.range))}</span><span>${escapeHtml(bucketLabel(Number(last.label), stats.range))}</span></p>`
      : '';
  const per = stats.range === '24h' ? 'hour' : 'day';
  return `<section class="card panel"><h2>Calls per ${per}</h2>
<p class="axis">Peak ${number(peak)}</p>
<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Calls per ${per}, peak ${number(peak)}">${bars}<line class="base" x1="0" x2="${width}" y1="${top + plot}" y2="${top + plot}"/></svg>
${ends}<p class="note">UTC. Hover a bar for its count.</p></section>`;
};

const ago = (seconds: number) => {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))} seconds ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes ago`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} hours ago`;
  return `${Math.round(seconds / 86_400)} days ago`;
};

// The Worker runs every 5 minutes; three missed runs in a row means it has likely stopped.
const STALE_SECONDS = 15 * 60;

const reasonText = (check: HealthCheck) =>
  (FAILURE_NOTES as Record<string, string>)[check.reason ?? ''] ?? check.reason ?? 'unknown reason';

const dateTime = (seconds: number) => {
  const date = new Date(seconds * 1000);
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${day}, ${date.toISOString().slice(11, 16)}`;
};

const health = (stats: Stats) => {
  const { latest, total, passed, lastFailure } = stats.health;
  if (!latest)
    return `<section class="card panel" id="health"><h2>Health check</h2><p class="note">No health check has run yet. The subsola-health Worker (workers/health) checks subsola.com/mcp every 5 minutes.</p></section>`;
  const stale = stats.now - latest.at > STALE_SECONDS;
  const verdict = latest.ok
    ? `<span class="ok">Passed</span> in ${ms(latest.durationMs)}`
    : `<span class="bad">Failed: ${escapeHtml(reasonText(latest))}</span> after ${ms(latest.durationMs)}`;
  const failure = lastFailure
    ? `<p>Last failure: ${escapeHtml(reasonText(lastFailure))}, ${ago(stats.now - lastFailure.at)} (${escapeHtml(dateTime(lastFailure.at))} UTC).${lastFailure.message ? `<small class="sub">${escapeHtml(lastFailure.message)}</small>` : ''}</p>`
    : '<p>No failures in the last 30 days.</p>';
  return `<section class="card panel" id="health"><h2>Health check</h2>
<p>Latest: ${verdict}, ${ago(stats.now - latest.at)}.${stale ? ' <span class="bad">That is older than 15 minutes, so the check may have stopped running.</span>' : ''}</p>
<p>Last 24 hours: ${number(passed)} of ${number(total)} passed (${percent(passed, total)}).</p>
${failure}
<p class="note">The subsola-health Worker runs it every 5 minutes from outside, so it also sees the server being unreachable. Its calls are left out of every other figure on this page.</p></section>`;
};

/** Up to three, then "+N" for the rest. */
const firstFew = (items: string[], max = 3) =>
  items.length > max
    ? `${items.slice(0, max).join(', ')} +${items.length - max}`
    : items.join(', ');

const requesters = (stats: Stats) => {
  const lead = `<p class="lead">${number(stats.requesterCount)} distinct ${stats.requesterCount === 1 ? 'requester' : 'requesters'} in the last ${RANGES[stats.range].label}.</p>`;
  if (!stats.requesters.length)
    return `<section class="card panel" id="requesters"><h2>Requesters</h2>${lead}<p class="note">No calls with a requester ID in this range. Calls from before requester IDs were added have none.</p></section>`;
  const body = stats.requesters
    .map((row) => {
      const regular = row.days >= REGULAR_DAYS ? '<span class="tag">regular</span>' : '';
      return `<tr><td><span class="id">${escapeHtml(row.requester)}</span>${regular}</td><td class="wrap">${escapeHtml(row.network ?? 'Unknown')}</td><td>${escapeHtml(row.country ?? '?')}</td><td class="n">${number(row.calls)}</td><td class="n">${number(row.toolCalls)}</td><td class="n">${percent(row.answered, row.toolCalls)}</td><td>${escapeHtml(firstFew(row.regions.map(cityName)) || 'none')}</td><td>${escapeHtml(firstFew(row.clients))}</td><td>${escapeHtml(dateTime(row.firstSeen))}</td><td>${escapeHtml(dateTime(row.lastSeen))}</td></tr>`;
    })
    .join('');
  return `<section class="card panel" id="requesters"><h2>Requesters</h2>${lead}
<div class="scroll"><table class="wide"><thead><tr><th>Requester</th><th>Network</th><th>Country</th><th class="n">Calls</th><th class="n">Tool calls</th><th class="n">Success</th><th>Cities</th><th>App</th><th>First seen</th><th>Last seen</th></tr></thead><tbody>${body}</tbody></table></div>
<p class="note footnote">Most calls first, top 50. A requester is an anonymous ID made by scrambling the caller's IP address with a secret key; the IP itself is never stored. One ID can be many people sharing one address, as everyone on a hosted assistant does. A regular was active on ${REGULAR_DAYS} or more days in the range. Times are UTC.</p></section>`;
};

const limitedByNetwork = (stats: Stats) => {
  if (!stats.limitedByNetwork.length)
    return `<section class="card panel" id="limited"><h2>Rate limited by network</h2><p class="note">No calls were rate limited in the last ${RANGES[stats.range].label}.</p></section>`;
  const body = stats.limitedByNetwork
    .map(
      (row) =>
        `<tr><td class="wrap">${escapeHtml(row.network ?? 'Unknown network')}</td><td class="n">${number(row.limited)}</td><td class="n">${number(row.requesters)}</td><td class="n">${number(row.calls)}</td><td class="n">${percent(row.limited, row.calls)}</td></tr>`,
    )
    .join('');
  return `<section class="card panel" id="limited"><h2>Rate limited by network</h2>
<p class="lead">${number(stats.limitedRequesters)} distinct ${stats.limitedRequesters === 1 ? 'requester was' : 'requesters were'} limited at least once.</p>
<div class="scroll"><table class="wide"><thead><tr><th>Network</th><th class="n">Limited calls</th><th class="n">Requesters limited</th><th class="n">All calls</th><th class="n">Share limited</th></tr></thead><tbody>${body}</tbody></table></div>
<p class="note footnote">The limit counts per IP address. Claude, ChatGPT and other hosted assistants call from a few shared servers, so many people behind one of those addresses share one limit. A network with few requesters and many limited calls is a sign of that.</p></section>`;
};

export const statsPage = (stats: Stats, nonce: string) => {
  const range = RANGES[stats.range];
  const switcher = (Object.keys(RANGES) as RangeId[])
    .map(
      (id) =>
        `<li><a href="?range=${id}"${id === stats.range ? ' aria-current="page"' : ''}>${RANGES[id].label}</a></li>`,
    )
    .join('');
  const empty = stats.total === 0;
  const body = empty
    ? `<section class="card empty"><p>No calls in the last ${range.label} yet, apart from the health check's.</p><p class="note">Rows start when an assistant connects to subsola.com/mcp. Try the 30 days view, or come back later.</p></section>`
    : `<dl class="tiles">
  <div class="card tile"><dt>Calls</dt><dd>${number(stats.total)}<small>every method</small></dd></div>
  <div class="card tile"><dt>Tool calls</dt><dd>${number(stats.toolCalls)}<small>tools/call</small></dd></div>
  <div class="card tile"><dt>Success</dt><dd>${percent(stats.answered, stats.toolCalls)}<small>${number(stats.answered)} answered</small></dd></div>
  <div class="card tile"><dt>Median</dt><dd>${ms(stats.p50)}<small>tool call time</small></dd></div>
  <div class="card tile"><dt>p95</dt><dd>${ms(stats.p95)}<small>tool call time</small></dd></div>
</dl>
${chart(stats)}
<div class="grid">
${table('By tool', stats.byTool, (label) => label ?? 'Unknown tool', 'No tool calls.')}
${table('By city', stats.byCity, cityName, 'No tool calls.')}
${table(
  'By outcome',
  stats.byOutcome,
  (label) => label ?? 'none',
  'No tool calls.',
  (label) => (label && label !== 'answered' ? (OUTCOME_NOTES[label] ?? null) : null),
)}
${table('By client', stats.byClient, (label) => label ?? 'none', 'No calls.')}
${table('By method', stats.byMethod, (label) => label ?? 'none', 'No calls.')}
${table('Missed places', stats.missed, (label) => label ?? 'Not recognized', 'No addresses outside the covered cities.')}
</div>
<p class="note footnote">Missed places are addresses outside the covered cities, most asked first: the city to add next. Only places on the server's own list are named; anything else counts as not recognized.</p>
${requesters(stats)}
${limitedByNetwork(stats)}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#e6e9ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f131a" media="(prefers-color-scheme: dark)">
<title>MCP stats | Subsola</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&family=Barlow:wght@400;500;600;700&display=swap">
<style nonce="${nonce}">${baseStyle()}${STYLE}</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="/" aria-label="Subsola map"><span class="mark" aria-hidden="true"></span><span>Subsola</span></a>
  <nav class="site-nav" aria-label="Site"><a href="/mcp">MCP docs</a></nav>
</header>
<main class="stats" id="main">
  <header>
    <div><p class="kicker">Private</p><h1>MCP server stats</h1><p class="note">Last ${range.label}, health checks left out.</p></div>
    <nav aria-label="Range"><ul class="ranges">${switcher}</ul></nav>
  </header>
  ${health(stats)}
  ${body}
</main>
</body>
</html>
`;
};

export const statsPageHeaders = (nonce: string): Record<string, string> => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': [
    "default-src 'none'",
    `style-src 'nonce-${nonce}' https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
});
