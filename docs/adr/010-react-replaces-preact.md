# ADR 010: React replaces Preact

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-25 |
| **Deciders** | Kaue Galon |
| **Supersedes** | [ADR 002](002-preact-vite-typescript-strict.md), UI part only (Vite, TypeScript strict and Vitest stay) |

## Context

[ADR 002](002-preact-vite-typescript-strict.md) chose Preact for its size. Only the T01 shell uses it: no page exists yet. The plan revision before T08 moves the UI after the cloud phase and adds a navigable prototype, a dashboard with four charts plus tables, editable categories and limits, and an encrypted sync setup. That UI will lean on libraries (routing, charts, accessible components) that target React first, and on tooling and examples that assume React. Preact's runtime saving matters less for one owner's instance, which is installed as a PWA and cached after the first load.

## Decision

- **React** (with `react-dom`) for the UI, via `@vitejs/plugin-react`. Tests use `@testing-library/react`.
- No signals library: state lives in React state and context; shared data comes from storage through small hooks.
- The router is picked in T20 (React Router or a smaller equivalent), with bundle size in mind.
- **Vite, TypeScript `strict` (plus `noUncheckedIndexedAccess`) and Vitest stay** as in ADR 002.
- The swap happens now, in the T01 shell, before any page is written.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Keep Preact** | Smaller bundle, but every React-first library needs `preact/compat` and a check that it works; the gain is small for a cached PWA. |
| **Preact with `preact/compat` everywhere** | Most of React's ecosystem, with an aliasing layer that can break in subtle ways in tests and type definitions. |
| **Swap later, after the UI phase** | Rewrites every page instead of one shell. |

## Consequences

**Gained**
- The React ecosystem without a compatibility layer: charts, routing and accessible components work as documented.
- One mainstream mental model for contributors and agents.

**Costs**
- A larger runtime (tens of KB gzipped instead of a few), paid once per version thanks to the service worker cache (T27).
- The pure modules are unaffected; only `src/main.tsx`, `src/app.tsx`, the shell test and the build config change.

## Revisit when

- First load on a mid-range phone misses the PRD's mobile-first goal (NFR5) because of the runtime size.

## Related

- [ADR 002: Preact + Vite + TypeScript strict](002-preact-vite-typescript-strict.md)
- [Plan, Phase 7](../plan.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
