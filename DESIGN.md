# Bees TUI — a workbench for the next good move

Status: visual direction approved on 2026-10-09, with an executable React Ink prototype. The prototype uses fictional, in-memory issues. It does not open a Bees project, execute the Bees CLI, or persist edits.

## The experience

Open the terminal. See what is ready. Inspect without losing your place. Finish one thing and see what it unlocks.

The signature moment: complete a blocker and get **“bees-42 completed. 2 now ready: bees-43, bees-44.”** The queue changes immediately after a successful save. A small green sparkle settles into a check. The interface explains the consequence of the action, not just that a command succeeded.

Bees should feel warm, precise, fast, and alive. Honey gold gives navigation a recognizable identity. Blue signals work in progress, green completion, violet deferral, and coral a problem requiring attention. Color always accompanies words or symbols. Emoji belong in the brand and occasional moments of delight; dense rows use stable, single-cell symbols.

## What we borrow, and what we improve

The [VS Code extension](https://github.com/ctxshift/vscode-bees) provides the baseline: searchable tables, a board, editable details, typed relationships, project selection, and refresh via the CLI. The TUI translates these into keyboard workflows, adding readiness explanations and navigation history.

| Capability | Proposed terminal experience | Demo |
|---|---|---|
| Issue table | Stable selection; search; filters; priority sorting; optional owner/type/label columns | Queue, fixed priority sort, structured search |
| Board | Actual statuses as lanes; filter-aware counts; keyboard move picker | Four lanes; narrow single lane; status picker |
| Details | Inspector follows selection; full-width reading mode; section navigation | Overview, design, acceptance, comments |
| Editing | Inline pickers for short fields; dedicated editor for rich text | Title, status, priority, assignment, comment |
| New issue | Title-first capture; progressively expose more fields | Title-only quick capture |
| Dependencies | Directional links, blocker explanation, jump/back history | Typed relationship navigation |
| Projects | Recent projects; explicitly configured discovery roots; separate view preferences | Single fictional workspace |
| Saved views | Ready, Not closed, Blocked, Epics, Mine, custom saved queries | Ready, Not closed, Blocked, Everything |
| Presentation | Persistent columns, multi-sort, theme, motion and glyph preferences | Responsive sizing, ASCII and no-motion switches |
| Refresh | Last-good view, refresh indicator, stale/error recovery | Simulated save latency and failure |
| Export | Explicit “Export issues to JSONL” action and result | Planned |
| Copy issue ID | `y` and palette action; clipboard success/error feedback | Planned |

The product language, configuration names, and adapter use Bees terminology only. No database administration surfaces or external workflow integrations are part of this product.

## Screen structure

At 132 columns and wider, show a 19-column navigation rail, the work queue, and an inspector of up to 49 columns. At 100–131, remove the rail and keep queue + inspector. At 48–99, show one primary pane; Enter opens details and Escape returns. Below 48 columns or 18 rows, show a resize notice and an exit key.

```text
🐝 bees / workbench                                  project / fresh
━━━━────────  4/12 complete
1 Queue   2 Board   3 Graph

YOUR VIEWS     WORK QUEUE                       INSPECTOR
> Ready       ▸ ○ P1 bees-42 Land the palette   bees-42 / FEATURE
  Not closed    ◐ P2 bees-45 Unicode alignment  ○ Open  P1  @you
  Blocked       ○ P3 bees-50 Narrow layouts    #keyboard
  Everything
                                               OVERVIEW
                                               One small doorway…
                                               Removes a blocker
                                               from 2 issues.

✓ bees-42 completed. 2 now ready.               u undo
/ find  : commands  n new  ? keys  q quit
```

The header is context, not a dashboard full of vanity metrics. Queue count, active filters, completion, project name, and refresh state earn their space. Every pane gets a bounded viewport; changing selection scrolls only as needed. Resize preserves selection, draft, section, and navigation history.

The prototype truncates long inspector content to its available space. Production needs independent inspector scrolling, explicit continuation markers, and page-up/page-down before it can be used for real descriptions.

## Interaction contract

| Key | Meaning |
|---|---|
| `j/k`, arrows | Move selection; in Graph, move among links |
| `h/l`, left/right | Move between populated board lanes |
| `1`, `2`, `3` | Queue, Board, Graph |
| `Enter` | Inspect issue; follow relationship; submit active form |
| `Esc` | Cancel active form; close expanded inspector; retrace relationship; clear search; return to work |
| `/` | Search issues |
| `:` or `Ctrl+P` | Search commands |
| `f` | Select saved view |
| `[` / `]` | Previous/next detail section |
| `n` | New issue |
| `e` | Edit title |
| `s`, `p`, `a` | Status, priority, assign to me |
| `c` | Add comment |
| `x` | Complete selected issue |
| `u` | Undo last in-memory demo change |
| `?`, `q` | Help, quit |
| `!` | Demo only: fail the next save |

One input scope owns keys at a time. Inside a field, `q`, `x`, `n`, and `:` are text, never global actions. A pending save rejects repeated mutation keys. Escape cancels an unsaved draft; production asks before discarding a nonempty rich-text draft. Ctrl+C remains an emergency exit handled by Ink.

Search combines terms with AND. The demo supports free text plus `status:open`, `type:bug`, `label:keyboard`, `assignee:you`, and `p:1`. Filters are explicit and persist when switching views; board counts show visible/total so empty lanes are explainable. Future grammar should add quoted values and validation for unknown field names rather than silently guessing.

### Board

Use Open / In progress / Deferred / Closed. Closed can collapse into a compact summary in production. Keep its count visible and expose the toggle in the palette. Moving focus does not move a card; `s` opens the status picker. Production can add mouse support later, but every operation must work without it.

### Details and editing

Production sections: Overview, Design, Acceptance, Notes, Relationships, Comments. Show status, priority, type, assignee, owner, labels, due/defer dates, external reference, and timestamps. Render a limited Markdown subset without executing terminal control sequences. Long code blocks have horizontal scrolling or wrapping as a preference.

Labels use a searchable add/remove picker with stable colors. Type and assignee have dedicated pickers; support clearing optional fields only when the CLI provides a verified clearing operation. Date editing presents an explicit timezone and validates before submission. Production column preferences support show/hide/reorder plus a multi-column sort editor, with priority then ID as the deterministic fallback. A copy-ID action must report whether clipboard access succeeded and offer a selectable ID if unavailable.

Short fields use contextual pickers. Rich text uses a multiline modal or the configured external editor. When using an external editor, suspend the terminal cleanly and restore the view after exit; preserve unsaved content on editor failure. Provide a visible Submit action for accessibility and a keyboard shortcut that does not conflict with inserting a newline.

Production `x` opens a completion sheet with optional close reason and a summary of newly available work. Avoid pretending every mutation is reversible: the current CLI lacks comment deletion and a general transactional undo mechanism. Production undo is available only for supported inverse operations, after concurrency checks. The demo's complete snapshot undo is deliberately broader.

### Relationship exploration

Display “Blocked by,” “Blocks,” “Parent,” “Children,” and “Related” explicitly. Selecting an edge and pressing Enter navigates to its issue, even if that issue is excluded by the current filter; the demo widens to Everything. Escape retraces the visited IDs. In production, each history entry also restores filters, scroll, and section.

Prefer a readable adjacency view over a tangled full graph. Later, an expandable dependency tree can show depth and repeated nodes. Detect cycles with a visited set, annotate them, and never recurse without a bound. Distinguish “removes a blocker from 3 issues” from “makes 3 issues ready”: other blockers may remain.

### Projects

Production launch: `bees-tui --project <path>`; otherwise search the current directory and its ancestors for `.bees`. Explicit recent/discovery roots are opt-in, bounded, cancellable, and exclude build/vendor directories. Use canonical absolute paths as identities. A project switch retains the old view while loading, resets transient issue requests, and cancels stale results. Never create or initialize a project just by browsing.

## Visual language and motion

| Token | Honey dark | Role |
|---|---|---|
| Honey | `#E9B949` | Selected item, active pane, identity |
| Ink | `#DFE5EF` | Primary text |
| Muted | `#97A5BA` | Secondary labels; avoid dimming essential text |
| Structure | `#536174` | Quiet borders |
| Green | `#83D6AC` | Completion and successful saves |
| Blue | `#8FBDF3` | In progress, active save |
| Violet | `#C1A0EF` | Deferred, secondary metadata |
| Coral | `#F2919A` | Failed save or unresolved blockers |

The prototype is tuned for dark terminals and inherits the terminal's base foreground/background. Production should include Honey dark, Paper light, and Terminal themes. Test contrast on each actual surface, including the selected-row background. Do not assume truecolor: let the renderer degrade gracefully, honor `NO_COLOR`, and retain textual state.

Motion budget:

- Saving: one small spinner, about 11 frames per second, only while pending.
- Success: a brief sparkle-to-check transition, stops after 630 ms.
- Filter/selection: immediate, no travel animation that delays navigation.
- New work becoming ready: a short highlight in production; never reorder rows repeatedly during animation.
- Idle: zero animation timers. No blinking bee, looping progress bar, or incessant confetti.

`--no-motion` stops animations. `--ascii` changes UI borders and symbols; user content remains intact. Emoji width is measured in terminal cells and text is truncated at grapheme boundaries. No Nerd Font dependency. Avoid putting variable-width emoji into aligned status columns.

## Bees contract: what the source actually supports

This design was checked against the local Bees Zig source on 2026-10-09, not inferred from the extension's UI.

1. Stored statuses are `open`, `in_progress`, `deferred`, `closed` (`src/types.zig`). **Blocked is derived**, not a writable status.
2. `dep add A B -t blocks` means A depends on B: B blocks A. Related and parent-child links do not make an issue blocked.
3. The current ready query selects open, non-template, non-ephemeral issues with no unresolved blocking dependency. It does not use `defer_until` as a time filter. Production should use `bees ready --json` as the authority and display deferral dates separately until the contract is clarified.
4. A dependency count is not a blocker count: it includes multiple relation types. Do not use `dependency_count > 0` as the blocked predicate.
5. `list --json` supplies issue fields, labels, and relation/comment counts. `show --json` hydrates dependencies and dependents with `dependency_type`. `dep list --json` uses a different representation. Decode each endpoint separately.
6. `show --json` currently omits comments. Read them using `comment list <id> --json`; tracked as **bees-19**.
7. CLI help documents priority 1–4, but parsing currently accepts invalid values; tracked as **bees-20**. Preserve unfamiliar existing values with an “Unknown priority” label rather than silently rewriting them. Offer documented values in the picker.
8. Due dates, defer dates, design, acceptance, working notes, and external references have CLI flags. Database columns alone do not establish a supported write API.

## Production architecture

```text
Ink views and input scopes
            |
Application controller / typed commands
            |
Queries, selection, drafts, pending mutations
            |
BeesClient interface
        /          \
Demo memory       CLI adapter
                  spawn executable + argument array
                  project cwd + timeout + bounded output
```

Keep derived domain operations pure. Keep terminal layout separate from subprocess execution. Do not introduce a database client or embed Bees' storage rules in the UI. The demo currently injects a save function; production should replace this with explicit read/mutation methods and validated results, not an arbitrary “save the whole array” API.

Use TypeScript strict mode, React, and Ink. The current locked prototype uses Ink 8 / React 19.3; see [Ink](https://github.com/vadimdemedes/ink). Node 22.12+ or Node 24 LTS is the intended baseline. The inspected environment ran the checks on Node 25.6.1.

### CLI boundary

- Resolve an explicitly configured executable first; otherwise resolve `bees` on PATH. Optional mise resolution should be explicit and show the resolved path in diagnostics. Account for broken shims.
- Spawn with an argument array and `shell: false`. Never interpolate issue text into shell commands. Pin `cwd` to the selected project's canonical path.
- Decode and validate JSON with endpoint-specific schemas. Accept additive fields, preserve unknown enum values for display, and reject malformed payloads with an actionable error. Normalize missing nullable fields.
- Reads have timeouts and cancellation. A project/request generation token prevents late results from replacing a newer selection.
- Serialize mutations per project. Refresh affected detail, list, and readiness after success. Do not celebrate before the write is confirmed.
- An ambiguous mutation timeout means “Outcome unknown; checking project,” not “retry automatically.” Read back first so create/comment are not duplicated.
- Keep the last-good snapshot during refresh failures. Preserve drafts, selection by ID, and scroll. Stale data gets a visible label and Retry action.
- Poll at a modest configurable interval, with at most one outstanding refresh. Do not rely only on database file mtimes: SQLite WAL and external writers complicate that approach. Graph views need hydrated edges; build their cache lazily with bounded concurrency and display loading/partial state honestly.
- Keep refresh status separate from persistence/export status. Never imply the JSONL file was updated simply because the TUI is showing current database content. Verify current CLI auto-export behavior before adding any redundant export step.
- `bees import` rebuilds the database. Keep it out of routine TUI operations. No automatic import on startup, refresh, or project switch.

### Preferences and navigation

Use a versioned local user config with atomic replacement: theme, motion, symbols, recent projects, saved filters, column layouts, and per-project view state. Never save drafts or UI settings into `.bees/issues.jsonl`. Persist only supported, non-sensitive preferences. A changed issue disappearing from a filter chooses a neighboring visible ID; no selection should point at a stale array index.

## Test strategy and release gates

The tests should prove user outcomes, not just that a frame matches a giant snapshot. The runnable suite uses [Vitest](https://vitest.dev/guide/) and [ink-testing-library](https://github.com/vadimdemedes/ink-testing-library); static layout checks render the same Ink components at multiple terminal sizes.

| Layer | Must prove |
|---|---|
| Pure domain | Blocked vs status; all blockers must close; related/parent edges do not block; cycles; missing targets; newly-ready precision; search intersections; stable ID selection |
| Component journeys | Complete → release work → undo; type shortcut letters safely; validate empty input; failed save keeps draft; retry once; duplicate-key suppression; palette; search; follow/back |
| Geometry | 48×18, 80×24, 100×30, 132×32, 160×40; Unicode cell widths; long text; resize while editing; no hidden escape/quit hint |
| Motion | No idle/reduced-motion timers; finite success animation; spinner cleanup on success, error, and unmount |
| Adapter contract, production | Real disposable Bees projects: create/show/list/edit/status/labels/comments/relations/ready/export; Unicode and shell metacharacters; malformed JSON; nonzero exits; timeout outcomes |
| Concurrency, production | Late detail responses, switched projects, overlapping polls, external edits, stale writes, vanished issue, partial graph loading |
| PTY, production | Actual Windows ConPTY and Linux/macOS PTYs: raw input, resizing, alternate-screen restoration, Ctrl+C, paste, editor handoff, Unicode, color downgrade |
| Performance, production | 10k issue fixture; bounded rows; no full-graph hydration on every keystroke; no concurrent refresh pileup; no idle repaint loop |

Targets to measure, not current benchmark claims: first meaningful frame under 300 ms excluding cold CLI startup; local navigation under 50 ms at p95 on a documented reference machine; maximum 30 redraws/sec and no continuous idle redraw. Fix time and randomness for tests. Keep a few small golden frames for intentional layout changes, supplemented by cell-bound and behavioral assertions.

CI should run typecheck and component/domain tests on Windows, Linux, and macOS, followed by adapter tests against the supported Bees version once integrated. PTY checks are a separate gate; mocked stdin alone cannot establish terminal correctness.

## Delivery sequence

1. **This design pass:** runnable in-memory workbench, board, relationships, editing, failures, undo, motion, and behavior tests. Review whether navigation and visual density feel right.
2. **Read-only real projects:** executable discovery, project switcher, validated list/show/comments/ready, polling, stale states, preference persistence. Contract-test against disposable Bees projects.
3. **Safe editing:** supported field pickers, rich text, comments, labels, close reason, dependency add/remove, mutation serialization and concurrency checks. Build truthful per-command undo where feasible.
4. **Polish and release:** multi-sort, saved views, light/terminal themes, inspector scrolling, accessibility mode, PTY checks, packaging, release CI, profiling large fixtures.

## Known prototype limits

- No real project connection, persistence, export, project discovery, or subprocess adapter.
- No multiline editor, long-document scrolling, dependency mutations, configurable columns, multi-sort, or mouse support.
- Text entry uses a basic single-line component; full Unicode cursor editing and very long pasted input need a dedicated production editor.
- The dark palette is the only styled theme. ASCII changes UI chrome, not user-authored content.
- Demo undo restores an in-memory snapshot; it is not a promise that the current Bees CLI can undo every operation.
- Automated frame/input tests do not replace manual visual inspection and cross-platform PTY validation.

## Source references

- [VS Code Bees feature baseline](https://github.com/ctxshift/vscode-bees#features)
- [Ink rendering, input, accessibility, and testing](https://github.com/vadimdemedes/ink)
- [Ink testing utilities](https://github.com/vadimdemedes/ink-testing-library)
- [Vitest documentation](https://vitest.dev/guide/)
- Local Bees: `src/types.zig`, `src/db/schema.zig`, `src/db/store.zig`, and `src/cli/{list,show,ready,dep,create,update,comment_cmd}.zig`.

