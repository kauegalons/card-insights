# Architecture decision records

Each ADR records one decision: context, decision, alternatives, consequences and when to revisit it. A changed decision gets a new ADR that supersedes the old one; old ADRs are never rewritten.

| ADR | Decision | Status |
|---|---|---|
| [001](001-static-app-without-backend.md) | A static app with no backend; data only in the browser | Superseded by [011](011-self-hosted-instances-with-mandatory-e2e-sync.md) |
| [002](002-preact-vite-typescript-strict.md) | Preact + Vite + TypeScript strict | UI part superseded by [010](010-react-replaces-preact.md); Vite, TypeScript strict and Vitest stand |
| [003](003-indexeddb-for-storage.md) | IndexedDB as the storage | Accepted |
| [004](004-cloudflare-workers-static-assets-hosting.md) | Hosting on Cloudflare Workers Static Assets | Accepted |
| [005](005-money-in-integer-cents.md) | Money in integer cents | Accepted |
| [006](006-dedupe-by-fingerprint-and-occurrence-count.md) | Dedupe by fingerprint and occurrence count | Accepted |
| [007](007-editable-rules-for-categorization-without-ai.md) | Categorization by editable rules, without AI | Accepted |
| [008](008-data-durability-local-first-sync-ready.md) | Data durability: local first (persistent storage, PWA, automatic backup), storage ready for a later sync (clock and record identity: [009](009-sync-clock-and-record-identity.md)) | Partly superseded by [011](011-self-hosted-instances-with-mandatory-e2e-sync.md): automatic backup file dropped, sync moved before the UI |
| [009](009-sync-clock-and-record-identity.md) | Sync clock and record identity: random ids as keys (never fingerprints), one `dismissed` record per occurrence, strictly increasing per-device `updatedAt` plus `updatedBy` | Accepted |
| [010](010-react-replaces-preact.md) | React replaces Preact for the UI | Accepted |
| [011](011-self-hosted-instances-with-mandatory-e2e-sync.md) | Self-hosted single-owner instances; end-to-end encrypted sync (Worker + D1 behind Cloudflare Access, recovery key) in every deploy, before the UI; file backup optional | Accepted |
| [012](012-assistant-as-claude-code-commands.md) | The assistant is Claude Code commands (`/organizar`, `/investir`) outside the app; the app calls no AI API | Accepted |

The Status column is the only place an older ADR's status changes; its file stays as written.
