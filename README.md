# pi-extensions

![Release](https://github.com/reykjavik-labs/pi-extensions/actions/workflows/release.yml/badge.svg)
![CI](https://github.com/reykjavik-labs/pi-extensions/actions/workflows/ci.yml/badge.svg)

Monorepo of extensions for the Pi Coding Agent: a TUI status-bar footer and automatic model routing for image-bearing prompts.

## Install

```sh
pi install git:git@github.com:reykjavik-labs/pi-extensions.git
```

Restart Pi (or run `/reload`) after installing.

## Extensions

- [`pi-status-footer`](packages/pi-status-footer/README.md) — status bar: model, tokens, git, TPS, context usage. No config.
- [`pi-image-router`](packages/pi-image-router/README.md) — switches to a configured `imageReaderModel` when a prompt has images.

## Usage

### pi-status-footer

No configuration — the footer appears on session start. Icons require a Nerd Font in your terminal.

### pi-image-router

Set the model that handles image-bearing prompts:

```json
"imageReaderModel": "minimax/MiniMax-M3"
```

in `~/.pi/agent/settings.json` (global) or `<project>/.pi/settings.json` (project wins).

## Development

Development setup, commands, and conventions: see [AGENTS.md](AGENTS.md).
