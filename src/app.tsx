import {useEffect, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useWindowSize} from 'ink';
import TextInput from 'ink-text-input';
import {demoIssues} from './fixtures.js';
import {moveSelection, newlyReady, relationRows, sections, selectedIssue, statuses, visibleIssues} from './model.js';
import type {Filter, Issue, Section, View} from './model.js';
import {asciiBorder, clean, colors as c, fit, statusLabels, viewport} from './theme.js';
import {Board, FilterRail, Inspector, IssueList, Links} from './views.js';
import {graphNodes, RelationshipGraph} from './graph.js';
import {layoutGraph, edgeModes, type EdgeMode} from './graph-layout.js';

type Modal = 'search' | 'palette' | 'filter' | 'status' | 'priority' | 'create' | 'title' | 'comment' | 'help' | null;
type Choice = {label: string; run: () => void};
export type AppProps = {
  width?: number; height?: number; ascii?: boolean; motion?: boolean; interactive?: boolean;
  initialIssues?: Issue[]; initialView?: View; initialFilter?: Filter;
  save?: () => Promise<void>;
};
const simulatedSave = () => new Promise<void>(resolve => setTimeout(resolve, 220));
const helpLines = ['j/k or arrows  Navigate', '1 / 2 / 3      Queue / Board / Graph', '/ Search       f Filter       : Commands', 'Enter Inspect  Esc Back       [ / ] Sections', 'n New issue    e Edit title    s Status', 'p Priority     a Assign to me  c Comment', 'x Complete     u Undo          h/l Lanes', '! Fail next save              q Quit', 'Changes live only for this session.'];

export function Activity({pending, message, celebration, motion, ascii}: {
  pending: boolean; message: string; celebration: boolean; motion: boolean; ascii: boolean;
}) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (!motion || (!pending && !celebration)) return;
    const interval = setInterval(() => setFrame(frame => frame + 1), 90);
    const timeout = pending ? undefined : setTimeout(() => clearInterval(interval), 630);
    return () => {clearInterval(interval); clearTimeout(timeout);};
  }, [pending, celebration, message, motion]);
  const spinner = ascii ? ['-', '\\', '|', '/'] : ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴'];
  const symbol = pending ? spinner[frame % spinner.length] : celebration ? (ascii ? '*' : frame < 6 ? ['✦', '✧'][frame % 2] : '✓') : ascii ? '>' : '›';
  return <Text color={pending ? c.blue : celebration ? c.green : c.muted}>{symbol} {pending ? 'Saving in demo memory…' : message}</Text>;
}

export function App({width: fixedWidth, height: fixedHeight, ascii = false, motion = true, interactive = true,
  initialIssues, initialView = 'work', initialFilter = 'ready', save = simulatedSave}: AppProps) {
  const terminal = useWindowSize();
  const {exit} = useApp();
  const width = fixedWidth ?? terminal.columns ?? 100;
  const height = fixedHeight ?? terminal.rows ?? 30;
  const [issues, setIssues] = useState(initialIssues ?? demoIssues);
  const [selectedId, setSelectedId] = useState('bees-42');
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [view, setView] = useState<View>(initialView);
  const [section, setSection] = useState<Section>('Overview');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState('');
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [linkIndex, setLinkIndex] = useState(0);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('all');
  const [graphList, setGraphList] = useState(false);
  const [trail, setTrail] = useState<string[]>([]);
  const [history, setHistory] = useState<Issue[][]>([]);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [failNext, setFailNext] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('Try x on bees-42. Two issues are waiting for it.');
  const [celebration, setCelebration] = useState(false);
  const visible = visibleIssues(issues, filter, query);
  const graphRows = layoutGraph(issues, edgeMode);
  const selected = selectedIssue(view === 'links' ? issues : visible, selectedId);
  const relations = selected ? graphNodes(selected, issues) : [];
  const typing = ['search', 'palette', 'create', 'title', 'comment'].includes(modal ?? '');

  function open(next: Modal, value = '') {
    setDraft(value); setChoiceIndex(0); setError(''); setModal(next);
  }

  async function commit(next: Issue[], note: string, undo = false) {
    if (saving.current) return;
    saving.current = true; setPending(true); setError('');
    try {
      await save();
      if (failNext) {setFailNext(false); throw new Error('Simulated save failure. Draft kept. Enter retries; Esc cancels.');}
      const ready = newlyReady(issues, next).filter(issue => issue.id !== selected?.id);
      setHistory(previous => undo ? previous.slice(0, -1) : [...previous, issues].slice(-20));
      setIssues(next); setModal(null); setCelebration(true);
      setMessage(`${note}${ready.length ? ` ${ready.length} now ready: ${ready.map(issue => issue.id).join(', ')}.` : ''}  u undo`);
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'Save failed. Your changes were not applied.';
      setError(detail); setMessage(detail); setCelebration(false);
    } finally {saving.current = false; setPending(false);}
  }

  function change(patch: Partial<Issue>, note: string) {
    if (selected) void commit(issues.map(issue => issue.id === selected.id ? {...issue, ...patch} : issue), note);
  }

  function changeView(next: View) {setView(next); setExpanded(false); setLinkIndex(0);}
  function action(name: string) {
    if (name === 'work' || name === 'board' || name === 'links') {changeView(name); setModal(null);}
    if (name === 'create') open('create');
    if (name === 'title' && selected) open('title', selected.title);
    if (name === 'status' && selected) open('status');
    if (name === 'priority' && selected) open('priority');
    if (name === 'comment' && selected) open('comment');
    if (name === 'assign' && selected) change({assignee: 'you'}, `${selected.id} assigned to you.`);
    if (name === 'close' && selected) change({status: 'closed'}, `${selected.id} completed.`);
    if (name === 'undo') {
      const previous = history.at(-1);
      if (previous) void commit(previous, 'Previous change restored.', true);
      else {setMessage('Nothing to undo yet.'); setModal(null);}
    }
    if (name === 'failure') {setFailNext(true); setMessage('Next save will fail once. Try editing a title.'); setModal(null);}
  }

  const commands = [
    {label: 'Show work queue', action: 'work'}, {label: 'Show kanban board', action: 'board'},
    {label: 'Explore relationships', action: 'links'}, {label: 'Create issue', action: 'create'},
    ...(selected ? [{label: 'Edit issue title', action: 'title'}, {label: 'Change status', action: 'status'},
      {label: 'Change priority', action: 'priority'}, {label: 'Assign to me', action: 'assign'},
      {label: 'Add comment', action: 'comment'}, {label: 'Complete selected issue', action: 'close'}] : []),
    {label: 'Undo last demo change', action: 'undo'}, {label: 'Simulate next save failing', action: 'failure'},
  ];
  const choices: Choice[] = modal === 'palette' ? commands.filter(command => command.label.toLowerCase().includes(draft.toLowerCase())).map(command => ({label: command.label, run: () => action(command.action)})) :
    modal === 'filter' ? (['ready', 'active', 'blocked', 'all'] as Filter[]).map(key => ({
      label: {ready: 'Ready to start', active: 'Not closed', blocked: 'Blocked by another issue', all: 'Everything'}[key],
      run: () => {setFilter(key); setModal(null); setLinkIndex(0);},
    })) : modal === 'status' ? statuses.map(status => ({label: statusLabels[status], run: () => change({status}, `${selected?.id} moved to ${statusLabels[status]}.`)})) :
    modal === 'priority' ? ([1, 2, 3, 4] as const).map(priority => ({label: `P${priority} ${['Critical', 'High', 'Medium', 'Low'][priority - 1]}`, run: () => change({priority}, `${selected?.id} set to P${priority}.`)})) : [];

  function submit() {
    if (saving.current) return;
    if (modal === 'palette' || modal === 'filter' || modal === 'status' || modal === 'priority') {choices[choiceIndex]?.run(); return;}
    if (modal === 'search') {setQuery(draft); setModal(null); return;}
    if (!draft.trim()) {setError('Please enter some text.'); return;}
    if (modal === 'title') change({title: draft.trim()}, `${selected?.id} title saved.`);
    if (modal === 'comment' && selected) change({comments: [...selected.comments, {author: 'you', text: draft.trim()}]}, `Comment added to ${selected.id}.`);
    if (modal === 'create') {
      const id = `bees-${Math.max(50, ...issues.map(issue => Number(issue.id.split('-').at(-1)) || 0)) + 1}`;
      const issue: Issue = {id, title: draft.trim(), description: '', type: 'task', priority: 2, status: 'open', assignee: 'you', labels: [], dependencies: [], design: '', acceptance: '', comments: []};
      void commit([...issues, issue], `${id} created.`);
    }
  }

  useInput((input, key) => {
    if (saving.current) return;
    if (width < 48 || height < 18) {if (input === 'q') exit(); return;}
    if (modal) {
      if (key.escape) {setModal(null); setError(''); return;}
      if (key.upArrow || (!typing && input === 'k')) setChoiceIndex(index => Math.max(0, index - 1));
      if (key.downArrow || (!typing && input === 'j')) setChoiceIndex(index => Math.max(0, Math.min((modal === 'help' ? helpLines.length : choices.length) - 1, index + 1)));
      if (key.return) {if (modal === 'help') setModal(null); else submit();}
      return;
    }
    if (input === 'q') {exit(); return;}
    if (input === '?') {open('help'); return;}
    if (input === ':' || (key.ctrl && input === 'p')) {open('palette'); return;}
    if (input === '/') {open('search', query); return;}
    if (input === 'f') {open('filter'); return;}
    if (input === '1') changeView('work');
    if (input === '2') changeView('board');
    if (input === '3') changeView('links');
    if (input === 'v' && view === 'links') setEdgeMode(value => edgeModes[(edgeModes.indexOf(value) + 1) % edgeModes.length]!);
    if (input === 'g') setGraphList(value => !value);
    if (input === '[' || input === ']') setSection(sections[(sections.indexOf(section) + (input === ']' ? 1 : 3)) % 4]!);
    const shortcuts: Record<string, string> = {n: 'create', e: 'title', s: 'status', p: 'priority', c: 'comment', a: 'assign', x: 'close', u: 'undo', '!': 'failure'};
    if (shortcuts[input]) action(shortcuts[input]);
    if (key.escape) {
      if (expanded) setExpanded(false);
      else if (view === 'links' && trail.length) {setSelectedId(trail.at(-1)!); setTrail(trail.slice(0, -1)); setLinkIndex(0);}
      else if (query) setQuery('');
      else if (view !== 'work') changeView('work');
    }
    if (key.return && selected) setExpanded(value => !value);
    const delta = key.downArrow || input === 'j' ? 1 : key.upArrow || input === 'k' ? -1 : 0;
    if (delta) {
      if (view === 'links' && !expanded) setSelectedId(moveSelection(graphRows.map(row => row.issue), selected?.id ?? '', delta));
      else {
        const candidates = view === 'board' && selected ? visible.filter(issue => issue.status === selected.status) : visible;
        setSelectedId(moveSelection(candidates, selected?.id ?? '', delta));
      }
    }
    if (view === 'links' && !expanded && selected && (input === 'h' || input === 'l' || key.leftArrow || key.rightArrow)) {const target = relations.find(row => row.lane === (input === 'h' || key.leftArrow ? 'left' : 'right')); if (target && issues.some(issue => issue.id === target.id)) {setTrail([...trail, selected.id]); setSelectedId(target.id);}}
    if (view === 'board' && selected && (key.leftArrow || key.rightArrow || input === 'h' || input === 'l')) {
      const direction = key.leftArrow || input === 'h' ? -1 : 1;
      for (let offset = 1; offset < 4; offset++) {
        const status = statuses[(statuses.indexOf(selected.status) + direction * offset + 4) % 4];
        const target = visible.find(issue => issue.status === status);
        if (target) {setSelectedId(target.id); break;}
      }
    }
  }, {isActive: interactive});

  if (width < 48 || height < 18) return <Box width={width} flexDirection="column"><Text color={c.honey}>bees / demo</Text><Text>Resize to at least 48 x 18.</Text><Text>q quit</Text></Box>;
  const bodyHeight = height - 8;
  const rail = width >= 132 && !expanded && view === 'work' ? 19 : 0;
  const inspector = width >= 100 && view !== 'board' && !expanded ? Math.min(49, Math.floor(width * 0.39)) : 0;
  const mainWidth = width - rail - inspector;
  const modalTitle = {search: 'SEARCH ISSUES', palette: 'WHAT WOULD YOU LIKE TO DO?', filter: 'CHOOSE YOUR VIEW', status: 'MOVE ISSUE', priority: 'SET PRIORITY', create: 'CAPTURE A NEW ISSUE', title: 'EDIT TITLE', comment: 'ADD A COMMENT', help: 'MAKE YOURSELF AT HOME'};
  const completed = issues.filter(issue => issue.status === 'closed').length;
  const progress = Math.round(completed / Math.max(1, issues.length) * 12);
  return <Box width={width} height={height - 1} flexDirection="column">
    <Box justifyContent="space-between"><Text bold color={c.honey}>{ascii ? 'bees' : '🐝 bees'} <Text color={c.muted}>/ workbench</Text></Text><Text color={c.muted}>DEMO / MEMORY ONLY </Text></Box>
    <Text color={c.muted}>{fit(`${ascii ? '#'.repeat(progress) + '-'.repeat(12 - progress) : '━'.repeat(progress) + '─'.repeat(12 - progress)}  ${completed}/${issues.length} complete     ${filter.toUpperCase()}${query ? ` / ${query}` : ''}`, width, ascii)}</Text>
    <Box gap={3}>{(['work', 'board', 'links'] as View[]).map((item, i) => <Text key={item} color={view === item ? c.honey : c.muted} bold={view === item}>{i + 1} {item === 'work' ? 'Queue' : item === 'board' ? 'Board' : 'Graph'}</Text>)}</Box>
    <Box height={1}/>
    {modal ? <Box width={width} height={bodyHeight} borderStyle={ascii ? asciiBorder : 'round'} borderColor={error ? c.red : c.honey} paddingX={2} flexDirection="column">
      <Text color={c.honey} bold>{modalTitle[modal]}</Text>
      <Text color={c.muted}>{fit(modal === 'search' ? 'Words or label:keyboard p:1 type:bug status:open assignee:you' : selected ? `Context: ${selected.id} / ${selected.title}` : 'Bees workbench', width - 6, ascii)}</Text>
      {typing && <Box height={1} overflow="hidden"><Text color={c.honey}>{'> '}</Text><TextInput value={draft} onChange={value => {setDraft(clean(value)); setChoiceIndex(0); setError('');}} focus={!pending && interactive} showCursor={!pending} /></Box>}
      {modal === 'help' ? <Box flexDirection="column">
        {viewport(helpLines, choiceIndex, bodyHeight - 6).map(line => <Text key={line}>{fit(line, width - 6, ascii)}</Text>)}
      </Box> : viewport(choices, choiceIndex, bodyHeight - 7).map(choice => <Text key={choice.label} color={choices[choiceIndex] === choice ? c.honey : undefined}>{fit(`${choices[choiceIndex] === choice ? '>' : ' '} ${choice.label}`, width - 6, ascii)}</Text>)}
      {modal === 'palette' && !choices.length && <Text color={c.muted}>No commands match.</Text>}
      <Box flexGrow={1}/>
      <Text color={c.red}>{fit(error, width - 6, ascii)}</Text>
      <Text color={c.muted}>{modal === 'help' ? 'j/k scroll   Esc close' : `Enter ${modal === 'search' ? 'apply' : typing && modal !== 'palette' ? 'save' : 'select'}   Esc cancel`}</Text>
    </Box> : <Box height={bodyHeight}>
      {rail > 0 && <FilterRail filter={filter} issues={issues} width={rail} ascii={ascii}/>}
      {expanded ? <Inspector issue={selected} issues={issues} section={section} width={width} height={bodyHeight} ascii={ascii}/> : <>
        {view === 'work' && <IssueList issues={visible} all={issues} selected={selected} width={mainWidth} height={bodyHeight} ascii={ascii}/>}
        {view === 'board' && <Board issues={visible} all={issues} selected={selected} width={width} height={bodyHeight} ascii={ascii}/>}
        {view === 'links' && <RelationshipGraph issue={selected} issues={issues} mode={edgeMode} width={mainWidth} height={bodyHeight} ascii={ascii} list={graphList}/>}
        {inspector > 0 && <Inspector issue={selected} issues={issues} section={view === 'links' ? 'Relationships' : section} width={inspector} height={bodyHeight} ascii={ascii}/>}
      </>}
    </Box>}
    <Activity pending={pending} message={fit(message, width - 2, ascii)} celebration={celebration} motion={motion} ascii={ascii}/>
    <Text color={c.muted}>{fit(width < 80 ? '/ find  : commands  ? keys  q: quit' : '/: find   f: filter   n: new   x: complete   u: undo   ?: keys   q: quit', width, ascii)}</Text>
  </Box>;
}

