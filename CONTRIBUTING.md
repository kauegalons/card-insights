# Contributing

## Development

Node 24 or later (`.nvmrc`).

```sh
npm ci
npm run dev           # local server with hot reload
npm run typecheck
npm test              # Vitest
npm run test:ui       # the same tests in the Vitest UI
npm run build         # static app in dist/
```

## How changes are made

Each task in [docs/plan.md](docs/plan.md) is **one branch and one PR**, cut from an up-to-date `main`, in dependency order.

1. **Branch:** `git switch main && git pull && git switch -c <prefix>/<name>`. Prefixes: `docs/`, `chore/`, `feat/`, `test/`, `fix/`.
2. **Failing tests first.** A red commit with the tests that describe the behavior, then a green commit with the smallest change that passes. A known bug can be pinned with `it.fails`, which turns red once the bug is fixed.
3. **Clean before the PR:** `npm run typecheck && npm test`.
4. **The PR** says what changes, ticks the task's acceptance criteria and links the ADR, if there is one. `CHANGELOG.md` is updated in the same PR.
5. **CI on every PR** (from T02): typecheck, tests, build and the privacy guard. CI comments a test report.
6. **Review** by a separate reviewer with a clean context: only the diff and the docs ([`.claude/agents/code-reviewer.md`](.claude/agents/code-reviewer.md)).
7. **Merge to `main` deploys** (from T03).

Decisions that change the design get an ADR in [`docs/adr/`](docs/adr/README.md).

## Conventions

- Code, file names, identifiers and commit messages in **English**. Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). User-facing text is pt-BR.
- Money is always integer cents (`amountCents: number`), never a float ([ADR 005](docs/adr/005-money-in-integer-cents.md)).
- Domain code (`src/domain`, `src/import`, `src/categorize`, `src/analysis`) is pure TypeScript: no DOM, no IndexedDB, no Preact.

## Privacy rule

**No real financial data in the repository, ever:** no statements, no screenshots of them, no real merchant lists copied from your own CSV. Tests read only fictitious files in `test/fixtures/`. See [SECURITY.md](SECURITY.md).
