import type {Issue, Relation} from './model.js';
export type EdgeMode = 'all' | Relation['type'];
export const edgeModes: EdgeMode[] = ['all', 'blocks', 'parent-child', 'related'];
export type Cell = {char: string; lane: number; type?: Relation['type']};
export type GraphRow = {issue: Issue; lane: number; node: Cell[]; connector: Cell[]; cyclic: boolean; overflow: boolean};
/** Stable prerequisite-first ordering; cycles remain visible, with bounded rail width. */
export function layoutGraph(issues: Issue[], mode: EdgeMode = 'all', ascii = false, maxLanes = 8): GraphRow[] {
  const byId = new Map(issues.map(issue => [issue.id, issue]));
  const outgoing = new Map(issues.map(issue => [issue.id, [] as {id: string; type: Relation['type']}[]]));
  const incoming = new Map(issues.map(issue => [issue.id, 0]));
  for (const issue of issues) for (const dep of issue.dependencies) {
    if (!byId.has(dep.id) || mode !== 'all' && dep.type !== mode) continue;
    outgoing.get(dep.id)!.push({id: issue.id, type: dep.type});
    incoming.set(issue.id, incoming.get(issue.id)! + 1);
  }
  const rank = new Map(issues.map((issue, index) => [issue.id, index]));
  const ready: number[] = [];
  function push(value: number) {let i = ready.length; ready.push(value); while (i > 0) {const parent = (i - 1) >> 1; if (ready[parent]! <= value) break; ready[i] = ready[parent]!; i = parent;} ready[i] = value;}
  function pop() {const result = ready[0]!; const last = ready.pop()!; if (ready.length) {let i = 0; while (i * 2 + 1 < ready.length) {let child = i * 2 + 1; if (child + 1 < ready.length && ready[child + 1]! < ready[child]!) child++; if (last <= ready[child]!) break; ready[i] = ready[child]!; i = child;} ready[i] = last;} return result;}
  issues.forEach((issue, i) => {if (!incoming.get(issue.id)) push(i);});
  const ordered: Issue[] = [];
  while (ready.length) {
    const issue = issues[pop()]!; ordered.push(issue);
    for (const edge of outgoing.get(issue.id)!) {const remaining = incoming.get(edge.id)! - 1; incoming.set(edge.id, remaining); if (!remaining) push(rank.get(edge.id)!);}
  }
  const visited = new Set(ordered.map(issue => issue.id));
  // This annotation includes nodes downstream of cycles: their ordering is unresolved too.
  const unresolved = new Set(issues.filter(issue => !visited.has(issue.id)).map(issue => issue.id));
  ordered.push(...issues.filter(issue => unresolved.has(issue.id)));
  const tracks: ({id: string; type: Relation['type']} | undefined)[] = [];
  const seen = new Set<string>();
  const rows: GraphRow[] = [];
  const vertical = (type: Relation['type']) => ascii ? '|' : type === 'blocks' ? '│' : type === 'related' ? '┊' : '┆';
  const blank = (): Cell[] => Array.from({length: maxLanes * 2}, () => ({char: ' ', lane: 0}));
  for (const issue of ordered) {
    let lane = tracks.findIndex(track => track?.id === issue.id);
    if (lane < 0) {lane = tracks.findIndex(track => !track); if (lane < 0) lane = Math.min(tracks.length, maxLanes - 1);}
    const node = blank(); let overflow = Boolean(tracks[lane] && tracks[lane]?.id !== issue.id);
    tracks.forEach((track, index) => {if (track) node[index * 2] = {char: vertical(track.type), lane: index, type: track.type};});
    node[lane * 2] = {char: ascii ? '*' : '●', lane};
    if (!overflow) tracks[lane] = undefined;
    seen.add(issue.id);
    const connector = blank();
    tracks.forEach((track, index) => {if (track) connector[index * 2] = {char: vertical(track.type), lane: index, type: track.type};});
    for (const edge of outgoing.get(issue.id)!) {
      if (seen.has(edge.id)) {overflow = true; continue;}
      let target = tracks.findIndex(track => track?.id === edge.id);
      if (target < 0) {
        target = !tracks[lane] ? lane : tracks.findIndex(track => !track);
        if (target < 0) target = tracks.length;
        if (target >= maxLanes) {overflow = true; continue;}
        tracks[target] = edge;
      }
      if (target === lane) {
        // A continuing branch must not erase a junction drawn by another outgoing edge.
        if (connector[lane * 2]!.char === ' ' || connector[lane * 2]!.char === vertical(edge.type)) connector[lane * 2] = {char: vertical(edge.type), lane, type: edge.type};
      }
      else {
        for (let column = Math.min(lane, target) * 2; column <= Math.max(lane, target) * 2; column++) {
          const char = column === lane * 2 ? ascii ? '+' : target > lane ? '├' : '┤' : column === target * 2 ? ascii ? '+' : target > lane ? '╮' : '╭' : ascii ? '-' : edge.type === 'blocks' ? '─' : edge.type === 'related' ? '┈' : '┄';
          const crossing = column !== lane * 2 && column !== target * 2 && tracks[column / 2] && column % 2 === 0;
          connector[column] = {char: crossing ? ascii ? '+' : '┼' : char, lane, type: edge.type};
        }
      }
    }
    rows.push({issue, lane, node, connector, cyclic: unresolved.has(issue.id), overflow});
  }
  return rows;
}
