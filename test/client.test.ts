import {describe, expect, it, vi} from 'vitest';
import {CliClient, decodeIssue, decodeSnapshot, mutationArgs, validDate} from '../src/client.js';
import {CommandError} from '../src/process.js';
const row = {id: 'test-1', title: 'Hello', status: 'open', issue_type: 'task', priority: 2, labels: []};
describe('CLI boundary', () => {
  it('joins a complete snapshot and uses revision-based unchanged reads', async () => {
    const revision = 'a'.repeat(32);
    const data = {schema_version: 1, revision, unchanged: false, issues: [row, {...row, id: 'test-2'}],
      labels: [{issue_id: row.id, label: 'label'}], comments: [{issue_id: row.id, author: null, text: 'comment'}],
      dependencies: [{issue_id: row.id, depends_on_id: 'test-2', type: 'blocks'}], ready: ['test-2']};
    const runner = vi.fn().mockResolvedValueOnce(JSON.stringify(data)).mockResolvedValueOnce(JSON.stringify({schema_version: 1, revision, unchanged: true}));
    const client = new CliClient('/project', 'bees', runner);
    const snapshot = await client.snapshot();
    expect(snapshot.unchanged).toBe(false); if (snapshot.unchanged) throw new Error('Expected full snapshot');
    expect(snapshot.issues[0]).toMatchObject({revision, labels: ['label'], comments: [{author: '', text: 'comment'}], dependencies: [{id: 'test-2', type: 'blocks'}], ready: false, dependenciesLoaded: true});
    expect(snapshot.issues[1]).toMatchObject({ready: true, dependents: [{id: row.id, type: 'blocks'}]});
    expect(await client.snapshot(revision)).toEqual({revision, unchanged: true});
    expect(runner.mock.calls.map(call => call[1])).toEqual([['snapshot', '--json'], ['snapshot', '--since', revision, '--json']]);
    for (const invalid of [{...data, schema_version: 2}, {...data, issues: [row, row]}, {...data, dependencies: [{issue_id: 'missing', depends_on_id: row.id, type: 'blocks'}]}, {...data, comments: 'bad'}]) expect(() => decodeSnapshot(invalid)).toThrow();
  });
  it('accepts real calendar dates and explicit timezones, including field clearing', () => {
    for (const value of ['', '2028-02-29', '2026-10-09T09:30:00-05:00']) expect(validDate(value)).toBe(true);
    for (const value of ['2026-02-29', '2026-02-30', 'tomorrow', '2026-10-09T09:30:00']) {
      expect(validDate(value)).toBe(false);
      expect(() => mutationArgs({kind: 'update', id: 'test-1', patch: {due: value}})).toThrow('valid');
    }
  });
  it('decodes optional fields and preserves unfamiliar values', () => {
    const issue = decodeIssue({...row, status: 'custom', issue_type: 'custom', priority: 99, new_field: true});
    expect(issue.rawStatus).toBe('custom'); expect(issue.priority).toBe(99); expect(issue.type).toBe('custom'); expect(issue.description).toBe('');
  });
  it('rejects malformed fields rather than showing an empty project', () => {
    expect(() => decodeIssue({...row, priority: '2'})).toThrow('number'); expect(() => decodeIssue({...row, labels: 'bad'})).toThrow('array');
  });
  it('keeps metacharacters and option-looking text in literal argv values', () => {
    const title = '--help $(echo hacked) `test` & "quoted" 🐝';
    expect(mutationArgs({kind: 'create', title})).toEqual(['create', '--json', '--', title]);
  });
  it('validates priorities and routes closing through close', () => {
    expect(() => mutationArgs({kind: 'update', id: 'test-1', patch: {priority: 99}})).toThrow('1–4');
    expect(() => mutationArgs({kind: 'update', id: 'test-1', patch: {status: 'closed'}})).toThrow('Complete');
  });
  it('uses dedicated comments and endpoint-specific dependency shapes', async () => {
    const runner = vi.fn().mockResolvedValueOnce(JSON.stringify({...row, dependencies: [{...row, id: 'test-2', dependency_type: 'blocks'}]})).mockResolvedValueOnce(JSON.stringify([{author: null, text: 'Hello'}]));
    const issue = await new CliClient('/project', 'bees', runner).show('test-1');
    expect(issue.dependencies).toEqual([{id: 'test-2', type: 'blocks'}]); expect(issue.comments).toEqual([{author: '', text: 'Hello'}]);
    expect(runner.mock.calls[1]![1]).toEqual(['comment', 'list', 'test-1', '--json']);
  });
  it('does not retry a write after an ambiguous outcome', async () => {
    const runner = vi.fn().mockRejectedValue(new CommandError('Unknown outcome', true));
    await expect(new CliClient('/project', 'bees', runner).mutate({kind: 'create', title: 'One'})).rejects.toThrow('Unknown'); expect(runner).toHaveBeenCalledTimes(1);
  });
  it('treats malformed create output as uncertain', async () => {
    await expect(new CliClient('/project', 'bees', vi.fn().mockResolvedValue('broken')).mutate({kind: 'create', title: 'One'})).rejects.toMatchObject({uncertain: true});
  });
  it('rejects malformed read JSON', async () => {
    await expect(new CliClient('/project', 'bees', vi.fn().mockResolvedValue('broken')).list()).rejects.toThrow('invalid JSON');
  });
});
