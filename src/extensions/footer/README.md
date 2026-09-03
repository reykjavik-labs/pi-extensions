# status-footer

Pi extension — status bar footer.

## What it does

Renders a persistent status bar at the bottom of the Pi TUI. The footer shows:
current mode, working directory with git branch (including dirty/ahead/behind
markers), cumulative session token counts (in/out), context usage percentage,
session cost, and active model name. During a streaming response it displays
live tokens-per-second (TPS), holding the last value for 4 seconds after the
turn ends. Model spec (context window, pricing) is sourced from
`~/.cache/pi/models-dev.json` via `pix-data`. Extension statuses (e.g. plan
mode) are surfaced as additional segments on the right. Requires
`@xynogen/pix-data` as a dependency.

No configuration required — the footer activates when the session starts.
The layout is responsive and self-adjusts to the terminal width.

## Layout

Single line, used while the stable content fits the terminal width:

```text
[MODE] | ~/cwd (branch *±⇡n⇣n) | ⇡in ⇣out [Rcache] [ctx%/ctxk] [$cost] | model [· thinking] [· ctxK · $in/$out] [| status…] [| N t/s]
```

Stacked, one section per line, used when the single line would overflow
(e.g. a narrow/mobile terminal):

```text
[MODE]
~/cwd (branch *±⇡n⇣n) +n ~n ?n ⇡n ⇣n
ctx%/ctxk ⇡in ⇣out [$cost]
model [· thinking] [· ctxK · $in/$out] [| N t/s]
status…
```

In the stacked layout every section keeps its own full-width line, so no
section is ever truncated. Extension statuses share one line when they fit
and spill to one line per status when they do not.

### Responsive switching

- The single line is composed from the *stable* sections only — mode,
  location, git, context usage, model, and extension statuses. The transient
  token/TPS counters never participate in the fit test, so the layout never
  reflows while they appear and decay during/after a stream.
- If the stable line fits the terminal width, the footer stays on one line
  (with the token and TPS counters appended, as today).
- If it does not fit, the footer switches to the stacked layout above.
- Collapsing back to the single line requires the stable line to fit with an
  8-column margin (`LAYOUT_HYSTERESIS` in `src/footer.ts`), so content that
  hovers near the boundary (growing context %, git marker changes) does not
  flip the layout back and forth.

## Context usage coloring

The context-usage block (`used/total (pct%)`) is colored to surface when a
session is leaving the model's "smart zone". The rule set is selected by the
model's context window:

| Window | Green | Orange | Red |
|---|---|---|---|
| `≥ 100k` | `used < 100k` | `100k ≤ used ≤ 140k` | `used > 140k` |
| `< 100k` | `pct < 40%` | `40% ≤ pct ≤ 70%` | `pct > 70%` |

Token count and percentage always share the same color. Thresholds are
hardcoded module constants (`CTX_*` in `src/footer.ts`). Layout thresholds
are the `LAYOUT_HYSTERESIS` constant in the same file.

**Reference:** the 40%-rule / smart-zone-dumb-zone heuristic is described in
["La regla del 40 % de contexto: dónde vive la inteligencia de un LLM"](https://23people.io/blog/regla-40-contexto-smart-zone-dumb-zone/)
— the model's comfort zone ends at ~40% of the window or ~100k tokens,
whichever comes first; degradation past that point is gradual, and urgent near
the top of the window.

## Requirements

The footer icons are Nerd Font PUA glyphs (resolved by `@xynogen/pix-pretty`
in `nerd` mode, the default). They only render when the **terminal font**
itself is a Nerd Font — the library mode and the terminal font are
independent. If icons show as blank or tofu, set your terminal's font to a
Nerd Font such as `MesloLGLDZ Nerd Font Mono`, `JetBrainsMono Nerd Font Mono`,
or `Hack Nerd Font Mono`. Warp, Terminal.app, iTerm2 and VS Code expose this
in their appearance/font settings.

## Install

The extension is registered in the root `package.json` under `pi.extensions`
(`./extensions/pi/status-footer`). Pi loads it automatically when the project
is trusted — no manual install needed. The upstream unmodified version is
[`@xynogen/pix-footer`](https://www.npmjs.com/package/@xynogen/pix-footer) on
npm.

## Source

Inspired by `pix-footer` from the
[pix suite](https://github.com/xynogen/pix-mono), adapted for personal use and
extended with the 40%-rule context coloring (see
[Context usage coloring](#context-usage-coloring)).

## Development

Setup, lint, and commit conventions: see
[CONTRIBUTING.md](../../../CONTRIBUTING.md) and
[AGENTS.md](../../../AGENTS.md). Tests: `bun test` (from this directory).

## License

MIT
