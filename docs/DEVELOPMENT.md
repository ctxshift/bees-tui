# Development

[Back to README](../README.md) · [User guide](USAGE.md) · [Design](DESIGN.md)

## Setup and run

The project uses TypeScript, React and Ink. Source execution requires Node 22.12+; mise pins the validated Node version and the Bees CLI. The configured sibling `../zig/bees/zig-out/bin` path takes precedence when that local build exists.

```sh
mise install
mise run setup
mise run start
```

Startup builds the current source. The default command opens this checkout's tracker. To select another project:

```sh
mise run start -- -- --project /path/to/project
```

The first separator belongs to mise; the second passes npm arguments to the app. Start uses `raw = true` so the app receives terminal input and output directly.

Without mise:

```sh
npm ci
npm start -- --project /path/to/project --bees /path/to/bees
```

Editing existing issues requires a Bees build supporting revision tokens and `--if-revision`. Git is optional for uncommitted-record markers. Clipboard and external-editor features use platform tools.

## Standalone executable

Install Bun on the build machine; Bun 1.3.6 is validated. Dependencies still come from `npm ci` and `package-lock.json`; Bun is the compiler, not a replacement package manager.

```sh
mise run build:binary
mise run test:binary
```

`npm run build:binary` also works directly. The output is `release/bees-tui.exe` on Windows or `release/bees-tui` on other hosts. For example, in PowerShell:

```powershell
.\release\bees-tui.exe --project C:\path\to\project --bees C:\path\to\bees.exe
```

Distribute that single TUI file. It contains the application, Bun runtime, React, Ink and Yoga layout code; users need no Node, Bun or `node_modules`. The Bees CLI remains a separate dependency. The validated Windows x64 executable is approximately 109 MiB uncompressed.

The build omits Ink's optional development debugger because Bun otherwise eagerly resolves the uninstalled debugger package. No runtime dependencies are externalized. It builds for the current host; Linux/macOS execution still needs native terminal validation. Build output is ignored by Git.

## Tests

```sh
mise run test
mise run test:binary
```

The first command runs type checking, builds the app and runs the unit, UI, integration and terminal tests. Coverage includes graph stability and geometry, Unicode editing, keyboard workflows, concurrent writers, project switching, Git markers, exact JSONL/index preservation and terminal restoration.

Set `BEES_BIN` when the Bees executable is outside the configured sibling checkout. The regular CLI/PTY suites skip without an executable. Binary validation instead fails if Bees is missing: it rebuilds and copies the executable into a disposable project outside this checkout, then checks help, plain listing, live rendering and updates, navigation, JSONL preservation, resizing and exit.

Windows ConPTY is validated. Cross-platform terminal tests and large-project performance measurements remain release work; see [Design](DESIGN.md#validation-and-remaining-work).

## Issue tracking

Use this project's `.bees` tracker for new work:

```sh
mise run bees -- list
mise exec -- bees ready
```

The TUI refreshes through one revision-aware Bees bulk snapshot. Unchanged responses reuse cached issue data; Git markers refresh independently. See [Design](DESIGN.md) for the data boundaries and concurrency contracts.

### Fast interaction loop

```sh
mise run test:ui
mise run test:ui:watch
# Focus one behavior while developing:
npm run test:ui -- -t "blocking cycle"
```

This suite imports TypeScript directly: no build, CLI processes or PTYs. Tests drive the real Ink app and Session with an in-memory Bees boundary. Clipboard, external editor and project discovery are mocked; timers advance deterministically. Each test gets fresh issues and preferences. The full gate above retains real CLI, filesystem and terminal validation.

| Coverage | Behavioral checks |
|---|---|
| Editing | Every issue field, status, priority, type, creation, completion, assignment, comments, labels, relationships, undo and export |
| Safety | Failed drafts, duplicate submits, concurrent edits, blocking cycles, invalid input and explicit discard |
| Navigation | Queue/Board/Graph, selection, inspection, graph modes, search, filters, saved views, help and refresh |
| Preferences | Themes, motion, ASCII, identity, editor, columns, sorting, discovery and project switching |
| Recovery | Stale reads, retry, project lookup and clipboard errors |
| Rendering | Narrow/wide terminal bounds, Unicode, graph stability, change markers and live indicator |

Avoid fixed sleeps and timing assertions on shared CI machines. Assert resulting issue state and visible output; test durations are reported by Vitest. OS-specific clipboard/editor launches still require native validation.
