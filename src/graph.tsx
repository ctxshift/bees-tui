import {Box, Text} from 'ink';
import {useMemo} from 'react';
import {layoutGraph, type EdgeMode} from './graph-layout.js';
import type {Issue} from './model.js';
import {relationRows} from './model.js';
import {asciiBorder, fit, usePalette, viewport} from './theme.js';
import {wouldCycle} from './query.js';

export type GraphNode = {id: string; labels: string[]; lane: 'left' | 'right'; cycle: boolean};
export function graphNodes(issue: Issue, issues: Issue[]): GraphNode[] {
  const nodes = new Map<string, GraphNode>();
  for (const row of relationRows(issue, issues)) {
    const previous = nodes.get(row.id);
    if (previous) {if (!previous.labels.includes(row.label)) previous.labels.push(row.label); continue;}
    const lane = row.label === 'Blocked by' || row.label === 'Parent' ? 'left' : 'right';
    const cycle = row.id === issue.id || Boolean(issue.dependencies.some(dep => dep.id === row.id && dep.type === 'blocks') && wouldCycle(issues, issue.id, row.id));
    nodes.set(row.id, {id: row.id, labels: [row.label], lane, cycle});
  }
  return [...nodes.values()];
}

export function RelationshipGraph({issue, issues, width, height, ascii, list = false, mode = 'all'}: {
  issue?: Issue; issues: Issue[]; cursor?: number; width: number; height: number; ascii: boolean; list?: boolean; mode?: EdgeMode;
}) {
  const c = usePalette(); const space = width - 4;
  const lanes = width < 70 ? 4 : 8;
  const rows = useMemo(() => layoutGraph(issues, mode, ascii, lanes), [issues, mode, ascii, lanes]);
  const index = rows.findIndex(row => row.issue.id === issue?.id);
  const capacity = Math.max(1, Math.floor((height - 7) / (list ? 1 : 2)));
  const shown = viewport(rows, index, capacity);
  const rails = list ? 0 : Math.min(lanes * 2, Math.max(2, ...rows.map(row => Math.max(row.lane * 2 + 2, row.connector.findLastIndex(cell => cell.char !== ' ') + 2))));
  const idWidth = Math.min(14, Math.max(9, ...issues.map(item => item.id.length + 1)));
  const metadata = width >= 70 ? 15 : 0;
  const titleWidth = Math.max(1, space - rails - idWidth - metadata - 2);
  const colors = [c.honey, c.blue, c.green, c.purple];
  const byId = new Map(issues.map(item => [item.id, item]));
  const draw = (cells: typeof rows[number]['node']) => cells.slice(0, rails).map((cell, i) => <Text key={i} color={cell.type === 'parent-child' ? c.purple : cell.type === 'related' ? c.blue : colors[cell.lane % colors.length]}>{cell.char}</Text>);
  return <Box width={width} height={height} borderStyle={ascii ? asciiBorder : 'round'} borderColor={c.border} flexDirection="column" paddingX={1}>
    <Text color={c.honey}>{fit('RELATIONSHIP GRAPH', space, ascii)}</Text>
    <Text color={c.muted}>{fit(`v links: ${mode === 'parent-child' ? 'family' : mode} / ${list ? 'List view' : 'Prerequisites above'}`, space, ascii)}</Text>
    <Text color={c.muted}>{fit(' '.repeat(rails + 2) + 'ISSUE'.padEnd(idWidth) + 'TITLE', space, ascii)}</Text>
    {!rows.length && <Text color={c.muted}>No issues.</Text>}
    {shown.map(row => {
      const selected = row.issue.id === issue?.id;
      const blocked = row.issue.dependencies.some(dep => dep.type === 'blocks' && byId.get(dep.id)?.status !== 'closed');
      const status = row.issue.rawStatus || (blocked && row.issue.status !== 'closed' ? 'Blocked' : row.issue.status === 'in_progress' ? 'Active' : row.issue.status);
      return <Box key={row.issue.id} flexDirection="column">
        <Text backgroundColor={selected ? c.selected : undefined} color={selected ? c.honey : c.text}>{selected ? '>' : ' '}<Text color={c.honey}>{row.issue.modifiedInJsonl ? '*' : ' '}</Text>{!list && draw(row.node)}{fit(row.issue.id, idWidth, ascii)}{fit(`${row.cyclic ? '! ' : ''}${row.overflow ? '+ ' : ''}${row.issue.title}`, titleWidth, ascii)}{metadata > 0 && <Text color={blocked ? c.red : row.issue.status === 'closed' ? c.green : c.muted}>{fit(` ${status}`, 11, ascii)}{fit(` P${row.issue.priority}`, 4, ascii)}</Text>}</Text>
        {!list && <Text color={c.muted}>  {draw(row.connector)}</Text>}
      </Box>;
    })}
    <Box flexGrow={1}/>
    <Text color={c.muted}>{fit(`${Math.max(0, index + 1)}/${rows.length}  ${ascii ? '| blocks : family . related' : '│ blocks ┆ family ┊ related'}${rows.some(row => row.overflow || row.cyclic) ? ' / + more, ! cycle/order' : ''}`, space, ascii)}</Text>
    <Text color={c.muted}>{fit('j/k rows  h/l follow  Enter inspect  g list', space, ascii)}</Text>
  </Box>;
}
