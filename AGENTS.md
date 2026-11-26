# AGENTS.md

Rules for AI agents (and people) working on this repository.

## The project

A web app (React + Vite + TypeScript strict, [ADR 010](docs/adr/010-react-replaces-preact.md)) that imports credit card statements, categorizes them with editable rules and shows spending insights. Each person runs their own instance: data lives in the browser's IndexedDB and syncs, end-to-end encrypted, to the owner's own Cloudflare Worker and D1 ([ADR 011](docs/adr/011-self-hosted-instances-with-mandatory-e2e-sync.md)). The assistant (`/organizar`, `/investir`) is Claude Code commands outside the app ([ADR 012](docs/adr/012-assistant-as-claude-code-commands.md)). Start with [ARCHITECTURE.md](ARCHITECTURE.md), the [spec](docs/spec/v1.md) and the [plan](docs/plan.md).

## Never

- **Never commit real financial data.** No real statements, no rows copied from one, no real merchant names taken from the user's files, no screenshots of the app with real data. CSV, OFX and PDF files exist only in `test/fixtures/`, and they are fictitious. If a user pastes a real row to explain a format, rewrite it with invented values before it goes into a test, a doc or a commit.
- **Never send readable user data anywhere.** The only backend is the owner's own Worker + D1 behind Cloudflare Access, and it receives only records encrypted in the browser ([ADR 011](docs/adr/011-self-hosted-instances-with-mandatory-e2e-sync.md)). No analytics, no tracking script, no other server or external API that receives user data; any of those needs a new ADR first.
- **The app never calls an AI API** (Anthropic or any other), and no AI key goes in the app or the Worker. The assistant is Claude Code commands the owner runs on their own machine ([ADR 012](docs/adr/012-assistant-as-claude-code-commands.md)).
- **Never store money as a float.** Integer cents only ([ADR 005](docs/adr/005-money-in-integer-cents.md)).
- Never ask for, print or commit secrets. The Cloudflare token lives only in GitHub Actions secrets. The sync passphrase and recovery key are typed by the owner only where the app or an assistant command asks for them, and never land in a file, a log or a commit.

## Working on the code

- **One task, one branch, one PR**, in the order of [docs/plan.md](docs/plan.md). Stop after opening the PR and show it to the user before starting the next task.
- **Squash merge** when CI is green; never merge red.
- **Code review with a clean context** (the `code-reviewer` agent) at the close of every phase, and **before merging any sensitive PR**: storage, backup, sync, crypto or security. Findings become fix PRs before the next phase.
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
