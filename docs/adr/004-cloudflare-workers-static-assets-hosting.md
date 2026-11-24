# ADR 004: Hosting on Cloudflare Workers Static Assets

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Deciders** | Kaue Galon |

## Context

The app is a folder of static files ([ADR 001](001-static-app-without-backend.md)). It needs HTTPS (required for the service worker and install), a fallback to `index.html` for client-side routes, a deploy on every merge to `main`, a preview URL per PR, and it must be free and easy for anyone to deploy their own copy.

## Decision

Host on **Cloudflare Workers Static Assets**: a `wrangler.jsonc` with an `assets` directory (`dist/`) and `not_found_handling: "single-page-application"`, no Worker script. GitHub Actions deploys on push to `main` and uploads a preview version per PR (T03). The only secret is a Cloudflare API token in GitHub Actions secrets.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **GitHub Pages** | Free and zero-config, and a good fallback for forks. No SPA fallback (needs a `404.html` copy trick), no per-PR previews without extra tooling. |
| **Cloudflare Pages** | Works, but Cloudflare now points new projects to Workers Static Assets, which gets new features first. |
| **Netlify / Vercel** | Good previews; free tiers have bandwidth and build limits, and add another account. |

## Consequences

**Gained**
- Free at this scale, global CDN, HTTPS by default.
- SPA fallback and caching configured in one file in the repo.
- Preview URLs let each PR be tried on a phone before merge.
- Room to add a Worker later (e.g. security headers) without moving host.

**Costs**
- Deploying your own needs a Cloudflare account and an API token.
- The repo depends on `wrangler` in CI.

## Revisit when

- Cloudflare's free tier changes for static assets.
- Most forks prefer GitHub Pages: document it as a supported path in `docs/setup.md`.

## Related

- [Plan, T03](../plan.md)
- [README, Deploy your own](../../README.md#deploy-your-own)
