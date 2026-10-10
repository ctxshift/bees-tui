import type {Issue} from '../src/model.js';

const base: Omit<Issue, 'id' | 'title'> = {
  description: 'Make the next piece of work easier to pick up and finish.',
  status: 'open', priority: 2, type: 'task', assignee: 'you', labels: [], dependencies: [],
  design: 'Keep the change small. Prefer one clear interaction and a visible outcome.',
  acceptance: '[ ] Works with the keyboard\n[ ] Handles empty and error states\n[ ] Has a behavior test', comments: [],
};

export function testIssues(): Issue[] {
  return structuredClone([
    {...base, id: 'bees-40', title: 'A calmer place to ship great work', type: 'epic', priority: 2,
      description: 'A terminal workbench that makes the next action obvious. Fast navigation, clear dependencies, and a little delight.', labels: ['milestone']},
    {...base, id: 'bees-42', title: 'Land the command palette', priority: 1, type: 'feature',
      description: 'One small doorway to every action. Search commands, jump to an issue, and keep your hands on the keyboard.',
      labels: ['experience', 'keyboard'], dependencies: [{id: 'bees-40', type: 'parent-child'}],
      design: 'Open with : or Ctrl+P.\n\nCommands describe the outcome. The selected issue supplies context. Escape restores the exact place you left.',
      acceptance: '[x] Every command names its outcome\n[x] Escape restores focus\n[ ] Success explains what changed',
      comments: [{author: 'mira', text: 'The palette should feel like a shortcut, never a detour.'}]},
    {...base, id: 'bees-43', title: 'Jump between connected issues', type: 'feature',
      description: 'Follow a blocker, resolve it, then return to your original issue.',
      labels: ['experience'], dependencies: [{id: 'bees-42', type: 'blocks'}, {id: 'bees-40', type: 'parent-child'}]},
    {...base, id: 'bees-44', title: 'Make every action discoverable', type: 'task',
      description: 'Contextual key hints and a searchable command palette make the interface approachable.',
      assignee: 'mira', labels: ['keyboard'], dependencies: [{id: 'bees-42', type: 'blocks'}]},
    {...base, id: 'bees-45', title: 'Keep emoji columns aligned', type: 'bug', status: 'in_progress', priority: 1,
      description: 'Measure terminal cells rather than string length. Include emoji, CJK, and combining characters.',
      labels: ['terminal', 'polish'], dependencies: [{id: 'bees-48', type: 'related'}]},
    {...base, id: 'bees-46', title: 'Write the first-run welcome', type: 'story', priority: 3, assignee: 'mira', labels: ['experience']},
    {...base, id: 'bees-47', title: 'Ship the workbench', status: 'in_progress', priority: 2,
      labels: ['release'], dependencies: [{id: 'bees-45', type: 'blocks'}, {id: 'bees-43', type: 'blocks'}]},
    {...base, id: 'bees-48', title: 'Offer a quiet, ASCII-only mode', status: 'closed', priority: 3, labels: ['terminal']},
    {...base, id: 'bees-49', title: 'Explore project switching', status: 'deferred', priority: 4, assignee: '', labels: ['exploration']},
    {...base, id: 'bees-50', title: 'Test narrow terminal layouts', priority: 3, labels: ['testing', 'terminal']},
  ] satisfies Issue[]);
}
