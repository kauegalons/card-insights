# ADR 005: Money in integer cents

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-24 |
| **Deciders** | Kaue Galon |

## Context

Amounts arrive as pt-BR strings: quoted, `.` for thousands, `,` for decimals, and a space after a minus sign (`"- 1.234,56"`). They are summed per category, compared across months and split into percentages. Binary floating point can't represent most decimal cents (`0.1 + 0.2 !== 0.3`), so sums drift and totals stop matching the statement.

## Decision

Represent every amount as an **integer number of cents** (`amountCents: number`, always `Number.isInteger`). Convert only at the edges:

- `parseBrlAmount(text): number` parses the pt-BR string straight into cents with string operations, never through `parseFloat`. It accepts an optional sign with optional spaces, thousand separators and exactly two decimals; anything else throws an error that says what was wrong.
- `formatBrl(cents): string` formats for display with `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

Percentages and averages are computed at the end and rounded only for display.

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Floats in reais** | Rounding errors in sums; totals don't match the statement. |
| **A decimal library** (decimal.js, big.js, dinero.js) | Correct, but a dependency for something integers solve. Personal card totals stay far below `Number.MAX_SAFE_INTEGER` (≈ 90 trillion reais in cents). |
| **`bigint` cents** | Exact too, but doesn't mix with `number`, doesn't serialize to JSON natively and adds friction everywhere. |

## Consequences

**Gained**
- Exact sums and comparisons; totals match the statement to the cent.
- Plain numbers in IndexedDB and JSON backups.

**Costs**
- Every boundary must convert explicitly; a raw `number` that is reais by mistake is a bug the types don't catch. Mitigated by naming (`...Cents`) and tests.
- Division (percentages, averages) needs a deliberate rounding rule.

## Revisit when

- Multiple currencies or exchange rates enter the model.

## Related

- [Spec v1, §2 and §3.2](../spec/v1.md#2-data-model)
- [Plan, T04](../plan.md)
