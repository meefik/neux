# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/meefik/neux/compare/v0.15.2...HEAD
