/** Dedupe by fingerprint and occurrence count: spec v1 §4, ADR 006. */
import type { Transaction } from '../domain/transaction';
import type { ParsedRow } from './types';

export type StoredTransaction = Pick<Transaction, 'date' | 'merchant' | 'amountCents' | 'fingerprint'>;

/** One occurrence the user deleted (a live record in the `dismissed` store, T15). */
export interface DismissedOccurrence {
  fingerprint: string;
}

/** Disjoint counts: `added + existing + review` is the number of rows in the file. */
export interface ImportSummary {
  /** New rows with status `ok`. */
  added: number;
  /** Rows already stored or dismissed, skipped. */
  existing: number;
  /** New rows with status `review` (possibly a renamed stored row). */
  review: number;
}

export interface DedupedRow extends ParsedRow {
  fingerprint: string;
  status: Transaction['status'];
}

export interface DedupeResult {
  toAdd: DedupedRow[];
  summary: ImportSummary;
}

/** Case-, accent- and spacing-insensitive merchant, so a cosmetic change doesn't create a new fingerprint. */
function normalizeMerchant(merchant: string): string {
  return merchant.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** `date|normalizedMerchant|amountCents|n/total` (or `-` without installment). */
export function fingerprint(row: Pick<ParsedRow, 'date' | 'merchant' | 'amountCents' | 'installment'>): string {
  const installment = row.installment ? `${row.installment.n}/${row.installment.total}` : '-';
  return `${row.date}|${normalizeMerchant(row.merchant)}|${row.amountCents}|${installment}`;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Per fingerprint, adds `max(0, countInFile − countStored − countDismissed)` rows, where `countDismissed` is
 * the number of `dismissed` entries with that fingerprint (one per deleted occurrence). Only stored transactions
 * within the file's date range count. A new fingerprint whose `date + amountCents` matches a stored row with
 * another merchant is added as `review`.
 */
export function dedupe(
  rows: readonly ParsedRow[],
  stored: readonly StoredTransaction[],
  dismissed: readonly DismissedOccurrence[] = [],
): DedupeResult {
  const dates = rows.map((r) => r.date).sort();
  const [from, to] = [dates[0], dates[dates.length - 1]];
  const inRange = from === undefined || to === undefined ? [] : stored.filter((t) => t.date >= from && t.date <= to);

  const storedCount = new Map<string, number>();
  const storedMerchantsByDateAmount = new Map<string, Set<string>>();
  for (const t of inRange) {
    increment(storedCount, t.fingerprint);
    const key = `${t.date}|${t.amountCents}`;
    const merchants = storedMerchantsByDateAmount.get(key) ?? new Set<string>();
    storedMerchantsByDateAmount.set(key, merchants.add(normalizeMerchant(t.merchant)));
  }

  // Occurrences already accounted for, consumed as matching rows come in.
  const skip = new Map(storedCount);
  for (const d of dismissed) increment(skip, d.fingerprint);

  const toAdd: DedupedRow[] = [];
  const summary: ImportSummary = { added: 0, existing: 0, review: 0 };
  for (const row of rows) {
    const fp = fingerprint(row);
    const remaining = skip.get(fp) ?? 0;
    if (remaining > 0) {
      skip.set(fp, remaining - 1);
      summary.existing++;
      continue;
    }
    const merchants = storedMerchantsByDateAmount.get(`${row.date}|${row.amountCents}`);
    const renamed = !storedCount.has(fp) && merchants !== undefined && !merchants.has(normalizeMerchant(row.merchant));
    const status = renamed ? 'review' : 'ok';
    toAdd.push({ ...row, fingerprint: fp, status });
    summary[renamed ? 'review' : 'added']++;
  }
  return { toAdd, summary };
}
