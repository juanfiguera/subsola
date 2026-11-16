import { RECYCLED_WATER, UTILITY_STYLES } from '../../src/utilities';

/**
 * The docs page's stylesheet, in the map's look: pale ground, white panels, Barlow, and APWA
 * paint colors only where they mean a utility. Every color is a token in the one block below, so
 * dark mode (and the site's theme toggle, when it reaches this page) swaps tokens and nothing
 * else. Light values match the rest of the site.
 */

const TOKENS = `
:root{
  --ground:#e6e9ee;--panel:#fff;--panel-2:#f3f5f8;--panel-3:#eaedf2;
  --line:rgb(20 30 50/.09);--line-2:rgb(20 30 50/.16);
  --ink:#1b2230;--ink-2:#4f5a6d;--ink-3:#626c80;
  --button:#1b2230;--button-ink:#fff;--button-hover:#2c3546;
  --user:#1b2230;--user-ink:#fff;
  --warn:#c4383d;--warn-wash:#fdeeee;--ok:#25803c;
  --shadow:0 1px 2px rgb(20 30 50/.06),0 10px 28px rgb(20 30 50/.08);
  --radius:14px;
  --display:'Barlow Condensed','Barlow',system-ui,sans-serif;--body:'Barlow',system-ui,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){
  --ground:#0f131a;--panel:#171c25;--panel-2:#1f2531;--panel-3:#262d3a;
  --line:rgb(255 255 255/.08);--line-2:rgb(255 255 255/.16);
  --ink:#e8ecf2;--ink-2:#b4bdcc;--ink-3:#97a1b3;
  --button:#e8ecf2;--button-ink:#11151c;--button-hover:#ffffff;
  --user:#2d3646;--user-ink:#f1f4f8;
  --warn:#ff7b80;--warn-wash:#2a1a1d;--ok:#5fcf7a;
  --shadow:0 1px 2px rgb(0 0 0/.3),0 10px 28px rgb(0 0 0/.35);
  color-scheme:dark;
}}
:root[data-theme=dark]{
  --ground:#0f131a;--panel:#171c25;--panel-2:#1f2531;--panel-3:#262d3a;
  --line:rgb(255 255 255/.08);--line-2:rgb(255 255 255/.16);
  --ink:#e8ecf2;--ink-2:#b4bdcc;--ink-3:#97a1b3;
  --button:#e8ecf2;--button-ink:#11151c;--button-hover:#ffffff;
  --user:#2d3646;--user-ink:#f1f4f8;
  --warn:#ff7b80;--warn-wash:#2a1a1d;--ok:#5fcf7a;
  --shadow:0 1px 2px rgb(0 0 0/.3),0 10px 28px rgb(0 0 0/.35);
  color-scheme:dark;
}`;

// The page's CSP allows no style attributes, so each utility's paint is a class.
const DOTS = [
  ...Object.entries(UTILITY_STYLES).map(
    ([kind, style]) => `.dot-${kind}{background:${style.color}}`,
  ),
  `.dot-recycled{background:${RECYCLED_WATER.color}}`,
].join('\n');

const LAYOUT = `
*{box-sizing:border-box}
html{background:var(--ground);scroll-padding-top:76px}
body{margin:0;background:var(--ground);color:var(--ink);font:500 16px/1.55 var(--body);-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
a{color:inherit;text-decoration-color:var(--line-2);text-underline-offset:3px}
a:hover{text-decoration-color:currentColor}
:focus-visible{outline:2px solid var(--ink);outline-offset:2px;border-radius:4px}
code,pre{font-family:var(--mono)}
code{font-size:.9em}
p{margin:0 0 10px}
ul,ol{margin:0;padding:0}
[hidden]{display:none!important}
.skip{position:absolute;left:16px;top:-48px;z-index:3;padding:8px 12px;border-radius:8px;background:var(--button);color:var(--button-ink);font-weight:600}
.skip:focus{top:8px}
.topbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:16px;height:56px;padding:0 16px;background:var(--panel);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:8px;font:800 20px var(--display);text-decoration:none}
.mark{width:18px;height:18px;border-radius:5px;background:linear-gradient(90deg,#e3262b 0 20%,#f2c200 20% 40%,#f47c20 40% 60%,#1f6fd1 60% 80%,#2e9a48 80%)}
.site-nav{display:flex;gap:4px;margin-left:auto}
.site-nav a{padding:6px 10px;border-radius:8px;color:var(--ink-2);font-weight:600;font-size:15px;text-decoration:none;white-space:nowrap}
.site-nav a:hover{color:var(--ink);background:var(--panel-2)}
.layout{display:grid;grid-template-columns:184px minmax(0,1fr);gap:48px;max-width:1120px;margin:0 auto;padding:36px 24px 72px}
.side{position:sticky;top:88px;align-self:start}
.side p{margin:0 0 8px;color:var(--ink-3);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.side ol{list-style:none;display:grid;gap:2px}
.side a{display:block;padding:6px 10px;border-radius:8px;color:var(--ink-2);font-weight:600;font-size:15px;text-decoration:none;border-left:3px solid transparent}
.side a:hover{background:var(--panel);color:var(--ink)}
.side a[aria-current=true]{background:var(--panel);color:var(--ink);border-left-color:var(--ink)}
main{min-width:0;max-width:820px}
section{margin:0 0 56px}
h1{margin:0 0 10px;font:800 52px/1 var(--display);letter-spacing:-.01em}
h2{margin:0 0 6px;font:800 34px/1.05 var(--display)}
h3{margin:0;font-size:18px}
.section-lede{margin:0 0 18px;color:var(--ink-2);font-size:17px;max-width:38em}
.kicker{margin:0 0 6px;color:var(--ink-3);font-size:14px;font-weight:700}
.lede{margin:0 0 20px;color:var(--ink-2);font-size:19px;max-width:32em}
.hero{margin:0 0 48px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius)}
`;

const PARTS = `
.endpoint{display:flex;align-items:center;gap:12px;padding:10px 10px 10px 18px;border-radius:var(--radius);background:var(--panel);border:1px solid var(--line-2);box-shadow:var(--shadow)}
.endpoint-label{color:var(--ink-3);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
.endpoint code{flex:1;min-width:0;font-size:19px;font-weight:600;overflow-wrap:anywhere}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;list-style:none}
.chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--panel);border:1px solid var(--line);color:var(--ink-2);font-size:14px;font-weight:600;white-space:nowrap}
.chip svg{width:15px;height:15px}
.quick{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:18px 0 0}
.quick .fine{margin:0}
.button{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:0;border-radius:10px;background:var(--button);color:var(--button-ink);font:600 15px var(--body);text-decoration:none;cursor:pointer}
.button:hover{background:var(--button-hover)}
.button svg{width:16px;height:16px}
.button-quiet{background:var(--panel);color:var(--ink);border:1px solid var(--line-2)}
.button-quiet:hover{background:var(--panel-2)}
.fine{color:var(--ink-3);font-size:14px}
.nowrap{white-space:nowrap}

.demo{padding:20px;display:grid;gap:14px}
.bubble{justify-self:end;max-width:min(30em,92%);padding:10px 14px;border-radius:16px 16px 4px 16px;background:var(--user);color:var(--user-ink);font-size:16px}
.reply{max-width:100%;padding:16px;border-radius:16px 16px 16px 4px;background:var(--panel-2)}
.called{display:inline-flex;gap:6px;align-items:center;margin:0 0 10px;padding:2px 9px;border-radius:999px;background:var(--panel);border:1px solid var(--line);color:var(--ink-3);font-size:13px;font-weight:700}
.reply h3{margin:0 0 2px;font-size:17px}
.reply .fine{margin:0 0 12px}
.lines{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:8px;margin:0 0 14px}
.lines li{display:grid;grid-template-columns:12px minmax(0,1fr);gap:10px;padding:10px 12px;border-radius:10px;background:var(--panel)}
.lines div{display:grid;gap:1px}
.lines strong{font-size:15px}
.lines .where{color:var(--ink);font-size:15px}
.lines .depth{color:var(--ink-2);font-size:14px}
.lines .from{color:var(--ink-3);font-size:13px;font-weight:600}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;box-shadow:0 0 0 1px rgb(0 0 0/.12)}
.lines .dot{margin-top:5px}
.facts{display:grid;gap:4px;margin:0 0 10px;font-size:15px}
.facts div{display:flex;gap:8px;flex-wrap:wrap}
.facts dt{font-weight:700}
.facts dd{margin:0;color:var(--ink-2)}
.call811{display:flex;gap:8px;align-items:center;margin:0;padding:8px 12px;border-radius:10px;background:var(--warn-wash);color:var(--ink);font-size:15px;font-weight:600}
.call811 svg{flex:none;width:18px;height:18px;color:var(--warn)}

.tablist{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 12px;padding:4px;border-radius:12px;background:var(--panel-3);width:fit-content;max-width:100%}
.tab{padding:7px 12px;border:0;border-radius:9px;background:transparent;color:var(--ink-2);font:600 15px var(--body);cursor:pointer;white-space:nowrap}
.tab:hover{color:var(--ink)}
.tab[aria-selected=true]{background:var(--panel);color:var(--ink);box-shadow:0 1px 2px rgb(0 0 0/.12)}
.tabpanel{padding:20px;margin:0 0 12px}
.js .tab-title{display:none}
.tab-title{margin:0 0 12px}
.steps{list-style:none;counter-reset:step;display:grid;gap:10px;margin:0 0 14px}
.steps li{counter-increment:step;display:grid;grid-template-columns:26px 1fr;gap:10px;align-items:start}
.steps li::before{content:counter(step);display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--panel-3);color:var(--ink);font-size:14px;font-weight:700}
.snippet-label{margin:14px 0 6px;color:var(--ink-3);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.copy{position:relative}
.copy pre{margin:0;padding:12px 84px 12px 14px;border-radius:10px;background:var(--panel-2);border:1px solid var(--line);white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.5}
.copy-button{position:absolute;top:7px;right:7px;display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--line-2);border-radius:8px;background:var(--panel);color:var(--ink);font:600 13px var(--body);cursor:pointer}
.copy-button:hover{background:var(--panel-3)}
.copy-button svg{width:14px;height:14px}
.endpoint .copy-button{position:static;padding:8px 14px;border:0;border-radius:10px;background:var(--button);color:var(--button-ink);font-size:15px}
.endpoint .copy-button:hover{background:var(--button-hover)}

.tools{display:grid;gap:16px}
.tool{padding:22px}
.tool-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin:0 0 4px}
.tool-head code{font-size:20px;font-weight:700}
.tool-head span{color:var(--ink-3);font-size:14px;font-weight:600}
.tool .purpose{margin:0 0 16px;font-size:17px}
.tool h4{margin:18px 0 8px;color:var(--ink-3);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.params{list-style:none;display:grid;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.param{padding:10px 14px;border-top:1px solid var(--line)}
.param:first-child{border-top:0}
.param-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.param-head code{margin-right:4px;font-weight:700}
.tag{padding:1px 8px;border-radius:6px;background:var(--panel-3);color:var(--ink-2);font-size:13px;font-weight:600}
.tag-required{background:var(--ink);color:var(--panel)}
.param p{margin:6px 0 0;color:var(--ink-2);font-size:15px}
.ids{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0;list-style:none}
.ids li{display:inline-flex;gap:6px;align-items:center;padding:2px 8px;border-radius:6px;border:1px solid var(--line);font-size:14px;color:var(--ink-2)}
.ids code{color:var(--ink);font-weight:700}
.client-note{margin:0 0 14px;color:var(--ink-2);font-size:15px}
.returns{list-style:none;display:grid;gap:6px}
.returns li{display:grid;grid-template-columns:16px 1fr;gap:8px;font-size:15px}
.returns li::before{content:'';width:6px;height:6px;margin:9px 0 0 4px;border-radius:50%;background:var(--ink-3)}
details{border-radius:10px}
summary{cursor:pointer;font-weight:700;list-style:none;display:flex;align-items:center;gap:8px}
summary::-webkit-details-marker{display:none}
summary::before{content:'';width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);transition:transform .15s;flex:none;margin:0 4px 0 2px}
details[open]>summary::before{transform:translateY(-2px) rotate(45deg)}
.tool details{margin:14px 0 0;padding:10px 14px;background:var(--panel-2)}
.tool details[open]{padding-bottom:14px}
.tool details pre{margin:8px 0 0;padding:12px 14px;border-radius:8px;background:var(--panel);border:1px solid var(--line);white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.5;max-height:440px;overflow:auto}
.tool details p{margin:8px 0 0;color:var(--ink-2);font-size:15px}

.prompts{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:10px}
.prompt{display:grid;grid-template-rows:auto 1fr auto;gap:6px;height:100%;padding:14px 16px}
.prompt .who{color:var(--ink-3);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.prompt p{margin:0;font-size:16px}
.prompt .copy-button{position:static;justify-self:start;margin-top:4px}

.matrix-wrap{overflow:hidden}
.matrix{width:100%;border-collapse:collapse;font-size:15px}
.matrix th,.matrix td{padding:11px 14px;text-align:left;vertical-align:top;border-top:1px solid var(--line)}
.matrix thead th{border-top:0;background:var(--panel-2);color:var(--ink-3);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.matrix tbody th{font-weight:700;white-space:nowrap}
.matrix td:nth-child(2),.matrix td:last-child{white-space:nowrap}
.pipes{display:flex;flex-wrap:wrap;gap:4px 10px;list-style:none}
.pipes li{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.pipes .dot{width:9px;height:9px}
.yes{display:inline-flex;align-items:center;gap:6px;color:var(--ok);font-weight:700}
.yes svg{width:16px;height:16px}
.no{color:var(--ink-3)}
.muted{color:var(--ink-3)}
.sources{margin:12px 0 0;padding:12px 16px}
.sources dl{margin:10px 0 0;display:grid;gap:10px;font-size:15px}
.sources dt{font-weight:700}
.sources dd{margin:2px 0 0;color:var(--ink-2)}

.facts-list{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:10px;align-items:start}
.fact{display:grid;grid-template-columns:40px 1fr;gap:14px;padding:16px 18px}
.fact-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:var(--panel-3)}
.fact-icon svg{width:20px;height:20px}
.fact h3{margin:0 0 2px;font-size:17px}
.fact p{margin:0;color:var(--ink-2)}
.fact details{margin:8px 0 0}
.fact summary{font-size:14px;color:var(--ink-2)}
.fact details ul{margin:8px 0 0;padding-left:18px;display:grid;gap:6px;color:var(--ink-2);font-size:15px}
.fact-warn{border-color:var(--warn)}
.fact-warn .fact-icon{background:var(--warn-wash);color:var(--warn)}

.help{display:grid;gap:10px}
.help>details{padding:14px 18px;background:var(--panel);border:1px solid var(--line)}
.help>details>summary{font-size:17px}
.help dl{margin:12px 0 0;display:grid;gap:16px}
.help dd .copy{margin-top:8px}
.help dt{font-weight:700}
.help dd{margin:4px 0 0;color:var(--ink-2)}
.help dd code{overflow-wrap:anywhere}
.changelog{list-style:none;display:grid;gap:14px;margin:12px 0 0}
.changelog p{margin:0 0 4px;font-weight:700}
.changelog ul{padding-left:18px;display:grid;gap:4px;color:var(--ink-2);font-size:15px}
.contact{padding:18px 20px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
.contact p{margin:0}

.status{position:fixed;left:50%;bottom:16px;z-index:4;transform:translateX(-50%);margin:0;padding:8px 14px;border-radius:9px;background:var(--button);color:var(--button-ink);font-size:14px;font-weight:600;opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100% - 32px)}
.status.shown{opacity:1}
footer.site{padding:0 16px 40px;text-align:center}
`;

const RESPONSIVE = `
@media (max-width:960px){
  .layout{display:block;padding:0 16px 64px}
  .side{position:sticky;top:56px;z-index:1;margin:0 -16px 24px;padding:8px 16px;background:var(--ground);border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none}
  .side::-webkit-scrollbar{display:none}
  .side p{display:none}
  .side ol{display:flex;gap:4px;width:max-content}
  .side a{border-left:0;padding:6px 10px;white-space:nowrap}
  .side a[aria-current=true]{background:var(--panel);box-shadow:inset 0 -2px 0 var(--ink)}
  main{padding-top:4px}
  html{scroll-padding-top:116px}
}
@media (max-width:640px){
  h1{font-size:42px}
  h2{font-size:30px}
  .lede{font-size:17px}
  .endpoint{flex-wrap:wrap;padding:12px 12px 12px 14px;gap:8px}
  .endpoint-label{width:100%}
  .endpoint code{flex:1 1 100%;font-size:17px}
  .demo,.tabpanel,.tool{padding:16px}
  .matrix thead{display:none}
  .matrix,.matrix tbody,.matrix tr,.matrix th,.matrix td{display:block}
  .matrix tr{padding:12px 14px;border-top:1px solid var(--line)}
  .matrix tbody tr:first-child{border-top:0}
  .matrix tbody th{padding:0 0 6px;border:0;font-size:17px}
  .matrix td{display:grid;grid-template-columns:104px minmax(0,1fr);gap:8px;padding:4px 0;border:0}
  .matrix td::before{content:attr(data-label);color:var(--ink-3);font-size:13px;font-weight:700}
  .fact{grid-template-columns:32px 1fr;gap:12px;padding:14px}
  .fact-icon{width:32px;height:32px}
}
@media (prefers-reduced-motion:reduce){.status,summary::before{transition:none}}
`;

export const pageStyle = () => [TOKENS, DOTS, LAYOUT, PARTS, RESPONSIVE].join('\n');

/** The tokens and base layout alone, for the owner's stats page, so it looks like this one. */
export const baseStyle = () => [TOKENS, LAYOUT].join('\n');
