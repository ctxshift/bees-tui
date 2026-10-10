import {afterEach, describe, expect, it, vi} from 'vitest';
import {Session} from '../src/session.js';
import type {BeesClient} from '../src/client.js';
import {testIssues} from './fixtures.js';
import {CommandError} from '../src/process.js';
import {layoutGraph} from '../src/graph-layout.js';
const sessions: Session[] = [];
afterEach(() => {sessions.splice(0).forEach(session => session.dispose());});
function fixture() {
  let issues = testIssues();
  const client: BeesClient = {
    project: '/test-project', list: vi.fn(async () => structuredClone(issues)), ready: vi.fn(async () => new Set(['bees-42'])),
    show: vi.fn(async id => structuredClone(issues.find(issue => issue.id === id)!)),
    dependencies: vi.fn(async id => structuredClone(issues.find(issue => issue.id === id)!.dependencies)),
    mutate: vi.fn(async command => {if (command.kind === 'update') issues = issues.map(issue => issue.id === command.id ? {...issue, ...command.patch} : issue); return undefined;}),
  };
  const session = new Session(client, 0); sessions.push(session);
  return {client, session, external: (title: string) => {issues[1]!.title = title;}, comments: () => {issues[1]!.comments.push({author: 'external', text: 'new comment'});}};
}
describe('live refresh and competing writers', () => {
  it('refreshes Git markers independently of issue edits and clears unknown status', async () => {
    const {session, client} = fixture();
    client.changes = vi.fn(async () => ({available: true, ids: new Set(['bees-42'])}));
    session.select('bees-42'); await session.refresh();
    expect(session.getSnapshot().issues.find(issue => issue.id === 'bees-42')?.modifiedInJsonl).toBe(true);
    vi.mocked(client.changes).mockResolvedValue({available: true, ids: new Set()});
    await session.refresh();
    expect(session.getSnapshot().issues.every(issue => issue.modifiedInJsonl === false)).toBe(true);
    vi.mocked(client.changes).mockResolvedValue({available: false, ids: new Set()});
    await session.refresh();
    expect(session.getSnapshot().gitAvailable).toBe(false);
    expect(session.getSnapshot().issues.every(issue => issue.modifiedInJsonl === undefined)).toBe(true);
    expect(session.getSnapshot().stale).toBe(false);
  });
  it('never publishes partial graph tracks when selection changes during hydration', async () => {
    const {session, client} = fixture();
    const issues = testIssues().slice(0, 3);
    issues.forEach((issue, index) => {
      issue.dependencies = index ? [{id: issues[index - 1]!.id, type: 'blocks'}] : [];
      issue.dependenciesLoaded = true;
    });
    vi.mocked(client.list).mockImplementation(async () => issues.map(issue => ({...structuredClone(issue), dependencies: [], dependenciesLoaded: false})));
    vi.mocked(client.show).mockImplementation(async id => structuredClone(issues.find(issue => issue.id === id)!));
    vi.mocked(client.dependencies).mockImplementation(async id => structuredClone(issues.find(issue => issue.id === id)!.dependencies));
    session.needGraph(true); await session.refresh();
    const tracks = () => layoutGraph(session.getSnapshot().issues).map(({issue, lane, node, connector}) => ({id: issue.id, lane, node, connector}));
    const original = tracks();
    const published: ReturnType<typeof tracks>[] = [];
    const unsubscribe = session.subscribe(() => {published.push(tracks());});
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>(resolve => {started = resolve;});
    vi.mocked(client.dependencies).mockImplementationOnce(async id => {
      started(); await new Promise<void>(resolve => {release = resolve;});
      return structuredClone(issues.find(issue => issue.id === id)!.dependencies);
    });
    const refresh = session.refresh(); await pending;
    session.select(issues[1]!.id); session.select(issues[2]!.id);
    release(); await refresh;
    unsubscribe();
    expect(session.getSnapshot().graphLoaded).toBe(true);
    expect(published.length).toBeGreaterThan(1);
    for (const graph of published) expect(graph).toEqual(original);
    // Genuine external edge changes must still rebuild the graph.
    issues[2]!.dependencies = [];
    await session.refresh();
    expect(tracks()).not.toEqual(original);
    const complete = session.getSnapshot().issues;
    vi.mocked(client.dependencies).mockRejectedValueOnce(new Error('relationship read failed'));
    await session.refresh();
    expect(session.getSnapshot().stale).toBe(true);
    expect(session.getSnapshot().issues).toBe(complete);
  });
  it('coalesces overlapping refreshes into one read', async () => {
    const {session, client} = fixture(); await Promise.all([session.refresh(), session.refresh(), session.refresh()]); expect(client.list).toHaveBeenCalledTimes(1);
  });
  it('refreshes changed content and comments without relying on timestamps', async () => {
    const {session, external, comments} = fixture(); session.select('bees-42'); await session.refresh(); external('Another agent edited the title'); comments(); await session.refresh();
    const item = session.getSnapshot().issues.find(issue => issue.id === 'bees-42')!; expect(item.title).toBe('Another agent edited the title'); expect(item.comments.at(-1)?.text).toBe('new comment');
  });
  it('keeps the last good state on a read failure', async () => {
    const {session, client} = fixture(); await session.refresh(); const snapshot = session.getSnapshot().issues;
    vi.mocked(client.list).mockRejectedValueOnce(new Error('busy')); await session.refresh(); expect(session.getSnapshot().issues).toBe(snapshot); expect(session.getSnapshot().stale).toBe(true);
    await session.refresh(); expect(session.getSnapshot().stale).toBe(false);
  });
  it('rejects stale field edits without changing the outside value', async () => {
    const {session, client, external} = fixture(); await session.refresh(); const base = session.getSnapshot().issues[1]!; external('External winner');
    await expect(session.mutate({kind: 'update', id: base.id, patch: {title: 'My draft'}}, base)).rejects.toThrow('changed outside'); expect(client.mutate).not.toHaveBeenCalled();
  });
  it('allows unrelated changes and undoes only the edited field', async () => {
    const {session, external} = fixture(); await session.refresh(); const base = session.getSnapshot().issues[1]!; external('External title');
    await session.mutate({kind: 'update', id: base.id, patch: {priority: 3}}, base); expect(session.getSnapshot().issues[1]!.title).toBe('External title');
    await session.undoLast(); expect(session.getSnapshot().issues[1]!.priority).toBe(1);
  });
  it('locks mutations after uncertain results until reviewed', async () => {
    const {session, client} = fixture(); await session.refresh(); vi.mocked(client.mutate).mockRejectedValueOnce(new CommandError('Unknown outcome', true));
    await expect(session.mutate({kind: 'create', title: 'one'})).rejects.toThrow(); expect(session.getSnapshot().uncertain).toBe(true);
    await expect(session.mutate({kind: 'create', title: 'again'})).rejects.toThrow('Inspect'); await session.allowEditsAfterReview(); expect(session.getSnapshot().uncertain).toBe(false); expect(client.mutate).toHaveBeenCalledTimes(1);
  });
  it('does not offer undo when another writer replaced our value before readback', async () => {
    const {session, client, external} = fixture(); await session.refresh(); const base = session.getSnapshot().issues[1]!;
    vi.mocked(client.mutate).mockImplementationOnce(async () => {external('External after-image'); return undefined;});
    await session.mutate({kind: 'update', id: base.id, patch: {title: 'My title'}}, base);
    expect(session.getSnapshot().canUndo).toBe(false);
    await expect(session.undoLast()).rejects.toThrow('No reversible');
    expect(session.getSnapshot().issues[1]!.title).toBe('External after-image');
  });
  it('does not retry success when the following refresh fails', async () => {
    const {session, client} = fixture(); await session.refresh(); vi.mocked(client.list).mockRejectedValueOnce(new Error('offline'));
    await session.mutate({kind: 'create', title: 'once'}); expect(session.getSnapshot().stale).toBe(true); expect(client.mutate).toHaveBeenCalledTimes(1);
  });
  it('discards a late response from a previous project', async () => {
    const {session, client} = fixture(); let resolve!: (value: ReturnType<typeof testIssues>) => void;
    vi.mocked(client.list).mockImplementationOnce(() => new Promise(done => {resolve = done;})); const first = session.refresh();
    await session.switchProject({...client, project: '/other', list: async () => []}); await session.refresh(); resolve(testIssues()); await first;
    expect(session.getSnapshot().project).toBe('/other'); expect(session.getSnapshot().issues).toEqual([]);
  });
});
