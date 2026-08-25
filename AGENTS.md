# AGENTS.md

Pensieve is a TUI-only Pi extension that keeps interrupted prompt drafts in a process-wide,
in-memory LIFO stack.

## Invariants

- Store prompt text only in process memory. Version raw state on `globalThis` so `/reload`
  preserves it without retaining stale implementation objects.
- Share one stack across sessions and projects in the same Pi process.
- Restore only when Pi's editor is empty. Set the editor before removing the entry so a failed
  restoration cannot lose text.
- Preserve exact prompt text; trimming is only for empty-editor checks and footer display.
- Keep the external seam to the default extension factory and use Pi's public extension interface.
- Keep runtime dependencies empty. Use Node built-ins and type-only Pi imports.
- Keep v1 focused: no custom editor, disk persistence, transcript messages, or management commands.

## Verification

Run `bun run check` after code changes. Keep tests beside every change to stack, lifecycle,
configuration, or footer semantics.
