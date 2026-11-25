# Architecture decision records

Each ADR records one decision: context, decision, alternatives, consequences and when to revisit it. A changed decision gets a new ADR that supersedes the old one; old ADRs are never rewritten.

| ADR | Decision | Status |
|---|---|---|
| [001](001-static-app-without-backend.md) | A static app with no backend; data only in the browser | Accepted |
| [002](002-preact-vite-typescript-strict.md) | Preact + Vite + TypeScript strict | Accepted |
| [003](003-indexeddb-for-storage.md) | IndexedDB as the storage | Accepted |
| [004](004-cloudflare-workers-static-assets-hosting.md) | Hosting on Cloudflare Workers Static Assets | Accepted |
| [005](005-money-in-integer-cents.md) | Money in integer cents | Accepted |
| [006](006-dedupe-by-fingerprint-and-occurrence-count.md) | Dedupe by fingerprint and occurrence count | Accepted |
| [007](007-editable-rules-for-categorization-without-ai.md) | Categorization by editable rules, without AI | Accepted |
| [008](008-data-durability-local-first-sync-ready.md) | Data durability: local first (persistent storage, PWA, automatic backup), storage ready for a later sync (clock and record identity: [009](009-sync-clock-and-record-identity.md)) | Accepted |
| [009](009-sync-clock-and-record-identity.md) | Sync clock and record identity: random ids as keys (never fingerprints), one `dismissed` record per occurrence, strictly increasing per-device `updatedAt` plus `updatedBy` | Accepted |
