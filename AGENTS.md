# AGENTS.md

Guidance for AI coding agents working in this repository.

## Why

A single npm package (`@reykjavik-labs/pi-extensions`) that ships Pi Coding Agent extensions. Each extension adds behavior to the Pi TUI or agent runtime: a status-bar footer (active) and automatic model routing for image-bearing prompts (scaffolded, opt-in).

## What

- **Stack**: TypeScript (strict), Bun (>= 1.1.0), ES modules.
- **Pi APIs**: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`.

- `src/extensions/footer/` — TUI status bar (model, tokens, git, TPS, context usage). Registered in `pi.extensions`.
- `src/extensions/image-router/` — switches models when a prompt has attached images. Scaffolded, **not registered** (opt-in).
- `.github/workflows/` — CI lint/typecheck/test on PRs; semantic-release + npm publish on main.

## How

- **Install**: `bun install`
- **Lint**: `bun run lint` (Biome + markdownlint; both auto-fix)
- **Type-check**: `bun run typecheck` (`tsc --noEmit`)
- **Test**: `bun test`

## Commits

Conventional Commits drive semantic-release on main (`.releaserc.json`): `feat` → minor, most other types → patch, `BREAKING CHANGE` → major. `cz-conventional-changelog` is available for interactive commits; no commit hooks are installed.

## Release

Merging to `main` runs `.github/workflows/release.yml`: lint + typecheck + test, then semantic-release tags `v${version}`, publishes the package to npm (`@semantic-release/npm`), and creates a GitHub release. Requires the `NPM_TOKEN` secret in the repo. Never tag or publish manually — semantic-release owns versions.

## Adding an extension

1. Create `src/extensions/<name>/index.ts` exporting `(pi: ExtensionAPI) => void`.
2. Register it: add `"./src/extensions/<name>/index.ts"` to `pi.extensions` in `package.json`.
3. Add `src/extensions/<name>/README.md` documenting config and behavior.
4. Typecheck, test, lint locally before opening the PR.

## Gotchas

- Extensions are registered via the `pi.extensions` array in `package.json`, pointing at TypeScript source entries (`./src/**/*.ts`), not built output. The published `files` field ships `src/` as-is; pi's loader (jiti) resolves them.
- `allowImportingTsExtensions` is enabled: import local files with an explicit `.ts` extension (e.g. `./footer.ts`).
- `pi.extensions` entries must be files inside this package; everything must resolve within the published tarball.

## Reference

- `src/extensions/footer/README.md` — footer layout, context-coloring thresholds, Nerd Font requirement
- `src/extensions/image-router/README.md` — routing behavior, settings precedence, limitations
