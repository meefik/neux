# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking:** `refresh` re-runs the element's live reactive functions instead of re-patching config properties: static values are not re-applied, and `detail` must name a bound path (`"style"` for a reactive `style` map, `"style.color"` for a function inside a static one).
- Long lists render 2.7–5× faster (10,000 items): `mounted` no longer sorts new nodes by document position, and the `children` diff skips serializing nodes when one side is empty.
- Signal writes are about 10% faster: a write to a key no effect reads schedules nothing.
- `npm run build` checks `dist/` against `browserslist` in a `postbuild` step, replacing `npm run check`.

### Fixed

- The UMD build runs in strict mode, so functions destructured from the `neux` global (`const { signal } = neux`) use the global context, as `neux.effect()` does, instead of a separate `window` context that left their signals and effects disconnected.
- An effect is not re-run by its own writes made in its getter (including through a signal property setter or inside `untrack()`), so `list.push()` or `state.count++` inside it no longer loops; a write to the same key from elsewhere still re-runs it.
- An effect created inside `untrack()` or a setter tracks its own reads and owns its writes, from its getter and setter alike, without changing the enclosing effect's tracking.
- Effects of one update re-run in creation order, so a parent `children` list replaces its children before their bindings re-run against stale state.
- An effect whose getter threw on a re-run stays disposed, as documented; a `refresh` event no longer revives it.
- An effect that disposes itself mid-run no longer stays subscribed, which leaked it.
- Arrays: writing past the end re-runs `length` readers; assigning a smaller `length` re-runs readers of dropped indices, keys, and `in`.
- An object reads as one proxy wherever reached (`state.selected === state.items[0]`); an assigned proxy is stored as its plain object.
- Classes and built-in constructors stored in a signal are returned as is (`state.list.constructor === Array`); a plain object with its own `constructor` key is reactive.
- A rejected signal write (such as to a getter-only property) does not re-run effects.
- A `DocumentFragment` in `children` or `render()` contributes its child nodes, which now mount, release their bindings on removal, and are diffed individually.
- A reactive `children` list holding an existing `Node` and an equal new sibling no longer drops one of them.
- A `children` re-render whose new child binding throws releases the nodes it already built.
- `removed` cascades through elements Neux did not build (such as a supplied wrapper), so Neux elements inside release their bindings and re-mount on re-insertion.
- Clearing a property binding resets an inherited accessor (such as a custom element's `value` that started `undefined`) instead of keeping the last value.
- Clearing the last style through a single `style` key removes the empty `style` attribute.
- A `style` key for a custom property with uppercase letters (`--myColor`) is applied.
- A `use` string with surrounding whitespace (`"span "`) is trimmed instead of rendering a `div`.
- `i18n()` resolves a language to the closest locale: an exact key (case- and separator-insensitive, `ru_RU` ≡ `ru-RU`) or the longest key the language starts with at a subtag boundary (`de_DE` → `de`, but not `run-BI` → `ru`). Odd tags such as `ru_RU.UTF-8` and an unparseable language or `fallback` no longer throw.
- `i18n()` formatting keeps a script subtag (`sr-Latn`, `zh-Hant`).
- `i18n()` reports a missing key once per locale (the matched one, or the requested language when none matches); a `null` placeholder value is left as is; `null` data (`t(5, null, "de")`) no longer throws.
- Documentation: `README.md`, `SKILL.md`, `AGENTS.md`, and TypeDoc corrected to match behavior, with fixed examples. New notes: `Object.defineProperty()` on a signal does not re-run effects; elements inserted with DOM APIs into a mounted parent never get `mounted`/`removed`; the `children` diff ignores Shadow DOM content; `use` markup with no element renders an empty `div`; `dataset` keys must be camelCase.

## [0.18.0] - 2026-10-09

### Added

- `npm run format` (Prettier) and `npm run check` (verifies `dist/` against the `browserslist` targets via `es-check`).
- `NodeConfigList` and `ClassName` types; `children` and `render()` accept nested arrays, and `className` entries may be numbers, booleans, `null`, or `undefined`. `classList` is typed as an alias of `className`.
- `README.md` warns that children that look identical share the existing element, including its event handlers, and shows how to tell them apart.

### Changed

- `mounted` fires top-down on the initial mount and on re-mounts, matching `removed`.
- `NodeConfig` includes `number` and `boolean`. `null`, `undefined`, and booleans are skipped in `children` and `className`; strings and numbers (including `0`) are used as is.
- `render()` returns `null` for a config it cannot render (`boolean`, `null`, `undefined`, a class instance, `Date`, function, or symbol) instead of an empty `div`. Null-prototype objects render like plain objects.
- `ReactiveProperty<T>` accepts functions returning `Promise<T>`. A binding that resolves to `null` or `undefined` restores the property's original value.
- Effects re-run once per update, not once per written property, so `list.splice()` re-runs a `children` function once.
- A `children` re-run matches reordered items by markup lookup, so the work grows linearly with the list size. Equal nodes whose attributes were set in a different order are rebuilt.
- `updated` no longer fires when `className` or `children` re-run to the same result; its details are the applied class names and the child nodes in the DOM.
- Errors thrown inside effects, rejected promises, and missing `i18n()` keys are reported through `reportError` (or `console.error`) instead of being swallowed or left unhandled. `i18n()` reports each missing key once per language and returns the key.
- Signals allocate fewer `Proxy` objects and record each effect subscription once per run.
- The package no longer ships `.d.ts.map` files.

### Removed

- The `require` export condition: the package is ESM-only. `require("neux")` works on Node 22.12+; the UMD build stays for browsers.

### Fixed

- Bindings are released correctly: removing an element releases all of its bindings, discarded nodes no longer leak effects, a reused node stays live, and a disposed effect no longer re-runs. A `Node` passed as a child is never released when an equal existing child is kept.
- Re-mounting a removed element, including hosts with their own shadow root, rebuilds its bindings and children and fires `mounted`/`removed` exactly once per insertion.
- `refresh` with a nested path or a key of a reactive `attributes`, `style`, or `dataset` function works, no longer overwrites config functions, and ignores properties the config does not bind and removed elements.
- Reactive `attributes`, `style`, and `dataset` maps remove dropped keys and clear only what they applied. Clearing a camelCase `style` key reports `undefined` in `updated`.
- `use` markup keeps elements such as `<tr>`, `<td>`, and `<option>` and tolerates leading whitespace; `#id` and `.class` selectors apply to custom elements.
- `className` entries with spaces no longer throw, and a numeric `0` is applied as a class. Children of an SVG `foreignObject` are HTML elements.
- Signals: effects re-run when keys are added to or removed from an object (`Object.keys()`, `in`, `for...in`); a computed getter that returns a function is evaluated on every read; writing `NaN` over `NaN` or deleting a missing key does not re-run effects; a throwing getter or setter no longer leaves the context stuck; an effect created inside another no longer stops its tracking; empty subscriber sets are released.
- An `effect()` whose first run throws is disposed before the error propagates.
- `signal()`, `effect()`, `untrack()`, and `render()` work through a module namespace (`import * as neux`, UMD global) using the global context.
- `i18n()` falls back from a regional language to its base (`ru-RU` → `ru`), also for `fallback`; ignores inherited keys such as `toString`; treats a key naming a nested group as missing; leaves unknown `%{key}` placeholders as is; and no longer throws where `navigator` is undefined.
- TypeScript consumers on `node16`/`nodenext` get types, and test coverage instruments `src/**/*.ts`.
- Documentation (`README.md`, `SKILL.md`, TypeDoc) corrected and extended: `className` replaces existing classes, `style` keys are camelCase, `updated` semantics, detached `render()`, nested function properties, `i18n()` formatting, the `children` diff ignoring element properties, and the signal limits (only plain objects and arrays are reactive, `length` truncation, frozen data).

## [0.17.3] - 2026-08-16

### Changed

- Add the `Node` type for `this` inside `render` event handlers and reactive properties.
- Add a custom type for the `render` function to return a typed value.

### Fixed

- Dispatch "removed" event to children inside shadow root when shadow DOM is used.

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

[unreleased]: https://github.com/meefik/neux/compare/v0.18.0...HEAD
[0.18.0]: https://github.com/meefik/neux/compare/v0.17.3...v0.18.0
[0.17.3]: https://github.com/meefik/neux/compare/v0.17.2...v0.17.3
[0.17.2]: https://github.com/meefik/neux/compare/v0.17.1...v0.17.2
[0.17.1]: https://github.com/meefik/neux/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/meefik/neux/compare/v0.16.1...v0.17.0
[0.16.1]: https://github.com/meefik/neux/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/meefik/neux/compare/v0.15.2...v0.16.0
