# AGENTS.md

Rules for AI agents (and people) working on this repository.

## The project

A static web app (Preact + Vite + TypeScript strict) that imports credit card statements, categorizes them with editable rules and shows spending insights. No backend: all data stays in the browser's IndexedDB. Start with [ARCHITECTURE.md](ARCHITECTURE.md), the [spec](docs/spec/v1.md) and the [plan](docs/plan.md).

## Never

- **Never commit real financial data.** No real statements, no rows copied from one, no real merchant names taken from the user's files, no screenshots of the app with real data. CSV, OFX and PDF files exist only in `test/fixtures/`, and they are fictitious. If a user pastes a real row to explain a format, rewrite it with invented values before it goes into a test, a doc or a commit.
- **Never add a backend, analytics, a tracking script or a call to an external API** that receives user data. That breaks [ADR 001](docs/adr/001-static-app-without-backend.md) and needs a new ADR first.
- **Never store money as a float.** Integer cents only ([ADR 005](docs/adr/005-money-in-integer-cents.md)).
- Never ask for, print or commit secrets. The Cloudflare token lives only in GitHub Actions secrets.

## Working on the code

- **One task, one branch, one PR**, in the order of [docs/plan.md](docs/plan.md). Stop after opening the PR and show it to the user before starting the next task.
- **Tests first:** a failing test in its own commit, then the change that makes it pass. `npm run typecheck && npm test` must be clean before the PR.
- **English** for code, file names, identifiers, commits and docs (the plan in `docs/plan.md` stays in pt-BR, as written). User-facing text in the UI is pt-BR.
- Domain logic (`src/domain`, `src/import`, `src/categorize`, `src/analysis`) is pure TypeScript and fully unit-tested; the UI and storage layers call it, never the other way around.
- Design decisions are ADRs in [`docs/adr/`](docs/adr/README.md). Changing one means a new ADR that supersedes it.
- Update `CHANGELOG.md` in the same PR.

## Project agents

`.claude/agents/` has three agents adapted to this stack:

| Agent | Use for |
|---|---|
| [`developer`](.claude/agents/developer.md) | Implementing a task from the plan: analyze, plan, red commit, green commit. |
| [`test-writer`](.claude/agents/test-writer.md) | Writing the failing tests and fictitious fixtures for a task's acceptance criteria. |
| [`code-reviewer`](.claude/agents/code-reviewer.md) | Reviewing a PR with a clean context: only the diff and the docs. Read-only. |
