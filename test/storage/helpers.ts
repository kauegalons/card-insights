/** Shared setup for storage tests: a fresh fake IndexedDB per test, a settable clock and fictitious records. */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';
import type { Category, Rule } from '../../src/domain/category';
import type { Transaction } from '../../src/domain/transaction';
import type { DismissedRecord, ImportRecord } from '../../src/storage/db';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** A clock the test moves by hand; starts at 2026-11-24T10:00:00.000Z. */
export function fakeClock(start = '2026-11-24T10:00:00.000Z') {
  let now = new Date(start);
  return {
    clock: () => new Date(now),
    set: (iso: string) => {
      now = new Date(iso);
    },
  };
}

export const transaction = (id: string, overrides: Partial<Transaction> = {}): Transaction => ({
  id,
  date: '2026-11-09',
  rawTitle: 'Padaria Exemplo',
  merchant: 'Padaria Exemplo',
  amountCents: 1850,
  kind: 'purchase',
  statementId: '2026-11-11',
  fingerprint: `2026-11-09|padaria exemplo|1850|-|${id}`,
  importId: 'import-1',
  status: 'ok',
  ...overrides,
});

export const importRecord = (id: string): ImportRecord => ({
  id,
  adapterId: 'nubank-card-csv',
  fileName: 'Nubank_2026-11-11.csv',
  statementId: '2026-11-11',
  importedAt: '2026-11-24T10:00:00.000Z',
  summary: { added: 2, existing: 0, review: 0 },
});

export const category = (id: string, parentId?: string): Category => ({
  id,
  name: `Categoria ${id}`,
  ...(parentId ? { parentId } : {}),
});

export const rule = (id: string): Rule => ({
  id,
  match: 'contains',
  pattern: 'padaria',
  categoryId: 'bakery',
  priority: 10,
  origin: 'user',
});

export const dismissed = (fingerprint: string): DismissedRecord => ({
  fingerprint,
  count: 1,
  dismissedAt: '2026-11-24T10:00:00.000Z',
});
