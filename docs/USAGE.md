# User guide

[Back to README](../README.md)

## Queue, Board and Graph

All three views fit the same terminal size and scroll within their panes. At wider sizes, Queue and Graph show the selected issue's details alongside the list. In a narrow terminal, press Enter to expand details and Escape to return. The minimum supported size is 48 columns by 18 rows.

### Queue

Queue helps you pick the next issue. Use saved views and structured search to narrow the list, then inspect or edit the selected item. Columns and sort rules can be changed through the command menu.

![Queue and issue inspector](queue.png)

### Board

Board groups issues into status lanes. Use left/right or `h/l` to move between populated lanes, then `s` to change an issue's status. Moving the selection does not change its status. Narrow terminals show the selected lane; `z` collapses or expands Closed.

### Graph

Graph shows the whole project, regardless of Queue filters, so a hidden issue cannot conceal a blocker. Prerequisites appear above dependent issues, with tracks showing branches and merges. Moving the selection keeps the tracks stable; actual relationship changes appear after refresh completes.

![Graph with relationship details](graph.png)

- Solid tracks represent blocking links; dashed tracks represent family links; dotted tracks represent related issues.
- `v` cycles through all, blocking, family and related links.
- `g` switches between tracks and a compact list.
- Left/right or `h/l` follows the first upstream/downstream connection. Escape retraces your steps.
- `!` marks cycles or unresolved ordering. `+` marks connections beyond the available track lanes. Inspect Relationships for the full list.

Blocked is derived from unresolved blocking links, not an editable status. An unknown relationship target remains visible in details.

## Keyboard controls

Press `?` for the in-app guide or `:` for searchable commands.

| Key | Action |
| --- | --- |
| `1`, `2`, `3` | Queue, Board, Graph |
| Up/down or `j/k` | Move selection |
| Left/right or `h/l` | Board lanes or Graph connections |
| `Enter`, `Esc` | Inspect; return or cancel |
| `/`, `f` | Search; choose saved views |
| `:`, `Ctrl+P` | Search commands |
| `n`, `e` | Create an issue; edit fields |
| `s`, `p`, `t`, `a` | Status, priority, type, assign to me |
| `c`, `d` | Add a comment; manage relationships |
| `l` outside Board/Graph | Manage labels |
| `x`, `u` | Complete; undo a supported change |
| `[`, `]` | Previous/next detail section |
| `PgUp`, `PgDn` | Scroll details |
| `g`, `v` in Graph | Compact list; relationship filter |
| `P`, `,`, `z` | Projects, preferences, collapse Closed |
| `y`, `r`, `q` | Copy issue ID, refresh, quit |

## Search and editing

Search combines words and fields, including `status:open`, `type:bug`, `label:"two words"`, `assignee:me` and `p:1`. Set your name in Preferences for assignment and `assignee:me`. Saved views, table columns and sort rules are available through the command menu.

The inspector has Overview, Design, Acceptance, Notes, Relationships and Comments sections. Editing supports short-field pickers, multiline text, labels, comments, completion reasons and relationship changes. Use Ctrl+S to save multiline text or Ctrl+E to open your configured external editor.

While typing, shortcut letters are ordinary text. Escape asks before discarding a changed draft. Failed saves keep the draft. Undo applies only where a safe inverse is available; it cannot undo every operation.

## Live updates and uncommitted changes

The **Live** light briefly brightens after a successful read. The adjacent time records the last successful read and stays visible during refresh. Reduced-motion and screen-reader modes use a static light.

An amber `*` beside an issue means its JSONL record has staged or unstaged changes, including new records. Markers refresh after external edits and Git commits. Whitespace, object-key order and record order alone do not mark issues; array changes do. Deleted records have no row if absent from the live tracker.

**Git: unavailable** means the marker cannot be determined: Git may be missing, the project may not be a Git repository, or the file may be unreadable or conflicted. It does not mean the project is clean. The TUI never stages or commits files.

Other people and agents can continue using the Bees CLI while the TUI is open. Refresh keeps your draft and selection where possible. Before saving, the TUI checks for conflicting edits and uses Bees' conditional-write support. A conflict keeps your draft for review. Because the revision covers the project, unrelated changes during a save can also cause a conflict.

- **STALE / r retry**: the latest read failed; the last good view remains visible.
- **CHECK WRITE RESULT**: a write's outcome is uncertain. Inspect the tracker, then use the command menu to allow edits after review. The TUI does not automatically retry the write.

Browsing, searching, navigation and refresh preserve `issues.jsonl` byte-for-byte. Only edits or the explicit **Export issues to JSONL** command request writes through Bees. UI preferences are stored separately from issue records.

## Preferences and launch options

Preferences include Honey, Paper and Terminal themes, motion, ASCII symbols, your name, editor settings, saved views and per-project navigation. Press `P` to switch projects; discovery uses configured roots rather than scanning your entire computer.

| Option | Purpose |
| --- | --- |
| `--project <directory>` | Select an initialized Bees project; otherwise search the current directory and its ancestors |
| `--bees <executable>` | Choose the Bees executable; `BEES_BIN` and PATH are also supported |
| `--mise` | Resolve the Bees executable through mise |
| `--poll-ms <milliseconds>` | Refresh interval; default 2500, minimum 500 |
| `--theme honey\|paper\|terminal` | Choose a theme |
| `--ascii` | Use ASCII interface symbols; user content stays intact |
| `--no-motion` | Disable animation |
| `--screen-reader` | Accessible rendering without animation or an alternate screen |
| `--config <file>` | Choose a user-preferences file |
| `--help` | Show launch options |

Run in an interactive terminal. Piped or redirected input/output produces a plain issue listing. For launch examples and dependency setup, see [Development](DEVELOPMENT.md).
