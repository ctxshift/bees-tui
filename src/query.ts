import {isReady, type Filter, type Issue} from './model.js';
import type {Sort} from './preferences.js';

export function parseQuery(query: string): {field?: string; value: string}[] {
  const raw = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  if ((query.match(/"/g)?.length ?? 0) % 2) throw new Error('Close the quoted search value.');
  return raw.map(token => {
    const separator = token.indexOf(':');
    if (separator < 0) return {value: token.replaceAll('"', '').toLowerCase()};
    const field = token.slice(0, separator);
    const value = token.slice(separator + 1).replaceAll('"', '').toLowerCase();
    if (!['id', 'status', 'type', 'label', 'assignee', 'owner', 'p', 'is'].includes(field)) throw new Error(`Unknown search field: ${field}`);
    if (!value) throw new Error(`Enter a value for ${field}.`);
    if (field === 'is' && !['ready', 'blocked'].includes(value)) throw new Error('Use is:ready or is:blocked.');
    return {field, value};
  });
}
export function queryIssues(issues: Issue[], filter: Filter, query: string, sort: Sort[], user: string): Issue[] {
  const terms = parseQuery(query);
  const byId = new Map(issues.map(issue => [issue.id, issue]));
  const blocked = (issue: Issue) => issue.dependencies.some(dep => dep.type === 'blocks' && byId.get(dep.id)?.status !== 'closed');
  return issues.filter(issue => {
    if (filter === 'ready' && !isReady(issue, issues)) return false;
    if (filter === 'active' && issue.status === 'closed') return false;
    if (filter === 'blocked' && (issue.status === 'closed' || !blocked(issue))) return false;
    return terms.every(({field, value}) => {
      if (!field) return [issue.id, issue.title, issue.description, issue.assignee, ...issue.labels].join(' ').toLowerCase().includes(value);
      if (field === 'is') return value === 'ready' ? isReady(issue, issues) : blocked(issue);
      if (field === 'label') return issue.labels.some(label => label.toLowerCase() === value);
      const actual = field === 'p' ? issue.priority : field === 'status' ? issue.rawStatus || issue.status : issue[field as 'id' | 'type' | 'assignee' | 'owner'];
      return String(actual ?? '').toLowerCase() === ((field === 'assignee' || field === 'owner') && value === 'me' ? user.toLowerCase() : value);
    });
  }).sort((a, b) => {
    for (const {field, descending} of sort) {
      const av = a[field] ?? ''; const bv = b[field] ?? '';
      const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, {numeric: true});
      if (comparison) return descending ? -comparison : comparison;
    }
    return a.id.localeCompare(b.id, undefined, {numeric: true});
  });
}

export function wouldCycle(issues: Issue[], from: string, to: string): boolean {
  const edges = new Map(issues.map(issue => [issue.id, issue.dependencies.filter(dep => dep.type === 'blocks').map(dep => dep.id)]));
  const stack = [to]; const visited = new Set<string>();
  while (stack.length) {const id = stack.pop()!; if (id === from) return true; if (visited.has(id)) continue; visited.add(id); stack.push(...(edges.get(id) ?? []));}
  return false;
}
