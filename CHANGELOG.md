# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.17.2] - 2026-08-07

### Changed

- Render arrays as `Node[]` instead of `DocumentFragment`.

### Fixed

- Re-render raw node elements even when unchanged.
- Render does not accept `Proxy` objects from signals.

## [0.17.1] - 2026-08-06

### Changed

- Playground links and examples updated to include WebAwesome.

### Fixed

- Prevented duplicate `mounted` events on nested render children.
- Incorrect `mounted` events firing on unrelated target children.

## [0.17.0] - 2026-07-31

### Added

- Skill for AI agents.
- Instructions on how to use the AI agent skill.

### Changed

- `render()` now skips falsy entries in children arrays.
- TypeDoc generation for LLMs switched to `typedoc-plugin-markdown`.

### Removed

- Passing a function as config (top level and children).

## [0.16.1] - 2026-07-26

### Added

- Project logo.

### Changed

- Homepage moved to `neux.dev`.
- TypeDoc generation switched to `@skillit/typedoc` with per-module entry points.

### Fixed

- TypeScript type definitions.

## [0.16.0] - 2026-07-21

### Added

- TypeDoc documentation generation (`npm run docs`).
- `AGENTS.md` with project conventions and development guidelines for AI agents.
- `use` config option in `render()` for specifying an alternate element source (config, HTML markup, or existing Element).
- `untrack()` function for non-reactive reads.
- `typecheck` script for standalone type checking.

### Changed

- The `effect()` function is now debounced and simplifies subscription management.
- Computed signal properties now use getter syntax (`get`) instead of callback functions.
- `render()` signature has been simplified to accept a single config object; the HyperScript-style multi-argument syntax is removed.
- `classList` option has been renamed to `className` for consistency with the DOM API; `classList` still works as a backwards-compatible alias.
- The `l10n()` function has been renamed to `i18n()`.
- Rewritten to TypeScript (strict mode, TypeScript 6).
- Build system migrated from Rollup to Vite (ESM + UMD).
- Tests moved from `tests/` to co-located `src/**/*.test.ts` files, run via `tsx`.
- TypeScript declarations are now emitted to `dist/` instead of a separate `types/` directory.
- Lifecycle events now dispatch directly on elements, no longer relying on `MutationObserver`.
- README examples updated to reflect the new `render()` API.
- Commit messages now follow the Conventional Commits specification.

### Removed

- Nested reactivity via the `$` property prefix; use plain property names instead.
- The `mount()` function; `render()` now accepts an optional second argument (target element, `DocumentFragment`, or CSS selector) and mounts automatically.
- The `changed` lifecycle event; attribute changes from external sources are no longer observed.
- The `$$on()`, `$$once()`, `$$off()`, and `$$emit()` helpers on signal proxies.
- The `tag` property in element config; use `tagName` or `use` instead.
- The `ref` callback in element config; use the `mounted` event handler instead.
- Signal computed callbacks no longer receive `(obj, prop)` arguments; use `this` and getter syntax instead.
- Internal helper modules `context.js`, `emitter.js`, and `utils.js`; functionality was inlined.
- Legacy JavaScript source and test files.
- Manually maintained `types/*.d.ts` declaration files.

[unreleased]: https://github.com/meefik/neux/compare/v0.17.2...HEAD
[0.17.2]: https://github.com/meefik/neux/compare/v0.17.1...v0.17.2
[0.17.1]: https://github.com/meefik/neux/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/meefik/neux/compare/v0.16.1...v0.17.0
[0.16.1]: https://github.com/meefik/neux/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/meefik/neux/compare/v0.15.2...v0.16.0
