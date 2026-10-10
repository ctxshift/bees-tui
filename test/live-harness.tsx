import {act} from 'react';
import {afterEach, beforeEach, expect, vi} from 'vitest';
import {cleanup, render} from 'ink-testing-library';
import {LiveApp} from '../src/live.js';
import {Session} from '../src/session.js';
import {CliClient, type BeesClient, type Mutation, type Snapshot} from '../src/client.js';
import {defaultPreferences, defaultProject, findProject, discoverProjects} from '../src/preferences.js';
import {copyText, externalEdit} from '../src/os.js';
import {testIssues} from './fixtures.js';

vi.mock('../src/os.js', () => ({copyText: vi.fn(async () => {}), externalEdit: vi.fn(async () => 'Edited externally')}));
vi.mock('../src/preferences.js', async original => ({...await original<typeof import('../src/preferences.js')>(),
  findProject: vi.fn(async (path: string) => path), discoverProjects: vi.fn(async () => ['/other'])}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
export const enter = '\r', esc = '\u001b', down = '\u001b[B', save = '\u0013';
export const until = (check: () => void) => vi.waitFor(check, {interval: 1, timeout: 1500});
beforeEach(() => vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']}));
afterEach(() => {act(() => cleanup()); vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers();});

export async function boot() {
  const issues = testIssues(); let revision = 0;
  const snapshot = async (): Promise<Snapshot> => ({revision: String(revision), unchanged: false,
    issues: structuredClone(issues).map(issue => ({...issue, ready: issue.status === 'open', dependenciesLoaded: true}))});
  const client: BeesClient = {project: '/test', snapshot: vi.fn(snapshot),
    list: vi.fn(async () => {throw new Error('Unexpected legacy read');}), ready: vi.fn(async () => new Set<string>()),
    dependencies: vi.fn(async () => []), show: vi.fn(async id => structuredClone(issues.find(issue => issue.id === id)!)),
    mutate: vi.fn(async (command: Mutation) => {
      revision++;
      if (command.kind === 'export') return;
      if (command.kind === 'create') {issues.push({...structuredClone(issues[0]!), id: 'new-1', title: command.title}); return 'new-1';}
      const issue = issues.find(issue => issue.id === command.id)!;
      switch (command.kind) {
        case 'update': Object.assign(issue, command.patch); break;
        case 'close': issue.status = 'closed'; issue.closeReason = command.reason; break;
        case 'comment': issue.comments.push({author: command.author, text: command.text}); break;
        case 'label': issue.labels = command.remove ? issue.labels.filter(label => label !== command.label) : [...issue.labels, command.label]; break;
        case 'dependency': issue.dependencies = command.remove ? issue.dependencies.filter(dep => dep.id !== command.target) : [...issue.dependencies, {id: command.target, type: command.relation}]; break;
      }
    })};
  const session = new Session(client, 0); const preferences = vi.fn();
  let app!: ReturnType<typeof render>; await act(async () => {app = render(<LiveApp session={session} width={80} height={24} onPreferences={preferences}
    preferences={{...defaultPreferences(), user: 'tester', motion: false, projects: {'/test': {...defaultProject(), filter: 'all', selected: 'bees-42'}}}}/>);});
  const see = async (text: string) => until(() => expect(app.lastFrame()).toContain(text));
  await see('WORK QUEUE'); await until(() => expect(session.getSnapshot().loading).toBe(false));
  const key = async (text: string) => {await act(async () => {app.stdin.write(text); await vi.advanceTimersByTimeAsync(text === esc ? 21 : 0);});};
  const pick = async (shortcut: string, text: string) => {await key(shortcut); await key(text); await key(enter);};
  return {...app, client, session, issues, key, see, pick, preferences, issue: () => issues.find(issue => issue.id === 'bees-42')!,
    saved: async () => {await see('Saved.'); await until(() => expect(session.getSnapshot().saving).toBe(false));}};
}
