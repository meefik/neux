# Neux — Agent Guide

Lightweight frontend JS library for dynamic UIs via declarative elements and reactive signals.

## Tech Stack

- TypeScript 6+ (strict)
- Node.js (build only, browser at runtime)
- Type checking via `tsc`
- Testing with `node:test` + `node:assert/strict` via `tsx` ES loader
- Vite (UMD + ESM)
- TypeDoc

## Conventions

- **Simple & minimal** — least code that works. No unnecessary abstractions.
- **TypeDoc on all exports** — include `@param`, `@returns`, `@throws` as needed. Concise prose, not inline notes.
- **Naming**: `camelCase` (vars/functions), `PascalCase` (classes/types), `UPPER_SNAKE_CASE` (constants).
- **Fix grammar** in existing comments when touching nearby code. No typos.

## Structure

```
./dist/         # Build output
./docs/         # Generated TypeDoc
./src/          # Source + co-located unit tests
./CHANGELOG.md  # Project changelog
./README.md     # Project README
```

## Commands

| Command             | Does                                |
| ------------------- | ----------------------------------- |
| `npm install`       | Install dev dependencies            |
| `npm run build`     | Build (ESM + UMD) + TS declarations |
| `npm test`          | Run unit tests                      |
| `npm run docs`      | Generate docs → `docs/`             |
| `npm run typecheck` | Type-check only                     |

## Testing

Tests live alongside source (`src/**/*.test.ts`). Follow **Arrange → Act → Assert**. Node built-in imports use the `node:` prefix. No external test libraries — just `node:test` and `node:assert/strict`.

## Docs

Run `npm run docs` to regenerate TypeDoc. Output includes `docs/llms.txt` (globals index) and `docs/llms-full.txt` (combined, for AI context).

## Releases

- **Semver**: `npm version [major|minor|patch]`. Changelog in `CHANGELOG.md`.
- **Commits**: Conventional Commits (`feat|fix|docs|refactor|test|chore`).

## Dev Checklist

1. Edit source in `src/`
2. Add/update tests alongside the source file
3. Add/update TypeDoc for public API changes
4. Run `npm test` — all tests pass
5. Review comments for grammar and spelling
6. Run `npm run build` — clean compile
7. Verify correctness: no oversights, regressions, or missed requirements
