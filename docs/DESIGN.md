# Bees TUI design

Visual direction approved October 9, 2026. Updated October 10, 2026 to describe the live implementation. See the [README](../README.md) for setup and usage. The retired prototypes have been removed; the live TUI is the product implementation.

## Product intent

Help people find ready work, inspect it without losing their place, and understand what completing it unlocks. Use Bees terminology throughout. Database administration and external workflow integrations are outside the product scope.

The original feature baseline was the VS Code Bees extension. The terminal interaction model is keyboard-first: Queue, Board and a Git-style Graph, with a shared inspector and command menu.

## Layout and navigation

All three tabs occupy the same terminal dimensions. Each pane has a bounded viewport; long lists scroll internally. At widths of 100 columns or more, Queue and Graph have an adjacent inspector. Below that, Enter expands details into the primary pane. Below 48 columns or 18 rows, show a resize notice and an exit key. Board uses all status lanes when wide and the selected lane when narrow.

Selection is identified by issue ID, not an array index. Queue filtering must not hide dependencies from Graph: Graph uses the whole project. Moving the cursor must never publish an incomplete relationship set or collapse the tracks. Genuine external relationship changes can rebuild the graph after hydration completes.

| Input | Live behavior |
|---|---|
| `1`, `2`, `3` | Queue, Board, Graph |
| `j/k`, arrows | Select rows |
| `h/l`, left/right | Board lanes; Graph follows the first upstream/downstream connection |
| `Enter`, `Esc` | Expand details; return or retrace Graph navigation |
| `/`, `f` | Structured search; saved views |
| `:`, `Ctrl+P` | Search commands |
| `e`, `n` | Edit fields; create an issue |
| `s`, `p`, `t`, `a` | Status, priority, type, assign to me |
| `c`, `d`, `l` | Comments, relationships, labels (`l` outside Board/Graph) |
| `x`, `u` | Complete; undo a supported reversible change |
| `[`, `]`, `PgUp`, `PgDn` | Detail sections and scrolling |
| `g`, `v` in Graph | Compact list; relation-type filter |
| `P`, `,`, `z` | Projects, preferences, collapse closed lane |
| `y`, `r`, `?`, `q` | Copy ID, refresh, help, quit |

One input scope owns keys at a time. Shortcut letters entered in an editor are text. Changed drafts require a discard choice. Multiline editing uses Ctrl+S to save and Ctrl+E for the external editor. A pending mutation suppresses repeated writes.

Details expose Overview, Design, Acceptance, Notes, Relationships and Comments. Text wraps at grapheme boundaries, strips terminal control sequences, and supports vertical scrolling. Search validates field names and supports quoted values. Preferences retain theme, motion, glyphs, saved queries, columns, sort rules, recent projects and per-project navigation; drafts are not persisted.

## Visual language

Honey gold identifies selection and actions. Blue indicates active work, green completion, violet deferral and coral errors or blockers. Words and symbols accompany color. Emoji belong in branding and occasional feedback; aligned rows use stable terminal cells. Honey, Paper and Terminal themes are implemented.

Graph draws prerequisite-first branches and merges using bounded colored tracks. Blocking, family and related links have distinct strokes. Cycles and unresolved ordering use `!`; connections beyond available lanes use `+`. Relationship details remain available when an endpoint is missing or a track cannot fit.

An amber `*` beside an issue means its JSONL record has staged or unstaged changes. Its legend belongs in `?` help, not beside the tabs. Compare records by ID and field values across Git HEAD, index and working file; ignore whitespace, object-key order and record order. Array changes count. Unknown Git state is shown as unavailable, never clean. Deleted records have no row if absent from the live tracker.

The header keeps a fixed Live label and the last successful read time. A green light briefly brightens after successful reads, then settles. Do not replace the clock with Refreshing or animate row positions. Saves use a small spinner; success feedback is finite. No continuous idle animation loop. Reduced motion and screen-reader modes disable animation; ASCII mode replaces interface glyphs without changing user content.

## Data and write boundaries

The live TUI reads issues through the Bees CLI. Viewing, filtering, navigation, project switching and refresh must preserve the exact bytes of `issues.jsonl`. No incidental export, normalization, sorting or staging. Only explicit mutations or Export issues to JSONL request writes. Bees may hydrate a missing derived database from JSONL; that must not rewrite JSONL. Preferences live in user configuration, separate from issue records.

`Session` owns single-flight refresh, file notifications, polling, revision-aware snapshots, project generation checks and serialized mutations. File notifications accelerate reads; polling catches missed events, SQLite WAL changes and Git commits. One bulk snapshot supplies issues, readiness, comments and relationships from the same revision. Unchanged responses preserve cached issue references. Navigation does not spawn detail reads. Read failures retain the last good view and show STALE. A project switch cancels previous reads and rejects late results.

`CliClient` decodes endpoint-specific JSON and invokes the executable with an argument array, explicit working directory, timeout and bounded output. Issue text never enters a shell command. Readiness comes from the snapshot's ready set. Blocked is derived from unresolved blocking relationships, not a writable status or a generic dependency count. Mutation preflight and undo verification still read fresh issue details.

Before an edit, compare the edited fields against a fresh issue. Send the current revision token with the conditional mutation so a concurrent writer cannot slip between validation and write. The revision covers the whole project, so unrelated writes can also conflict. Keep the draft on conflict. An ambiguous write outcome locks further edits until reviewed; never retry mutations automatically. Undo is limited to operations with a safe inverse and an unchanged after-image.

The Git marker reader uses read-only Git plumbing and reads JSONL directly. It never refreshes the index, stages, commits, exports or repairs data. Missing Git, non-repositories, merge conflicts and partial/unreadable JSONL produce unavailable status, retried on the next poll.

## Implementation map

| Module | Responsibility |
|---|---|
| `src/live.tsx`, `src/editor.tsx` | Live interaction and scoped editing |
| `src/views.tsx`, `src/graph.tsx` | Terminal panes and layout |
| `src/graph-layout.ts`, `src/model.ts`, `src/query.ts` | Pure graph, domain and query operations |
| `src/session.ts` | Refresh, project lifecycle, concurrency and undo |
| `src/client.ts`, `src/process.ts` | Validated CLI boundary and process execution |
| `src/git-changes.ts` | Per-record uncommitted JSONL markers |
| `src/live-status.tsx` | Finite receive pulse and stable status text |
| `src/preferences.ts` | User configuration and bounded project discovery |
| `test/fixtures.ts` | Sample issue data used only by tests |
| `scripts/build-binary.mjs` | Bun standalone executable build; excludes optional Ink development debugger |

Paths in this table are relative to the project root. TypeScript is strict; React and Ink render native terminal cells. Runtime versions and dependencies are recorded in `package.json`, its lockfile and `mise.toml`.

Distribution can use a single Bun-compiled executable containing the TUI and runtime. Bees remains an external executable; Git remains optional for markers. The build uses the existing npm dependency tree and does not change the development/test runtime. Bun 1.3.6 on Windows x64 is validated with `mise run test:binary`, including a copied executable outside the checkout and real terminal interaction. Other operating systems still require native validation.

## Validation and remaining work

Run `mise run test` for type checking, build and tests. Coverage includes domain behavior, graph topology and geometry, editor/input journeys, stale-write protection, external CLI changes, project switches, Git markers, exact JSONL/index preservation and real Windows ConPTY sessions launched both directly and through mise. Fresh-clone hydration is tested against a disposable real Bees project. Mocked input alone does not establish terminal correctness.

Open work is tracked in the project's Bees tracker. Use `mise run test:ui` for the fast interaction loop and `mise run test:ui:watch` while editing; see [Development](DEVELOPMENT.md#fast-interaction-loop).

Cross-platform PTY validation and large-project performance measurements remain release work. Linux/macOS terminal behavior and performance targets are not established by the current Windows checks. Mouse support, rich Markdown rendering and horizontal code-block scrolling are possible future improvements, not current guarantees.
