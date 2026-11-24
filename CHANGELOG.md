# Changelog

## Unreleased

### Added
- **CI** (T02): `.github/workflows/ci.yml` runs `npm ci`, `typecheck`, `test` and `build` on every PR and on push to `main` (Node from `.nvmrc`), and keeps one sticky test report comment on the PR. A `privacy-guard` job runs `scripts/check-data-files.ts` on `git ls-files` and fails if any `.csv`, `.ofx` or `.pdf` (any case) is tracked outside `test/fixtures/`.
- **Scaffold** (T01): Vite + Preact + TypeScript `strict`, Vitest with the Vitest UI and happy-dom, `.nvmrc` (Node 24), scripts `dev`, `build`, `preview`, `typecheck`, `test`, `test:ui`, and the `src/` and `test/fixtures/` layout.
- **Foundation docs** (T00): [PRD v1](docs/prd/v1.md), [spec v1](docs/spec/v1.md), [architecture](ARCHITECTURE.md), the [build plan](docs/plan.md) and ADRs [001](docs/adr/001-static-app-without-backend.md) to [007](docs/adr/007-editable-rules-for-categorization-without-ai.md): a static app with no backend, Preact + Vite + TypeScript strict, IndexedDB, Cloudflare Workers Static Assets, money in integer cents, dedupe by fingerprint and occurrence count, categorization by editable rules.
- **Transaction deletion** planned in T15, with a `dismissed` store so re-imports respect it.
- **Rules for contributors and agents**: [AGENTS.md](AGENTS.md) (tests first, no real data, English names), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) with the privacy model, and project agents in `.claude/agents/` for development, tests and clean-context review.
- A `.gitignore` that keeps statements (`*.csv`, `*.ofx`, `*.pdf`) out of the repository, except fictitious fixtures in `test/fixtures/`.
