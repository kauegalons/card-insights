# ADR 001: A static app with no backend; data only in the browser

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Deciders** | Kaue Galon |

## Context

The app reads credit card statements: every purchase, with merchant, date and amount. That is sensitive data. The [PRD](../prd/v1.md) names "tools that want my data" as one of the problems to solve. At the same time the work is small: parse a file of a few hundred rows, apply rules, sum numbers. A phone browser does that in milliseconds.

## Decision

Build card-insights as a **static single-page app**. The host serves HTML, JavaScript and CSS; there is no API, no server database and no account. Files are read with the File API, processed in the page and stored in the browser ([ADR 003](003-indexeddb-for-storage.md)). Moving data between devices is a backup file the user downloads and opens.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Backend with an API and a database** (e.g. a Worker + D1) | Statements would sit on a server: one more thing to secure, a reason not to trust the app, and accounts to build. Gains sync between devices, which v1 doesn't need. |
| **End-to-end encrypted sync** (client-side encryption, server stores blobs) | Solves sync without trusting the server, but adds key management, recovery and a backend. Too much for v1; the backup file covers the need. |
| **Desktop app** (Electron, Tauri) | Not on the phone, which is where I check spending; installing is a barrier for anyone else. A PWA gets install and offline from the browser ([T27](../plan.md)). |

## Consequences

**Gained**
- **Privacy by construction:** there is nowhere on the server for data to leak from.
- **No operations:** nothing to patch, scale or back up on the server side. Hosting is free.
- **Works offline** once loaded.
- **Simple to deploy your own:** upload a folder.

**Costs**
- **No sync:** phone and laptop each have their own data unless the user moves a backup.
- **Data can be lost** if the browser evicts storage or the user clears site data. Mitigated by `navigator.storage.persist()` and visible backup in Settings.
- **No server-side help:** no shared rule database across users, no email reminders.

## Revisit when

- Sync between devices becomes a real need: consider end-to-end encrypted sync, in a new ADR.
- A feature needs a secret (e.g. an API key for a bank integration), which cannot live in a static app.

## Related

- [PRD v1](../prd/v1.md), NFR1
- [SECURITY.md](../../SECURITY.md)
- [ADR 003: IndexedDB for storage](003-indexeddb-for-storage.md)
- [ADR 004: Hosting on Cloudflare Workers Static Assets](004-cloudflare-workers-static-assets-hosting.md)
