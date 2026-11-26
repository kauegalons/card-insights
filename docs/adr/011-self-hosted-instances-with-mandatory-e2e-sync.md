# ADR 011: Self-hosted single-owner instances with mandatory end-to-end encrypted sync

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-25 |
| **Deciders** | Kaue Galon |
| **Supersedes** | [ADR 001](001-static-app-without-backend.md); [ADR 008](008-data-durability-local-first-sync-ready.md) in part (automatic file backup, sync as v2) |

## Context

[ADR 001](001-static-app-without-backend.md) kept all data in one browser, and [ADR 008](008-data-durability-local-first-sync-ready.md) protected it with persistent storage, a PWA and an automatic backup file, leaving sync for v2. Two things changed in the plan revision before T08:

- The owner uses the app on a phone and a laptop every month; a backup file moved by hand is the weak point ADR 008 tried to patch, and the automatic file backup only works on Chromium desktop.
- An assistant outside the app ([ADR 012](012-assistant-as-claude-code-commands.md)) needs to read the data and write rules, limits and plans back. A backup file on one device can't serve that.

The storage is already sync-ready ([ADR 009](009-sync-clock-and-record-identity.md)): random ids, a monotonic `updatedAt`, `updatedBy` and tombstones.

## Decision

**One instance per person.** Each person forks the repo and deploys it to their own Cloudflare account (free tier). An instance has one owner; there are no accounts, no sign-up and no shared server. The owner's Worker and D1 database are the only backend.

**The public app stays usable without login.** Anyone who opens an instance gets the app in local mode: data only in that browser, as in ADR 001. Cloud sync and the assistant need the owner's login.

**Sync is part of every deploy and comes before the UI.** The deploy creates the Worker API and the D1 database. The plan builds sync (Phase 4) before the screens (Phase 7), so every screen is written over synced storage.

**Access and encryption:**

- The API sits behind **Cloudflare Access**, with a policy that admits only the owner's e-mail. Preview deployments sit behind the same login; production stays open for the local mode.
- **End-to-end encryption in the browser.** Records are encrypted with AES-GCM before they leave the device, under a data key wrapped by a key derived from the owner's passphrase. The server stores only `id`, `updatedAt`, `updatedBy`, `deletedAt`, the account epoch and ciphertext; Cloudflare and the Worker cannot read the data.
- A **recovery key** is generated when the owner turns on the cloud, shown once and wraps the same data key: a forgotten passphrase doesn't lose the data.
- Conflicts resolve by last-write-wins per record, by `(updatedAt, updatedBy)`, with the cursor and receive rules of ADR 009. An account **epoch**, bumped by delete all and restore, keeps the server from bringing wiped data back.
- The details (key derivation, which settings sync, the epoch protocol, how the assistant authenticates) are fixed by the T13 ADR, within this decision.

**File backup becomes optional.** With the cloud on, the encrypted copy in D1 is the durability layer. Export and import of the JSON backup stay in Settings, without reminders or warnings. ADR 008's **automatic backup file** (File System Access handle, 30-day download banner) is dropped. Persistent storage and the PWA install invite stay.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Keep ADR 001, local only, sync in v2** | The phone/laptop split and the assistant both need a shared copy now; building screens first means reworking them for sync. |
| **One shared multi-user service** | Accounts, abuse, a server holding many people's statements, costs that grow with users. Self-hosting keeps each person's data in their own account. |
| **Server-side encryption only** (D1 at rest) | The Worker could read the data; a bug or a leaked token exposes it. E2E keeps the server blind. |
| **Passphrase without a recovery key** | One forgotten passphrase loses every month in the cloud; the recovery key costs one screen. |
| **Keep the automatic backup file next to sync** | Chromium-only, a stored file handle, reminders: complexity that sync makes redundant. Export stays for whoever wants a file. |

## Consequences

**Gained**
- Phone and laptop see the same months; a lost device loses nothing.
- The assistant can work on the owner's data without the app shipping any AI.
- Each person's data lives in their own Cloudflare account, encrypted with a key only they hold.

**Costs**
- Deploying your own needs more steps: D1, an Access application with your e-mail, and keeping the recovery key safe ([docs/setup.md](../setup.md)).
- A backend to maintain: a Worker, D1 migrations, the sync protocol and its tests (Phase 4).
- Crypto in the browser: key handling must be reviewed; every PR in storage, backup, sync, crypto or security gets a code review before merge.
- Losing both the passphrase and the recovery key loses the cloud copy.

## Revisit when

- Cloudflare's free tier no longer fits one owner's data.
- Someone needs to share one instance between people (accounts would need their own ADR).

## Related

- [ADR 001: a static app with no backend](001-static-app-without-backend.md)
- [ADR 008: data durability, local first and sync-ready](008-data-durability-local-first-sync-ready.md)
- [ADR 009: sync clock and record identity](009-sync-clock-and-record-identity.md)
- [ADR 012: assistant as Claude Code commands](012-assistant-as-claude-code-commands.md)
- [Plan, Phase 4](../plan.md) · [Spec v1, §7](../spec/v1.md#7-storage)
