import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {demoIssues} from '../src/fixtures.js';
import {fileURLToPath} from 'node:url';
import Convert from 'ansi-to-html';

// Set before Ink/Chalk are loaded so this export preserves the real TUI colors.
process.env.FORCE_COLOR = '3';
const {renderToString} = await import('ink');
const {App} = await import('../src/app.js');
const convert = new Convert({fg: '#DFE5EF', bg: '#171D28', escapeXML: true});
const views = ['work', 'board'] as const;
const graphCss = readFileSync(new URL('./graph-demo.css', import.meta.url), 'utf8');
const graphJs = readFileSync(new URL('./graph-demo.js', import.meta.url), 'utf8');
const graphMarkup = `<div id="git-demo" class="git-demo" tabindex="0" aria-label="Interactive Git style relationship tree">
<div class="git-topline"><span class="git-brand">🐝 bees  / workbench</span><small>DEMO / MEMORY ONLY</small></div>
<div class="git-progress">━─────────── <span>1/10 complete · ALL</span></div><div class="git-tabs">1 Queue  2 Board  <b>3 Graph</b></div>
<div class="git-main"><div class="git-log"><div class="git-controls"><div><strong>RELATIONSHIP GRAPH</strong></div><div role="group" aria-label="Relationship types"><button data-edge-mode="all" aria-pressed="true">All links</button><button data-edge-mode="blocks" aria-pressed="false">Blocking</button><button data-edge-mode="parent-child" aria-pressed="false">Family</button><button data-edge-mode="related" aria-pressed="false">Related</button></div><div class="git-direction">Prerequisites above / downstream below</div></div><div class="git-column-head"><span>ISSUE</span><span>TITLE</span><span>STATUS</span><span>PRI</span></div><div class="git-log-body"><svg id="git-rails" class="git-rails" aria-hidden="true"></svg><div id="git-rows" class="git-rows" tabindex="0" aria-label="Issues; use j and k or arrow keys to navigate"></div></div></div><aside id="git-detail" class="git-detail" aria-live="polite"></aside></div>
<div class="git-footer"><div class="git-legend"><b class="blocking">━ blocks</b><b class="family">┄ family</b><b class="related">┈ related</b></div><span id="git-position"></span></div><div class="git-help"><kbd>j / k</kbd> move · click a row to inspect · click a connection to follow it</div>
</div><script type="application/json" id="graph-data">${JSON.stringify(demoIssues()).replace(/</g, '\\u003c')}</script>`;
const previews = views.map(view => ({view, html: convert.toHtml(renderToString(
  <App width={132} height={30} initialView={view} initialFilter={view === 'board' ? 'all' : 'ready'} interactive={false} motion={false}/>, {columns: 132},
))}));
const output = new URL('../docs/preview.html', import.meta.url);
mkdirSync(new URL('../docs/', import.meta.url), {recursive: true});
writeFileSync(output, `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bees — a terminal workbench</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#10151e;color:#dfe5ef;font:16px/1.6 system-ui,sans-serif}main{max-width:1280px;margin:0 auto;padding:46px 32px}header{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:28px}.eyebrow{color:#e9b949;letter-spacing:.18em;font-size:12px}h1{font-size:38px;line-height:1.15;letter-spacing:-.04em;margin:12px 0}p{color:#97a5ba;margin:0}.tabs{display:flex;gap:8px;margin-bottom:18px}button{background:transparent;border:1px solid #536174;border-radius:8px;color:#97a5ba;padding:9px 16px;font:inherit;cursor:pointer}button[aria-pressed=true]{background:#e9b949;color:#171d28;border-color:#e9b949}button:focus-visible{outline:3px solid #8fbdf3;outline-offset:3px}.terminal{background:#171d28;border:1px solid #374254;border-radius:14px;padding:18px;box-shadow:0 24px 80px #0005;overflow:auto}.bar{display:flex;gap:7px;margin-bottom:18px;align-items:center}.dot{width:9px;height:9px;border-radius:50%;background:#536174}.bar span:last-child{margin-left:12px;color:#97a5ba;font:12px monospace}pre{font:13px/1.65 Consolas,'Cascadia Mono',monospace;margin:0;white-space:pre;width:max-content}footer{display:flex;justify-content:space-between;gap:20px;margin-top:22px;color:#97a5ba;font-size:13px}code{color:#e9b949}a{color:#8fbdf3}@media(max-width:700px){main{padding:24px 16px}header,footer{display:block}h1{font-size:30px}.tabs{flex-wrap:wrap}}
${graphCss}</style></head><body><main>
<header><div><div class="eyebrow">BEES / TERMINAL WORKBENCH</div><h1>Find your next good move.</h1><p>Less hunting. Clearer dependencies. Small wins that open doors.</p></div><p>React + Ink<br>Graph exploration / 02</p></header>
<nav class="tabs" aria-label="Preview view">${previews.map(({view}, i) => `<button type="button" data-view="${view}" aria-pressed="false">${i + 1} ${view === 'work' ? 'Queue' : 'Board'}</button>`).join('')}<button type="button" data-view="git-demo" aria-pressed="true">3 Graph</button></nav>
<section class="terminal" aria-label="Bees design preview"><div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span>bees-tui — fictional issues</span></div><div class="terminal-screen">${previews.map(({view, html}) => `<pre id="${view}" hidden>${html}</pre>`).join('')}${graphMarkup}</div></section>
<footer><span>Graph: interactive browser design experiment. Queue and Board: actual Ink frames. Fictional data only.</span><span><a href="../DESIGN.md">Read the design</a></span></footer>
</main><script>${graphJs}
document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('button[data-view]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));document.querySelectorAll('pre,#git-demo').forEach(frame=>frame.hidden=frame.id!==button.dataset.view)}));</script></body></html>`);
console.log(fileURLToPath(output));


