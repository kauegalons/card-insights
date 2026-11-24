# Setup: deploy your own

card-insights is static files served by Cloudflare Workers Static Assets ([ADR 004](adr/004-cloudflare-workers-static-assets-hosting.md)). There is no server and no database to set up: your data stays in your browser. Deploying your own copy takes a Cloudflare account (the free plan is enough), a fork and two repository secrets.

## What gets deployed

| Worker | Config | What it serves | When |
|---|---|---|---|
| `card-insights` | [`wrangler.jsonc`](../wrangler.jsonc) | The app (`dist/`), with client-side routes falling back to `index.html` | Every push to `main` (`deploy` job) |
| `card-insights` preview `pr-<N>` | same | The PR's build, at its own URL | Every PR commit (`test` job) |
| `card-insights-tests` preview `pr-<N>` | [`reports.wrangler.jsonc`](../reports.wrangler.jsonc) | The PR's Vitest UI report (test code and fictitious fixtures only) | Every PR commit (`test` job) |

Both previews are linked from the sticky test report comment on the PR, with one row per commit that keeps each commit's own report and app build. URLs are read from Wrangler's output, so nothing in the repo names your `workers.dev` subdomain.

## Requirements

- Node 24 or later (`.nvmrc`), then `npm ci`.
- A Cloudflare account with a `workers.dev` subdomain (Workers & Pages in the dashboard asks you to pick one the first time).
- The GitHub CLI (`gh`), logged in.

## Steps

1. **Fork** the repository and clone your fork.
2. **Create an API token** in the Cloudflare dashboard: My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**. Limit it to your account (Account Resources → Include → your account) and, under Zone Resources, to no zones you don't need. Copy the token once; Cloudflare won't show it again.
3. **Find your account ID**: Workers & Pages overview, right column (or `npx wrangler whoami` after `npx wrangler login`).
4. **Set both secrets** on your fork. Each command prompts for the value, so it never lands in your shell history; never pass it with `--body`:
   ```sh
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```
5. **Deploy**: merge to `main` (or push to it). The `deploy` job builds and runs `npx wrangler deploy`; its log prints the URL, `https://card-insights.<your-subdomain>.workers.dev`. To use another Worker name, change `name` in `wrangler.jsonc` (and in `reports.wrangler.jsonc`).

Deploying by hand works too: `npx wrangler login`, then `npm run build && npx wrangler deploy`.

## Previews

Preview URLs need **Preview URLs** enabled for each Worker (`"preview_urls": true` in both configs, applied on upload). A PR from a fork gets no secrets, so its run skips the uploads and the comment shows only the test results.

If a PR's upload step fails because the Worker doesn't exist yet, deploy it once (step 5, or by hand; for the report, `npx wrangler deploy -c reports.wrangler.jsonc` after `GITHUB_ACTIONS=1 npm test` writes `reports/html`) and re-run the job.

## Related

- [ADR 001: static app without a backend](adr/001-static-app-without-backend.md)
- [ADR 004: Cloudflare Workers Static Assets](adr/004-cloudflare-workers-static-assets-hosting.md)
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
