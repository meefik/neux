# Neux — Agent Guide

Lightweight frontend JS library for dynamic UIs via declarative elements and reactive signals.

## Tech Stack

- TypeScript 6+ (strict; `tsc` targets ES2021, the Vite bundle targets ES2020 to match `browserslist`)
- Node.js (build only, browser at runtime)
- Type checking via `tsc`
- Testing with `node:test` + `node:assert/strict` via `tsx` ES loader and JSDOM for DOM simulation
- Vite (UMD + ESM)
- Prettier (default config)
- TypeDoc (HTML + markdown output)

## Conventions

- **Simple & minimal**: every byte ships to the browser, so choose the smallest correct solution and avoid speculative abstractions.
- **TypeDoc on all exports**: include `@param`, `@returns`, `@throws` as needed. Concise prose, not inline notes.
- **Naming**: `camelCase` (vars/functions), `PascalCase` (classes/types), `UPPER_SNAKE_CASE` (constants).
- **Comments**: one module summary at the top (a TypeDoc `@module` block in public modules, a `//` line in internal ones); all others explain _why_ (quirks, pin reasons, fail-closed rules, non-obvious ordering), never _what_. No banners or change history. If code needs a comment to explain what it does, simplify the code.

## Structure

```
dist/         # Build output
docs/         # Generated TypeDoc
src/          # Source + co-located unit tests
AGENTS.md     # AI agent guidelines
CHANGELOG.md  # Project changelog
README.md     # Project README
SKILL.md      # AI agent skill guidelines
```

## Commands

| Command             | Does                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `npm install`       | Install dev dependencies                                                       |
| `npm run build`     | Build (ESM + UMD) + TS declarations, then check `dist/` against `browserslist` |
| `npm test`          | Run unit tests with coverage                                                   |
| `npm run docs`      | Generate docs → `docs/`                                                        |
| `npm run typecheck` | Type-check only                                                                |
| `npm run format`    | Format sources and docs (Prettier)                                             |

## Testing

- **Location**: tests live alongside source (`src/**/*.test.ts`).
- **Coverage**: `npm test` fails when branch coverage drops below 95%.
- **Structure**: follow **Arrange → Act → Assert**.
- **No redundancy**: each test covers a distinct behavior or branch; don't duplicate assertions already covered elsewhere or test the same path with trivially different inputs.
- **Tooling**: only `node:test`, `node:assert/strict`, and `jsdom` (for tests that touch the DOM); no external test libraries. Import Node built-ins with the `node:` prefix.

## Docs

Run `npm run docs` to regenerate TypeDoc. Output includes HTML and Markdown documentation, plus `docs/llms.txt` (a copy of `docs/README.md`: the README merged with the module index).

## Releases

- **Semver**: This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Bump the version with `npm version [major|minor|patch]`.
- **Changelog**: Update `CHANGELOG.md` under the `[Unreleased]` heading when making changes. Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions — use categorized entries (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`) with bullet-point descriptions of each change.
- **Commits**: Follow Conventional Commits format: `<type>: <description>`. Use the type that best matches the change:

  | Type       | When to use                                             |
  | ---------- | ------------------------------------------------------- |
  | `feat`     | New feature or functionality                            |
  | `fix`      | Bug fix                                                 |
  | `docs`     | Documentation-only changes                              |
  | `refactor` | Code change that neither fixes a bug nor adds a feature |
  | `test`     | Adding or updating tests                                |
  | `chore`    | Maintenance, dependencies, tooling, or configuration    |

  Do NOT create git commits unless explicitly asked.

## Dev Checklist

1. Edit source in `src/`
2. Add/update tests alongside the source file
3. Add/update TypeDoc for public API changes
4. Run `npm test` — ensure all tests pass
5. Run `npm run format`; review comments for grammar and spelling
6. Run `npm run build` — clean compile
7. Verify correctness: no oversights, regressions, or missed requirements
