# image-router

Auto-routes prompts containing user-attached images to a configured
`imageReaderModel`, then switches back to the previous model when the
image-bearing turn ends.

## Install

The extension is registered in the root `package.json` under
`pi.extensions`. Pi loads it automatically when the project is trusted.

## Configure

Add `imageReaderModel` to your settings. Both global (`~/.pi/agent/settings.json`)
and project-local (`.pi/settings.json`) are read; project takes precedence.

```json
"imageReaderModel": "minimax/MiniMax-M3"
```

Format is `provider/modelId`, the same shape as `--model` and `enabledModels`.

## Behavior

| Situation | Action |
|---|---|
| User prompt has attached images, current model is not `imageReaderModel` | Switch to `imageReaderModel`, notify |
| User prompt has no images, current model is `imageReaderModel`, previous model was set by auto-switch | Switch back to previous model, notify |
| User prompt has no images, current model is `imageReaderModel`, but user chose it manually | No-op (no `previousModel` set) |
| `imageReaderModel` not configured | Notify once per session with config hint, skip routing (turn will fail at the LLM) |
| `imageReaderModel` configured but not in registry | Warn, skip routing |
| `imageReaderModel` configured but no API key | Error, skip routing |

The "notify once per session" state for the no-config case is persisted via
`appendEntry`, so it survives session resume but resets between sessions.

## Trigger

`before_agent_start` inspects `event.images` (user-attached images only).
Tool-result images from the previous turn are not re-checked — they enter
the next user prompt's context only after the LLM call, and the calling
model already had vision to invoke the tool that produced them.

## Thinking level

Not touched. Pi clamps the current thinking level to the new model's
`thinkingLevelMap` automatically when the model changes. If you changed
the thinking level manually during the image turn (Ctrl+Tab), your change
is honored on switch-back.

## Settings merging

Settings are read with this precedence:

1. `~/.pi/agent/settings.json`
2. `<cwd>/.pi/settings.json`

Both are parsed shallowly; project overrides global on key conflict.

## Limitations

- Detects user-attached images only. Image URLs, base64 in text, or
  images returned by tools are not inspected for routing purposes.
- The first user prompt after a session start may race with the model
  catalog refresh (`pi update --models`). If `imageReaderModel` is not
  in the registry yet, the extension warns and skips.
- Routing decisions are per-turn. A multi-turn agentic loop driven by
  tool calls stays on `imageReaderModel` until the user submits a new
  prompt without images, at which point the switch-back fires.

## Uninstall

Remove the entry from `package.json`'s `pi.extensions` and run `/reload`
in pi.
