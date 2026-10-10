import {describe, expect, it} from 'vitest';
import {demoIssues} from '../src/fixtures.js';
import {blockers, isReady, matchesFilter, moveSelection, newlyReady, relationRows, selectedIssue, visibleIssues} from '../src/model.js';
import {clean, fit, viewport} from '../src/theme.js';
import stringWidth from 'string-width';

describe('Bees workflow semantics', () => {
  it('finishing a blocker releases exactly the eligible issues, not their downstream work', () => {
    const before = demoIssues();
    const after = before.map(issue => issue.id === 'bees-42' ? {...issue, status: 'closed' as const} : issue);
    expect(newlyReady(before, after).map(issue => issue.id)).toEqual(['bees-43', 'bees-44']);
    expect(isReady(after.find(issue => issue.id === 'bees-47')!, after)).toBe(false);
    expect(blockers(before.find(issue => issue.id === 'bees-42')!, before)).toEqual([]);
  });
  it('keeps blocked separate from status and ignores related/parent edges', () => {
    const issues = demoIssues();
    const active = issues.find(issue => issue.id === 'bees-47')!;
    expect(active.status).toBe('in_progress');
    expect(matchesFilter(active, issues, 'blocked')).toBe(true);
    expect(isReady(issues.find(issue => issue.id === 'bees-42')!, issues)).toBe(true);
    expect(blockers(issues.find(issue => issue.id === 'bees-45')!, issues)).toEqual([]);
  });
  it('does not treat a missing blocker as completed', () => {
    const issues = demoIssues().filter(issue => issue.id !== 'bees-42');
    expect(isReady(issues.find(issue => issue.id === 'bees-43')!, issues)).toBe(false);
  });
  it('handles cycles without recursion or false readiness', () => {
    const issues = demoIssues().slice(0, 2);
    issues[0]!.dependencies = [{id: issues[1]!.id, type: 'blocks'}];
    issues[1]!.dependencies = [{id: issues[0]!.id, type: 'blocks'}];
    expect(visibleIssues(issues, 'ready', '')).toEqual([]);
  });
  it('requires every blocker to finish', () => {
    const issues = demoIssues();
    const target = {...issues.find(issue => issue.id === 'bees-47')!, status: 'open' as const};
    for (const [a, b, ready] of [[false, false, false], [true, false, false], [false, true, false], [true, true, true]]) {
      const state = issues.map(issue => issue.id === 'bees-45' ? {...issue, status: a ? 'closed' as const : 'open' as const} : issue.id === 'bees-43' ? {...issue, status: b ? 'closed' as const : 'open' as const} : issue);
      expect(isReady(target, state)).toBe(ready);
    }
  });
  it('combines structured filters with free text, case insensitively', () => {
    expect(visibleIssues(demoIssues(), 'all', 'label:KEYBOARD p:1 palette').map(issue => issue.id)).toEqual(['bees-42']);
    expect(visibleIssues(demoIssues(), 'all', 'type:bug assignee:you status:in_progress').map(issue => issue.id)).toEqual(['bees-45']);
    expect(visibleIssues(demoIssues(), 'all', 'missing')).toEqual([]);
  });
  it('preserves identity across sorting, clamps navigation, and handles an empty queue', () => {
    const issues = visibleIssues(demoIssues(), 'all', '');
    expect(selectedIssue(issues, 'bees-45')?.id).toBe('bees-45');
    expect(moveSelection(issues, issues[0]!.id, -1)).toBe(issues[0]!.id);
    expect(moveSelection(issues, issues.at(-1)!.id, 1)).toBe(issues.at(-1)!.id);
    expect(selectedIssue([], 'anything')).toBeUndefined();
    expect(moveSelection([], '', 1)).toBe('');
  });
  it('labels relationship direction from the selected issue', () => {
    const issues = demoIssues();
    expect(relationRows(issues.find(issue => issue.id === 'bees-42')!, issues)).toEqual([
      {id: 'bees-40', label: 'Parent'}, {id: 'bees-43', label: 'Blocks'}, {id: 'bees-44', label: 'Blocks'},
    ]);
  });
});

describe('terminal cell geometry', () => {
  it.each(['🐝 emoji', '中文 work', 'e\u0301lan', '👩‍💻 dev', 'ordinary', '\x1b[31mred\x1b[0m'])('fits %s without splitting graphemes', text => {
    for (let width = 0; width < 18; width++) expect(stringWidth(fit(text, width))).toBe(width);
  });
  it('strips control characters and terminal escape sequences', () => {
    expect(clean('\x1b[2Jhello\x07')).toBe('hello ');
    expect(clean('\x1b]0;malicious title\x07normal')).toBe('normal');
  });
  it('keeps the selected item in a bounded viewport', () => {
    const items = Array.from({length: 1000}, (_, i) => i);
    for (const index of [0, 1, 5, 500, 999]) {
      const result = viewport(items, index, 8);
      expect(result).toContain(index);
      expect(result).toHaveLength(8);
    }
  });
});
