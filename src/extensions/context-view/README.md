# context-view

Pi extension — Claude Code-style context window breakdown.

## What it does

Adds a `/context` command that reports how the active model's context window
is filled. In TUI mode it renders an overlay with:

- A colored 100-cell grid of the context window, colored by category.
- A per-category token breakdown: system prompt, context files, skills,
  built-in tools, extension tools, messages, autocompact buffer, and free
  space.
- An expandable active-tool list (`t` to toggle, `↑`/`↓` to scroll, `q`/`Esc`
  to close).

In non-TUI modes the same numbers are emitted as a single text notification.

No configuration required — the extension is active when the session starts.

## Commands

| Command | Effect |
| --- | --- |
| `/context` | Show the context window breakdown. |

## Notes

- The used total and window size come from Pi's own accounting
  (`ctx.getContextUsage()`); the per-category figures are estimates
  (`chars / 4`) derived from the system prompt and tool schemas. The
  "Messages" row is the remainder so the used rows reconcile with Pi's total.
- The autocompact reserve is read from the `compaction` block in Pi's
  settings files (`reserveTokens`, `modelOverrides`, and `enabled: false`
  forcing a zero reserve).
