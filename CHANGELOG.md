# Changelog

## Unreleased

### Added
- **Foundation docs** (T00): [PRD v1](docs/prd/v1.md), [spec v1](docs/spec/v1.md), [architecture](ARCHITECTURE.md), the [build plan](docs/plan.md) and ADRs [001](docs/adr/001-static-app-without-backend.md) to [007](docs/adr/007-editable-rules-for-categorization-without-ai.md): a static app with no backend, Preact + Vite + TypeScript strict, IndexedDB, Cloudflare Workers Static Assets, money in integer cents, dedupe by fingerprint and occurrence count, categorization by editable rules.
- **Transaction deletion** planned in T15, with a `dismissed` store so re-imports respect it.
- **Rules for contributors and agents**: [AGENTS.md](AGENTS.md) (tests first, no real data, English names), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) with the privacy model, and project agents in `.claude/agents/` for development, tests and clean-context review.
- A `.gitignore` that keeps statements (`*.csv`, `*.ofx`, `*.pdf`) out of the repository, except fictitious fixtures in `test/fixtures/`.
