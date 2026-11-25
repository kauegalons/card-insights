/** Dedupe by fingerprint and occurrence count: spec v1 §4, ADR 006. */
import type { Transaction } from '../domain/transaction';
import type { ParsedRow } from './types';

export type StoredTransaction = Pick<Transaction, 'id' | 'date' | 'merchant' | 'amountCents' | 'fingerprint' | 'statementId'>;

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
  /** Ids of the stored transactions the file's rows matched, one per matching row. */
  matchedIds: string[];
  /**
   * Matched ids whose `statementId` should become the file's: set only when the file's statement id comes from
   * its name or the closing day, for rows stored under another one (e.g. a partial export's provisional id).
   */
  moveToStatement: string[];
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

  const storedByFingerprint = new Map<string, StoredTransaction[]>();
  const storedMerchantsByDateAmount = new Map<string, Set<string>>();
  for (const t of inRange) {
    storedByFingerprint.set(t.fingerprint, [...(storedByFingerprint.get(t.fingerprint) ?? []), t]);
    const key = `${t.date}|${t.amountCents}`;
    const merchants = storedMerchantsByDateAmount.get(key) ?? new Set<string>();
    storedMerchantsByDateAmount.set(key, merchants.add(normalizeMerchant(t.merchant)));
  }

  // Occurrences already accounted for, consumed as matching rows come in: stored rows first, then dismissed.
  const unmatched = new Map([...storedByFingerprint].map(([fp, list]) => [fp, [...list]]));
  const dismissedLeft = new Map<string, number>();
  for (const d of dismissed) increment(dismissedLeft, d.fingerprint);

  const toAdd: DedupedRow[] = [];
  const matched: StoredTransaction[] = [];
  const summary: ImportSummary = { added: 0, existing: 0, review: 0 };
  for (const row of rows) {
    const fp = fingerprint(row);
    const match = unmatched.get(fp)?.shift();
    const dismissedCount = dismissedLeft.get(fp) ?? 0;
    if (match !== undefined || dismissedCount > 0) {
      if (match !== undefined) matched.push(match);
      else dismissedLeft.set(fp, dismissedCount - 1);
      summary.existing++;
      continue;
    }
    const merchants = storedMerchantsByDateAmount.get(`${row.date}|${row.amountCents}`);
    const renamed = !storedByFingerprint.has(fp) && merchants !== undefined && !merchants.has(normalizeMerchant(row.merchant));
    const status = renamed ? 'review' : 'ok';
    toAdd.push({ ...row, fingerprint: fp, status });
    summary[renamed ? 'review' : 'added']++;
  }
  const file = rows[0];
  const known = file !== undefined && file.statementIdFrom !== 'latestDate';
  const moveToStatement = known ? matched.filter((t) => t.statementId !== file.statementId).map((t) => t.id) : [];
  return { toAdd, summary, matchedIds: matched.map((t) => t.id), moveToStatement };
}
