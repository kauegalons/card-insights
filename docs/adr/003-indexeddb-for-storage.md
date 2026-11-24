# ADR 003: IndexedDB as the storage

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Deciders** | Kaue Galon |

## Context

With no backend ([ADR 001](001-static-app-without-backend.md)), the browser keeps everything: transactions (a few thousand a year), import records, rules, categories and settings. Queries are simple: by statement, by date range, by fingerprint. The schema will change as tasks land, so it needs versioning.

## Decision

Use **IndexedDB** through the [`idb`](https://github.com/jakearchibald/idb) wrapper. One database, `card-insights`, with stores `transactions`, `imports`, `rules`, `categories` and `settings`, indexes for the common lookups, and a `schemaVersion` with ordered migrations in `upgrade`. All access goes through repositories in `src/storage/`; nothing else touches IndexedDB. Tests use `fake-indexeddb`.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **localStorage** | Synchronous, string-only, about 5 MB, no indexes, no transactions. A year of transactions plus backups would push it. |
| **SQLite in WebAssembly** (sql.js, wa-sqlite with OPFS) | Real SQL is pleasant, but adds ~1 MB of WASM and OPFS support quirks on iOS. The queries here are simple enough for indexes. |
| **Dexie** | Nicer query API, larger than `idb`. `idb` is enough with repositories on top. |
| **Raw IndexedDB** | Callback API is error-prone; `idb` adds promises at ~1 KB. |

## Consequences

**Gained**
- Asynchronous, transactional, indexed and large enough for years of data.
- Works offline and in every target browser, iOS Safari included.
- Repositories hide the API, so the domain stays pure and tests stay fast.

**Costs**
- **Eviction risk:** browsers may clear it under storage pressure, especially Safari after weeks without a visit. Mitigated by `navigator.storage.persist()`, backups and an import reminder (T22).
- Migrations are hand-written and must be tested.
- Not encrypted at rest by the app.

## Revisit when

- Queries need joins or aggregations that indexes can't serve well: reconsider SQLite in WASM.
- Eviction turns out to be a frequent problem in practice.

## Related

- [Spec v1, §7](../spec/v1.md#7-storage)
- [Plan, T07](../plan.md)
