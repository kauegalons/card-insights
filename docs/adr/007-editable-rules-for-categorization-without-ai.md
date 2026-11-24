# ADR 007: Categorization by editable rules, without AI

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Deciders** | Kaue Galon |

## Context

Every transaction needs a category for the analysis to mean anything. Merchant names are noisy (acquirer prefixes, abbreviations), but a person's set of merchants is small and repeats every month. Data must stay on the device ([ADR 001](001-static-app-without-backend.md)), and insights must be explainable.

## Decision

Categorize with **rules**: `{ match: 'contains' | 'regex', pattern, categoryId, priority }` over the normalized merchant, case- and accent-insensitive. Rules run by priority and the first match wins; no match is "Uncategorized". The app ships default rules for common Brazilian merchants and a default two-level tree. **Correcting a category creates a user rule** for that merchant, above the defaults, with the option to apply it to past transactions. Manual choices are never overwritten. Savings insights are rules too, each with a stated reason and amount.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **LLM via an API** | Sends spending data to a third party, needs an API key the static app can't hold, costs money and gives answers that can change between runs. |
| **On-device model** (small classifier or WebLLM) | Private, but heavy to download, hard to explain and hard to correct; rules learned from corrections reach the same accuracy for one person's repeating merchants. |
| **Bank's own category** | The Nubank CSV doesn't include it. |
| **Merchant category codes (MCC)** | Not in the CSV either. |

## Consequences

**Gained**
- Private, instant, deterministic and testable: each fixture merchant maps to an expected subcategory.
- Explainable: the user sees which rule matched and can change it.
- Accuracy improves with each correction and stays.

**Costs**
- New merchants start as "Uncategorized" until a rule exists.
- Default rules need curation and may be wrong for some users.
- Regex rules can be misused; the editor validates them and shows matches before saving.

## Revisit when

- Uncategorized rates stay high after a few months of corrections.
- A private on-device model becomes small enough to suggest (never force) categories for unknown merchants.

## Related

- [Spec v1, §5](../spec/v1.md#5-categorization)
- [Plan, T08, T09, T12](../plan.md)
