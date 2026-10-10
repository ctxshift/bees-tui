import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest';
import {existsSync} from 'node:fs';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {CliClient, type Mutation} from '../src/client.js';
import {run} from '../src/process.js';
import {Session} from '../src/session.js';
import {layoutGraph} from '../src/graph-layout.js';

const binary = process.env.BEES_BIN || resolve('../zig/bees/zig-out/bin', process.platform === 'win32' ? 'bees.exe' : 'bees');
describe.skipIf(!existsSync(binary))('real Bees CLI contract', () => {
  let directory: string; let client: CliClient; let session: Session | undefined;
  beforeEach(async () => {directory = await mkdtemp(join(tmpdir(), 'bees tui 契約-')); await run(binary, ['init'], {cwd: directory}); client = new CliClient(directory, binary);});
  afterEach(async () => {session?.dispose(); session = undefined; await rm(directory, {recursive: true, force: true, maxRetries: 4, retryDelay: 100});});
  it('preserves exact JSONL bytes during reads, navigation, refresh and fresh-clone hydration', async () => {
    const a = (await client.mutate({kind: 'create', title: 'First'}))!;
    const b = (await client.mutate({kind: 'create', title: 'Second'}))!;
    await client.mutate({kind: 'dependency', id: a, target: b, relation: 'blocks', remove: false});
    const path = join(directory, '.bees/issues.jsonl');
    const unusual = (await readFile(path, 'utf8')).trim().split('\n').reverse().map(line =>
      ' { ' + Object.entries(JSON.parse(line)).reverse().map(([key, value]) => `${JSON.stringify(key)} : ${JSON.stringify(value)}`).join(', ') + ' } ').join('\r\n') + '\r\n';
    await writeFile(path, unusual);
    session = new Session(client, 0); session.needGraph(true); await session.refresh();
    session.select(a); await session.refresh(); session.select(b); await session.refresh();
    expect(await readFile(path, 'utf8')).toBe(unusual);
    const clone = join(directory, 'fresh-clone');
    await mkdir(join(clone, '.bees'), {recursive: true});
    const clonePath = join(clone, '.bees/issues.jsonl');
    await writeFile(clonePath, unusual);
    await writeFile(join(clone, '.bees/config.json'), await readFile(join(directory, '.bees/config.json')));
    await session.switchProject(new CliClient(clone, binary)); await session.refresh();
    expect(session.getSnapshot().issues).toHaveLength(2);
    session.needGraph(true); session.select(a); await session.refresh();
    expect(session.getSnapshot().stale).toBe(false);
    expect(await readFile(clonePath, 'utf8')).toBe(unusual);
  }, 15000);
  it('keeps real graph rails stable while navigating during CLI reads', async () => {
    const ids: string[] = [];
    for (const title of ['Root', 'Branch A', 'Branch B', 'Merge']) ids.push((await client.mutate({kind: 'create', title}))!);
    for (const [child, parent] of [[1, 0], [2, 0], [3, 1], [3, 2]]) {
      await client.mutate({kind: 'dependency', id: ids[child!]!, target: ids[parent!]!, relation: 'blocks', remove: false});
    }
    session = new Session(client, 0); session.needGraph(true); await session.refresh();
    const tracks = () => layoutGraph(session!.getSnapshot().issues).map(({issue, lane, node, connector}) => ({id: issue.id, lane, node, connector}));
    const baseline = tracks();
    const published: ReturnType<typeof tracks>[] = [];
    const unsubscribe = session.subscribe(() => {published.push(tracks());});
    const read = client.dependencies.bind(client);
    let cursor = 0;
    const navigating = vi.spyOn(client, 'dependencies').mockImplementation(async (id, signal) => {
      session!.select(ids[++cursor % ids.length]!);
      return read(id, signal);
    });
    await session.refresh();
    navigating.mockRestore(); unsubscribe();
    expect(cursor).toBeGreaterThan(1);
    expect(session.getSnapshot().graphLoaded).toBe(true);
    for (const graph of published) expect(graph).toEqual(baseline);
  });
  it('round-trips Unicode, quotes, newlines, and option-looking titles literally', async () => {
    const title = '--help 🐝 中文 $(echo dangerous) & "quotes"';
    const id = (await client.mutate({kind: 'create', title}))!;
    await client.mutate({kind: 'update', id, patch: {description: 'First\n\n# Second 🐝', design: 'Design', acceptance: '- [ ] done', notes: 'Notes', owner: 'owner', externalRef: 'https://example.com', due: '2026-12-01', defer: '2026-11-01'}});
    const issue = await client.show(id);
    expect(issue.title).toBe(title); expect(issue.description).toBe('First\n\n# Second 🐝'); expect(issue.notes).toBe('Notes'); expect(issue.owner).toBe('owner'); expect(issue.due).toBe('2026-12-01');
  });
  it('supports clearable text fields, labels, comments and explicit export', async () => {
    const id = (await client.mutate({kind: 'create', title: 'Fields'}))!;
    await client.mutate({kind: 'update', id, patch: {assignee: 'you', description: 'Content', due: '2026-12-01'}});
    await client.mutate({kind: 'update', id, patch: {assignee: '', description: '', due: ''}});
    await client.mutate({kind: 'label', id, label: '--literal label', remove: false});
    await client.mutate({kind: 'comment', id, author: 'human', text: '--literal\nA second line'});
    let issue = await client.show(id); expect(issue.assignee).toBe(''); expect(issue.description).toBe(''); expect(issue.due).toBe('');
    expect(issue.labels).toEqual(['--literal label']); expect(issue.comments[0]?.text).toBe('--literal\nA second line');
    await client.mutate({kind: 'label', id, label: '--literal label', remove: true}); issue = await client.show(id); expect(issue.labels).toEqual([]);
    await client.mutate({kind: 'export'}); expect(await readFile(join(directory, '.bees/issues.jsonl'), 'utf8')).toContain(id);
  });
  it('tracks dependency direction, readiness, close reason and removing edges', async () => {
    const a = (await client.mutate({kind: 'create', title: 'Dependent'}))!;
    const b = (await client.mutate({kind: 'create', title: 'Blocker'}))!;
    await client.mutate({kind: 'dependency', id: a, target: b, relation: 'blocks', remove: false});
    expect((await client.ready()).has(a)).toBe(false); expect((await client.show(b)).dependents).toEqual([{id: a, type: 'blocks'}]);
    await client.mutate({kind: 'close', id: b, reason: 'Done by another agent'});
    expect((await client.ready()).has(a)).toBe(true); expect((await client.show(b)).closeReason).toBe('Done by another agent');
    await client.mutate({kind: 'dependency', id: a, target: b, relation: 'blocks', remove: true}); expect(await client.dependencies(a)).toEqual([]);
  });
  it('converges automatically after an independent CLI writer changes title, labels, comments and relationships', async () => {
    const id = (await client.mutate({kind: 'create', title: 'Original'}))!;
    const target = (await client.mutate({kind: 'create', title: 'Target'}))!;
    session = new Session(client, 500); session.select(id); session.needGraph(true); session.start();
    await vi.waitFor(() => expect(session!.getSnapshot().issues.some(issue => issue.id === id)).toBe(true), {timeout: 6000});
    // Each call starts a separate process, just like an agent or a human in another shell.
    await run(binary, ['update', id, '--title', 'External title', '--json'], {cwd: directory});
    await run(binary, ['label', 'add', id, 'external'], {cwd: directory});
    await run(binary, ['comment', 'add', id, 'External comment', '--author', 'agent', '--json'], {cwd: directory});
    await run(binary, ['dep', 'add', id, target, '--type', 'blocks'], {cwd: directory});
    await vi.waitFor(() => {
      const issue = session!.getSnapshot().issues.find(item => item.id === id)!;
      expect(issue.title).toBe('External title'); expect(issue.labels).toContain('external');
      expect(issue.comments.some(comment => comment.text === 'External comment')).toBe(true);
      expect(issue.dependencies).toContainEqual({id: target, type: 'blocks'}); expect(issue.ready).toBe(false);
    }, {timeout: 7000});
  }, 15000);
  it('refuses to overwrite a real external edit and permits a nonconflicting field change', async () => {
    const id = (await client.mutate({kind: 'create', title: 'Original'}))!;
    session = new Session(client, 0); await session.refresh(); const base = (await client.show(id));
    await run(binary, ['update', id, '--title', 'External winner'], {cwd: directory});
    await expect(session.mutate({kind: 'update', id, patch: {title: 'Stale draft'}}, base)).rejects.toThrow('changed outside');
    await session.mutate({kind: 'update', id, patch: {priority: 3}}, base);
    expect((await client.show(id)).title).toBe('External winner'); expect((await client.show(id)).priority).toBe(3);
  });
  it('allows exactly one simultaneous conditional writer, with no partial losing fields', async () => {
    const id = (await client.mutate({kind: 'create', title: 'Before'}))!;
    const expectedRevision = (await client.show(id)).revision!;
    expect(expectedRevision).toMatch(/^[a-f0-9]{32}$/);
    expect((await client.show(id)).revision).toBe(expectedRevision);
    const results = await Promise.allSettled([
      client.mutate({kind: 'update', id, patch: {title: 'A', priority: 1}, expectedRevision}),
      client.mutate({kind: 'update', id, patch: {title: 'B', priority: 4}, expectedRevision}),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(String(failure.reason)).toContain('BEES_CONFLICT');
    const after = await client.show(id);
    expect(after.priority).toBe(after.title === 'A' ? 1 : 4);
    expect(after.revision).not.toBe(expectedRevision);
  });
  it('guards labels, dependencies, comments, and completion and invalidates their tokens', async () => {
    const id = (await client.mutate({kind: 'create', title: 'Guarded'}))!;
    const target = (await client.mutate({kind: 'create', title: 'Target'}))!;
    const commands: Mutation[] = [
      {kind:'label', id, label:'--literal', remove:false},
      {kind:'label', id, label:'--literal', remove:true},
      {kind:'dependency', id, target, relation:'blocks', remove:false},
      {kind:'dependency', id, target, relation:'blocks', remove:true},
      {kind:'comment', id, author:'test', text:'--literal comment'},
      {kind:'close', id, reason:'Verified'},
    ];
    for (const command of commands) {
      const expectedRevision = (await client.show(id)).revision!;
      await client.mutate({...command, expectedRevision});
      const next = (await client.show(id)).revision;
      expect(next).not.toBe(expectedRevision);
      await expect(client.mutate({...command, expectedRevision})).rejects.toThrow('BEES_CONFLICT');
      expect((await client.show(id)).revision).toBe(next);
    }
    expect((await client.show(id)).comments).toHaveLength(1);
  }, 20000);
  it('rejects the writer inserted between the TUI preflight read and actual save', async () => {
    const id = (await client.mutate({kind:'create', title:'Before'}))!;
    let inject = true;
    const racing = new CliClient(directory, binary, async (exe, args, options) => {
      if (options.mutation && inject) {inject = false; await run(binary, ['update', id, '--title', 'External winner'], {cwd:directory});}
      return run(exe, args, options);
    });
    session = new Session(racing, 0); const base = await racing.show(id);
    await expect(session.mutate({kind:'update', id, patch:{title:'TUI draft'}}, base)).rejects.toThrow('during save');
    expect((await client.show(id)).title).toBe('External winner');
    expect(session.getSnapshot().uncertain).toBe(false);
  });
});
