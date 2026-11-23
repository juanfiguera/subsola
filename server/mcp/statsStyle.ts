/**
 * The owner's stats page's frame: tokens and base layout in the site's look. It keeps its own copy
 * rather than the shared shell (src/pages/shell.css) because the page runs no script at all, so
 * it can't use public/theme.js and follows the system's dark mode in CSS instead. It's private and
 * never linked, so it isn't one of the pages the shell test holds to the shared frame.
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

export const baseStyle = () => [TOKENS, LAYOUT].join('\n');
