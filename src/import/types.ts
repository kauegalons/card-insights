/** Spec v1 §3.1. */
import type { Installment, TransactionKind } from '../domain/transaction';

export interface ParsedRow {
  date: string;
  rawTitle: string;
  merchant: string;
  amountCents: number;
  kind: TransactionKind;
  installment?: Installment;
  statementId: string;
  /**
   * Where `statementId` came from: the file name or the closing day mean the statement is known; `latestDate`
   * is provisional (a partial export), so a later import may move these rows to its statement (spec v1 §4).
   */
  statementIdFrom: 'fileName' | 'closingDay' | 'latestDate';
}

export interface ImportFile {
  name: string;
  text: string;
}

export interface ImportMeta {
  fileName: string;
  /** Day of the month the statement closes (settings), 1..31. */
  statementClosingDay?: number;
}

export interface ImportAdapter {
  id: string;
  detect(file: ImportFile): boolean;
  /** Throws on the first invalid row, naming its line; rows are never dropped silently. */
  parse(text: string, meta: ImportMeta): ParsedRow[];
}
