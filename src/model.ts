export const statuses = ['open', 'in_progress', 'deferred', 'closed'] as const;
export type Status = typeof statuses[number];
export type View = 'work' | 'board' | 'links';
export type Filter = 'ready' | 'active' | 'blocked' | 'all';
export type Section = 'Overview' | 'Design' | 'Acceptance' | 'Comments' | 'Notes' | 'Relationships';
export const sections: Section[] = ['Overview', 'Design', 'Acceptance', 'Comments'];
export type Relation = {id: string; type: 'blocks' | 'related' | 'parent-child'};
export type Issue = {
  revision?: string;
  modifiedInJsonl?: boolean;
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: number;
  type: string;
  assignee: string;
  labels: string[];
  dependencies: Relation[];
  design: string;
  acceptance: string;
  comments: {author: string; text: string}[];
  owner?: string;
  notes?: string;
  due?: string;
  defer?: string;
  externalRef?: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
  closeReason?: string;
  rawStatus?: string;
  ready?: boolean;
  dependenciesLoaded?: boolean;
  dependencyCount?: number;
  dependents?: Relation[];
};

export function blockers(issue: Issue, issues: Issue[]): string[] {
  return issue.dependencies.filter(dep => dep.type === 'blocks' &&
    issues.find(item => item.id === dep.id)?.status !== 'closed').map(dep => dep.id);
}

export function isReady(issue: Issue, issues: Issue[]): boolean {
  if (issue.ready !== undefined) return issue.ready;
  return issue.status === 'open' && blockers(issue, issues).length === 0;
}

export function matchesFilter(issue: Issue, issues: Issue[], filter: Filter): boolean {
  switch (filter) {
    case 'ready': return isReady(issue, issues);
    case 'active': return issue.status !== 'closed';
    case 'blocked': return issue.status !== 'closed' && blockers(issue, issues).length > 0;
    case 'all': return true;
  }
}

export function visibleIssues(issues: Issue[], filter: Filter, query: string): Issue[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return issues.filter(issue => matchesFilter(issue, issues, filter) && terms.every(term => {
    const [key, ...rest] = term.split(':');
    const value = rest.join(':');
    if (key === 'status' && value) return issue.status === value;
    if (key === 'type' && value) return issue.type === value;
    if (key === 'label' && value) return issue.labels.some(label => label.toLocaleLowerCase() === value);
    if (key === 'assignee' && value) return issue.assignee.toLocaleLowerCase() === value;
    if (key === 'p' && value) return String(issue.priority) === value;
    return [issue.id, issue.title, issue.description, issue.assignee, ...issue.labels]
      .join(' ').toLocaleLowerCase().includes(term);
  })).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id, undefined, {numeric: true}));
}

export function newlyReady(before: Issue[], after: Issue[]): Issue[] {
  const ready = new Set(before.filter(issue => isReady(issue, before)).map(issue => issue.id));
  return after.filter(issue => isReady(issue, after) && !ready.has(issue.id));
}

export function selectedIssue(visible: Issue[], selectedId: string): Issue | undefined {
  return visible.find(issue => issue.id === selectedId) ?? visible[0];
}

export function moveSelection(visible: Issue[], selectedId: string, delta: number): string {
  const index = Math.max(0, visible.findIndex(issue => issue.id === selectedId));
  return visible[Math.max(0, Math.min(visible.length - 1, index + delta))]?.id ?? '';
}

export function relationRows(issue: Issue, issues: Issue[]): {id: string; label: string}[] {
  return [
    ...issue.dependencies.map(dep => ({id: dep.id, label: dep.type === 'blocks' ? 'Blocked by' : dep.type === 'parent-child' ? 'Parent' : 'Related'})),
    ...(issue.dependents?.map(dep => ({id: dep.id, label: dep.type === 'blocks' ? 'Blocks' : dep.type === 'parent-child' ? 'Child' : 'Related'})) ?? issues.flatMap(other => other.dependencies.filter(dep => dep.id === issue.id).map(dep => ({
      id: other.id, label: dep.type === 'blocks' ? 'Blocks' : dep.type === 'parent-child' ? 'Child' : 'Related',
    })))),
  ];
}
