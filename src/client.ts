import {run, type Runner, CommandError} from './process.js';
import {statuses, type Issue, type Relation, type Status} from './model.js';
import {jsonlChanges, type JsonlChanges} from './git-changes.js';

export type Patch = Partial<Pick<Issue, 'title' | 'description' | 'status' | 'priority' | 'type' | 'assignee' | 'owner' | 'design' | 'acceptance' | 'notes' | 'due' | 'defer' | 'externalRef'>>;
export type Mutation = ({kind: 'create'; title: string} | {kind: 'update'; id: string; patch: Patch} |
  {kind: 'close'; id: string; reason: string} | {kind: 'comment'; id: string; text: string; author: string} |
  {kind: 'label'; id: string; label: string; remove: boolean} |
  {kind: 'dependency'; id: string; target: string; relation: Relation['type']; remove: boolean} | {kind: 'export'}) & {expectedRevision?: string};
export interface BeesClient {
  readonly project: string;
  list(signal?: AbortSignal): Promise<Issue[]>;
  ready(signal?: AbortSignal): Promise<Set<string>>;
  show(id: string, signal?: AbortSignal): Promise<Issue>;
  dependencies(id: string, signal?: AbortSignal): Promise<Relation[]>;
  changes?(signal?: AbortSignal): Promise<JsonlChanges>;
  mutate(command: Mutation): Promise<string | undefined>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Bees JSON: expected an object.');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {if (!Array.isArray(value)) throw new Error('Invalid Bees JSON: expected an array.'); return value;}
function string(value: unknown, optional = false): string {
  if (optional && value == null) return '';
  if (typeof value !== 'string') throw new Error('Invalid Bees JSON: expected text.'); return value;
}
function number(value: unknown): number {if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid Bees JSON: expected a number.'); return value;}
function relation(value: unknown, hydrated = false): Relation {
  const entry = object(value);
  const type = string(entry[hydrated ? 'dependency_type' : 'type']);
  if (!['blocks', 'related', 'parent-child'].includes(type)) throw new Error(`Unsupported Bees relationship: ${type}`);
  return {id: string(entry.id), type: type as Relation['type']};
}
export function decodeIssue(value: unknown): Issue {
  const row = object(value);
  const rawStatus = string(row.status);
  const known = (statuses as readonly string[]).includes(rawStatus);
  return {id: string(row.id), revision: row.revision === undefined ? undefined : string(row.revision), title: string(row.title), status: known ? rawStatus as Status : 'deferred',
    rawStatus: known ? undefined : rawStatus, priority: number(row.priority), type: string(row.issue_type),
    description: string(row.description, true), assignee: string(row.assignee, true), owner: string(row.owner, true),
    design: string(row.design, true), acceptance: string(row.acceptance_criteria, true), notes: string(row.notes, true),
    due: string(row.due_at, true), defer: string(row.defer_until, true), externalRef: string(row.external_ref, true),
    createdAt: string(row.created_at, true), updatedAt: string(row.updated_at, true), closedAt: string(row.closed_at, true), closeReason: string(row.close_reason, true),
    labels: array(row.labels ?? []).map(value => string(value)), comments: [],
    dependencies: array(row.dependencies ?? []).map(value => relation(value, true)),
    dependents: row.dependents === undefined ? undefined : array(row.dependents).map(value => relation(value, true)),
    dependenciesLoaded: row.dependencies !== undefined || row.dependency_count === 0,
    dependencyCount: row.dependency_count === undefined ? undefined : number(row.dependency_count),
  };
}

const flags: Record<keyof Patch, string> = {title: '--title', description: '--description', status: '--status', priority: '--priority',
  type: '--type', assignee: '--assignee', owner: '--owner', design: '--design', acceptance: '--acceptance', notes: '--notes',
  due: '--due', defer: '--defer', externalRef: '--external-ref'};

export function validDate(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || Number.isNaN(Date.parse(value))) return false;
  const day = value.slice(0, 10);
  return new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
}

export function mutationArgs(command: Mutation): string[] {
  const args = unguardedArgs(command);
  if (command.expectedRevision) {
    if (!/^[a-f0-9]{32}$/.test(command.expectedRevision)) throw new Error('Invalid Bees revision token.');
    // Insert before positional text protected by -- (comments and labels).
    const separator = args.indexOf('--');
    args.splice(separator < 0 ? args.length : separator, 0, '--if-revision', command.expectedRevision);
  }
  return args;
}
function unguardedArgs(command: Mutation): string[] {
  if (command.kind === 'create') {if (!command.title.trim()) throw new Error('A title is required.'); return ['create', '--json', '--', command.title];}
  if (command.kind === 'export') return ['sync'];
  if (!command.id || command.id.startsWith('-')) throw new Error('Invalid issue ID.');
  switch (command.kind) {
    case 'update': {
      const args = ['update', command.id, '--json'];
      for (const [key, value] of Object.entries(command.patch)) {
        if (!(key in flags) || value === undefined) throw new Error('Unsupported field.');
        if (key === 'priority' && (![1, 2, 3, 4].includes(Number(value)) || !Number.isInteger(value))) throw new Error('Priority must be 1–4.');
        if (key === 'status' && (!(statuses as readonly string[]).includes(String(value)) || value === 'closed')) throw new Error('Use Complete for closing an issue.');
        if (key === 'title' && !String(value).trim()) throw new Error('A title is required.');
        if ((key === 'due' || key === 'defer') && !validDate(String(value))) throw new Error('Use a valid YYYY-MM-DD date or ISO timestamp with an explicit timezone.');
        args.push(flags[key as keyof Patch], String(value));
      }
      return args;
    }
    case 'close': return ['close', command.id, '--reason', command.reason, '--json'];
    case 'comment': if (!command.text.trim()) throw new Error('A comment is required.'); return ['comment', 'add', command.id, '--author', command.author, '--json', '--', command.text];
    case 'label': if (!command.label.trim()) throw new Error('A label is required.'); return ['label', command.remove ? 'remove' : 'add', command.id, '--', command.label];
    case 'dependency':
      if (!command.target || command.target.startsWith('-') || command.id === command.target) throw new Error('Choose a different issue.');
      return ['dep', command.remove ? 'remove' : 'add', command.id, command.target, ...(command.remove ? [] : ['--type', command.relation])];
  }
}

export class CliClient implements BeesClient {
  constructor(readonly project: string, readonly executable: string, private runner: Runner = run) {}
  changes(signal?: AbortSignal) {return jsonlChanges(this.project, signal);}
  private async json(args: string[], signal?: AbortSignal): Promise<unknown> {
    // Reads may race another CLI's schema setup; retry only a recognized busy/locked read.
    for (let attempt = 0; ; attempt++) {
      let output: string;
      try {output = await this.runner(this.executable, [...args, '--json'], {cwd: this.project, signal});}
      catch (error) {
        if (attempt < 2 && !signal?.aborted && /SQLITE_BUSY|database is locked/i.test(String(error))) {await new Promise(resolve => setTimeout(resolve, 80 * (attempt + 1))); continue;}
        throw error;
      }
      try {return JSON.parse(output.replace(/^\uFEFF/, ''));} catch {throw new Error(`${args[0]} returned invalid JSON.`);}
    }
  }
  async list(signal?: AbortSignal) {return array(await this.json(['list'], signal)).map(decodeIssue);}
  async ready(signal?: AbortSignal) {return new Set(array(await this.json(['ready'], signal)).map(value => string(object(value).id)));}
  async show(id: string, signal?: AbortSignal) {
    const issue = decodeIssue(await this.json(['show', id], signal));
    const comments = array(await this.json(['comment', 'list', id], signal));
    issue.comments = comments.map(value => {const comment = object(value); return {author: string(comment.author, true), text: string(comment.text)};});
    return issue;
  }
  async dependencies(id: string, signal?: AbortSignal) {
    return array(object(await this.json(['dep', 'list', id], signal)).depends_on).map(value => relation(value));
  }
  async mutate(command: Mutation) {
    const output = await this.runner(this.executable, mutationArgs(command), {cwd: this.project, mutation: true});
    if (command.kind === 'create') {
      try {return string(object(JSON.parse(output)).id);} catch {throw new CommandError('Create returned an unreadable result. Inspect current issues before creating again.', true);}
    }
    return undefined;
  }
}
