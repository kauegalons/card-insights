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
5. **First deploy, once, by hand.** `wrangler versions upload` (the PR previews) refuses a Worker that does not exist yet, so create both Workers before the first PR:
   ```sh
   npx wrangler login
   npm run build && npx wrangler deploy                                 # the app
   GITHUB_ACTIONS=1 npm test && npx wrangler deploy -c reports.wrangler.jsonc   # the test report Worker
   ```
   The first prints the app URL, `https://card-insights.<your-subdomain>.workers.dev`. To use other Worker names, change `name` in `wrangler.jsonc` and `reports.wrangler.jsonc` first.
6. **After that, CI deploys.** Every push to `main` runs the `deploy` job (`npm run build`, `npx wrangler deploy`), and every PR commit uploads its previews.

## Previews

Preview URLs are on for both Workers (`"preview_urls": true`). A PR from a fork gets no secrets: its upload steps fail without failing the job (`continue-on-error`), and the comment shows only the test results. If an upload step fails with "You cannot upload a new version of a Worker that does not yet exist", step 5 was skipped: run it and re-run the job.

## Related

- [ADR 001: static app without a backend](adr/001-static-app-without-backend.md)
- [ADR 004: Cloudflare Workers Static Assets](adr/004-cloudflare-workers-static-assets-hosting.md)
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
