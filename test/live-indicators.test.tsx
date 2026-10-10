import {afterEach, expect, it, vi} from 'vitest';
import {renderToString} from 'ink';
import {cleanup, render} from 'ink-testing-library';
import {LiveStatus} from '../src/live-status.js';
import {IssueList, Board, Inspector} from '../src/views.js';
import {RelationshipGraph} from '../src/graph.js';
import {demoIssues} from '../src/fixtures.js';

afterEach(() => {cleanup(); vi.useRealTimers();});
it('keeps live status text stable throughout a finite receive pulse and supports reduced motion', async () => {
  vi.useFakeTimers();
  const props = {refreshedAt: Date.UTC(2026, 9, 10, 12), stale: false, uncertain: false, motion: true, ascii: true};
  const app = render(<LiveStatus {...props}/>);
  await vi.advanceTimersByTimeAsync(20);
  const before = app.lastFrame();
  expect(before).toMatch(/\* Live \d\d:\d\d:\d\d/);
  await vi.advanceTimersByTimeAsync(700);
  expect(app.lastFrame()).toBe(before);
  app.rerender(<LiveStatus {...props} motion={false}/>);
  await vi.advanceTimersByTimeAsync(20);
  expect(app.lastFrame()).toBe(before);
  app.rerender(<LiveStatus {...props} stale/>);
  await vi.advanceTimersByTimeAsync(20);
  expect(app.lastFrame()).toContain('STALE / r retry');
  app.rerender(<LiveStatus {...props} uncertain/>);
  await vi.advanceTimersByTimeAsync(20);
  expect(app.lastFrame()).toContain('CHECK WRITE RESULT');
});

it('shows a separate change marker in Queue, Board, Graph, list mode and inspection', () => {
  const issues = demoIssues(); const selected = issues[0]!;
  selected.modifiedInJsonl = true;
  const props = {issues, all: issues, selected, width: 100, height: 24, ascii: true};
  const queue = renderToString(<IssueList {...props}/>, {columns: 100});
  const board = renderToString(<Board {...props}/>, {columns: 100});
  const graph = renderToString(<RelationshipGraph {...props} issue={selected}/>, {columns: 100});
  const list = renderToString(<RelationshipGraph {...props} issue={selected} list/>, {columns: 100});
  const inspector = renderToString(<Inspector {...props} issue={selected} section="Overview"/>, {columns: 100});
  for (const frame of [queue, board, graph, list]) expect(frame).toContain('>*');
  expect(inspector).toContain(`* ${selected.id}`);
  selected.modifiedInJsonl = false;
  expect(renderToString(<IssueList {...props}/>, {columns: 100})).not.toContain('>*');
});
