# ADR 002: Preact + Vite + TypeScript strict

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Deciders** | Kaue Galon |

## Context

A static app ([ADR 001](001-static-app-without-backend.md)) used mostly on a phone, often on mobile data, that must also work offline. Most of the logic is pure data transformation (parsing, dedupe, rules, sums) that has to be right, because it is about money. Five pages, a few charts and forms: modest UI needs.

## Decision

- **Preact** (with `preact-iso` for routing and Preact signals where state is shared) for the UI.
- **Vite** for the dev server and the build.
- **TypeScript with `strict: true`**, plus `noUncheckedIndexedAccess`, everywhere.
- **Vitest** for tests, sharing Vite's config.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **React** | Same model, but about ten times the runtime size. Preact keeps the React API (and `preact/compat` if a library needs it) at ~4 KB. |
| **Angular** (the stack I use at work) | Heavy for a five-page app; larger bundle and more ceremony than the problem needs. |
| **Svelte / SolidJS** | Small and fast too; Preact was chosen for the React-compatible API and ecosystem. |
| **Vanilla TS, no framework** | Fine for the domain code, which is framework-free anyway; for forms, lists and routing a small framework saves code. |
| **Jest** | Needs separate TS and ESM setup; Vitest reuses the Vite pipeline. |

## Consequences

**Gained**
- Small bundle: fast first load on a phone, cheap to cache offline.
- `strict` types catch missing fields and `undefined` access in parsing and money code at compile time.
- One toolchain for dev, build and tests.

**Costs**
- Some React libraries need `preact/compat` or don't work; charts must be chosen with that in mind (prefer small, framework-free libraries or SVG by hand).
- Strict mode is more verbose around array indexing and optional fields.

## Revisit when

- A required library can't run under `preact/compat`.
- The UI grows into something that needs a larger framework's tooling.

## Related

- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Plan, T01](../plan.md)
