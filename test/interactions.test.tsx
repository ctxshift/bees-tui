import {act} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {boot, until, enter, esc, down, save} from './live-harness.js';
import {CliClient} from '../src/client.js';
import {copyText, externalEdit} from '../src/os.js';
import {findProject, discoverProjects} from '../src/preferences.js';

describe('live keyboard mutations', () => {
  it.each([
    ['Title', 'title', false], ['Description', 'description', true], ['Design notes', 'design', true],
    ['Acceptance criteria', 'acceptance', true], ['Working notes', 'notes', true], ['Assignee', 'assignee', false],
    ['Owner', 'owner', false], ['External reference', 'externalRef', false], ['Due date', 'due', false], ['Defer until', 'defer', false],
  ] as const)('edits %s through the field picker', async (label, field, multiline) => {
    const app = await boot(); const original = String(app.issue()[field] ?? '');
    await app.pick('e', label); await app.see(label);
    const value = field === 'due' || field === 'defer' ? '2027-01-02' : 'Updated 🐝';
    await app.key(value); await app.key(multiline ? save : enter); await app.saved();
    expect(app.issue()[field]).toBe(original + value);
    expect(app.client.mutate).toHaveBeenCalledTimes(1);
  });
  it.each([['p', 'SET PRIORITY', {priority: 2}], ['t', 'ISSUE TYPE', {type: 'bug'}], ['s', 'MOVE ISSUE', {status: 'in_progress'}]] as const)
  ('changes %s with keyboard selection', async (shortcut, title, patch) => {
    const app = await boot(); await app.key(shortcut); await app.see(title); await app.key(down); await app.key(enter); await app.saved();
    expect(app.issue()).toMatchObject(patch);
  });
  it('creates, selects and completes an issue with a close reason', async () => {
    const app = await boot(); await app.key('n'); await app.key('New issue'); await app.key(enter); await app.saved();
    await app.key('x'); await app.see('COMPLETE new-1'); await app.key('Delivered'); await app.key(enter);
    await until(() => expect(app.issues.find(issue => issue.id === 'new-1')).toMatchObject({status: 'closed', closeReason: 'Delivered'}));
  });
  it('assigns to me and undoes the persisted change', async () => {
    const app = await boot(); await app.key('a'); await app.saved(); expect(app.issue().assignee).toBe('tester');
    await app.key('u'); await app.see('Change restored.'); expect(app.issue().assignee).toBe('you');
  });
  it('submits multiline comments without consuming shortcut letters', async () => {
    const app = await boot(); await app.key('c'); await app.key('qxs'); await app.key(enter); await app.key('second line');
    expect(app.client.mutate).not.toHaveBeenCalled(); await app.key(save); await app.saved();
    expect(app.issue().comments.at(-1)).toEqual({author: 'tester', text: 'qxs\nsecond line'});
  });
  it('adds and removes a label', async () => {
    const app = await boot(); await app.pick('l', '+ Add'); await app.key('fresh-label'); await app.key(enter); await app.saved();
    expect(app.issue().labels).toContain('fresh-label'); await app.pick('l', 'fresh-label');
    await until(() => expect(app.issue().labels).not.toContain('fresh-label'));
  });
  it.each([['blocks', 0], ['parent-child', 1], ['related', 2]] as const)('adds and removes a %s relationship', async (relation, index) => {
    const app = await boot(); await app.key('d'); for (let i = 0; i < index; i++) await app.key(down);
    await app.key(enter); await app.key('bees-46'); await app.key(enter); await app.saved();
    expect(app.issue().dependencies).toContainEqual({id: 'bees-46', type: relation});
    await app.key('d'); for (let i = 0; i < 4; i++) await app.key(down); await app.key(enter);
    await until(() => expect(app.issue().dependencies).not.toContainEqual({id: 'bees-46', type: relation}));
  });
  it('rejects a blocking cycle without issuing a write', async () => {
    const app = await boot(); await app.key('d'); await app.key(enter); await app.key('bees-47'); await app.key(enter);
    await app.see('would create a blocking cycle'); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('keeps a failed draft and prevents duplicate submits during a pending write', async () => {
    const app = await boot(); let reject!: (error: Error) => void;
    vi.mocked(app.client.mutate).mockImplementationOnce(() => new Promise((_, no) => {reject = no;}));
    await app.key('n'); await app.key('Keep this draft'); await app.key(enter);
    await until(() => expect(app.client.mutate).toHaveBeenCalledTimes(1)); await app.key(enter); await app.key('x');
    expect(app.client.mutate).toHaveBeenCalledTimes(1); await act(async () => reject(new Error('Write failed')));
    await app.see('Write failed'); await app.see('Keep this draft');
  });
  it('rejects invalid dates before writing', async () => {
    const app = await boot(); await app.pick('e', 'Due date'); await app.key('tomorrow'); await app.key(enter);
    await app.see('Use YYYY-MM-DD'); expect(app.client.mutate).not.toHaveBeenCalled();
  });
  it('imports an external editor draft and saves only on Ctrl+S', async () => {
    const app = await boot(); await app.pick('e', 'Description'); await app.key('\u0005'); await app.see('Edited externally');
    expect(externalEdit).toHaveBeenCalledTimes(1); expect(app.client.mutate).not.toHaveBeenCalled();
    await app.key(save); await app.saved(); expect(app.issue().description).toBe('Edited externally');
  });
});
