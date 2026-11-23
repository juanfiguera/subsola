import { REGIONS, cityNames, type Region } from '../../src/regions';
import { isPaused, SOURCES, type SourceKey } from '../../src/sources/catalog';
import { KEEP_SECONDS, LIMITS } from './limit';
import { CALL_KEEP_SECONDS } from './callLog';
import { UPSTREAM_TIMEOUT_MS } from './lookup';
import { MAX_DIGS, toolList } from './tools';
import { CLIENTS, MCP_URL, type ClientSetup } from './clients';
import { COVERAGE, permitsSince } from './coverage';
import { DEMO, EXAMPLE_CALLS, EXAMPLE_PROMPTS, PARAM_NOTES, TOOL_SUMMARIES } from './examples';
import { CHANGELOG, SERVER_VERSION } from './changelog';
import { LATEST_PROTOCOL, LEGACY_PROTOCOLS } from './protocolVersions';
import { pageStyle } from './pageStyle';
import { CONTACT_LINK } from '../../src/site';
import { UTILITY_STYLES, type UtilityKind } from '../../src/utilities';
import { PAGE_SCRIPT } from './pageScript';
import { FONTS_URL, intro, sectionNav, siteFoot, topBar } from '../../src/pages/shell';

/**
 * What a person sees when they open https://subsola.com/mcp in a browser: what the server answers,
 * how to add it to each assistant, the tools, coverage, limits and privacy. Served by the Pages
 * Function, where the site's _headers file doesn't reach, so it is one self-contained page that
 * brings its own security headers. The inline style and script carry a per-response nonce instead
 * of loosening the policy. The site's shared shell (src/pages/shell.ts: top bar, theme switch,
 * section nav, intro, footer) is rendered from the same code as every other page; its stylesheet
 * and scripts (/shell.css, /theme.js, /shell.js) are same-origin files the build writes, loaded
 * under the nonce too, so the policy needs no 'self'. Every list of cities, limit and tool parameter is read from the code
 * that enforces it, so the page can't drift from the server.
 */

export { MCP_URL };
export { CLAUDE_CODE_COMMAND } from './clients';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escaped text where `backticks` mark code. */
const inlineHtml = (text: string) =>
  escapeHtml(text).replace(/`([^`]+)`/g, (_, code: string) => `<code>${code}</code>`);

const limitOf = (name: (typeof LIMITS)[number]['name']) =>
  LIMITS.find((limit) => limit.name === name)!.max.toLocaleString('en-US');

/** A fresh nonce per response, so the policy only lets this page's own style and script run. */
export const newNonce = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};

export const docsPageHeaders = (nonce: string): Record<string, string> => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': [
    "default-src 'none'",
    `style-src 'nonce-${nonce}' https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    `script-src 'nonce-${nonce}'`,
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'clipboard-write=(self)',
  // The same URL answers MCP clients with JSON-RPC or a 405, so a cache must key on Accept.
  Vary: 'Accept',
});

/* Icons: simple line drawings, inline so the page loads nothing else. */
const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  copy: svg(
    '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  ),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>'),
  eye: svg(
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  ),
  pin: svg(
    '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  ),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  gauge: svg('<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/>'),
  lock: svg(
    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  ),
  warn: svg('<path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18h.01"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
};

let copyCount = 0;

/** Text with a copy button. Ids only need to be unique within one page. */
const copyBlock = (label: string, text: string) => {
  const id = `copy-${(copyCount += 1)}`;
  return `<div class="copy"><pre id="${id}"><code>${escapeHtml(text)}</code></pre>${copyButton(id, label)}</div>`;
};

const copyButton = (id: string, label: string, text = 'Copy') =>
  `<button type="button" class="copy-button" data-copy="${id}" data-label="${text}" aria-label="Copy ${escapeHtml(label)}">${ICONS.copy}<span class="copy-label">${text}</span></button>`;

// Shorter than the headings, so the nav reads as a list. The ids are the sections', not the h2s'.
const SECTIONS: { id: string; title: string }[] = [
  { id: 'example', title: 'See it work' },
  { id: 'setup', title: 'Set up' },
  { id: 'tools', title: 'Tools' },
  { id: 'prompts', title: 'Prompts' },
  { id: 'coverage', title: 'Coverage' },
  { id: 'good-to-know', title: 'Good to know' },
  { id: 'help', title: 'Help' },
];

const hero = (cities: number) => {
  const cursor = CLIENTS.find((client) => client.id === 'cursor')!.install!;
  const vscode = CLIENTS.find((client) => client.id === 'vscode')!.install!;
  return intro({
    label: `MCP server · version ${SERVER_VERSION}`,
    title: 'Subsola for AI assistants',
    lede: "Ask your AI assistant what public records say is under a street, and who's been digging it up. It works with Claude, ChatGPT, Cursor and any other MCP client.",
    chips: [
      `${ICONS.check}Free`,
      `${ICONS.key}No sign-in`,
      `${ICONS.eye}Read-only`,
      `${ICONS.pin}${cities} cities`,
    ],
    after: `<div class="endpoint">
      <span class="endpoint-label">Server URL</span>
      <code id="endpoint">${MCP_URL}</code>
      ${copyButton('endpoint', 'the server URL', 'Copy URL')}
    </div>
    <div class="quick">
      <a class="button" href="${escapeHtml(cursor.href)}">${escapeHtml(cursor.label)}</a>
      <a class="button" href="${escapeHtml(vscode.href)}">${escapeHtml(vscode.label)}</a>
      <a class="button button-quiet" href="#setup">Other clients ${ICONS.arrow}</a>
    </div>`,
  });
};

const clientPanel = ({ id, name, steps, note, snippets, install }: ClientSetup) => `
      <div class="card tabpanel" id="panel-${id}" aria-labelledby="tab-${id}">
        <h3 class="tab-title">${escapeHtml(name)}</h3>
        <ol class="steps">${steps.map((step) => `<li><span>${inlineHtml(step)}</span></li>`).join('')}</ol>
        ${note ? `<p class="client-note">${inlineHtml(note)}</p>` : ''}
        ${install ? `<p><a class="button" href="${escapeHtml(install.href)}">${escapeHtml(install.label)}</a></p>` : ''}
        ${snippets.map((snippet) => `<p class="snippet-label">${escapeHtml(snippet.label)}</p>${copyBlock(`${name} ${snippet.label}`, snippet.text)}`).join('')}
      </div>`;

const setup = () => `
  <section id="setup" aria-labelledby="setup-title">
    <h2 id="setup-title">Set up</h2>
    <p class="section-lede">Pick your assistant. All it needs is the server URL.</p>
    <div data-tabs>
      <div class="tablist" role="tablist" aria-label="Assistant" hidden>
        ${CLIENTS.map((client) => `<button type="button" class="tab" role="tab" id="tab-${client.id}" aria-controls="panel-${client.id}" aria-selected="false" tabindex="-1">${escapeHtml(client.short)}</button>`).join('')}
      </div>
      ${CLIENTS.map(clientPanel).join('')}
    </div>
  </section>`;

const example = () => `
  <section id="example" aria-labelledby="example-title">
    <h2 id="example-title">See it work</h2>
    <p class="section-lede">A real answer, trimmed. Colors are the paint utilities use to mark the street.</p>
    <div class="card demo">
      <p class="bubble">${escapeHtml(DEMO.prompt)}</p>
      <div class="reply">
        <p class="called"><code>whats_under</code></p>
        <h3>${escapeHtml(DEMO.address)}</h3>
        <p class="fine">Under the street in front · records as of <span class="nowrap">${DEMO.asOf}</span></p>
        <ul class="lines">${DEMO.lines
          .map(
            (line) => `
          <li><span class="dot dot-${line.utility}" aria-hidden="true"></span><div><strong>${escapeHtml(line.label)}</strong><span class="where">${escapeHtml(line.where)}</span><span class="depth">${escapeHtml(line.depth)}</span><span class="from">From ${escapeHtml(line.from)}</span></div></li>`,
          )
          .join('')}
        </ul>
        <dl class="facts">${DEMO.facts.map(([term, value]) => `<div><dt>${escapeHtml(term!)}</dt><dd>${escapeHtml(value!)}</dd></div>`).join('')}</dl>
        <p class="call811">${ICONS.warn}${escapeHtml(DEMO.call811)}</p>
      </div>
    </div>
  </section>`;

interface JsonProperty {
  type?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  enum?: unknown[];
  examples?: unknown[];
}

const paramTags = (property: JsonProperty, required: boolean) => {
  const tags = [property.enum ? 'one of' : (property.type ?? '')];
  tags.push(required ? 'required' : 'optional');
  if (property.default !== undefined) tags.push(`default ${String(property.default)}`);
  if (property.minimum !== undefined && property.maximum !== undefined)
    tags.push(`${property.minimum} to ${property.maximum}`);
  if (property.maxLength !== undefined) tags.push(`up to ${property.maxLength} characters`);
  return tags
    .filter(Boolean)
    .map(
      (tag) =>
        `<span class="tag${tag === 'required' ? ' tag-required' : ''}">${escapeHtml(tag)}</span>`,
    )
    .join('');
};

/** Each allowed value with what it means: a city's name, a utility's label. */
const enumIds = (values: unknown[]) =>
  `<ul class="ids">${values
    .map((value) => {
      const region = REGIONS.find((candidate) => candidate.id === value);
      const label = region?.name ?? UTILITY_STYLES[value as UtilityKind]?.label ?? '';
      return `<li><code>${escapeHtml(String(value))}</code>${escapeHtml(label)}</li>`;
    })
    .join('')}</ul>`;

const params = (schema: Record<string, unknown>) => {
  const properties = (schema.properties ?? {}) as Record<string, JsonProperty>;
  const required = new Set((schema.required ?? []) as string[]);
  return `<ul class="params">${Object.entries(properties)
    .map(
      ([name, property]) => `
          <li class="param"><div class="param-head"><code>${escapeHtml(name)}</code>${paramTags(property, required.has(name))}</div><p>${escapeHtml(PARAM_NOTES[name] ?? property.description ?? '')}</p>${property.enum || property.examples ? enumIds(property.enum ?? property.examples!) : ''}</li>`,
    )
    .join('')}</ul>`;
};

const toolCard = (tool: ReturnType<typeof toolList>[number]) => {
  const summary = TOOL_SUMMARIES[tool.name];
  const call = EXAMPLE_CALLS[tool.name];
  return `
    <article class="card tool" id="tool-${tool.name}">
      <div class="tool-head"><code>${tool.name}</code><span>read-only</span></div>
      <p class="purpose">${escapeHtml(summary?.purpose ?? '')}</p>
      <h4>Parameters</h4>
      ${params(tool.inputSchema)}
      <h4>Returns</h4>
      <ul class="returns">${(summary?.returns ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      ${
        call
          ? `<details><summary>See an example answer</summary>
        <pre><code>${escapeHtml(JSON.stringify(call.args))}</code></pre>
        <pre><code>${escapeHtml(call.answer)}</code></pre>
      </details>`
          : ''
      }
      <details><summary>The description your assistant reads</summary><p>${escapeHtml(tool.description)}</p></details>
    </article>`;
};

const tools = (cities: string) => `
  <section id="tools" aria-labelledby="tools-title">
    <h2 id="tools-title">Tools</h2>
    <p class="section-lede">Two read-only tools. Your assistant picks one from how you ask.</p>
    <div class="tools">${toolList().map(toolCard).join('')}</div>
    <details class="card sources">
      <summary>How addresses and errors work</summary>
      <ul class="returns">
        <li>An answer counts only when the house number, street and any city, borough or neighborhood named match. If the match reads differently, the answer starts "Matched to ... (you asked for ...)".</li>
        <li>An address outside ${escapeHtml(cities)}, or with no true match, is a tool error (<code>isError</code>) saying what was found instead and how to ask again.</li>
        <li>Arguments that don't fit come back as a tool error the assistant can fix, such as "radius_m must be between 10 and 400 (got 5000). Try 400."</li>
        <li>Protocol ${LATEST_PROTOCOL} (no handshake, <code>server/discover</code>) and ${LEGACY_PROTOCOLS.join(', ')} (with <code>initialize</code>) on the same URL. No sessions.</li>
        <li>Every answer ends with the city's 811 notice and a link to the spot on the <a href="/">map</a>.</li>
      </ul>
    </details>
  </section>`;

const prompts = () => `
  <section id="prompts" aria-labelledby="prompts-title">
    <h2 id="prompts-title">Prompts to try</h2>
    <p class="section-lede">Ask in your own words. Each of these names a real address.</p>
    <ul class="prompts">${EXAMPLE_PROMPTS.map(
      ({ who, prompt }, i) => `
      <li class="card prompt"><span class="who">${escapeHtml(who)}</span><p id="prompt-${i}">${escapeHtml(prompt)}</p>${copyButton(`prompt-${i}`, `the prompt: ${prompt}`, 'Copy prompt')}</li>`,
    ).join('')}
    </ul>
  </section>`;

const sourceLink = (key: SourceKey) => {
  const source = SOURCES[key];
  return `<a href="${escapeHtml(source.url)}">${escapeHtml(source.name)}</a> (${escapeHtml(source.publisher)})`;
};

const coverageRow = (region: Region) => {
  const coverage = COVERAGE[region.id];
  const markout = `<a href="${escapeHtml(region.markout.url)}">${escapeHtml(region.markout.center)}</a>`;
  if (!coverage)
    return `<tr><th scope="row">${escapeHtml(region.name)}</th><td data-label="Permits" class="muted">See the map</td><td data-label="Pipe maps" class="muted">See the map</td><td data-label="Lead lines" class="muted">See the map</td><td data-label="Before digging">${markout}</td></tr>`;
  // A paused source (PAUSED_SOURCES) is published but held back while permission is asked.
  const shown = coverage.pipes.filter((pipe) => !isPaused(pipe.source));
  const pipes = shown.length
    ? `<ul class="pipes">${shown.map((pipe) => `<li><span class="dot dot-${pipe.utility}" aria-hidden="true"></span>${escapeHtml(pipe.label)}</li>`).join('')}</ul>`
    : coverage.pipes.length
      ? '<span class="no">Paused, asking for permission</span>'
      : '<span class="no">None published</span>';
  const lead =
    typeof coverage.serviceLines !== 'string'
      ? `<span class="no">${escapeHtml(coverage.serviceLines.none)}</span>`
      : isPaused(coverage.serviceLines)
        ? '<span class="no">Paused, asking for permission</span>'
        : `<span class="yes">${ICONS.check}By address</span>`;
  return `<tr><th scope="row">${escapeHtml(region.name)}</th><td data-label="Permits">${permitsSince(region.id) ?? 'On record'}</td><td data-label="Pipe maps">${pipes}</td><td data-label="Lead lines">${lead}</td><td data-label="Before digging">${markout}</td></tr>`;
};

const datasets = (region: Region) => {
  const coverage = COVERAGE[region.id];
  if (!coverage) return '';
  const keys = [
    ...coverage.permits,
    ...coverage.pipes.map((pipe) => pipe.source),
    ...(typeof coverage.serviceLines === 'string' ? [coverage.serviceLines] : []),
  ].filter((key) => !isPaused(key));
  return `<div><dt>${escapeHtml(region.name)}</dt><dd>${keys.map(sourceLink).join('; ')}</dd></div>`;
};

const coverage = () => `
  <section id="coverage" aria-labelledby="coverage-title">
    <h2 id="coverage-title">Coverage</h2>
    <p class="section-lede">Where a utility maps its own lines, answers use that map. Elsewhere lines come from permits and standards, and say so.</p>
    <div class="card matrix-wrap">
      <table class="matrix">
        <thead><tr><th scope="col">City</th><th scope="col">Permits</th><th scope="col">Pipe maps</th><th scope="col">Lead lines</th><th scope="col">Before digging</th></tr></thead>
        <tbody>${REGIONS.map(coverageRow).join('')}</tbody>
      </table>
    </div>
    <details class="card sources"><summary>Datasets by city</summary><dl>${REGIONS.map(datasets).join('')}</dl></details>
  </section>`;

const fact = (
  id: string,
  icon: string,
  title: string,
  line: string,
  more: string[],
  warn = false,
) => `
      <li class="card fact${warn ? ' fact-warn' : ''}" id="${id}">
        <span class="fact-icon">${icon}</span>
        <div>
          <h3>${title}</h3>
          <p>${line}</p>
          ${more.length ? `<details><summary>More</summary><ul>${more.map((item) => `<li>${item}</li>`).join('')}</ul></details>` : ''}
        </div>
      </li>`;

const goodToKnow = () => {
  const minute = limitOf('visitor-minute');
  const day = limitOf('visitor-day');
  const keepDays = KEEP_SECONDS / 86_400;
  return `
  <section id="good-to-know" aria-labelledby="good-title">
    <h2 id="good-title">Good to know</h2>
    <ul class="facts-list">
      ${fact('811', ICONS.warn, 'Not a substitute for 811', 'Answers come from public records. They are not a survey or a utility locate. Call 811 before you dig.', ["Every covered city's law requires a free request to its one-call center before any digging, and every answer ends with that center and link.", 'Utilities don’t publish exact positions or depths. A line nobody has dug up since the records begin won’t appear.'], true)}
      ${fact('data', ICONS.clock, 'Fresh every night', 'Rebuilt nightly from city and utility open data. Each answer gives its records-as-of date.', ['The same records the <a href="/">map</a> shows: excavation permits, pipe and asset maps, lead service line inventories and installation standards.', 'For what the records say across the cities, see <a href="/insights">Insights</a>.'])}
      ${fact('limits', ICONS.gauge, 'Limits', `${minute} questions a minute and ${day} a day per connection.`, [`All connections together get ${limitOf('all-minute')} questions a minute. Over a limit, the answer is a tool error saying how many seconds to wait.`, 'Connecting and listing the tools don’t count.', `<code>recent_digs</code> lists at most ${MAX_DIGS} permits and gives the total found.`, `Each lookup of an address or of map data gives up after ${UPSTREAM_TIMEOUT_MS / 1000} seconds.`, '"Permitted today" uses New York’s date, the same day the map uses.'])}
      ${fact('privacy', ICONS.lock, 'Privacy', 'The addresses you ask about are never stored or logged by Subsola.', ['To find an address, its text goes to the city’s own address lookup, which has its own policy.', `Each call leaves a stats row: the tool, the city, how it ended, how long it took, the app’s name and protocol version, and for an address outside the covered cities, the city named (such as "Boston, MA").`, 'The row also keeps an anonymous requester ID, made by scrambling the IP address with a secret key, and the network’s name and the country, as Cloudflare reports them. Never the address or the IP itself.', `Rows are deleted after ${CALL_KEEP_SECONDS / 86_400} days.`, 'Beyond that, the server logs counts and error names only.', `To enforce the limits, each connection’s IP address is hashed with a secret; only the hash and a count are kept, and they are deleted after ${keepDays === 1 ? 'one day' : `${keepDays} days`}.`, 'Subsola runs on Cloudflare, which keeps its own request logs under <a href="https://www.cloudflare.com/privacypolicy/">its privacy policy</a>.', 'This page sets no cookies and runs no analytics. Its fonts come from Google Fonts.', 'The whole site’s policy: <a href="/privacy">subsola.com/privacy</a>.'])}
    </ul>
  </section>`;
};

const help = (cities: string) => {
  const minute = limitOf('visitor-minute');
  const day = limitOf('visitor-day');
  return `
  <section id="help" aria-labelledby="help-title">
    <h2 id="help-title">Help</h2>
    <div class="help">
      <details id="troubleshooting"><summary>Troubleshooting</summary>
        <dl>
          <div><dt>"405 Method Not Allowed" from curl</dt>
          <dd>Expected: MCP clients use POST, and a plain GET gets 405. To test by hand:${copyBlock('the curl command', `curl -X POST ${MCP_URL} \\\n  -H 'Content-Type: application/json' \\\n  -H 'Accept: application/json, text/event-stream' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`)}</dd></div>
          <div><dt>"Subsola is answering too many questions from here right now"</dt>
          <dd>Over ${minute} a minute or ${day} a day from your connection, or everyone together over ${limitOf('all-minute')} a minute. The message says how many seconds to wait.</dd></div>
          <div><dt>"Couldn't find" an address</dt>
          <dd>The error says what the closest match was and why it didn't count. Give the house number, street and city or borough ("350 5th Ave, Manhattan"), or set the <code>city</code> input. Only ${escapeHtml(cities)} are covered.</dd></div>
          <div><dt>The answer starts "Matched to ..."</dt>
          <dd>The match reads differently from what was asked, such as 190C for 190. If it's the wrong place, add the city or borough.</dd></div>
          <div><dt>My client can't connect</dt>
          <dd>Check it supports remote servers over Streamable HTTP, the URL is exactly <code>${MCP_URL}</code>, and no sign-in or OAuth is set for it. Some clients allow remote servers only on certain plans.</dd></div>
          <div><dt>"Origin not allowed" (403) from a web page</dt>
          <dd>Pages on any https site, desktop apps and <code>http://localhost</code> tools may all call the server. Only plain http from another host is turned away, as the protocol asks servers to check Origin. Server-side clients send no Origin and aren't affected.</dd></div>
        </dl>
      </details>
      <details id="changelog"><summary>Changelog · version ${SERVER_VERSION}</summary>
        <ul class="changelog">${CHANGELOG.map((entry) => `<li><p>${entry.date} · version ${entry.version}</p><ul>${entry.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join('')}</ul></li>`).join('')}</ul>
      </details>
      <div class="card contact" id="contact">
        <p>Wrong answer, missing city or a broken step? Email ${CONTACT_LINK} or use the feedback form on the map.</p>
        <a class="button button-quiet" href="/?sel=feedback">Send feedback ${ICONS.arrow}</a>
      </div>
    </div>
  </section>`;
};

export const docsPage = (nonce: string) => {
  copyCount = 0;
  const cities = cityNames('and');
  const description = `Subsola's MCP server lets any AI assistant, such as Claude, ChatGPT or Cursor, look up what public records say is under a street in ${cities}.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#e6e9ee">
<script nonce="${nonce}" src="/theme.js"></script>
<script nonce="${nonce}" src="/shell.js" defer></script>
<title>Subsola MCP server: use Subsola with AI assistants</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${MCP_URL}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Subsola">
<meta property="og:url" content="${MCP_URL}">
<meta property="og:title" content="Use Subsola with AI assistants">
<meta property="og:description" content="${escapeHtml(`Ask any AI assistant what's under a street in ${cities}.`)}">
<meta property="og:image" content="https://subsola.com/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="${FONTS_URL}">
<link rel="stylesheet" href="/shell.css" nonce="${nonce}">
<style nonce="${nonce}">${pageStyle()}</style>
</head>
<body>
${topBar('mcp')}
<div class="layout">
  ${sectionNav(SECTIONS)}
  <main id="main" class="page">
    ${hero(REGIONS.length)}
    ${example()}
    ${setup()}
    ${tools(cities)}
    ${prompts()}
    ${coverage()}
    ${goodToKnow()}
    ${help(cities)}
  </main>
  ${siteFoot()}
</div>
<p class="status" role="status" aria-live="polite"></p>
<script nonce="${nonce}">${PAGE_SCRIPT}</script>
</body>
</html>
`;
};
