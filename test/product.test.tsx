import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from 'ink-testing-library';
import {renderToString} from 'ink';
import {mkdtemp, mkdir, rm, writeFile, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import stringWidth from 'string-width';
import {testIssues} from './fixtures.js';
import {defaultPreferences, defaultProject, discoverProjects, findProject, loadPreferences, savePreferences} from '../src/preferences.js';
import {queryIssues, parseQuery, wouldCycle} from '../src/query.js';
import {graphNodes, RelationshipGraph} from '../src/graph.js';
import {editText} from '../src/editor.js';
import {LiveApp} from '../src/live.js';
import {Session} from '../src/session.js';
import type {BeesClient} from '../src/client.js';

afterEach(cleanup);
describe('preferences and project discovery', () => {
  it('round trips user preferences without writing into the project', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bees-tui-config-')); const path = join(dir, 'config.json');
    try {const prefs = defaultPreferences(); prefs.theme = 'paper'; prefs.projects['/project'] = defaultProject(); savePreferences(prefs, path); expect(loadPreferences(path).preferences).toEqual(prefs);
      await writeFile(path, 'invalid'); expect(loadPreferences(path).warning).toContain('retained'); expect(await readFile(path, 'utf8')).toBe('invalid');
    } finally {await rm(dir, {recursive: true, force: true});}
  });
  it('discovers bounded roots and finds projects from nested directories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bees-tui-discover-'));
    try {await mkdir(join(dir, 'project/.bees'), {recursive: true}); await mkdir(join(dir, 'project/src/deep'), {recursive: true}); await mkdir(join(dir, 'node_modules/ignored/.bees'), {recursive: true});
      expect(await discoverProjects([dir])).toEqual([await findProject(join(dir, 'project'))]); expect(await findProject(join(dir, 'project/src/deep'))).toBe(await findProject(join(dir, 'project')));
    } finally {await rm(dir, {recursive: true, force: true});}
  });
});
describe('search and editor', () => {
  it('accepts quoted queries, mine and multi-sort while rejecting typos', () => {
    expect(parseQuery('label:"two words"')).toEqual([{field: 'label', value: 'two words'}]); expect(() => parseQuery('stauts:open')).toThrow('Unknown');
    expect(queryIssues(testIssues(), 'all', 'assignee:me type:bug', [{field: 'title', descending: false}], 'you')[0]?.id).toBe('bees-45');
  });
  it('edits complete graphemes rather than breaking emoji or accents', () => {
    expect(editText('a👩‍💻é', 2, 'backspace')).toEqual({value: 'aé', cursor: 1});
    expect(editText('中文', 1, 'insert', '🐝')).toEqual({value: '中🐝文', cursor: 2});
  });
  it('detects multi-hop blocking cycles without treating family links as blocks', () => {
    expect(wouldCycle(testIssues(), 'bees-42', 'bees-47')).toBe(true); expect(wouldCycle(testIssues(), 'bees-40', 'bees-42')).toBe(false);
  });
});
describe('graph geometry', () => {
  it('deduplicates shared nodes and marks immediate cycles', () => {
    const issues = testIssues(); issues[1]!.dependents = [{id: 'bees-40', type: 'blocks'}]; issues[0]!.dependencies = [{id: 'bees-42', type: 'blocks'}]; issues[1]!.dependencies = [{id: 'bees-40', type: 'blocks'}];
    expect(graphNodes(issues[1]!, issues)).toHaveLength(1); expect(graphNodes(issues[1]!, issues)[0]?.cycle).toBe(true);
  });
  it.each([48, 80, 100, 132])('fits graph nodes at %i columns', width => {
    const issues = testIssues(); const frame = renderToString(<RelationshipGraph issue={issues[1]} issues={issues} cursor={1} width={width} height={20} ascii={false}/>, {columns: width});
    for (const line of frame.split('\n')) expect(stringWidth(line)).toBeLessThanOrEqual(width);
    expect(frame).toContain('bees-42'); expect(frame).toContain('bees-43'); expect(frame).toContain('bees-44');
  });
});

describe('live UI', () => {
  async function boot(width = 100, height = 30) {
    let issues = testIssues();
    const client: BeesClient = {project: '/test', list: async () => structuredClone(issues), ready: async () => new Set(['bees-42']), show: async id => structuredClone(issues.find(issue => issue.id === id)!), dependencies: async id => issues.find(issue => issue.id === id)!.dependencies,
      mutate: vi.fn(async command => {if (command.kind === 'update') issues = issues.map(issue => issue.id === command.id ? {...issue, ...command.patch} : issue); return undefined;})};
    const session = new Session(client, 0); const app = render(<LiveApp session={session} preferences={{...defaultPreferences(), motion: false}} width={width} height={height}/>);
    await vi.waitFor(() => {expect(session.getSnapshot().loading).toBe(false); expect(app.lastFrame()).toContain('WORK QUEUE');});
    return {...app, session, client, external: async () => {issues[1]!.title = 'External title'; await session.refresh();}, key: async (text: string) => {app.stdin.write(text); await new Promise<void>(resolve => setImmediate(resolve));}};
  }
  it('keeps shortcut letters in a failed creation draft and retries only on explicit submit', async () => {
    const app = await boot();
    vi.mocked(app.client.mutate).mockRejectedValueOnce(new Error('Save failed; draft kept.'));
    await app.key('n'); await vi.waitFor(() => expect(app.lastFrame()).toContain('NEW ISSUE'));
    await app.key('fix q x s n : keys'); await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Save failed; draft kept.'));
    expect(app.lastFrame()).toContain('fix q x s n : keys');
    expect(app.client.mutate).toHaveBeenCalledTimes(1);
    await app.key('\r'); await vi.waitFor(() => expect(app.lastFrame()).toContain('Saved.'));
    expect(app.client.mutate).toHaveBeenCalledTimes(2);
    expect(app.client.mutate).toHaveBeenLastCalledWith({kind: 'create', title: 'fix q x s n : keys'});
    app.session.dispose();
  });
  it('requires a discard choice for a changed draft and routes the palette to Board', async () => {
    const app = await boot();
    await app.key('n'); await vi.waitFor(() => expect(app.lastFrame()).toContain('NEW ISSUE'));
    await app.key('unsaved'); await app.key('\u001b');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('DISCARD UNSAVED CHANGES?'));
    await app.key('j'); await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('WORK QUEUE'));
    expect(app.client.mutate).not.toHaveBeenCalled();
    await app.key(':'); await vi.waitFor(() => expect(app.lastFrame()).toContain('WHAT WOULD YOU LIKE TO DO?'));
    await app.key('Show Board'); await app.key('\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('h/l lanes'));
    app.session.dispose();
  });
  it.each([[48, 18], [80, 24], [100, 30], [132, 32]])('keeps all live views within %i x %i', async (width, height) => {
    const app = await boot(width, height);
    for (const [key, text] of [['1', 'WORK QUEUE'], ['2', 'h/l lanes'], ['3', 'RELATIONSHIP GRAPH']]) {
      await app.key(key!); await vi.waitFor(() => expect(app.lastFrame()).toContain(text));
      const lines = app.lastFrame()!.split('\n');
      expect(lines.length).toBeLessThanOrEqual(height);
      for (const line of lines) expect(stringWidth(line)).toBeLessThanOrEqual(width);
      expect(app.lastFrame()).toContain('q quit');
    }
    app.session.dispose();
  });
  it('keeps an open draft during refresh and rejects overwriting a changed field', async () => {
    const app = await boot(); await app.key('e'); await vi.waitFor(() => expect(app.lastFrame()).toContain('EDIT ISSUE'));
    await app.key('\r'); await vi.waitFor(() => expect(app.lastFrame()).toContain('Enter save'));
    await app.key(' my draft'); await app.external(); expect(app.lastFrame()).toContain('my draft');
    await app.key('\r'); await vi.waitFor(() => expect(app.lastFrame()).toContain('changed outside'));
    expect(app.client.mutate).not.toHaveBeenCalled(); app.session.dispose();
  });
  it('navigates the graph and restores the preceding issue on Escape', async () => {
    const app = await boot(); await app.key('3'); await vi.waitFor(() => expect(app.lastFrame()).toContain('RELATIONSHIP GRAPH'));
    await app.key('l'); await vi.waitFor(() => expect(app.lastFrame()).toContain('bees-43  /  FEATURE'));
    await app.key('\u001b'); await vi.waitFor(() => expect(app.lastFrame()).toContain('bees-42  /  FEATURE')); app.session.dispose();
  });
});

