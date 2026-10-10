import {describe, expect, it} from 'vitest';
import * as pty from 'node-pty';
import {existsSync} from 'node:fs';
import {copyFile, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {delimiter, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {run} from '../src/process.js';
import {CliClient} from '../src/client.js';

const binary = process.env.BEES_BIN || resolve('../zig/bees/zig-out/bin', process.platform === 'win32' ? 'bees.exe' : 'bees');
const mise = (process.env.PATH || '').split(delimiter).map(path => join(path, process.platform === 'win32' ? 'mise.exe' : 'mise')).find(existsSync);
const standalone = resolve('release', process.platform === 'win32' ? 'bees-tui.exe' : 'bees-tui');
const binaryTest = process.env.BEES_TUI_TEST_BINARY === '1';
if (binaryTest && (!existsSync(standalone) || !existsSync(binary))) throw new Error('Binary tests require the compiled TUI and a real Bees executable.');
describe.skipIf(!existsSync(binary))('real terminal session', () => {
  for (const launch of binaryTest ? ['binary'] as const : ['direct', 'mise'] as const) it.skipIf(launch === 'mise' && !mise)(`${launch}: shows external CLI updates, resizes the graph, and restores the terminal on exit`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bees-tui-pty-'));
    let terminal: pty.IPty | undefined;
    try {
      await run(binary, ['init'], {cwd: directory}); const client = new CliClient(directory, binary);
      const id = (await client.mutate({kind: 'create', title: 'Original PTY title'}))!;
      await client.mutate({kind: 'create', title: 'Second read-only issue'});
      const jsonl = join(directory, '.bees/issues.jsonl');
      // Valid but deliberately noncanonical JSONL must survive viewing unchanged.
      const unusual = (await readFile(jsonl, 'utf8')).trim().split('\n').reverse().map(line =>
        '  { ' + Object.entries(JSON.parse(line)).reverse().map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(', ') + ' }  ').join('\r\n') + '\r\n';
      await writeFile(jsonl, unusual);
      const detached = join(directory, process.platform === 'win32' ? 'bees-tui.exe' : 'bees-tui');
      if (launch === 'binary') {
        await copyFile(standalone, detached);
        expect(await run(detached, ['--help'], {cwd: directory})).toContain('an interactive Bees workbench');
        expect(await run(detached, ['--project', directory, '--bees', binary], {cwd: directory})).toContain('Original PTY title');
        for (const flag of ['--preview', '--demo']) await expect(run(detached, [flag], {cwd: directory})).rejects.toThrow('Unknown option');
      }
      const args = ['--project', directory, '--bees', binary, '--config', join(directory, 'tui.json'), '--poll-ms', '500', '--ascii', '--no-motion'];
      terminal = pty.spawn(launch === 'binary' ? detached : launch === 'mise' ? mise! : process.execPath,
        launch === 'binary' ? args : launch === 'mise' ? ['run', 'start', '--', '--', ...args] : ['dist/cli.js', ...args],
        {name: 'xterm-256color', cols: 132, rows: 32, cwd: launch === 'binary' ? directory : process.cwd(), env: {...process.env, TERM: 'xterm-256color', CI: 'false', CONTINUOUS_INTEGRATION: 'false'} as Record<string, string>});
      let output = ''; const listeners: (() => void)[] = [];
      terminal.onData(data => {output += data; listeners.forEach(listener => listener());});
      const waitFor = (text: string) => new Promise<void>((resolveWait, reject) => {
        const check = () => {if (output.includes(text)) {clearTimeout(timeout); resolveWait();}};
        const timeout = setTimeout(() => reject(new Error(`Terminal did not show ${text}. Tail: ${output.slice(-1500)}`)), 9000); listeners.push(check); check();
      });
      await waitFor('Original PTY title');
      terminal.write('2'); await waitFor('h/l lanes');
      terminal.write('3'); await waitFor('RELATIONSHIP GRAPH');
      terminal.write('r'); await waitFor('Refreshed from Bees.');
      expect(await readFile(jsonl, 'utf8')).toBe(unusual);
      await run(binary, ['update', id, '--title', 'External PTY update'], {cwd: directory}); await waitFor('External PTY update');
      const afterEdit = await readFile(jsonl);
      // Graph is already active; do not coalesce a redundant tab key with g.
      terminal.resize(60, 24); terminal.write('g'); await waitFor('List view');
      const exited = new Promise<number>(done => terminal!.onExit(event => done(event.exitCode)));
      terminal.write('q'); expect(await exited).toBe(0);
      expect(await readFile(jsonl)).toEqual(afterEdit);
      expect(output).not.toContain('Refreshing');
      expect(output).toContain('\u001b[?1049h'); expect(output).toContain('\u001b[?1049l');
      terminal = undefined;
    } finally {terminal?.kill(); await rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});}
  }, 25000);
});
