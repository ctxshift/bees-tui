import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as pty from 'node-pty';
import {CliClient} from '../src/client.js';
import {Session} from '../src/session.js';
import {layoutGraph} from '../src/graph-layout.js';

const project = resolve(process.argv[2]!);
const binary = resolve(process.argv[3]!);
const config = await mkdtemp(join(tmpdir(), 'bees-real-smoke-'));
const hash = async () => createHash('sha256').update(await readFile(join(project, '.bees', 'issues.jsonl'))).digest('hex');
const before = await hash();
const client = new CliClient(project, binary);
const session = new Session(client, 0);
let terminal: pty.IPty | undefined;
let output = '';
const checks: string[] = [];
try {
  const initial = await client.list(); const ready = await client.ready();
  assert(initial.length > 0, 'Expected a populated project');
  session.select(initial.find(issue => ready.has(issue.id))?.id ?? initial[0]!.id);
  const started = performance.now(); session.needGraph(true); await session.refresh();
  const state = session.getSnapshot();
  assert(!state.stale, state.error); assert(state.graphLoaded);
  assert.equal(state.issues.length, initial.length);
  assert.equal(new Set(layoutGraph(state.issues).map(row => row.issue.id)).size, initial.length);
  const graphMs = Math.round(performance.now() - started);
  const edges = state.issues.reduce((n, issue) => n + issue.dependencies.length, 0);
  checks.push(`Loaded ${initial.length} issues, ${ready.size} ready, ${edges} relationships; full graph refresh ${graphMs} ms`);
  session.dispose();
  terminal = pty.spawn(process.execPath, ['dist/cli.js', '--project', project, '--bees', binary, '--config', join(config, 'config.json'), '--poll-ms', '1000', '--no-motion', '--ascii'], {
    name: 'xterm-256color', cols: 132, rows: 32, cwd: process.cwd(), env: {...process.env, TERM:'xterm-256color', CI:'false', CONTINUOUS_INTEGRATION:'false'} as Record<string,string>,
  });
  terminal.onData(data => {output += data;});
  const plain = (value: string) => value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  async function waitFor(label: string, predicate: (text: string) => boolean, offset = 0) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {if (predicate(plain(output.slice(offset)))) {checks.push(label); return;} await new Promise(done => setTimeout(done, 50));}
    throw new Error(`${label} failed. Tail: ${plain(output.slice(-4000))}`);
  }
  async function key(input: string, label: string, text: string) {const offset = output.length; terminal!.write(input); await waitFor(label, value => value.includes(text), offset);}
  await waitFor('Queue opened with real issues', text => text.includes('WORK QUEUE') && text.includes('bees-'));
  await key('2', 'Board opened', 'In progress');
  await key('3', 'Graph opened', 'RELATIONSHIP GRAPH');
  await waitFor('Graph hydrated from Bees', text => text.includes('Graph current'));
  await key('v', 'Blocking-edge filter selected', 'links: blocks');
  await key('g', 'Graph list mode selected', 'List view');
  await key('\r', 'Expanded real issue details', 'OVERVIEW');
  await key('\u001b', 'Returned from details', 'RELATIONSHIP GRAPH');
  const resizedAt = output.length; terminal.resize(60, 24);
  await waitFor('Narrow 60x24 layout retained graph and exit hint', text => text.includes('RELATIONSHIP GRAPH') && text.includes('q quit'), resizedAt);
  const minimumAt = output.length; terminal.resize(48, 18);
  await waitFor('Minimum 48x18 layout retained graph', text => text.includes('RELATIONSHIP GRAPH'), minimumAt);
  terminal.resize(132, 32);
  await key('1', 'Returned to Queue', 'WORK QUEUE');
  await key('/', 'Search editor opened', 'SEARCH ISSUES');
  await key('id:bees-1', 'Search text entered', 'id:bees-1'); await key('\r', 'Search applied to real project', 'WORK QUEUE');
  const exited = new Promise<number>(done => terminal!.onExit(event => done(event.exitCode)));
  terminal.write('q'); assert.equal(await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('Exit timed out')), 8000))]), 0); terminal = undefined;
  assert(output.includes('\u001b[?1049h') && output.includes('\u001b[?1049l'));
  checks.push('Clean exit and alternate-screen restoration');
  assert.equal(await hash(), before, 'Project JSONL changed during read-only smoke run');
  checks.push('Project issues.jsonl unchanged');
  await mkdir('docs', {recursive:true});
  await writeFile('docs/real-project-smoke.json', JSON.stringify({project, checks}, null, 2));
  console.log(JSON.stringify({project, checks}, null, 2));
} finally {
  terminal?.kill(); session.dispose();
  await rm(config, {recursive:true,force:true,maxRetries:5,retryDelay:100});
}

// The native ConPTY host can retain Node handles after its child has exited.
// All assertions, reports, and temporary-directory cleanup are complete here.
process.exit(0);

