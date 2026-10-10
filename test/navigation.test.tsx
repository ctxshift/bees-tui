import {act} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {boot, until, enter, esc, down, save} from './live-harness.js';
import {CliClient} from '../src/client.js';
import {copyText, externalEdit} from '../src/os.js';
import {findProject, discoverProjects} from '../src/preferences.js';

describe('read-only workflows', () => {
  it('searches, validates queries, clears search and copies the selected ID', async () => {
    const app = await boot(); await app.pick('/', 'id:bees-46'); await app.key('y'); await app.see('Copied bees-46');
    expect(copyText).toHaveBeenCalledWith('bees-46'); await app.key(esc);
    await app.pick('/', 'stauts:open'); await app.see('Unknown'); await app.key(esc); await app.key(down); await app.key(enter);
    expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it.each(['Ready to start', 'Not closed', 'Blocked', 'Everything', 'Epics', 'Mine'])('opens the %s saved view without writes', async name => {
    const app = await boot(); await app.pick('f', name); await app.see('WORK QUEUE'); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('saves and deletes a custom view', async () => {
    const app = await boot(); await app.pick('f', '+ Save'); await app.key('My view'); await app.key(enter);
    await until(() => expect(app.preferences).toHaveBeenCalledWith(expect.objectContaining({savedViews: [{name: 'My view', filter: 'all', query: ''}]})));
    await app.pick('f', 'Delete saved view: My view');
    await until(() => expect(app.preferences).toHaveBeenLastCalledWith(expect.objectContaining({savedViews: []})));
  });
  it.each([0, 1, 2, 3, 4])('changes preference option %i without writing issues', async index => {
    const app = await boot(); await app.key(','); for (let i = 0; i < index; i++) await app.key(down); await app.key(enter);
    const expected = index < 3 ? {theme: ['honey', 'paper', 'terminal'][index]} : index === 3 ? {motion: true} : {ascii: true};
    await until(() => expect(app.preferences).toHaveBeenCalledWith(expect.objectContaining(expected))); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('navigates all views, inspection, graph modes, help and refresh without mutations', async () => {
    const app = await boot(); const before = structuredClone(app.issues);
    for (const key of ['j', 'k', '2', 'l', 'h', 'z', '3', 'j', 'k', 'g', 'v', 'l', esc, enter, ']', '[', '\u001b[6~', '\u001b[5~', esc, '1']) await app.key(key);
    await app.key('?'); await app.see('KEYBOARD GUIDE'); await app.key(esc); await app.key('r'); await app.see('Refreshed from Bees.');
    expect(app.client.mutate).not.toHaveBeenCalled(); expect(app.issues).toEqual(before);
  });
  it('protects required columns and allows changing sorting', async () => {
    const app = await boot(); await app.pick(':', 'Table columns'); await app.key(down); await app.key(enter);
    await app.see('ID and title stay visible'); await app.key(esc); await app.pick(':', 'Sorting'); await app.key(enter);
    await app.see('WORK QUEUE'); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('opens a project through discovery using the real session switch', async () => {
    const app = await boot(); vi.spyOn(CliClient.prototype, 'snapshot').mockResolvedValue({revision: 'other', unchanged: false, issues: []});
    vi.spyOn(CliClient.prototype, 'changes').mockResolvedValue({available: false, ids: new Set()});
    await app.pick('P', 'Discover'); await app.see('DISCOVERED PROJECTS'); await app.key(enter);
    await until(() => expect(app.session.getSnapshot().project).toBe('/other'));
    expect(discoverProjects).toHaveBeenCalled(); expect(findProject).toHaveBeenCalledWith('/other'); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('exports only after an explicit export command', async () => {
    const app = await boot(); await app.pick(':', 'Export issues'); await app.see('JSONL exported.');
    expect(app.client.mutate).toHaveBeenCalledExactlyOnceWith({kind: 'export'});
  });
});





describe('configuration and recovery', () => {
  it.each([[5, 'Your name', 'user', 'Another user'], [6, 'editor executable', 'editor', 'my-editor']])('edits %s preference', async (index, _label, field, text) => {
    const app = await boot(); await app.key(','); for (let i = 0; i < Number(index); i++) await app.key(down); await app.key(enter); await app.key(String(text)); await app.key(enter);
    const value = field === 'user' ? 'tester' + text : text;
    await until(() => expect(app.preferences).toHaveBeenCalledWith(expect.objectContaining({[field]: value}))); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('validates external editor arguments and retains the draft', async () => {
    const app = await boot(); await app.key(','); for (let i = 0; i < 7; i++) await app.key(down); await app.key(enter);
    await app.key('bad'); await app.key(enter); await app.see('[]bad');
    expect(app.preferences.mock.calls.some(([prefs]) => prefs.editorArgs.includes('bad'))).toBe(false);
    expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('persists optional columns and sorting after navigation', async () => {
    const app = await boot(); await app.pick(':', 'Table columns'); for (let i = 0; i < 4; i++) await app.key(down); await app.key(enter);
    await app.pick(':', 'Sorting'); await app.key(enter); await act(async () => {await vi.advanceTimersByTimeAsync(201);});
    expect(app.preferences).toHaveBeenLastCalledWith(expect.objectContaining({projects: expect.objectContaining({'/test': expect.objectContaining({columns: ['priority', 'id', 'title', 'assignee', 'status'], sort: [{field: 'priority', descending: true}]})})}));
  });
  it('records a discovery root without changing issues', async () => {
    const app = await boot(); await app.pick('P', 'Add a discovery root'); await app.key('/workspace'); await app.key(enter);
    expect(app.preferences).toHaveBeenCalledWith(expect.objectContaining({roots: ['/workspace']})); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('shows project lookup failures without leaving the current project', async () => {
    const app = await boot(); vi.mocked(findProject).mockRejectedValueOnce(new Error('No Bees project'));
    await app.pick('P', 'Open a project path'); await app.key('/missing'); await app.key(enter); await app.see('No Bees project');
    expect(app.session.getSnapshot().project).toBe('/test'); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('retains last known issues on refresh failure and recovers on retry', async () => {
    const app = await boot(); vi.mocked(app.client.snapshot!).mockRejectedValueOnce(new Error('Disconnected'));
    await app.key('r'); await app.see('STALE'); expect(app.lastFrame()).toContain('Land the command');
    await app.key('r'); await until(() => expect(app.session.getSnapshot().stale).toBe(false)); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('reports clipboard errors without changing issues', async () => {
    const app = await boot(); vi.mocked(copyText).mockRejectedValueOnce(new Error('Clipboard unavailable'));
    await app.key('y'); await app.see('Clipboard unavailable'); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('moves selection with arrows and between Board lanes', async () => {
    const app = await boot(); const select = vi.spyOn(app.session, 'select'); await app.key(down); expect(select.mock.lastCall?.[0]).not.toBe('bees-42');
    await app.key('\u001b[A'); expect(select.mock.lastCall?.[0]).toBe('bees-42');
    await app.key('2'); await app.key('l');
    expect(app.issues.find(issue => issue.id === select.mock.lastCall?.[0])?.status).toBe('in_progress');
    await app.key('h'); expect(app.issues.find(issue => issue.id === select.mock.lastCall?.[0])?.status).toBe('open');
    expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('quits without modifying issues', async () => {
    const app = await boot(); const dispose = vi.spyOn(app.session, 'dispose'); await app.key('q');
    expect(dispose).toHaveBeenCalled(); expect(app.client.mutate).not.toHaveBeenCalled();
  });
});
