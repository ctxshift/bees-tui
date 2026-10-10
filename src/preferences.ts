import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {readdir, realpath, stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Filter, View} from './model.js';

export type ThemeName = 'honey' | 'paper' | 'terminal';
export type Column = 'id' | 'title' | 'priority' | 'status' | 'type' | 'assignee' | 'labels' | 'due' | 'updatedAt';
export const columns: Column[] = ['priority', 'id', 'title', 'assignee', 'status', 'type', 'labels', 'due', 'updatedAt'];
export type Sort = {field: Column; descending: boolean};
export type ProjectPrefs = {view: View; filter: Filter; query: string; selected: string; columns: Column[]; sort: Sort[]; closedCollapsed: boolean};
export type Preferences = {version: 1; theme: ThemeName; motion: boolean; ascii: boolean; user: string; recent: string[];
  roots: string[]; editor?: string; editorArgs: string[]; projects: Record<string, ProjectPrefs>; savedViews: {name: string; query: string; filter: Filter}[]};
export const defaultProject = (): ProjectPrefs => ({view: 'work', filter: 'ready', query: '', selected: '', columns: ['priority', 'id', 'title', 'assignee'], sort: [{field: 'priority', descending: false}], closedCollapsed: false});
export const defaultPreferences = (): Preferences => ({version: 1, theme: 'honey', motion: true, ascii: false,
  user: process.env.USERNAME || process.env.USER || '', recent: [], roots: [], editorArgs: [], projects: {}, savedViews: []});
export const defaultConfigPath = () => join(process.env.BEES_TUI_CONFIG_HOME || process.env.XDG_CONFIG_HOME ||
  (process.platform === 'win32' ? process.env.APPDATA || homedir() : join(homedir(), '.config')), 'bees-tui', 'config.json');

export function loadPreferences(path = defaultConfigPath()): {preferences: Preferences; warning?: string} {
  if (!existsSync(path)) return {preferences: defaultPreferences()};
  try {
    const p = JSON.parse(readFileSync(path, 'utf8')) as Preferences;
    if (p.version !== 1 || !['honey', 'paper', 'terminal'].includes(p.theme) || typeof p.motion !== 'boolean' ||
      typeof p.ascii !== 'boolean' || typeof p.user !== 'string' || !p.projects || typeof p.projects !== 'object' ||
      ![p.recent, p.roots, p.editorArgs].every(value => Array.isArray(value) && value.every(item => typeof item === 'string')) || !Array.isArray(p.savedViews)) throw new Error('Invalid preferences');
    for (const value of Object.values(p.projects)) {
      if (!['work', 'board', 'links'].includes(value.view) || !['ready', 'active', 'blocked', 'all'].includes(value.filter) ||
        typeof value.query !== 'string' || typeof value.selected !== 'string' || typeof value.closedCollapsed !== 'boolean' ||
        !Array.isArray(value.columns) || !value.columns.includes('title') || !value.columns.includes('id') || value.columns.some(column => !columns.includes(column)) ||
        !Array.isArray(value.sort) || value.sort.some(sort => !columns.includes(sort.field) || typeof sort.descending !== 'boolean')) throw new Error('Invalid project preferences');
    }
    if (p.savedViews.some(view => typeof view.name !== 'string' || typeof view.query !== 'string' || !['ready', 'active', 'blocked', 'all'].includes(view.filter))) throw new Error('Invalid saved views');
    return {preferences: p};
  } catch {return {preferences: defaultPreferences(), warning: `Preferences could not be read: ${path}. Existing file retained; repair it or select another --config file to enable saving.`};}
}
export function savePreferences(preferences: Preferences, path = defaultConfigPath()) {
  mkdirSync(dirname(path), {recursive: true});
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(preferences, null, 2) + '\n', {mode: 0o600});
  renameSync(temporary, path);
}
export async function findProject(start: string): Promise<string> {
  let path = await realpath(resolve(start));
  if (!(await stat(path)).isDirectory()) throw new Error('Project path must be a directory.');
  while (true) {
    try {if ((await stat(join(path, '.bees'))).isDirectory()) return path;} catch {}
    const parent = dirname(path);
    if (parent === path) throw new Error(`No .bees directory found at or above ${start}. Use --project to select an initialized project.`);
    path = parent;
  }
}
export async function discoverProjects(roots: string[], signal?: AbortSignal): Promise<string[]> {
  const queue = roots.map(path => ({path: resolve(path), depth: 0}));
  const result = new Set<string>();
  const visited = new Set<string>();
  const ignored = new Set(['node_modules', '.git', '.bees', 'dist', 'build', 'target', '.zig-cache', 'zig-out', '.cache']);
  for (let i = 0; i < queue.length && i < 2000; i++) {
    if (signal?.aborted) throw new Error('Discovery cancelled.');
    const entry = queue[i]!;
    let canonical: string;
    try {canonical = await realpath(entry.path);} catch {continue;}
    if (visited.has(canonical)) continue;
    visited.add(canonical);
    try {
      const entries = await readdir(canonical, {withFileTypes: true});
      if (entries.some(item => item.name === '.bees' && item.isDirectory())) result.add(canonical);
      if (entry.depth < 4) for (const child of entries) if (child.isDirectory() && !child.isSymbolicLink() && !ignored.has(child.name)) queue.push({path: join(canonical, child.name), depth: entry.depth + 1});
    } catch {}
  }
  return [...result].sort();
}
