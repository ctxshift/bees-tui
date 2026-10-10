# 🐝 Bees TUI

A TypeScript + React Ink issue workbench with **Queue**, **Board**, and **Graph** views. This project lives separately from the Bees CLI repository.

## Run

Running from source requires Node 22.12+ and a working Bees executable. The standalone build below does not require Node or Bun on the user's machine.

With mise, from this checkout:

```powershell
Set-Location C:\Users\ozone\source\bees-tui
mise run setup
mise run start
# Open a different tracker:
mise run start -- -- --project C:\Users\ozone\source\zig\bees
```

Without mise, run `npm ci`, then `npm start -- --project <project> --bees <executable>`. Startup builds the current source before launching. The live TUI reads and writes real issues through the CLI.

Use an interactive terminal. Redirected or piped input/output produces a plain issue listing instead of the TUI. The mise start task uses `raw = true` to preserve terminal input and output. Useful options include `--ascii`, `--no-motion`, `--screen-reader`, `--theme paper`, `--config <file>` and `--poll-ms 2500` (minimum 500).

## Standalone executable

Install Bun on the build machine (validated with Bun **1.3.6**) and install this project's locked dependencies with `mise run setup`. Keep npm's lockfile; Bun is used here as the compiler, not as a replacement package manager.

```powershell
mise run build:binary
mise run test:binary
.\release\bees-tui.exe --project C:\Users\ozone\source\zig\bees --bees C:\Users\ozone\source\zig\bees\zig-out\bin\bees.exe
```

`npm run build:binary` also works directly. The build produces `release/bees-tui.exe` on Windows, or `release/bees-tui` on other hosts. Copy that one file to distribute the TUI: it embeds the Bun runtime, application, React, Ink and Yoga layout code. The validated Windows x64 build is about **109 MiB** uncompressed. It needs neither `node_modules` nor a separate JavaScript runtime at execution time.

The **Bees executable is still required** for real projects; provide `--bees`, `BEES_BIN`, or a `bees` executable on PATH. Git is optional and enables the uncommitted-record markers. Clipboard and external-editor features still use platform tools.

The build excludes Ink's optional development debugger to avoid Bun eagerly resolving an uninstalled `react-devtools-core` package. No runtime dependencies are externalized. Bun supports [single-file compilation and platform-specific targets](https://bun.sh/docs/bundler/executables); this task builds for the current host. Only Windows x64 has been validated here; Linux/macOS builds need native terminal validation before release.

`mise run test:binary` rebuilds, copies the executable into a disposable Bees project outside this checkout, and exercises help, plain issue listing, live rendering and CLI updates, navigation, JSONL preservation, resizing and terminal restoration through a real PTY. It fails rather than skipping if the required Bees executable is missing. Build output is ignored by Git.

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

Editing existing issues requires a Bees build supporting revision tokens and `--if-revision`. The TUI uses a fresh project revision inside each conditional mutation; a concurrent edit causes a conflict with no partial writes. Revision tokens cover the entire project, so unrelated edits during the save window can also cause a conflict.

The backend bulk snapshot endpoint is implemented, but TUI adoption remains open in the TUI tracker. Refresh currently uses separate list, readiness, detail and dependency reads. See [the design](docs/DESIGN.md) for architecture, behavior contracts and remaining validation work.

## Validation

```sh
mise run test
```

Tests cover graph topology, merges, cycles, bounded lanes, Unicode, layout geometry, keyboard journeys, competing writers, adapter contracts, real disposable Bees projects, and a real PTY with resize and terminal restoration. Set `BEES_BIN` to run the CLI/PTY suites outside the local repository layout; those suites skip when no executable is available. Local validation includes Windows ConPTY; other operating systems have not yet been validated here.


## Mise and issue tracking

`mise.toml` pins Node 25.6.1, the version validated for this project. The default start command opens this project's own tracker. Use `mise run start -- -- --project <path>` to select another project: the first separator belongs to mise, the second forwards npm arguments to the application. The local `../zig/bees/zig-out/bin` directory is prepended to PATH; build Bees there or provide an installed executable via `--bees` or `BEES_BIN`.

New issues belong in this directory's `.bees` tracker (prefix `bees-tui`). Use `mise run bees -- list`, `mise run bees -- create "Title"`, or `mise exec -- bees <command>`. Existing Bees backend issues remain in their original tracker for continuity.
