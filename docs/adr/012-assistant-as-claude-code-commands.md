# ADR 012: The assistant is a set of Claude Code commands; the app stays AI-free

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-25 |
| **Deciders** | Kaue Galon |
| **Complements** | [ADR 007](007-editable-rules-for-categorization-without-ai.md) |

## Context

[ADR 007](007-editable-rules-for-categorization-without-ai.md) keeps categorization and insights as rules, with no AI in the app. The owner also wants help a rule can't give: a savings plan for the month (goal, where to cut, projection, what to improve next month), a spending limit per category, and a comparison of where to invest what is left. The owner already has a Claude Pro plan and runs Claude Code on the laptop where the repo is cloned. Calling an AI API from the app would need a key the static app can't hold, send spending data from the page to a third party, and cost money per call.

## Decision

- **The app never calls an AI API.** No Anthropic API, no other model API, no key in the app or the Worker. ADR 007 holds for the app.
- **The assistant is Claude Code commands** in the repo (`.claude/commands/`), run by the owner on their own machine with their own Claude plan:
  - **`/organizar`** (T17) asks for the passphrase, reads and decrypts the owner's data from the cloud ([ADR 011](011-self-hosted-instances-with-mandatory-e2e-sync.md)), runs the app's pure analysis, and, after showing the changes and getting a yes, **writes encrypted records straight to the cloud**: rules for uncategorized merchants, **limits per category** and a **plan** (savings goal, cuts with amount and reason, projection, next-month improvements). The app picks them up on the next sync and lets the owner edit them.
  - **`/investir`** (T18) builds a profile from questions (emergency fund, horizon, risk), compares options with **current rates looked up on the web** (with source and date) and suggests a split. It is education, **not advice**, says so every time, keeps no portfolio and writes nothing.
- The commands reuse the app's code (crypto, sync client, validation, analysis) through scripts in the repo, so what they write passes the same validation as a restore.
- The passphrase is never stored or logged by the commands.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **AI API called from the app or the Worker** | Needs a paid API key, sends data from the app to a model provider, and makes the app's behavior depend on a model. |
| **On-device model in the app** | Heavy download, weak at planning and at current rates. |
| **Workers AI in the owner's instance** | Possible later as an optional feature ("After v1" in the plan), with its own ADR. |
| **Assistant output as a file the owner imports** | Extra manual step; writing synced records directly is the same data path the app already trusts. |

## Consequences

**Gained**
- The app stays deterministic, explainable and free of AI keys; its privacy model doesn't change.
- The owner gets planning and investment help with the plan they already pay for.
- What the assistant writes is ordinary synced data: visible, editable and reversible in the app.

**Costs**
- Data leaves the device to the owner's Claude session when they run a command. That is the owner's choice, made per run, on their own account; the app never does it.
- The assistant needs Claude Code and a clone of the repo; on the phone there is no assistant.
- Investment comparisons are only as current as the web sources the command finds.

## Revisit when

- An optional in-app assistant (Workers AI) is wanted: a new ADR.
- Claude Code commands can't reach the API behind Cloudflare Access in a way that keeps tokens off the repo.

## Related

- [ADR 007: categorization by editable rules, without AI](007-editable-rules-for-categorization-without-ai.md)
- [ADR 011: self-hosted instances with mandatory end-to-end encrypted sync](011-self-hosted-instances-with-mandatory-e2e-sync.md)
- [Plan, Phase 5](../plan.md) · [Spec v1, §6 and §7](../spec/v1.md)
