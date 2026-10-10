import {watch, type FSWatcher} from 'node:fs';
import {join} from 'node:path';
import {CliClient, type BeesClient, type Mutation, type Patch} from './client.js';
import type {Issue} from './model.js';
import {CommandError} from './process.js';

export type SessionState = {project: string; issues: Issue[]; loading: boolean; saving: boolean; stale: boolean;
  error: string; uncertain: boolean; refreshedAt: number; revision: number; graphLoaded: boolean; canUndo: boolean; gitAvailable?: boolean};
type Undo = {command: Mutation; expected: Issue};
export class ConflictError extends Error {}

/** Single-flight reads, serialized writes and generation checks keep older requests off screen. */
export class Session {
  private state: SessionState;
  private listeners = new Set<() => void>();
  private abort = new AbortController();
  private generation = 0;
  private inFlight?: Promise<void>;
  private watcher?: FSWatcher;
  private poll?: ReturnType<typeof setInterval>;
  private debounce?: ReturnType<typeof setTimeout>;
  private lastFinished = 0;
  private disposed = false;
  private selected = '';
  private graph = false;
  private undo: Undo[] = [];
  constructor(public client: BeesClient, private interval = 2500) {
    this.state = {project: client.project, issues: [], loading: true, saving: false, stale: false, error: '',
      uncertain: false, refreshedAt: 0, revision: 0, graphLoaded: false, canUndo: false};
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  private publish(patch: Partial<SessionState>) {if (this.disposed) return; this.state = {...this.state, ...patch}; for (const listener of this.listeners) listener();}

  start() {
    void this.refresh();
    if (this.interval > 0) this.poll = setInterval(() => {void this.refresh();}, this.interval);
    try {
      this.watcher = watch(join(this.client.project, '.bees'), (_event, name) => {
        if (name && !/^(bees\.db(?:-wal|-shm)?|issues\.jsonl|config\.json)$/.test(name.toString())) return;
        // Coalesce notifications; polling catches writes during an active read.
        if (this.inFlight || this.state.saving || Date.now() - this.lastFinished < 300) return;
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => {void this.refresh();}, 150);
      });
      this.watcher.on('error', () => {this.watcher?.close(); this.watcher = undefined;});
    } catch { /* Directory notifications are an accelerator; polling is authoritative. */ }
  }
  select(id: string) {
    if (this.selected === id) return;
    this.selected = id;
    const epoch = this.generation;
    // A bounded refresh, rather than one subprocess for every rapid keypress.
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {if (epoch === this.generation) void this.refresh();}, 100);
  }
  needGraph(value: boolean) {if (value && !this.graph) {this.graph = true; void this.refresh();} else this.graph = value;}

  refresh = (): Promise<void> => {
    if (this.disposed || this.state.saving) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    const epoch = this.generation;
    const signal = this.abort.signal;
    const client = this.client;
    this.publish({loading: true});
    this.inFlight = (async () => {
      try {
        const issues = await client.list(signal);
        const ready = await client.ready(signal);
        for (const issue of issues) issue.ready = ready.has(issue.id) && issue.status === 'open' && !issue.rawStatus;
        const selected = this.selected;
        const selectedIndex = issues.findIndex(issue => issue.id === selected);
        if (selectedIndex >= 0) {
          const detail = await client.show(selected, signal);
          issues[selectedIndex] = {...detail, ready: issues[selectedIndex]!.ready};
        }
        const graph = this.graph;
        if (graph) {
          // Finish the topology independently of cursor/tab changes. Publishing a
          // partial edge set collapses the tracks on every navigation refresh.
          for (const issue of issues) {
            if (signal.aborted) return;
            if (!issue.dependenciesLoaded) {
              issue.dependencies = await client.dependencies(issue.id, signal);
              issue.dependenciesLoaded = true;
            }
          }
        }
        const changes = await client.changes?.(signal);
        for (const issue of issues) issue.modifiedInJsonl = changes?.available ? changes.ids.has(issue.id) : undefined;
        if (epoch !== this.generation || this.disposed) return;
        const changed = JSON.stringify(issues) !== JSON.stringify(this.state.issues);
        this.publish({issues: changed ? issues : this.state.issues, loading: false, stale: false, error: '', gitAvailable: changes?.available,
          graphLoaded: graph && issues.every(issue => issue.dependenciesLoaded), refreshedAt: Date.now(), revision: this.state.revision + (changed ? 1 : 0)});
        if (this.selected !== selected || this.graph !== graph) queueMicrotask(() => {setTimeout(() => {void this.refresh();}, 0);});
      } catch (error) {
        if (epoch === this.generation && !this.disposed) this.publish({loading: false, stale: true, error: String(error)});
      } finally {this.lastFinished = Date.now();}
    })().finally(() => {if (epoch === this.generation) this.inFlight = undefined;});
    return this.inFlight;
  };

  async switchProject(client: BeesClient) {
    if (this.state.saving) throw new Error('Wait for the current save before changing projects.');
    this.stopWatchers(); this.abort.abort(); this.abort = new AbortController(); this.generation++;
    this.inFlight = undefined; this.client = client; this.selected = ''; this.undo = []; this.graph = false;
    this.publish({project: client.project, issues: [], loading: true, saving: false, stale: false, error: '', uncertain: false,
      refreshedAt: 0, revision: this.state.revision + 1, graphLoaded: false, canUndo: false, gitAvailable: undefined});
    this.start();
  }

  async mutate(command: Mutation, base?: Issue, isUndo = false): Promise<string | undefined> {
    if (this.state.saving) throw new Error('A save is already running.');
    if (this.state.uncertain) throw new Error('Inspect the uncertain write result, then use “Allow edits after review”.');
    this.publish({saving: true});
    // Drain the active read before issuing a mutation; it cannot overwrite the write result.
    await this.inFlight;
    let succeeded = false;
    let created: string | undefined;
    let inverse: Mutation | undefined;
    let guarded = command;
    try {
      if ('id' in command && base) {
        const current = await this.client.show(command.id);
        if (this.client instanceof CliClient && !current.revision) throw new Error('Upgrade Bees: atomic saves require revision tokens in show --json. Your draft is kept.');
        guarded = {...command, expectedRevision: current.revision};
        if (command.kind === 'update') {
          const old: Patch = {};
          for (const key of Object.keys(command.patch) as (keyof Patch)[]) {
            if ((key === 'status' ? current.rawStatus || current.status : current[key] ?? '') !== (key === 'status' ? base.rawStatus || base.status : base[key] ?? '')) throw new ConflictError(`“${key}” changed outside the TUI. Your draft is kept; reload the field before saving.`);
            Object.assign(old, {[key]: current[key] ?? ''});
          }
          // Reopening cannot restore closed_at/reason with the current CLI, so no misleading inverse.
          if (current.status !== 'closed' && !('status' in old && current.rawStatus) && (!('priority' in old) || [1, 2, 3, 4].includes(current.priority))) inverse = {kind: 'update', id: command.id, patch: old};
        } else if (command.kind === 'close') {
          if ((current.rawStatus || current.status) !== (base.rawStatus || base.status)) throw new ConflictError('Status changed outside the TUI. Review it before completing.');
        } else if (command.kind === 'label') {
          if (JSON.stringify([...current.labels].sort()) !== JSON.stringify([...base.labels].sort())) throw new ConflictError('Labels changed outside the TUI. Reload the label picker.');
          if (current.labels.includes(command.label) !== !command.remove) inverse = {...command, remove: !command.remove};
        } else if (command.kind === 'dependency') {
          if (JSON.stringify(current.dependencies) !== JSON.stringify(base.dependencies)) throw new ConflictError('Relationships changed outside the TUI. Reload the graph.');
          const existing = current.dependencies.find(dep => dep.id === command.target);
          if (!command.remove && existing) throw new Error('A relationship to that issue already exists. Remove it before changing its type.');
          inverse = {...command, remove: !command.remove, relation: existing?.type ?? command.relation};
        }
      }
      created = await this.client.mutate(guarded);
      succeeded = true;
      if (isUndo) this.undo.pop();
      if (inverse && 'id' in inverse && !isUndo) {
        try {
          const expected = await this.client.show(inverse.id);
          // Do not adopt another writer's after-image as our undo baseline.
          const matches = command.kind === 'update'
            ? Object.entries(command.patch).every(([key, value]) => (key === 'status' ? expected.rawStatus || expected.status : expected[key as keyof Patch] ?? '') === value)
            : command.kind === 'label' ? expected.labels.includes(command.label) === !command.remove
            : command.kind === 'dependency' ? (command.remove
              ? !expected.dependencies.some(dep => dep.id === command.target)
              : expected.dependencies.some(dep => dep.id === command.target && dep.type === command.relation)) : false;
          if (matches) {this.undo.push({command: inverse, expected}); this.undo = this.undo.slice(-20);}
        }
        catch {this.undo = [];}
      }
      this.publish({canUndo: this.undo.length > 0});
      return created;
    } catch (error) {
      if (/BEES_CONFLICT/.test(String(error))) throw new ConflictError('The project changed outside the TUI during save. No changes applied; your draft is kept. Reload and review before retrying.');
      if (error instanceof CommandError && error.uncertain) this.publish({uncertain: true, stale: true, error: error.message});
      throw error;
    } finally {
      this.publish({saving: false});
      if (succeeded || this.state.uncertain) await this.refresh();
    }
  }
  async undoLast() {
    const entry = this.undo.at(-1);
    if (!entry) throw new Error('No reversible change in this session.');
    await this.mutate(entry.command, entry.expected, true);
  }
  async allowEditsAfterReview() {await this.refresh(); if (this.state.stale) throw new Error('Refresh must succeed first.'); this.publish({uncertain: false});}
  private stopWatchers() {this.watcher?.close(); clearInterval(this.poll); clearTimeout(this.debounce);}
  dispose() {this.disposed = true; this.generation++; this.abort.abort(); this.stopWatchers(); this.listeners.clear();}
}
