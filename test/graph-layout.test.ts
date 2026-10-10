import {describe, expect, it} from 'vitest';
import {layoutGraph} from '../src/graph-layout.js';
import {demoIssues} from '../src/fixtures.js';

describe('Git-style graph layout', () => {
  it('orders prerequisites above descendants and renders a two-branch merge once', () => {
    const issues = demoIssues(), rows = layoutGraph(issues);
    const position = new Map(rows.map((row, index) => [row.issue.id, index]));
    for (const issue of issues) for (const edge of issue.dependencies) expect(position.get(edge.id)!).toBeLessThan(position.get(issue.id)!);
    expect(rows.filter(row => row.issue.id === 'bees-47')).toHaveLength(1);
    const branch = rows.find(row => row.issue.id === 'bees-42')!;
    expect(branch.connector.some(cell => cell.char === '─')).toBe(true);
    expect(rows.some(row => row.node.filter(cell => cell.char === '│').length >= 1)).toBe(true);
  });
  it('filters edge types without dropping or duplicating issues', () => {
    const issues = demoIssues();
    for (const mode of ['blocks', 'parent-child', 'related'] as const) {
      const rows = layoutGraph(issues, mode);
      expect(new Set(rows.map(row => row.issue.id)).size).toBe(issues.length);
      expect(rows.flatMap(row => [...row.node, ...row.connector]).every(cell => !cell.type || cell.type === mode)).toBe(true);
    }
  });
  it('terminates for cycles and missing targets with an honest unresolved-order marker', () => {
    const issues = demoIssues().slice(0, 3);
    issues[0]!.dependencies = [{id: issues[1]!.id, type: 'blocks'}, {id: 'missing', type: 'related'}];
    issues[1]!.dependencies = [{id: issues[0]!.id, type: 'blocks'}];
    const rows = layoutGraph(issues);
    expect(rows).toHaveLength(3); expect(rows.some(row => row.cyclic)).toBe(true);
  });
  it('bounds rail width and signals omitted tracks in a large fan-out', () => {
    const root = demoIssues()[0]!;
    const issues = [root, ...Array.from({length: 100}, (_, index) => ({...root, id: `child-${index}`, dependencies: [{id: root.id, type: 'blocks' as const}]}))];
    const rows = layoutGraph(issues, 'all', true, 4);
    expect(rows).toHaveLength(101); expect(rows[0]!.overflow).toBe(true);
    expect(rows.every(row => row.node.length === 8 && row.connector.length === 8)).toBe(true);
    expect(rows.flatMap(row => [...row.node, ...row.connector]).every(cell => /^[\x20-\x7e]$/.test(cell.char))).toBe(true);
  });
});
