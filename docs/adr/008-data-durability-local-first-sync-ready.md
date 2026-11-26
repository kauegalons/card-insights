# ADR 008: Data durability: local first, sync-ready

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Deciders** | Kaue Galon |

## Context

Every imported statement must stay: the point of the app is the view across months (PRD G4). [ADR 001](001-static-app-without-backend.md) and [ADR 003](003-indexeddb-for-storage.md) keep the data only in the browser's IndexedDB, and ADR 003 already lists the risk: the data disappears if the user clears site data, if the browser evicts it under storage pressure, if Safari's ITP deletes it after 7 days without a visit (not for an app added to the home screen), or when the user changes devices without a backup.

The v1 plan covered this with `navigator.storage.persist()` and a manual JSON backup, which depends on the user remembering. The user also wants to sync phone and laptop later, through a free Cloudflare backend. Adding sync after the storage layer is built must not mean rewriting it.

## Decision

**v1 stays local (ADR 001 holds) and adds three layers of protection:**

1. **Persistent storage.** On start the app calls `navigator.storage.persist()`. Settings show whether it was granted; if it wasn't, a banner says the data may be evicted and suggests installing the app and turning on backups.
2. **Installable app (PWA, T27).** On iOS, a home screen app is not subject to ITP's 7-day deletion, so the app invites installation after the first import.
3. **Automatic backup.**
   - Where the File System Access API exists (Chrome and Edge on desktop), the user picks a backup file once (`showSaveFilePicker`). The handle is kept in IndexedDB, and the app rewrites the file after every import and every data change (debounced).
   - Everywhere else (Safari, Firefox, mobile), after each import and whenever the last backup is older than 30 days, a banner offers a one-tap download of the JSON backup.
   - The backup holds **every** store, `dismissed` included, plus the sync fields below. Restoring it and exporting again gives an identical file.

**The storage layer is sync-ready from T07**, so a later sync only adds code:

- Every record in `transactions`, `imports`, `rules`, `categories` and `dismissed` has a stable random id (`crypto.randomUUID()`), `updatedAt` (ISO timestamp, set by the repository on every write) and `deletedAt?`.
- **Deletes are soft**: a delete sets `deletedAt` (a tombstone). Queries skip tombstones. "Delete all" and restore still clear the stores for real.
- UI and domain code reach IndexedDB only through repository interfaces in `src/storage/` (`get`, `list`, `put`, `remove`, `changedSince(timestamp)`). A sync engine will sit behind the same interfaces.
- `settings` gets a `deviceId` (random UUID, created once) and `lastSyncAt?`, unused in v1.

**Sync is mapped as Phase 6 (v2)** in the [plan](../plan.md) and will need its own ADR that supersedes ADR 001. The intended design, so v1 choices stay compatible:

- A Worker API with Cloudflare D1, behind Cloudflare Access for login. Both fit the free tier for one user.
- **End-to-end encryption**: records are encrypted in the browser (AES-GCM, key derived from a passphrase only the user knows) before they leave it. The server stores ciphertext plus `id`, `updatedAt` and `deletedAt`; Cloudflare cannot read the data. A lost passphrase means the server copy is lost, so the local backup stays.
- Last-write-wins per record by `updatedAt`, with tombstones carrying deletes across devices.

## Alternatives considered

| Alternative | Why not now |
|---|---|
| **Only `persist()` and manual backup** (the v1 plan as it was) | Depends on the user remembering; one browser clean-up loses every month. |
| **Cloud sync in v1** | Free on Cloudflare, but it breaks ADR 001 now, adds login, encryption and conflicts before the first demo, and adds 4 to 6 tasks before any UI exists. |
| **Hard deletes with a separate change log** | Works for sync, but tombstones are simpler and the `dismissed` store already follows the same idea. |
| **Local only, never sync** | The user wants phone and laptop in sync later; not planning for it now would force a storage rewrite. |

## Consequences

**Gained**
- Months of data survive browser clean-ups once a backup exists, and on desktop Chrome or Edge without the user doing anything after the first setup.
- Adding sync in v2 does not change the schema, the repositories' callers or the backup format.

**Costs**
- Every write goes through a repository that stamps `updatedAt`; every query filters tombstones.
- Tombstones keep deleted records around. For one user's card statements this is a few KB a year.
- The automatic file backup is Chromium desktop only; elsewhere it is a reminder, not a guarantee.

## Revisit when

- Phase 6 starts: write the ADR for sync and the backend, superseding ADR 001.
- Browsers make IndexedDB eviction rare enough (or the File System Access API spreads) that the reminders become noise.

## Related

- [ADR 001: static app without a backend](001-static-app-without-backend.md)
- [ADR 003: IndexedDB for storage](003-indexeddb-for-storage.md)
- [ADR 006: dedupe by fingerprint and occurrence count](006-dedupe-by-fingerprint-and-occurrence-count.md)
- [Spec v1, §7](../spec/v1.md#7-storage)
- [Plan: T07, T25, T27, T29 and Phase 4](../plan.md)
