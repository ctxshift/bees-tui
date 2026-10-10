# 🐝 Bees TUI

A TypeScript + React Ink issue workbench with **Queue**, **Board**, and **Graph** views. This project lives separately from the Bees CLI repository.

## Run

Requires Node 22.12+ and a working Bees executable.

```powershell
Set-Location C:\Users\ozone\source\bees-tui
npm start -- --project C:\Users\ozone\source\zig\bees --bees C:\Users\ozone\source\zig\bees\zig-out\bin\bees.exe
```

On another machine, run `npm ci`, then `npm start -- --project <project> --bees <executable>`. The live TUI reads and writes real issues through the CLI. `npm run demo` uses fictional, in-memory issues only.

## Graph

Press **3** for the Git-style relationship graph. Prerequisites appear above downstream issues; colored terminal tracks show branches and merges. The graph uses the whole project so a Queue filter cannot hide a blocker. Its inspector follows the selected issue. All views share the same terminal dimensions; rows scroll inside their pane.

- `j/k` or arrows: select issue rows.
- `h/l` or left/right: follow the first upstream/downstream connection; Escape returns.
- `Enter`: expand issue details; Escape returns to the graph.
- `v`: cycle All / Blocking / Family / Related edges.
- `g`: switch to a compact list, also used for screen-reader rendering.
- `d`: add/remove relationships in the live TUI.

Solid tracks mean blocking dependencies, dashed tracks family, dotted tracks related issues. `!` indicates unresolved ordering from a cycle (including its downstream nodes). `+` indicates additional connections beyond the bounded rail display; inspect Relationships for the full list. Unknown targets remain visible in issue details. Readiness uses Bees' own ready query.

The interface supports issue creation, field editing, multiline text and external editors, labels, comments, completion reasons, saved views, table columns/sorting, project discovery, clipboard IDs, and explicit JSONL export. Press `:` for commands or `?` for keyboard help. Preferences include Honey, Paper, and Terminal themes, ASCII symbols, and reduced motion.

## Concurrent CLI use

Directory notifications accelerate refresh; periodic CLI reads (default 2.5 seconds, configurable with `--poll-ms`) catch missed notifications and WAL changes. One refresh runs at a time. Graph edges are hydrated serially and published together, independent of selection; large projects may take longer than the polling interval.

Browsing, navigation, filtering and refresh never export or rewrite `issues.jsonl`. Its exact bytes, formatting and record order are preserved, including when Bees rebuilds a missing database from JSONL. Only edits or the explicit **Export issues to JSONL** command request writes through Bees.

An amber `*` beside an issue marks uncommitted JSONL record changes, including staged and unstaged edits and new records. Git's HEAD, index and working file are read without staging or changing them. Comparisons use issue IDs and field values: whitespace, object-key order and record order alone do not mark issues. Array changes count. Deleted records have no row when absent from the current tracker. Markers refresh on the normal polling cycle, including after commits. A missing Git repository, unavailable Git, merge conflicts or unreadable JSONL show **Git: unavailable**, rather than pretending everything is clean. The legend is in `?` help.

The fixed **Live** light brightens briefly after a successful read; the adjacent time is the last successful read. Background refresh keeps the label in place. Reduced motion and screen-reader modes use a static light. Read failures still show **STALE** and uncertain writes show **CHECK WRITE RESULT**.

Refresh preserves drafts and retains the last good snapshot on failure. Before saving, edited fields are compared with their current values. Conflicting edits keep the draft and report the conflict. Writes are never automatically retried after an uncertain outcome. Undo is limited to supported inverse operations with concurrency checks.

The local Bees build now supports atomic conditional writes (--if-revision) from **bees-21**. The TUI uses a fresh project revision inside each conditional mutation; a concurrent edit causes a conflict with no partial writes. Older Bees builds remain readable but must be upgraded before editing through the TUI. Revision tokens cover the entire project, so unrelated edits during the save window can also cause a conflict. Other findings: **bees-19** (detail JSON omits comments; dedicated endpoint used), **bees-20** (priority validation), **bees-22** (reopening retains completion metadata), **bees-23** (revisioned bulk snapshot endpoint).

## Validation

```sh
npm run check
npm run preview
```

Tests cover graph topology, merges, cycles, bounded lanes, Unicode, layout geometry, keyboard journeys, competing writers, adapter contracts, real disposable Bees projects, and a real PTY with resize and terminal restoration. Set `BEES_BIN` to run the CLI/PTY suites outside the local repository layout; those suites skip when no executable is available. Local validation includes Windows ConPTY; other operating systems have not yet been validated here.

The browser preview in `docs/preview.html` retains the approved interactive design experiment. The terminal implementation uses native text cells, not browser graphics. Regenerate the preview with `npm run preview`.

## Mise and issue tracking

`mise.toml` pins Node 25.6.1, the version validated for this project. Run `mise run setup`, `mise run test`, `mise run demo`, or `mise run start`. The default start command opens this project's own tracker; pass `-- --project <path>` to select another project. The local `../zig/bees/zig-out/bin` directory is prepended to PATH.

New issues belong in this directory's `.bees` tracker (prefix `bees-tui`). Use `mise run bees -- list`, `mise run bees -- create "Title"`, or `mise exec -- bees <command>`. Existing Bees backend issues remain in their original tracker for continuity.
