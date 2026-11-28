# ADR 013: Derived data migrations

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-11-28 |
| **Deciders** | Kaue Galon |

## Context

[ADR 009](009-sync-clock-and-record-identity.md) says fingerprints are derived data that is stored, so changing how they are computed needs a migration. The Phase 2 review found more stored data derived the same way:

1. **Learned rules** (`origin: 'user'`, spec v1 §5) store `learnedRulePattern(merchant)`: `^<normalized merchant>$`, escaped. The merchant itself comes from the adapter's cleanup (acquirer prefixes and `Parcela n/N` stripped, spacing collapsed) and `normalizeMerchant`. If any of these change, a stored pattern stops matching the merchant the next import produces, and the user's correction silently stops applying.
2. **Default rules and categories** are seeded once per fixed id (spec v1 §5): a later version that edits a default's pattern, priority or name never reaches a device that already has it stored.

## Decision

Extend ADR 009's derived-data rule:

- **Changing `normalizeMerchant`, an adapter's merchant cleanup or `learnedRulePattern` needs a migration** that recomputes, in the same IndexedDB upgrade, every stored fingerprint (transactions and `dismissed`, as ADR 009 says), every transaction's `merchant` where the cleanup changed, and every learned rule's pattern (rebuilt from the merchant it encodes, then deduplicated as `recategorize` does). A test pins `learnedRulePattern`'s output for fixed fictitious merchants, run through the real adapter, so such a change cannot land unnoticed.
- **Changing a shipped default rule or category** (pattern, priority, target, name) needs a migration that updates the stored record only while it still equals the old shipped value, so a user's edit always wins. Adding a default needs none: seeding adds it.
- Migrations of synced records stamp them like any write, so other devices receive the new values (ADR 009).

## Alternatives considered

| Alternative | Why not |
|---|---|
| **Store the raw merchant in learned rules and derive the pattern at match time** | Changes the record shape synced in Phase 4 and still needs a migration for rules already stored. |
| **Re-seed defaults on every version** | Overwrites the user's edits of defaults. |
| **Do nothing; let the user correct again** | Silent loss of corrections; the user can't tell why a merchant stopped being categorized. |

## Consequences

**Gained**
- Corrections and default fixes survive normalization changes.

**Costs**
- Any change to merchant normalization is a schema-version bump with a migration and its test.

## Revisit when

- Rules gain a stored raw merchant, or the sync ADR (T13) changes how migrations of synced records propagate.

## Related

- [ADR 007: categorization by editable rules](007-editable-rules-for-categorization-without-ai.md)
- [ADR 009: sync clock and record identity](009-sync-clock-and-record-identity.md)
- [Spec v1, §4 and §5](../spec/v1.md)
