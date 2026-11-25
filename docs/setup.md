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
5. **Merge to `main`.** Every push to `main` runs the `deploy` job: after `test` passes, it builds and deploys the app (`npx wrangler deploy`), then deploys the Vitest UI report that the `test` job produced for the same commit (`npx wrangler deploy -c reports.wrangler.jsonc`). The first run creates both Workers and prints the app URL, `https://card-insights.<your-subdomain>.workers.dev`. To use other Worker names, change `name` in `wrangler.jsonc` and `reports.wrangler.jsonc` first.
6. **Then every PR commit uploads its previews.** `wrangler versions upload` refuses a Worker that does not exist yet, so PRs opened before the first deploy to `main` show only the test results; re-run their job after it.

## Previews

Preview URLs are on for both Workers (`"preview_urls": true`). The `test` job runs the PR's code with a read-only token; the Cloudflare secrets reach only its upload steps, and a separate `report` job, which runs the base branch's code, writes the sticky comment.

**PRs from forks** get no secrets and only a read-only token: their upload steps fail without failing the job (`continue-on-error`), and the `report` job cannot write to the PR, so **a fork PR gets no comment at all**. Its results are in the checks (the `test` job log and its `test-reports` artifact). If an upload step fails with "You cannot upload a new version of a Worker that does not yet exist", `main` has not deployed yet: wait for the first `deploy` job and re-run the PR job.

### Retention: previews stay public after the PR closes

Closing or merging a PR does not remove anything. The `pr-<N>` alias URLs and every per-commit version URL of both Workers stay reachable by anyone with the link until you remove them. They hold no user data (the app keeps everything in the visitor's browser; the report holds test code and fictitious fixtures), but they do expose old builds and test code.

Wrangler has no command to delete a single preview alias, so CI does not clean them up. To take them down:

- **All previews of a Worker**: set `"preview_urls": false` in `wrangler.jsonc` (or `reports.wrangler.jsonc`) and deploy, or turn off Preview URLs in the dashboard (Workers & Pages → the Worker → Settings → Domains & Routes). Turn it back on before the next PR needs a preview.
- **Everything, including production**: delete the Worker (`npx wrangler delete`, or `npx wrangler delete -c reports.wrangler.jsonc` for the report Worker). The next push to `main` creates it again.

## Related

- [ADR 001: static app without a backend](adr/001-static-app-without-backend.md)
- [ADR 004: Cloudflare Workers Static Assets](adr/004-cloudflare-workers-static-assets-hosting.md)
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
