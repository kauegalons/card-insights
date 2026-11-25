# Security and privacy

## Privacy model

card-insights handles card statements, so the design starts from one rule: **your financial data stays on your device.**

- **No backend.** The host serves static HTML, JavaScript and CSS, and nothing else. There is no API, no account and no database on a server ([ADR 001](docs/adr/001-static-app-without-backend.md)).
- **Parsing happens in the browser.** The CSV is read with the File API and never uploaded.
- **Storage is local.** Transactions, rules, categories and settings live in the browser's IndexedDB for this site ([ADR 003](docs/adr/003-indexeddb-for-storage.md)). Clearing the site data, or **Settings → Delete all data**, erases them.
- **No analytics, no third-party scripts, no tracking.** No request leaves the page after it loads, except the service worker checking for a new version of the app (from T20).
- **Backups are yours.** A backup is a JSON file you download; the app never sends it anywhere.
- **No AI service.** Categorization and insights are local rules ([ADR 007](docs/adr/007-editable-rules-for-categorization-without-ai.md)).

What this does not protect against: anyone with access to your unlocked device and browser profile can open the app and see the data. IndexedDB is not encrypted by the app.

## The repository

- **No real data is ever committed.** Statements (`.csv`, `.ofx`, `.pdf`) are git-ignored outside `test/fixtures/`, and from T02 a CI job fails any PR that adds one elsewhere.
- Fixtures are fictitious: invented merchants and amounts, in the same format as the real files.
- Deploy secrets (the Cloudflare API token and account ID) live only in GitHub Actions secrets.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/kauegalons/card-insights/security/advisories/new) instead of a public issue.
