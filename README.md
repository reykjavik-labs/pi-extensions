# pi-extensions

![Release](https://github.com/reykjavik-labs/pi-extensions/actions/workflows/release.yml/badge.svg)
![CI](https://github.com/reykjavik-labs/pi-extensions/actions/workflows/ci.yml/badge.svg)

Extensions for the Pi Coding Agent, published as a single npm package
(`@reykjavik-labs/pi-extensions`) that registers one or more extensions on
install. Each extension lives in `src/extensions/<name>/` and is registered by
adding its entry file to the `pi.extensions` array in `package.json`.

## Install

```sh
pi install npm:@reykjavik-labs/pi-extensions
```

Restart Pi (or run `/reload`) after installing.

## Extensions

- [`footer`](src/extensions/footer/README.md) — status bar: model, tokens, git, TPS, context usage. No config. Active by default.
- [`image-router`](src/extensions/image-router/README.md) — switches to a configured `imageReaderModel` when a prompt has images. Scaffolded but **not registered**; see its README to enable.

## Usage

### footer

No configuration — the footer appears on session start. Icons require a Nerd Font in your terminal.

### image-router (opt-in)

Set the model that handles image-bearing prompts:

```json
"imageReaderModel": "minimax/MiniMax-M3"
```

in `~/.pi/agent/settings.json` (global) or `<project>/.pi/settings.json` (project wins), then register the extension (see its README).

## Adding a new extension

1. Create `src/extensions/<name>/index.ts` exporting a default function `(pi: ExtensionAPI) => void`.
2. Add `"./src/extensions/<name>/index.ts"` to the `pi.extensions` array in `package.json`.
3. Add a `README.md` for the extension.
4. Bump versions via conventional commits; `feat` → minor, everything else → patch.

## Development

Development setup, commands, and conventions: see [AGENTS.md](AGENTS.md).
