# AGENTS.md

Guidance for AI coding agents working in this repository.

## Why

Monorepo of extensions for the Pi Coding Agent. Each package adds behavior to the Pi TUI or agent runtime: a status-bar footer and automatic model routing for image-bearing prompts.

## What

- **Stack**: TypeScript (strict), Bun (>= 1.1.0), ES modules, bun workspaces under `packages/*`.
- **Pi APIs**: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`.

- `packages/pi-status-footer/` — TUI status bar (model, tokens, git, TPS, context usage).
- `packages/pi-image-router/` — switches models when a prompt has attached images.
- `.github/workflows/` — CI lint on PRs; semantic-release on main.

## How

- **Install**: `bun install`
- **Lint**: `bun run lint` (Biome + markdownlint; both auto-fix)
- **Type-check**: `bun run typecheck` (`tsc --noEmit`)
- **Test**: `bun test`

## Commits

Conventional Commits drive semantic-release on main (`.releaserc.json`): `feat` → minor, most other types → patch, `BREAKING CHANGE` → major. `cz-conventional-changelog` is available for interactive commits; no commit hooks are installed.

## CI

- PR to `main`: markdownlint.
- Push to `main`: markdownlint, then semantic-release tags and releases (`v${version}`).

## Gotchas

- Extensions are registered per package via the `pi.extensions` array in `package.json`, pointing at TypeScript source entries (`./src/*.ts`), not built output.
- `allowImportingTsExtensions` is enabled: import local files with an explicit `.ts` extension (e.g. `./footer.ts`).
- Path aliases (`@reykjavik-labs/pi-status-footer`, `@reykjavik-labs/pi-image-router`) live in `tsconfig.base.json`; add an entry there when creating a package.

## Reference

- `packages/pi-status-footer/README.md` — footer layout, context-coloring thresholds, Nerd Font requirement
- `packages/pi-image-router/README.md` — routing behavior, settings precedence, limitations
