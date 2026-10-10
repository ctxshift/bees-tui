# Project instructions

Use the Bees tracker rooted in this directory (`.bees`, prefix `bees-tui`) for all new issues and follow-up tasks. Run tracker commands from this directory. Existing backend issues in the separate Bees project may be updated while implementing their fixes; do not put new issues there.

Use `mise run test` for type checking and tests, `mise run demo` for the fictional demo, and `mise run start` for the live TUI. `mise exec -- bees` selects the locally built Bees executable from the sibling `../zig/bees/zig-out/bin` checkout. Build Bees there if that executable is absent, or install Bees on PATH.
