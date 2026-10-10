import {useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {basename} from 'node:path';
import {Box, Text, useApp, useInput, useWindowSize, useIsScreenReaderEnabled} from 'ink';
import {Session} from './session.js';
import {CliClient, type Mutation, type Patch} from './client.js';
import {type Filter, type Issue, type Section, type View, blockers, moveSelection, selectedIssue, statuses} from './model.js';
import {defaultProject, discoverProjects, findProject, savePreferences, columns as availableColumns, type Column, type Preferences, type ProjectPrefs, type ThemeName} from './preferences.js';
import {parseQuery, queryIssues, wouldCycle} from './query.js';
import {asciiBorder, fit, palettes, statusLabels, ThemeContext, usePalette, viewport} from './theme.js';
import {Board, Inspector, IssueList} from './views.js';
import {graphNodes, RelationshipGraph} from './graph.js';
import {layoutGraph, edgeModes, type EdgeMode} from './graph-layout.js';
import {Editor} from './editor.js';
import {copyText, externalEdit} from './os.js';
import {LiveStatus} from './live-status.js';

type Choice = {label: string; run: () => void | Promise<void>};
type Modal = {title: string; value: string; initial: string; multiline?: boolean; choices?: Choice[]; searchable?: boolean;
  hint?: string; submit?: (value: string) => void | Promise<void>; readOnly?: boolean};
const detailSections: Section[] = ['Overview', 'Design', 'Acceptance', 'Notes', 'Relationships', 'Comments'];

export function LiveApp({session, preferences: initial, configPath, width, height, onPreferences, warning}: {
  session: Session; preferences: Preferences; configPath?: string; width?: number; height?: number;
  onPreferences?: (preferences: Preferences) => void; warning?: string;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [configError, setConfigError] = useState(warning || '');
  const prefsRef = useRef(preferences); prefsRef.current = preferences;
  function update(change: (preferences: Preferences) => Preferences) {
    const next = change(prefsRef.current); prefsRef.current = next; setPreferences(next); onPreferences?.(next);
    if (configPath && !warning) try {savePreferences(next, configPath);} catch (error) {setConfigError(`Preferences not saved: ${String(error)}`);}
  }
  return <ThemeContext.Provider value={palettes[preferences.theme]}><Workbench session={session} preferences={preferences} updatePreferences={update} width={width} height={height} configError={configError}/></ThemeContext.Provider>;
}

function Workbench({session, preferences, updatePreferences, width: fixedWidth, height: fixedHeight, configError}: {
  session: Session; preferences: Preferences; updatePreferences: (change: (preferences: Preferences) => Preferences) => void;
  width?: number; height?: number; configError: string;
}) {
  const c = usePalette(); const {exit, suspendTerminal} = useApp(); const size = useWindowSize();
  const screenReader = useIsScreenReaderEnabled();
  const width = fixedWidth ?? size.columns ?? 100; const height = fixedHeight ?? size.rows ?? 30;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [p, setP] = useState<ProjectPrefs>(() => preferences.projects[state.project] ?? defaultProject());
  const [section, setSection] = useState<Section>('Overview');
  const [scroll, setScroll] = useState(0); const [expanded, setExpanded] = useState(false);
  const [nodeIndex, setNodeIndex] = useState(0); const [edgeMode, setEdgeMode] = useState<EdgeMode>('all'); const [graphList, setGraphList] = useState(false);
  const [trail, setTrail] = useState<{prefs: ProjectPrefs; section: Section; scroll: number}[]>([]);
  const [modal, setModal] = useState<Modal | null>(null); const [choice, setChoice] = useState(0);
  const [error, setError] = useState(''); const [message, setMessage] = useState('Ready when you are. : commands / search');
  const [working, setWorking] = useState(false); const lock = useRef(false);
  const discovery = useRef<AbortController | null>(null);
  useEffect(() => () => discovery.current?.abort(), []);
  const [pulse, setPulse] = useState(0); const [celebration, setCelebration] = useState(0);
  const lastProject = useRef(state.project);
  const lastNavigation = useRef({project: state.project, prefs: p});
  lastNavigation.current = {project: state.project, prefs: p};
  useEffect(() => () => {const last = lastNavigation.current; updatePreferences(current => ({...current, projects: {...current.projects, [last.project]: last.prefs}}));}, []);
  useEffect(() => {session.start(); return () => session.dispose();}, [session]);
  useEffect(() => {
    if (lastProject.current !== state.project) {
      lastProject.current = state.project; setP(preferences.projects[state.project] ?? defaultProject());
      setModal(null); setTrail([]); setNodeIndex(0); setScroll(0); setExpanded(false); setMessage('Project changed.');
    }
  }, [state.project]);
  useEffect(() => {
    const timer = setTimeout(() => updatePreferences(current => ({...current, projects: {...current.projects, [state.project]: p}})), 200);
    return () => clearTimeout(timer);
  }, [p, state.project]);
  useEffect(() => {
    if (!preferences.motion || (!state.saving && !working && !celebration)) return;
    const interval = setInterval(() => setPulse(value => value + 1), 90);
    const end = state.saving || working ? undefined : setTimeout(() => {clearInterval(interval); setCelebration(0);}, 630);
    return () => {clearInterval(interval); clearTimeout(end);};
  }, [state.saving, working, celebration, preferences.motion]);

  const visible = useMemo(() => {
    try {return queryIssues(state.issues, p.filter, p.query, p.sort, preferences.user);} catch {return [];}
  }, [state.issues, p.filter, p.query, p.sort, preferences.user]);
  const graphRows = useMemo(() => layoutGraph(state.issues, edgeMode), [state.issues, edgeMode]);
  const selected = selectedIssue(p.view === 'links' ? state.issues : visible, p.selected);
  const nodes = selected ? graphNodes(selected, state.issues) : [];
  useEffect(() => {session.select(selected?.id ?? ''); setScroll(0); setNodeIndex(0);}, [selected?.id]);
  useEffect(() => {session.needGraph(p.view === 'links' || p.filter === 'blocked' || p.query.includes('is:blocked'));}, [p.view, p.filter, p.query]);
  const ascii = preferences.ascii;
  const bodyHeight = height - 8;
  const typing = Boolean(modal && (!modal.choices || modal.searchable) && !modal.readOnly);
  const choices = modal?.choices?.filter(item => !modal.searchable || item.label.toLowerCase().includes(modal.value.toLowerCase())) ?? [];

  function notify(value: string) {setMessage(value); setError('');}
  function open(next: Omit<Modal, 'initial'>) {setModal({...next, initial: next.value}); setChoice(0); setError('');}
  function menu(title: string, entries: Choice[], searchable = false) {open({title, value: '', choices: entries, searchable});}
  function input(title: string, value: string, submit: (value: string) => void | Promise<void>, multiline = false, hint = '') {open({title, value, submit, multiline, hint});}
  async function perform(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setWorking(true); setError('');
    try {await operation();} catch (failure) {const detail = failure instanceof Error ? failure.message : String(failure); setError(detail); setMessage(detail);}
    finally {lock.current = false; setWorking(false);}
  }
  async function write(command: Mutation, base = selected) {
    const readyBefore = new Set(state.issues.filter(issue => issue.ready).map(issue => issue.id));
    const id = await session.mutate(command, base);
    const next = session.getSnapshot();
    const released = next.issues.filter(issue => issue.ready && !readyBefore.has(issue.id) && issue.id !== id);
    setModal(null); setCelebration(Date.now());
    if (id) setP(value => ({...value, filter: 'all', query: '', selected: id}));
    const movedId = command.kind === 'close' || command.kind === 'update' && command.patch.status ? command.id : undefined;
    const reveal = Boolean(movedId && !next.stale && !queryIssues(next.issues, p.filter, p.query, p.sort, preferences.user).some(issue => issue.id === movedId));
    if (movedId && !next.stale) setP(value => ({...value, selected: movedId, closedCollapsed: false, ...(reveal ? {filter: 'all', query: ''} : {})}));
    notify(`${command.kind === 'export' ? 'JSONL exported.' : 'Saved.'}${reveal ? ' Showing all issues to keep the moved issue visible.' : ''}${released.length ? ` ${released.length} now ready: ${released.map(issue => issue.id).join(', ')}.` : ''}${next.stale ? ' Refresh failed; showing last known state.' : ''}`);
  }
  function editField(field: keyof Patch, title: string, multiline = false) {
    if (!selected) return;
    const base = structuredClone(selected);
    input(title, String(selected[field] ?? ''), async value => {
      if ((field === 'due' || field === 'defer') && value && !/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) throw new Error('Use YYYY-MM-DD or an ISO timestamp with Z or an explicit offset.');
      if ((field === 'due' || field === 'defer') && value && Number.isNaN(Date.parse(value))) throw new Error('Enter a valid date.');
      await write({kind: 'update', id: base.id, patch: {[field]: value}}, base);
    }, multiline, field === 'due' || field === 'defer' ? 'Dates use ISO 8601; timestamps must name their timezone. Empty clears the field.' : multiline ? 'Enter newline / Ctrl+S save / Ctrl+E external editor' : 'Enter save / Esc cancel');
  }
  function fields() {
    menu('EDIT ISSUE', [
      ...([['title', 'Title'], ['description', 'Description'], ['design', 'Design notes'], ['acceptance', 'Acceptance criteria'], ['notes', 'Working notes'], ['assignee', 'Assignee'], ['owner', 'Owner'], ['due', 'Due date'], ['defer', 'Defer until'], ['externalRef', 'External reference']] as [keyof Patch, string][])
        .map(([field, title]) => ({label: title, run: () => editField(field, title, ['description', 'design', 'acceptance', 'notes'].includes(field))})),
      {label: 'Status', run: statusMenu}, {label: 'Priority', run: priorityMenu}, {label: 'Type', run: typeMenu}, {label: 'Labels', run: labelMenu},
    ], true);
  }
  function statusMenu() {
    if (!selected) return; const base = structuredClone(selected);
    const blockedBy = blockers(base, state.issues);
    menu('MOVE ISSUE', statuses.map(status => ({label: statusLabels[status] + (status === 'in_progress' && blockedBy.length ? ` (! ${blockedBy.length} unresolved blocker${blockedBy.length === 1 ? '' : 's'})` : ''), run: () => status === 'closed' ? complete(base) : write({kind: 'update', id: base.id, patch: {status}}, base)})));
  }
  function priorityMenu() {
    if (!selected) return; const base = structuredClone(selected);
    menu('SET PRIORITY', ([1, 2, 3, 4] as const).map(priority => ({label: `P${priority} ${['Critical', 'High', 'Medium', 'Low'][priority - 1]}`, run: () => write({kind: 'update', id: base.id, patch: {priority}}, base)})));
  }
  function typeMenu() {
    if (!selected) return; const base = structuredClone(selected);
    menu('ISSUE TYPE', ['task', 'bug', 'feature', 'epic', 'story'].map(type => ({label: type, run: () => write({kind: 'update', id: base.id, patch: {type}}, base)})));
  }
  function complete(base = selected) {if (base) input(`COMPLETE ${base.id}`, '', async reason => write({kind: 'close', id: base.id, reason}, base), false, 'Optional close reason. Enter confirms completion.');}
  function labelMenu() {
    if (!selected) return; const base = structuredClone(selected);
    const labels = [...new Set(state.issues.flatMap(issue => issue.labels))].sort();
    menu('LABELS / SELECT TO TOGGLE', [
      {label: '+ Add a new label', run: () => input('NEW LABEL', '', async label => write({kind: 'label', id: base.id, label, remove: false}, base))},
      ...labels.map(label => ({label: `${base.labels.includes(label) ? '[x]' : '[ ]'} ${label}`, run: () => write({kind: 'label', id: base.id, label, remove: base.labels.includes(label)}, base)})),
    ], true);
  }
  function dependencyMenu() {
    if (!selected) return; const base = structuredClone(selected);
    menu('RELATIONSHIPS', [
      ...(['blocks', 'parent-child', 'related'] as const).map(relation => ({label: relation === 'blocks' ? 'Add blocker (this issue waits for...)' : relation === 'parent-child' ? 'Set parent (this issue belongs to...)' : 'Add related issue', run: () => {
        menu('CHOOSE TARGET ISSUE', state.issues.filter(issue => issue.id !== base.id).map(issue => ({label: `${issue.id} ${issue.title}`, run: async () => {
          if (relation === 'blocks') {session.needGraph(true); await session.refresh(); if (!session.getSnapshot().graphLoaded) throw new Error('Wait for relationships to finish loading, then try again.'); if (wouldCycle(session.getSnapshot().issues, base.id, issue.id)) throw new Error('That relationship would create a blocking cycle.');}
          await write({kind: 'dependency', id: base.id, target: issue.id, relation, remove: false}, base);
        }})), true);
      }})),
      ...base.dependencies.map(dep => ({label: `Remove ${dep.type} link to ${dep.id}`, run: () => write({kind: 'dependency', id: base.id, target: dep.id, relation: dep.type, remove: true}, base)})),
    ]);
  }
  function chooseFilter() {
    const pick = (filter: Filter, query = '') => {setP(value => ({...value, filter, query})); setModal(null);};
    menu('SAVED VIEWS', [
      {label: 'Ready to start', run: () => pick('ready')}, {label: 'Not closed', run: () => pick('active')},
      {label: 'Blocked', run: () => pick('blocked')}, {label: 'Everything', run: () => pick('all')},
      {label: 'Epics', run: () => pick('all', 'type:epic')}, {label: 'Mine', run: () => pick('active', 'assignee:me')},
      ...preferences.savedViews.map(view => ({label: view.name, run: () => pick(view.filter, view.query)})),
      {label: '+ Save current view', run: () => input('NAME THIS VIEW', '', name => {if (!name.trim()) throw new Error('Enter a name.'); updatePreferences(value => ({...value, savedViews: [...value.savedViews.filter(view => view.name !== name), {name, filter: p.filter, query: p.query}]})); setModal(null);})},
      ...preferences.savedViews.map(view => ({label: `Delete saved view: ${view.name}`, run: () => {updatePreferences(value => ({...value, savedViews: value.savedViews.filter(item => item.name !== view.name)})); setModal(null);}})),
    ], true);
  }
  async function switchProject(path: string) {
    const canonical = await findProject(path);
    const executable = session.client instanceof CliClient ? session.client.executable : 'bees';
    await session.switchProject(new CliClient(canonical, executable));
    updatePreferences(value => ({...value, recent: [canonical, ...value.recent.filter(item => item !== canonical)].slice(0, 20)}));
    setModal(null);
  }
  function projects() {
    menu('PROJECTS', [
      {label: '+ Open a project path', run: () => input('PROJECT DIRECTORY', '', switchProject)},
      ...preferences.recent.map(path => ({label: path, run: () => switchProject(path)})),
      {label: 'Discover within configured roots', run: async () => {
        const controller = new AbortController(); discovery.current = controller;
        try {const paths = await discoverProjects(preferences.roots, controller.signal); menu('DISCOVERED PROJECTS', paths.map(path => ({label: path, run: () => switchProject(path)})), true);}
        finally {discovery.current = null;}
      }},
      {label: '+ Add a discovery root', run: () => input('DISCOVERY ROOT', '', async path => {if (!path.trim()) throw new Error('Enter a directory.'); updatePreferences(value => ({...value, roots: [...new Set([...value.roots, path])]})); setModal(null);})},
    ], true);
  }
  function settings() {
    menu('PREFERENCES', [
      ...(['honey', 'paper', 'terminal'] as ThemeName[]).map(theme => ({label: `Theme: ${theme}`, run: () => {updatePreferences(value => ({...value, theme})); setModal(null);}})),
      {label: `Motion: ${preferences.motion ? 'on' : 'off'} (toggle)`, run: () => {updatePreferences(value => ({...value, motion: !value.motion})); setModal(null);}},
      {label: `ASCII symbols: ${preferences.ascii ? 'on' : 'off'} (toggle)`, run: () => {updatePreferences(value => ({...value, ascii: !value.ascii})); setModal(null);}},
      {label: 'Your name / assignment identity', run: () => input('YOUR NAME', preferences.user, user => {updatePreferences(value => ({...value, user})); setModal(null);})},
      {label: 'External editor executable', run: () => input('EDITOR EXECUTABLE', preferences.editor || '', editor => {updatePreferences(value => ({...value, editor})); setModal(null);}, false, 'Executable path only; no shell commands. Default: EDITOR or platform editor.')},
      {label: 'External editor arguments', run: () => input('EDITOR ARGUMENTS', JSON.stringify(preferences.editorArgs), text => {
        const args: unknown = JSON.parse(text); if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw new Error('Enter a JSON array of argument strings.');
        updatePreferences(value => ({...value, editorArgs: args})); setModal(null);
      }, false, 'JSON array, for example ["--wait"]. The draft filename is appended.')},
    ]);
  }
  function columnMenu() {
    menu('TABLE COLUMNS / ORDER', [
      ...availableColumns.map(column => ({label: `${p.columns.includes(column) ? '[x]' : '[ ]'} ${column}`, run: () => {if (column === 'id' || column === 'title') throw new Error('ID and title stay visible.'); setP(value => ({...value, columns: value.columns.includes(column) ? value.columns.filter(item => item !== column) : [...value.columns, column]})); setModal(null);}})),
      {label: 'Reorder columns', run: () => input('COLUMN ORDER', p.columns.join(', '), text => {const order = text.split(',').map(value => value.trim()) as Column[]; if (order.some(value => !availableColumns.includes(value)) || !order.includes('id') || !order.includes('title') || new Set(order).size !== order.length) throw new Error('Use unique column names including id and title.'); setP(value => ({...value, columns: order})); setModal(null);})},
    ]);
  }
  function sortMenu() {
    menu('SORT / FIRST RULE HAS PRECEDENCE', [
      ...p.sort.map((rule, index) => ({label: `${index + 1}. ${rule.field} ${rule.descending ? 'descending' : 'ascending'} (toggle)`, run: () => {setP(value => ({...value, sort: value.sort.map((item, i) => i === index ? {...item, descending: !item.descending} : item)})); setModal(null);}})),
      ...availableColumns.filter(column => !p.sort.some(rule => rule.field === column)).map(field => ({label: `Then by ${field}`, run: () => {setP(value => ({...value, sort: [...value.sort, {field, descending: false}]})); setModal(null);}})),
      {label: 'Reset to priority', run: () => {setP(value => ({...value, sort: [{field: 'priority', descending: false}]})); setModal(null);}},
      {label: 'Remove last sort rule', run: () => {setP(value => ({...value, sort: value.sort.slice(0, -1)})); setModal(null);}},
    ]);
  }
  function commands() {
    menu('WHAT WOULD YOU LIKE TO DO?', [
      {label: 'Create issue', run: () => input('NEW ISSUE', '', async title => write({kind: 'create', title}))},
      ...(selected ? [{label: 'Edit issue fields', run: fields}, {label: 'Complete issue', run: () => complete()}, {label: 'Manage labels', run: labelMenu}, {label: 'Manage relationships', run: dependencyMenu},
        {label: 'Copy issue ID', run: async () => {await copyText(selected.id); setModal(null); notify(`Copied ${selected.id}`);}}] : []),
      {label: 'Switch project', run: projects}, {label: 'Saved views', run: chooseFilter}, {label: 'Table columns', run: columnMenu}, {label: 'Sorting', run: sortMenu}, {label: 'Preferences', run: settings},
      {label: 'Refresh from Bees', run: async () => {await session.refresh(); setModal(null); notify('Refresh requested.');}},
      {label: 'Export issues to JSONL', run: async () => write({kind: 'export'})},
      {label: 'Undo last reversible change', run: async () => {await session.undoLast(); setModal(null); notify('Change restored.');}},
      ...(state.uncertain ? [{label: 'Allow edits after review of uncertain result', run: async () => {await session.allowEditsAfterReview(); setModal(null); notify('Edits enabled.');}}] : []),
      ...(['work', 'board', 'links'] as View[]).map(view => ({label: `Show ${view === 'links' ? 'Graph' : view === 'work' ? 'Queue' : 'Board'}`, run: () => {setP(value => ({...value, selected: selected?.id ?? value.selected, view})); setModal(null);}})),
    ], true);
  }

  useInput((keyText, key) => {
    if (key.escape && discovery.current) {discovery.current.abort(); return;}
    if (lock.current || state.saving) return;
    if (width < 48 || height < 18) {if (keyText === 'q') exit(); return;}
    if (modal) {
      if (key.escape) {
        if (!modal.choices && !modal.readOnly && modal.value !== modal.initial) {
          const previous = modal;
          menu('DISCARD UNSAVED CHANGES?', [{label: 'Keep editing', run: () => {setModal(previous); setChoice(0);}}, {label: 'Discard draft', run: () => {setModal(null); setError('');}}]);
        } else {setModal(null); setError('');}
        return;
      }
      if (modal.choices) {
        if (key.upArrow || (!typing && keyText === 'k')) setChoice(value => Math.max(0, value - 1));
        if (key.downArrow || (!typing && keyText === 'j')) setChoice(value => Math.max(0, Math.min(choices.length - 1, value + 1)));
        if (key.return && choices[choice]) {
          try {const result = choices[choice]!.run(); if (result instanceof Promise) void perform(async () => {await result;});}
          catch (failure) {setError(failure instanceof Error ? failure.message : String(failure));}
        }
      } else if (key.return && !modal.multiline || key.ctrl && keyText === 's') {
        if (modal.readOnly) setModal(null);
        else if (modal.submit) void perform(async () => {await modal.submit!(modal.value);});
      } else if (key.ctrl && keyText === 'e' && modal.multiline) {
        void perform(async () => {const text = await externalEdit(modal.value, preferences.editor || process.env.EDITOR || (process.platform === 'win32' ? 'notepad.exe' : 'vi'), preferences.editorArgs, suspendTerminal); setModal({...modal, value: text});});
      }
      return;
    }
    if (keyText === 'q') {exit(); return;}
    if (keyText === ':' || key.ctrl && keyText === 'p') {commands(); return;}
    if (keyText === '/') {input('SEARCH ISSUES', p.query, query => {parseQuery(query); setP(value => ({...value, query})); setModal(null);}, false, 'Words, quoted values, label:, p:, type:, status:, assignee:me'); return;}
    if (keyText === 'f') chooseFilter();
    if (keyText === 'P') projects();
    if (keyText === ',') settings();
    if (keyText === 'r') void perform(async () => {await session.refresh(); notify('Refreshed from Bees.');});
    if (keyText === 'n') input('NEW ISSUE', '', async title => write({kind: 'create', title}));
    if (keyText === 'e') fields();
    if (keyText === 's') statusMenu();
    if (keyText === 'p') priorityMenu();
    if (keyText === 't') typeMenu();
    if (keyText === 'l' && p.view !== 'board' && p.view !== 'links') labelMenu();
    if (keyText === 'd') dependencyMenu();
    if (keyText === 'x') complete();
    if (keyText === 'a' && selected) void perform(async () => {if (!preferences.user) throw new Error('Set your name in Preferences first.'); await write({kind: 'update', id: selected.id, patch: {assignee: preferences.user}});});
    if (keyText === 'c' && selected) {const base = selected; input('ADD COMMENT', '', async text => write({kind: 'comment', id: base.id, text, author: preferences.user}, base), true, 'Enter newline / Ctrl+S submit');}
    if (keyText === 'y' && selected) void perform(async () => {await copyText(selected.id); notify(`Copied ${selected.id}`);});
    if (keyText === 'u') void perform(async () => {await session.undoLast(); notify('Change restored.');});
    if (keyText === 'v' && p.view === 'links') setEdgeMode(value => edgeModes[(edgeModes.indexOf(value) + 1) % edgeModes.length]!);
    if (keyText === 'g') setGraphList(value => !value);
    if (keyText === 'z') setP(value => ({...value, closedCollapsed: !value.closedCollapsed}));
    if (['1', '2', '3'].includes(keyText)) {setP(value => ({...value, selected: selected?.id ?? value.selected, view: (['work', 'board', 'links'] as View[])[Number(keyText) - 1]!})); setExpanded(false);}
    if (keyText === '[' || keyText === ']') {setSection(detailSections[(detailSections.indexOf(section) + (keyText === ']' ? 1 : detailSections.length - 1)) % detailSections.length]!); setScroll(0);}
    if (key.pageDown || key.pageUp) setScroll(value => Math.max(0, value + (key.pageDown ? 1 : -1) * Math.max(1, bodyHeight - 12)));
    if (keyText === '?') menu('KEYBOARD GUIDE', [
      '* uncommitted: staged or unstaged JSONL issue changes',
      'Live light: brightens after reads / time: last successful read',
      'j/k or arrows: navigate / h/l: board lanes or follow graph links', '1 Queue / 2 Board / 3 Graph', 'Enter inspect / Esc back / g graph/list / v link types', 'e edit fields / n new / s status / p priority / t type', 'c comment / a assign to me / x complete / u undo', 'd relationships / l labels / y copy ID', '/ search / f saved views / : commands / r refresh', 'P projects / , preferences / z collapse closed', '[ ] detail sections / PgUp PgDn scroll', 'Ctrl+S save multiline / Ctrl+E external editor', 'q quit / changes are saved through Bees',
    ].map(label => ({label, run: () => setModal(null)})));
    if (key.escape) {
      if (expanded) setExpanded(false);
      else if (p.view === 'links' && trail.length) {const previous = trail.at(-1)!; setP(previous.prefs); setSection(previous.section); setScroll(previous.scroll); setTrail(value => value.slice(0, -1));}
      else if (p.query) setP(value => ({...value, query: ''}));
      else setP(value => ({...value, view: 'work'}));
    }
    if (key.return) setExpanded(value => !value);
    const delta = key.downArrow || keyText === 'j' ? 1 : key.upArrow || keyText === 'k' ? -1 : 0;
    if (delta) {
      if (p.view === 'links' && !expanded) setP(value => ({...value, selected: moveSelection(graphRows.map(row => row.issue), selected?.id ?? '', delta)}));
      else if (expanded) setScroll(value => Math.max(0, value + delta));
      else {const candidates = p.view === 'board' && selected ? visible.filter(issue => (issue.rawStatus || issue.status) === (selected.rawStatus || selected.status)) : visible; setP(value => ({...value, selected: moveSelection(candidates, selected?.id ?? '', delta)}));}
    }
    if (key.leftArrow || key.rightArrow || keyText === 'h' || keyText === 'l') {
      const direction = key.leftArrow || keyText === 'h' ? -1 : 1;
      if (p.view === 'links' && !expanded) {const node = nodes.find(node => node.lane === (direction < 0 ? 'left' : 'right')); if (node && state.issues.some(issue => issue.id === node.id)) {setTrail(value => [...value, {prefs: {...p, selected: selected?.id ?? p.selected}, section, scroll}]); setP(value => ({...value, selected: node.id}));}}
      if (p.view === 'board' && selected) {
        const lanes = [...new Set<string>([...statuses, ...visible.map(issue => issue.rawStatus || issue.status)])];
        for (let offset = 1; offset < lanes.length; offset++) {
          const status = lanes[(lanes.indexOf(selected.rawStatus || selected.status) + direction * offset + lanes.length) % lanes.length];
          const target = visible.find(issue => (issue.rawStatus || issue.status) === status && !(p.closedCollapsed && status === 'closed'));
          if (target) {setP(value => ({...value, selected: target.id})); break;}
        }
      }
    }
  });

  if (width < 48 || height < 18) return <Box flexDirection="column" width={width}><Text>bees / Resize to at least 48 x 18.</Text><Text>q quit</Text></Box>;
  const inspector = p.view !== 'board' && !expanded && width >= 100 && !screenReader ? Math.min(49, Math.floor(width * 0.39)) : 0;
  const completeCount = state.issues.filter(issue => issue.status === 'closed').length;
  const progress = Math.round(completeCount / Math.max(1, state.issues.length) * 12);
  const spinner = preferences.motion ? (ascii ? ['-', '\\', '|', '/'] : ['⠋', '⠙', '⠹', '⠸'])[pulse % 4] : '*';
  return <Box width={width} height={height - 1} flexDirection="column" backgroundColor={preferences.theme === 'terminal' ? undefined : c.dark}>
    <Box justifyContent="space-between"><Text color={c.honey} bold>{fit(`${ascii ? 'bees' : '🐝 bees'} / ${basename(state.project)}`, Math.max(20, width - 25), ascii)}</Text><LiveStatus refreshedAt={state.refreshedAt} stale={state.stale} uncertain={state.uncertain} motion={preferences.motion && !screenReader} ascii={ascii}/></Box>
    <Text color={c.muted}>{fit(`${(ascii ? '#' : '━').repeat(progress)}${(ascii ? '-' : '─').repeat(12 - progress)} ${completeCount}/${state.issues.length} complete / ${p.filter.toUpperCase()}${p.query ? ' / ' + p.query : ''}`, width, ascii)}</Text>
    <Text color={c.honey}>{fit(`1 Queue   2 Board   3 Graph   ${state.gitAvailable === false ? 'Git: unavailable' : ''}`, width, ascii)}</Text>
    <Box height={1}/>
    {modal ? <Box width={width} height={bodyHeight} borderStyle={ascii ? asciiBorder : 'round'} borderColor={error ? c.red : c.honey} paddingX={2} flexDirection="column">
      <Text color={c.honey} bold>{fit(modal.title, width - 6, ascii)}</Text>
      <Text color={c.muted}>{fit(modal.hint || (selected ? `${selected.id} / ${selected.title}` : state.project), width - 6, ascii)}</Text>
      {typing && <Editor key={modal.title} value={modal.value} onChange={value => {setModal({...modal, value}); setChoice(0); setError('');}} width={width - 6} height={modal.multiline ? Math.max(1, bodyHeight - 6) : 1} multiline={modal.multiline} active={!working && !state.saving}/>}
      {viewport(choices, choice, bodyHeight - (typing ? 7 : 6)).map(item => <Text key={item.label} color={item === choices[choice] ? c.honey : c.text}>{fit(`${item === choices[choice] ? '>' : ' '} ${item.label}`, width - 6, ascii)}</Text>)}
      {modal.choices && !choices.length && <Text color={c.muted}>No matches.</Text>}
      <Box flexGrow={1}/>
      <Text color={c.red}>{fit(error, width - 6, ascii)}</Text>
      <Text color={c.muted}>{modal.multiline ? 'Ctrl+S save / Ctrl+E editor / Esc cancel' : 'Enter select/save / Esc cancel'}</Text>
    </Box> : <Box height={bodyHeight}>
      {expanded ? <Inspector issue={selected} issues={state.issues} section={section} scroll={scroll} width={width} height={bodyHeight} ascii={ascii}/> : <>
        {p.view === 'work' && <IssueList issues={visible} all={state.issues} selected={selected} width={width - inspector} height={bodyHeight} ascii={ascii} columns={p.columns}/>}
        {p.view === 'board' && <Board issues={visible} all={state.issues} selected={selected} width={width} height={bodyHeight} ascii={ascii} closedCollapsed={p.closedCollapsed}/>}
        {p.view === 'links' && <RelationshipGraph issue={selected} issues={state.issues} mode={edgeMode} width={width - inspector} height={bodyHeight} ascii={ascii} list={graphList || screenReader}/>}
        {inspector > 0 && <Inspector issue={selected} issues={state.issues} section={p.view === 'links' ? 'Relationships' : section} scroll={scroll} width={inspector} height={bodyHeight} ascii={ascii}/>}
      </>}
    </Box>}
    <Text color={error || state.stale || state.uncertain ? c.red : celebration ? c.green : c.muted}>{fit(working || state.saving ? `${spinner} Working...` : `${celebration ? ascii ? '*' : '✦' : '>'} ${error || state.error || configError || message}`, width, ascii)}</Text>
    <Text color={c.muted}>{fit(width < 80 ? '/ search  : commands  ? keys  q quit' : '/ search   f views   e edit   x complete   d links   r refresh   ? keys   q quit', width, ascii)}</Text>
  </Box>;
}




