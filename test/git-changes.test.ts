import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {changedRecords, jsonlChanges} from '../src/git-changes.js';
import {run} from '../src/process.js';

it('ignores record order, object key order, whitespace and line endings but detects field changes', () => {
  const head = '{"id":"a","title":"A"}\n{"id":"b","labels":["one"]}\n';
  const reordered = ' { "labels": ["one"], "id": "b" }\r\n{"title":"A","id":"a"}';
  expect([...changedRecords(head, head, reordered)]).toEqual([]);
  expect([...changedRecords(head, head, reordered.replace('"A"', '"Edited"'))]).toEqual(['a']);
  expect(() => changedRecords(head, head, '{broken')).toThrow();
  expect(() => changedRecords(head, head, head + head)).toThrow();
});

describe('read-only Git markers', () => {
  let root: string; let project: string; let path: string;
  const original = '{"id":"a","title":"A"}\n{"id":"b","title":"B"}\n';
  const git = (...args: string[]) => run('git', args, {cwd: root});
  const commit = () => git('-c', 'user.name=TUI Test', '-c', 'user.email=tui@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'bees-git-'));
    project = join(root, 'nested project'); path = join(project, '.bees/issues.jsonl');
    await mkdir(join(project, '.bees'), {recursive: true});
    await git('init'); await writeFile(path, original);
  });
  afterEach(async () => {await rm(root, {recursive: true, force: true, maxRetries: 4, retryDelay: 100});});
  it('marks untracked and staged records in an unborn repository', async () => {
    let changes = await jsonlChanges(project); expect(changes.available).toBe(true); expect([...changes.ids]).toEqual(['a', 'b']);
    await git('add', '.'); changes = await jsonlChanges(project);
    expect(changes.available).toBe(true); expect([...changes.ids]).toEqual(['a', 'b']);
  });
  it('includes staged and unstaged edits even when working content matches HEAD, and clears after commit', async () => {
    await git('add', '.'); await commit();
    expect([...(await jsonlChanges(project)).ids]).toEqual([]);
    await writeFile(path, original.replace('"A"', '"Staged"')); await git('add', '.');
    await writeFile(path, original); // staged change plus an unstaged reversal
    const indexBefore = await readFile(join(root, '.git/index'));
    const bytesBefore = await readFile(path);
    const changes = await jsonlChanges(project);
    expect(changes.available).toBe(true); expect([...changes.ids]).toEqual(['a']);
    expect(await readFile(path)).toEqual(bytesBefore);
    expect(await readFile(join(root, '.git/index'))).toEqual(indexBefore);
    await writeFile(path, original.replace('"A"', '"Staged"').replace('"B"', '"Unstaged"'));
    expect([...(await jsonlChanges(project)).ids].sort()).toEqual(['a', 'b']);
    await git('add', '.'); await commit();
    expect([...(await jsonlChanges(project)).ids]).toEqual([]);
  });
  it('handles a new JSONL file after HEAD, deleted records, malformed data and non-repositories', async () => {
    await writeFile(join(root, 'readme'), 'fixture'); await git('add', 'readme'); await commit();
    expect([...(await jsonlChanges(project)).ids]).toEqual(['a', 'b']);
    await git('add', '.'); await commit();
    await writeFile(path, '{"id":"a","title":"A"}\n');
    expect([...(await jsonlChanges(project)).ids]).toEqual(['b']);
    await writeFile(path, '{partial'); expect((await jsonlChanges(project)).available).toBe(false);
    expect((await jsonlChanges(tmpdir())).available).toBe(false);
  });
});
