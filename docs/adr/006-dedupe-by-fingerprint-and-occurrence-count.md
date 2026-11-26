# ADR 006: Dedupe by fingerprint and occurrence count

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Deciders** | Kaue Galon |

## Context

Users will import the same statement more than once: by mistake, or a partial export during the month followed by the closed statement. Each import must add only what is new. The Nubank card CSV has **no row id and no time**, only `date,title,amount`. And identical rows can be legitimate: two coffees of the same price at the same shop on the same day are two purchases. Installments repeat the same merchant and amount every month, differing only in `Parcela n/N`.

## Decision

1. Each row gets a **fingerprint**: `date | normalizedMerchant | amountCents | installment` (`n/total`, or `-`).
2. Dedupe compares **counts**, not presence, over the stored transactions within the file's date range (not the statement id, which a partial export may not carry in its file name): for each fingerprint, add `max(0, countInFile − countStored)`. The file has 3, the store has 2 → 1 is added.
3. A row with a new fingerprint but the same `date + amountCents` as a stored row with a different merchant is added with status **`review`**: the bank may have renamed it. The user keeps both or discards one.
4. The import returns `ImportSummary { added, existing, review }`.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Fingerprint as a unique key** (drop any repeat) | Silently loses legitimate identical purchases on the same day. |
| **Hash of the whole file** | Catches only an exact re-import; a partial then closed statement would duplicate everything. |
| **Row position in the file** | Order changes between exports; a partial file shifts every position. |
| **Replace the whole statement on each import** | Simple, but loses manual categories and review decisions on the replaced rows. |

## Consequences

**Gained**
- Re-importing is safe and idempotent.
- Legitimate repeats survive; installments `9/12` and `10/12` stay distinct.
- Renamed rows surface for a human decision instead of being guessed.

**Costs**
- If the bank removes a row from a later export (e.g. a cancelled purchase), dedupe doesn't delete it; the user deletes it by hand (T22). Deleted occurrences are kept in a `dismissed` store so a re-import doesn't bring them back.
- If the bank changes a merchant name in a way that also changes the date or amount, the row duplicates.
- Counting is over the file's date range, so a stored row that falls outside it is never matched; that is correct, since its fingerprint holds a date outside the file.

## Revisit when

- An export format provides a stable row id: use it as the key.
- Review items turn out to be frequent or confusing in real use.

## Related

- [Spec v1, §4](../spec/v1.md#4-dedupe)
- [Plan, T06](../plan.md)
