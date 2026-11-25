# ADR 009: Sync clock and record identity

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Deciders** | Kaue Galon |

## Context

[ADR 008](008-data-durability-local-first-sync-ready.md) makes storage sync-ready: every record has an id, `updatedAt` and `deletedAt?`, `changedSince(timestamp)` finds what to push, and Phase 6 resolves conflicts by last-write-wins on `updatedAt`. The Phase 1 review found three gaps in how T07 built it:

1. `dismissed` was keyed by `fingerprint` with a `count`. In Phase 6 the server sees ids in clear, and a fingerprint holds the date, merchant and amount: keying by it would leak the data the end-to-end encryption hides. A count is also a counter two devices can both increment, which last-write-wins loses.
2. `updatedAt` was the wall clock. Two writes in the same millisecond get the same stamp, so a cursor at that stamp (`changedSince` is exclusive) misses the second; a clock that goes back stamps a newer write as older. Two devices writing the same record at the same millisecond have no tiebreak.
3. Fingerprints are derived data that is stored: dedupe compares a new file's fingerprints to the stored ones.

## Decision

**Record identity.** Every synced record is keyed by a random `id` (`crypto.randomUUID()`). Derived or user data (fingerprint, merchant, date) is never a primary key; where it must be looked up, it is an index. `dismissed` holds **one record per deleted occurrence**: `{ id, fingerprint, dismissedAt }` plus the sync fields, indexed by `fingerprint`. Dedupe's dismissed count for a fingerprint is the number of live records with it; deleting a transaction adds one, undo tombstones it. Each occurrence is its own record, so two devices dismissing at once never conflict.

**Clock.** The repository stamps each write transaction with

- `updatedAt = max(now, lastStampAt + 1 ms)`, where `lastStampAt` is a device-local setting read and written in the same IndexedDB transaction as the records. IndexedDB serializes readwrite transactions on `settings`, so every committed stamp is strictly greater than every earlier one on that device, whatever the system clock does. All records of one transaction (e.g. an import) share its stamp and commit together.
- `updatedBy = deviceId`.

`changedSince(cursor)` stays exclusive on the `updatedAt` index. A cursor is always a stamp already seen (the highest `updatedAt` pushed), never the wall clock: any later write has a greater stamp, so nothing is missed.

**Phase 6 rules this enables (not built in v1):**

- Last-write-wins compares `(updatedAt, updatedBy)`: the later stamp wins; equal stamps fall back to the greater `updatedBy`. Every device picks the same winner.
- On applying a remote record, the device sets `lastStampAt = max(lastStampAt, remote.updatedAt)`, so a later local edit of that record outranks it (the receive rule of a hybrid logical clock). Restoring a backup applies the same rule.
- A remote record is stored as received; it is not re-stamped, so it is not pushed back.

**Derived data.** Fingerprints are stored, so changing how they are computed (e.g. merchant normalization, ADR 006) needs a migration that recomputes every stored fingerprint, transactions and `dismissed` alike; otherwise re-imports duplicate rows.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **A local `seq` counter as the sync cursor** | Also safe, but adds a second index and field that must never leave the device; the monotonic stamp gives the same guarantee with the field LWW already needs. |
| **A full hybrid logical clock (wall time + counter)** | Strongest ordering, but a new stamp format in every record. Milliseconds bumped by one keep ISO strings and are enough for one user's devices. |
| **Server-assigned versions** | Needs the server on every write; v1 has no server. |
| **`dismissed` keyed by fingerprint with a count** | Leaks the fingerprint to the Phase 6 server and loses concurrent increments. |

## Consequences

**Gained**
- No write is missed by `changedSince`, even in the same millisecond or after a clock change.
- Concurrent edits on two devices resolve the same way everywhere.
- The server will see only random ids, stamps, device ids and ciphertext.

**Costs**
- Every write also reads and writes `settings.lastStampAt`, so writes from two tabs serialize (they would anyway on the same store).
- A burst of N writes runs up to N ms ahead of the wall clock; harmless, and the wall clock catches up.
- Counting dismissed occurrences reads the `fingerprint` index instead of one record.

## Revisit when

- Phase 6 starts: the sync ADR adopts or replaces these rules.
- Stamps drift far ahead of the wall clock in real use.

## Related

- [ADR 006: dedupe by fingerprint and occurrence count](006-dedupe-by-fingerprint-and-occurrence-count.md)
- [ADR 008: data durability, local first and sync-ready](008-data-durability-local-first-sync-ready.md)
- [Spec v1, §2, §4 and §7](../spec/v1.md)
