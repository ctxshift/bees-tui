import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {run} from './process.js';

export type JsonlChanges = {ids: Set<string>; available: boolean};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function records(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())) {
    const value = JSON.parse(line);
    if (!value || typeof value.id !== 'string' || result.has(value.id)) throw new Error('Invalid or duplicate JSONL issue ID');
    result.set(value.id, JSON.stringify(canonical(value)));
  }
  return result;
}
/** Compare records, not line positions: viewing never rewrites or normalizes the file. */
export function changedRecords(head: string, index: string, working: string): Set<string> {
  const versions = [records(head), records(index), records(working)];
  return new Set([...new Set(versions.flatMap(version => [...version.keys()]))].filter(id =>
    versions[0]!.get(id) !== versions[1]!.get(id) || versions[1]!.get(id) !== versions[2]!.get(id)));
}

/** Git plumbing reads only: no checkout, status refresh, add, sync or export. */
export async function jsonlChanges(project: string, signal?: AbortSignal): Promise<JsonlChanges> {
  const git = (...args: string[]) => run('git', ['--no-optional-locks', ...args], {cwd: project, signal, timeout: 4000});
  try {
    const prefix = (await git('rev-parse', '--show-prefix')).trim();
    const path = `${prefix}.bees/issues.jsonl`;
    const literal = `:(literal)${path}`;
    // Resolve from the repository root so nested projects and worktrees work too.
    const root = (await git('rev-parse', '--show-toplevel')).trim();
    const atRoot = (...args: string[]) => git('-C', root, ...args);
    const indexEntries = (await atRoot('ls-files', '--stage', '--', literal)).trim().split('\n').filter(Boolean);
    if (indexEntries.length > 1 || indexEntries.some(entry => !/^\d+ [a-f0-9]+ 0\t/.test(entry))) throw new Error('Unmerged JSONL');
    const indexId = indexEntries[0]?.split(' ')[1];
    let headId: string | undefined;
    // An unborn repository has no HEAD yet, and every working record is new.
    const refs = await atRoot('rev-parse', '--revs-only', '--verify', 'HEAD').catch(error => {
      if (/Needed a single revision|unknown revision|bad revision/i.test(String(error))) return '';
      throw error;
    });
    if (refs.trim()) headId = (await atRoot('ls-tree', refs.trim(), '--', literal)).trim().split(/\s+/)[2];
    const head = headId ? await atRoot('cat-file', 'blob', headId) : '';
    const index = indexId ? await atRoot('cat-file', 'blob', indexId) : '';
    const working = await readFile(join(project, '.bees', 'issues.jsonl'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    return {available: true, ids: changedRecords(head, index, working)};
  } catch {
    // Missing Git, non-repository projects, conflicts and partial external writes
    // are unknown, never falsely advertised as clean. Retry on the next poll.
    return {available: false, ids: new Set()};
  }
}
