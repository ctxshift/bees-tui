import {Box, Text} from 'ink';
import stringWidth from 'string-width';
import type {Filter, Issue, Section} from './model.js';
import {blockers, matchesFilter, relationRows, statuses} from './model.js';
import {asciiBorder, clean, fit, statusPalette, statusLabels, statusSymbols, viewport, usePalette} from './theme.js';
import type {Column} from './preferences.js';

export function IssueList({issues, all, selected, width, height, ascii, columns}: {
  issues: Issue[]; all: Issue[]; selected?: Issue; width: number; height: number; ascii: boolean; columns?: Column[];
}) {
  const c = usePalette();
  const roomy = width >= 66;
  const index = issues.findIndex(issue => issue.id === selected?.id);
  const fields = columns ? (width < 70 ? columns.filter(field => ['id', 'title', 'priority'].includes(field)) : columns).filter((field, i, values) => values.indexOf(field) === i) : undefined;
  const columnWidths: Partial<Record<Column, number>> = {priority: 4, id: Math.min(20, Math.max(10, selected?.id.length ?? 10)), status: 12, type: 9, assignee: 10, labels: 14, due: 10, updatedAt: 10};
  const kept = fields ? [...fields] : undefined;
  while (kept && kept.reduce((sum, field) => sum + (columnWidths[field] ?? 16) + 1, 0) > width - 7 && kept.length > 2) {
    const removable = kept.findLastIndex(field => field !== 'title' && field !== 'id');
    if (removable < 0) break; kept.splice(removable, 1);
  }
  columnWidths.title = Math.max(6, width - 7 - (kept?.filter(field => field !== 'title').reduce((sum, field) => sum + (columnWidths[field] ?? 0) + 1, 0) ?? 0));
  return <Box width={width} height={height} flexDirection="column" borderStyle={ascii ? asciiBorder : 'round'} borderColor={c.honey} paddingX={1}>
    <Text color={c.muted}>{fit(` WORK QUEUE  ${issues.length ? index + 1 : 0}/${issues.length}`, width - 4, ascii)}</Text>
    <Text color={c.muted}>{fit(kept ? '  ' + kept.map(field => fit(field.toUpperCase(), columnWidths[field]!, ascii)).join(' ') : roomy ? '   PRI  ISSUE       TITLE                         OWNER' : '   PRI  ISSUE       TITLE', width - 4, ascii)}</Text>
    {issues.length === 0 && <Text color={c.muted}>No matches. / search or f filter.</Text>}
    {viewport(issues, index, height - 5).map(issue => {
      const active = issue.id === selected?.id;
      const blocked = blockers(issue, all).length > 0;
      const line = kept ? `${active ? '>' : ' '} ` + kept.map(field => fit(field === 'priority' ? `P${issue.priority}` : field === 'status' ? issue.rawStatus || statusLabels[issue.status] : field === 'labels' ? issue.labels.join(',') : String(issue[field] ?? '-'), columnWidths[field]!, ascii)).join(' ') : `${active ? (ascii ? '>' : '▸') : ' '} ${ascii ? issue.status === 'closed' ? 'x' : 'o' : statusSymbols[issue.status]} P${issue.priority}  ${fit(issue.id, 9, ascii)} ${fit(issue.title, width - (roomy ? 35 : 26), ascii)}${roomy ? ' ' + fit(issue.assignee || '-', 8, ascii) : ''}${blocked ? ' !' : ''}`;
      return <Text key={issue.id} backgroundColor={active ? c.selected : undefined} color={active ? c.honey : issue.status === 'closed' ? c.muted : c.text}>{line[0]}<Text color={c.honey}>{issue.modifiedInJsonl ? '*' : ' '}</Text>{fit(line.slice(2), width - 6, ascii)}</Text>;
    })}
    <Box flexGrow={1}/>
    <Text color={c.muted}>{fit('j/k navigate   Enter inspect   ! blocked', width - 4, ascii)}</Text>
  </Box>;
}

export function Inspector({issue, issues, width, height, section, ascii, scroll = 0}: {
  issue?: Issue; issues: Issue[]; width: number; height: number; section: Section; ascii: boolean; scroll?: number;
}) {
  const c = usePalette(); const statusColors = statusPalette(c);
  if (!issue) return <Box width={width} height={height} borderStyle={ascii ? asciiBorder : 'single'} borderColor={c.border} paddingX={1}><Text color={c.muted}>Select an issue to inspect.</Text></Box>;
  const blocked = blockers(issue, issues);
  const downstream = issues.filter(other => other.status !== 'closed' && other.dependencies.some(dep => dep.id === issue.id && dep.type === 'blocks'));
  const content = section === 'Design' ? issue.design : section === 'Acceptance' ? issue.acceptance : section === 'Notes' ? issue.notes || 'No notes yet.' : section === 'Relationships' ? relationRows(issue, issues).map(row => `${row.label}: ${row.id}`).join('\n') : section === 'Comments' ?
    issue.comments.map(comment => `${comment.author}: ${comment.text}`).join('\n\n') || 'No comments yet. Press c to start a conversation.' : [issue.description, ...[issue.owner && `Owner: ${issue.owner}`, issue.due && `Due: ${issue.due}`, issue.defer && `Defer until: ${issue.defer}`, issue.externalRef && `Reference: ${issue.externalRef}`, issue.createdAt && `Created: ${localTime(issue.createdAt)}`, issue.updatedAt && `Updated: ${localTime(issue.updatedAt)}`, issue.closeReason && `Close reason: ${issue.closeReason}`].filter(Boolean)].join('\n\n');
  const wrapped = wrap(content, width - 4);
  const count = Math.max(1, height - 12);
  const offset = Math.min(Math.max(0, scroll), Math.max(0, wrapped.length - count));
  const body = wrapped.slice(offset, offset + count);
  if (height < 14) return <Box width={width} height={height} borderStyle={ascii ? asciiBorder : 'round'} borderColor={c.border} paddingX={1} flexDirection="column">
    <Text color={c.honey}>{fit(`${issue.modifiedInJsonl ? '* ' : ''}${issue.id} / ${issue.rawStatus || statusLabels[issue.status]} / P${issue.priority}`, width - 4, ascii)}</Text>
    <Text color={c.text} bold>{fit(issue.title, width - 4, ascii)}</Text>
    <Text color={c.blue}>{fit(`[ / ] ${section.toUpperCase()}`, width - 4, ascii)}</Text>
    {body.map((line, i) => <Text color={c.text} key={i}>{fit(line, width - 4, ascii)}</Text>)}
    <Box flexGrow={1}/><Text color={c.muted}>{fit('e edit  s status  Esc back', width - 4, ascii)}</Text>
  </Box>;
  return <Box width={width} height={height} flexDirection="column" borderStyle={ascii ? asciiBorder : 'round'} borderColor={c.border} paddingX={1}>
    <Text color={c.honey}>{fit(`${issue.modifiedInJsonl ? '* ' : ''}${issue.id}  /  ${issue.type.toUpperCase()}`, width - 4, ascii)}</Text>
    <Text color={c.text} bold>{fit(issue.title, width - 4, ascii)}</Text>
    <Text color={statusColors[issue.status]}>{fit(`${ascii ? '*' : statusSymbols[issue.status]} ${issue.rawStatus || statusLabels[issue.status]}   P${issue.priority}   @${issue.assignee || 'unassigned'}`, width - 4, ascii)}</Text>
    <Text color={c.purple}>{fit(issue.labels.map(label => '#' + label).join('  '), width - 4, ascii)}</Text>
    <Text color={c.text}> </Text>
    <Text color={c.blue}>{fit(`[ / ]  ${section.toUpperCase()}${wrapped.length > count ? ` ${offset + 1}/${wrapped.length} PgUp/Dn` : ''}`, width - 4, ascii)}</Text>
    {body.map((line, i) => <Text key={i} color={line.startsWith('#') ? c.honey : c.text} bold={line.startsWith('#')}>{fit(line, width - 4, ascii)}</Text>)}
    <Box flexGrow={1}/>
    {blocked.length > 0 ? <Text color={c.red}>{fit(`! Waiting on ${blocked.join(', ')}`, width - 4, ascii)}</Text> :
      <Text color={c.green}>{fit(issue.dependenciesLoaded === false ? 'Relationships not loaded yet.' : issue.status === 'closed' ? 'Complete. Nice work.' : 'No unresolved blockers.', width - 4, ascii)}</Text>}
    <Text color={c.honey}>{fit(downstream.length ? `Finishing this removes a blocker from ${downstream.length} issues.` : 'One clear next action. Keep going.', width - 4, ascii)}</Text>
    <Text color={c.muted}>{fit('e title  s status  p priority  c comment', width - 4, ascii)}</Text>
  </Box>;
}

function localTime(value: string) {const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString();}
export function wrap(value: string, width: number): string[] {
  return value.split('\n').flatMap(paragraph => {
    const lines: string[] = [];
    let line = '';
    for (const {segment} of new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(clean(paragraph))) {
      if (line && stringWidth(line + segment) > width) {lines.push(line); line = '';}
      line += segment;
    }
    lines.push(line);
    return lines;
  });
}

export function Board({issues, all, selected, width, height, ascii, closedCollapsed = false}: {
  issues: Issue[]; all: Issue[]; selected?: Issue; width: number; height: number; ascii: boolean; closedCollapsed?: boolean;
}) {
  const c = usePalette(); const statusColors = statusPalette(c);
  const lanes: string[] = width < 100 ? [selected?.rawStatus || selected?.status || 'open'] : [...statuses, ...new Set(issues.flatMap(issue => issue.rawStatus ? [issue.rawStatus] : []))];
  const laneWidth = Math.floor(width / lanes.length);
  return <Box width={width} height={height}>
    {lanes.map(status => {
      const cards = issues.filter(issue => (issue.rawStatus || issue.status) === status);
      const total = all.filter(issue => (issue.rawStatus || issue.status) === status).length;
      const known = (statuses as readonly string[]).includes(status) ? status as typeof statuses[number] : undefined;
      const color = known ? statusColors[known] : c.red;
      const index = cards.findIndex(issue => issue.id === selected?.id);
      return <Box key={status} width={laneWidth} height={height} borderStyle={ascii ? asciiBorder : 'round'} borderColor={color} flexDirection="column" paddingX={1}>
        <Text bold color={color}>{fit(`${known ? statusLabels[known] : status}  ${cards.length}/${total}`, laneWidth - 4, ascii)}</Text>
        <Text color={c.text}> </Text>
        {!cards.length && <Text color={c.muted}>No matching issues</Text>}
        {status === 'closed' && closedCollapsed ? <Text color={c.muted}>Collapsed / z expand</Text> : viewport(cards, index, Math.floor((height - 5) / 4)).map(issue => <Box key={issue.id} flexDirection="column" marginBottom={1}>
          <Text color={issue.id === selected?.id ? c.honey : c.muted} backgroundColor={issue.id === selected?.id ? c.selected : undefined}>{fit(`${issue.id === selected?.id ? '>' : ' '}${issue.modifiedInJsonl ? '*' : ' '} ${issue.id}  P${issue.priority}`, laneWidth - 4, ascii)}</Text>
          <Text color={c.text}>{fit(issue.title, laneWidth - 4, ascii)}</Text>
          <Text color={blockers(issue, all).length ? c.red : c.muted}>{fit(blockers(issue, all).length ? '! Has unresolved blockers' : `@${issue.assignee || 'unassigned'}`, laneWidth - 4, ascii)}</Text>
        </Box>)}
        <Box flexGrow={1}/>
        <Text color={c.muted}>{fit('h/l lanes  s move', laneWidth - 4, ascii)}</Text>
      </Box>;
    })}
  </Box>;
}

export function Links({issue, issues, cursor, width, height, ascii}: {
  issue?: Issue; issues: Issue[]; cursor: number; width: number; height: number; ascii: boolean;
}) {
  const c = usePalette();
  const relations = issue ? relationRows(issue, issues) : [];
  return <Box width={width} height={height} borderStyle={ascii ? asciiBorder : 'round'} borderColor={c.honey} paddingX={1} flexDirection="column">
    <Text color={c.honey}>{fit('THE PATH FORWARD', width - 4, ascii)}</Text>
    <Text color={c.text} bold>{fit(issue ? `${issue.id}  ${issue.title}` : 'Select an issue', width - 4, ascii)}</Text>
    <Text color={c.muted}>{fit('Follow a relationship. Esc retraces your steps.', width - 4, ascii)}</Text>
    <Text color={c.text}> </Text>
    {!relations.length && <Text color={c.green}>No linked issues. A clear path.</Text>}
    {viewport(relations, cursor, height - 8).map(row => {
      const other = issues.find(item => item.id === row.id);
      const selected = relations[cursor] === row;
      return <Text key={row.label + row.id} color={selected ? c.honey : other?.status === 'closed' ? c.green : c.text} backgroundColor={selected ? c.selected : undefined}>
        {fit(`${selected ? '>' : ' '} ${row.label.padEnd(10)} ${row.id}  ${other?.title ?? '(unavailable)'}`, width - 4, ascii)}
      </Text>;
    })}
    <Box flexGrow={1}/>
    <Text color={c.muted}>{fit('j/k choose   Enter follow   Esc back', width - 4, ascii)}</Text>
  </Box>;
}

export function FilterRail({filter, issues, width, ascii}: {filter: Filter; issues: Issue[]; width: number; ascii: boolean}) {
  const c = usePalette();
  const filters: Filter[] = ['ready', 'active', 'blocked', 'all'];
  const labels = {ready: 'Ready', active: 'Not closed', blocked: 'Blocked', all: 'Everything'};
  return <Box width={width} flexDirection="column" paddingRight={1}>
    <Text color={c.muted}>WORKSPACE</Text><Text color={c.text}>bees / demo</Text><Text color={c.text}> </Text>
    <Text color={c.muted}>YOUR VIEWS</Text>
    {filters.map(key => <Text key={key} color={filter === key ? c.honey : c.muted}>{fit(`${filter === key ? '>' : ' '} ${labels[key]} ${issues.filter(issue => matchesFilter(issue, issues, key)).length}`, width - 1, ascii)}</Text>)}
    <Text color={c.text}> </Text><Text color={c.muted}>f change view</Text>
    <Box flexGrow={1}/>
    <Text color={c.honey}>{ascii ? '* SMALL WINS' : '✦ SMALL WINS'}</Text>
    <Text color={c.muted}>Close bees-42.</Text><Text color={c.muted}>Free two tasks.</Text>
  </Box>;
}
