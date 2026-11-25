/** Spec v1 §2. Amounts are integer cents (ADR 005); dates are ISO `YYYY-MM-DD` with no time zone. */
export type TransactionKind = 'purchase' | 'refund' | 'payment' | 'fee';

/** From `Parcela n/N`: charge `n` of `total`. */
export interface Installment {
  n: number;
  total: number;
}

export interface Transaction {
  id: string;
  date: string;
  rawTitle: string;
  merchant: string;
  /** Positive for purchases and fees, negative for refunds and payments. */
  amountCents: number;
  kind: TransactionKind;
  installment?: Installment;
  /** Subcategory id; absent means "Uncategorized". */
  categoryId?: string;
  /** A manual choice is never overwritten by rules. */
  categorySource?: 'rule' | 'manual';
  /** Closing date of the statement, `YYYY-MM-DD`. */
  statementId: string;
  fingerprint: string;
  importId: string;
  status: 'ok' | 'review';
}
