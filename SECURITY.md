# Security and privacy

## Privacy model

card-insights handles card statements, so the design starts from one rule: **nobody but you can read your financial data.**

- **Your own instance, your own backend.** Each person deploys their own copy to their own Cloudflare account; there is no shared server and no sign-up. From Phase 4 the only backend is the owner's Worker and D1, behind Cloudflare Access that admits only the owner's e-mail, and it stores only records **encrypted in the browser** with a key derived from the owner's passphrase (plus a recovery key shown once). The server never sees readable data ([ADR 011](docs/adr/011-self-hosted-instances-with-mandatory-e2e-sync.md)).
- **Parsing happens in the browser.** The CSV is read with the File API and never uploaded.
- **Storage is local.** Transactions, rules, categories and settings live in the browser's IndexedDB for this site ([ADR 003](docs/adr/003-indexeddb-for-storage.md)). Clearing the site data, or **Settings → Delete all data**, erases them.
- **No analytics, no third-party scripts, no tracking.** No request leaves the page after it loads except encrypted sync with the owner's own Worker (from Phase 4) and the service worker checking for a new version of the app (from T27).
- **Backups are yours.** A backup is an optional JSON file you download; the app never sends it anywhere.
- **No AI service in the app.** Categorization and insights are local rules ([ADR 007](docs/adr/007-editable-rules-for-categorization-without-ai.md)). The assistant (`/organizar`, `/investir`) is Claude Code commands the owner chooses to run on their own machine and Claude account; the app never calls an AI API ([ADR 012](docs/adr/012-assistant-as-claude-code-commands.md)).

What this does not protect against: anyone with access to your unlocked device and browser profile can open the app and see the data. IndexedDB is not encrypted by the app.

## The repository

- **No real data is ever committed.** Statements (`.csv`, `.ofx`, `.pdf`) are git-ignored outside `test/fixtures/`, and from T02 a CI job fails any PR that adds one elsewhere.
- Fixtures are fictitious: invented merchants and amounts, in the same format as the real files.
- Deploy secrets (the Cloudflare API token and account ID) live only in GitHub Actions secrets.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/kauegalons/card-insights/security/advisories/new) instead of a public issue.
