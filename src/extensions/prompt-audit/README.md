# prompt-audit

Pi extension that inspects the system prompt Pi actually sends, and what fills it.

## What it does

Adds a `/prompt-audit` command that writes a report to
`.pi/prompt-audit.md`, and can log one metrics record per turn to
`.pi/prompt-audit-history.jsonl`. The report contains:

- The full generated system prompt.
- A per-section size breakdown (custom prompt, appended system prompt, tool
  snippets, prompt guidelines, context files) with character and estimated
  token counts.
- The active tool list.
- Every loaded skill: name, scope, source, path, and whether it enters the
  prompt or is hidden from model invocation.
- Every loaded context file, with size.
- Authoritative context usage from Pi's own accounting.

No configuration. The extension is active when the session starts.

## Commands

| Command | Effect |
| --- | --- |
| `/prompt-audit` | Write the full report to `.pi/prompt-audit.md`. |
| `/prompt-audit report` | Same as `/prompt-audit`. |
| `/prompt-audit watch` | Toggle per-turn metrics logging to `.pi/prompt-audit-history.jsonl`. |
| `/prompt-audit status` | Show the current model, context usage, and watch state. |

## Notes

- Token figures in the size breakdown are estimates (`chars / 4`). The context
  usage shown at the top comes from Pi's accounting and is authoritative.
- Reports and history are written under `.pi/` in the current working
  directory. Add that path to `.gitignore` if you do not want to commit them.
