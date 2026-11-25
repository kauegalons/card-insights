import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Installment } from '../../src/domain/transaction';
import { nubankCardCsv } from '../../src/import/adapters/nubank-card-csv';
import { dedupe, fingerprint, type StoredTransaction } from '../../src/import/dedupe';
import type { ParsedRow } from '../../src/import/types';

const row = (date: string, merchant: string, amountCents: number, installment?: Installment): ParsedRow => ({
  date,
  rawTitle: merchant,
  merchant,
  amountCents,
  kind: amountCents < 0 ? 'refund' : 'purchase',
  ...(installment ? { installment } : {}),
  statementId: '2026-11-11',
});

const store = (rows: readonly ParsedRow[]): StoredTransaction[] =>
  rows.map((r) => ({ date: r.date, merchant: r.merchant, amountCents: r.amountCents, fingerprint: fingerprint(r) }));

describe('fingerprint', () => {
  it('joins date, merchant, cents and installment, with "-" when there is no installment', () => {
    expect(fingerprint(row('2026-11-09', 'padaria exemplo', 1850))).toBe('2026-11-09|padaria exemplo|1850|-');
    expect(fingerprint(row('2026-11-03', 'loja exemplo', 14990, { n: 2, total: 6 }))).toBe('2026-11-03|loja exemplo|14990|2/6');
  });

  it('ignores case, accents and repeated spaces in the merchant', () => {
    expect(fingerprint(row('2026-11-09', '  Farmácia   EXEMPLO ', 6000))).toBe(fingerprint(row('2026-11-09', 'farmacia exemplo', 6000)));
  });

  it('tells installments 9/12 and 10/12 of the same merchant apart', () => {
    const nine = row('2026-10-03', 'Loja Exemplo', 14990, { n: 9, total: 12 });
    const ten = row('2026-10-03', 'Loja Exemplo', 14990, { n: 10, total: 12 });
    expect(fingerprint(nine)).not.toBe(fingerprint(ten));
  });
});

describe('dedupe', () => {
  const file = [
    row('2026-11-09', 'Padaria Exemplo', 1850),
    row('2026-11-05', 'Cafe Exemplo', 1200),
    row('2026-11-03', 'Loja Exemplo', 14990, { n: 2, total: 6 }),
  ];

  it('adds every row of a first import with its fingerprint and status ok', () => {
    const result = dedupe(file, []);
    expect(result.summary).toEqual({ added: 3, existing: 0, review: 0 });
    expect(result.toAdd).toEqual(file.map((r) => ({ ...r, fingerprint: fingerprint(r), status: 'ok' })));
  });

  it('adds nothing when the same file is imported again', () => {
    const result = dedupe(file, store(file));
    expect(result.summary).toEqual({ added: 0, existing: 3, review: 0 });
    expect(result.toAdd).toEqual([]);
  });

  it('is idempotent on the fixture parsed by the Nubank adapter', () => {
    const text = readFileSync(new URL('../fixtures/Nubank_2026-11-11.csv', import.meta.url), 'utf8');
    const rows = nubankCardCsv.parse(text, { fileName: 'Nubank_2026-11-11.csv' });
    const first = dedupe(rows, []);
    expect(first.summary.added).toBe(rows.length);
    const again = dedupe(rows, store(first.toAdd));
    expect(again.summary).toEqual({ added: 0, existing: rows.length, review: 0 });
  });

  it('keeps two identical purchases on the same day', () => {
    const coffee = row('2026-11-05', 'Cafe Exemplo', 1200);
    const result = dedupe([coffee, { ...coffee }], []);
    expect(result.summary).toEqual({ added: 2, existing: 0, review: 0 });
  });

  it('adds only the surplus occurrences: 3 in the file, 2 stored, 1 added', () => {
    const coffee = row('2026-11-05', 'Cafe Exemplo', 1200);
    const result = dedupe([coffee, coffee, coffee], store([coffee, coffee]));
    expect(result.summary).toEqual({ added: 1, existing: 2, review: 0 });
    expect(result.toAdd).toHaveLength(1);
  });

  it('adds only the new rows of a closed statement after a partial export without the closing date in its name', () => {
    const partial = [row('2026-10-15', 'Mercado Exemplo', 12345), row('2026-10-20', 'Cafe Exemplo', 1200)].map((r) => ({
      ...r,
      statementId: '2026-10-20',
    }));
    const closed = [
      row('2026-10-15', 'Mercado Exemplo', 12345),
      row('2026-10-20', 'Cafe Exemplo', 1200),
      row('2026-10-20', 'Cafe Exemplo', 1200),
      row('2026-11-02', 'Posto Exemplo', 20000),
    ];
    const result = dedupe(closed, store(partial));
    expect(result.summary).toEqual({ added: 2, existing: 2, review: 0 });
    expect(result.toAdd.map((r) => [r.date, r.merchant])).toEqual([
      ['2026-10-20', 'Cafe Exemplo'],
      ['2026-11-02', 'Posto Exemplo'],
    ]);
  });

  it('adds installment 10/12 when 9/12 of the same merchant and amount is stored', () => {
    const nine = row('2026-10-03', 'Loja Exemplo', 14990, { n: 9, total: 12 });
    const ten = row('2026-10-03', 'Loja Exemplo', 14990, { n: 10, total: 12 });
    const result = dedupe([nine, ten], store([nine]));
    expect(result.summary).toEqual({ added: 1, existing: 1, review: 0 });
    expect(result.toAdd[0]?.installment).toEqual({ n: 10, total: 12 });
  });

  it('does not bring back an occurrence the user dismissed', () => {
    const coffee = row('2026-11-05', 'Cafe Exemplo', 1200);
    const dismissed = [{ fingerprint: fingerprint(coffee), count: 1 }];
    expect(dedupe([coffee], [], dismissed).summary).toEqual({ added: 0, existing: 1, review: 0 });
    expect(dedupe([coffee, coffee, coffee], store([coffee]), dismissed).summary).toEqual({ added: 1, existing: 2, review: 0 });
  });

  it('flags a row with a new merchant but the same date and amount as a stored row as review', () => {
    const stored = store([row('2026-11-09', 'Padaria Exemplo', 1850)]);
    const result = dedupe([row('2026-11-09', 'Padaria Exemplo Ltda', 1850)], stored);
    expect(result.summary).toEqual({ added: 0, existing: 0, review: 1 });
    expect(result.toAdd).toEqual([expect.objectContaining({ merchant: 'Padaria Exemplo Ltda', status: 'review' })]);
  });

  it('does not flag review when only the date or only the amount matches', () => {
    const stored = store([row('2026-11-09', 'Padaria Exemplo', 1850)]);
    const result = dedupe([row('2026-11-10', 'Mercado Exemplo', 1850), row('2026-11-09', 'Mercado Exemplo', 1851)], stored);
    expect(result.summary).toEqual({ added: 2, existing: 0, review: 0 });
  });

  it('ignores stored transactions outside the file date range', () => {
    const outside = store([row('2026-09-01', 'Padaria Exemplo', 1850)]);
    const result = dedupe([row('2026-11-09', 'Padaria Exemplo', 1850)], outside);
    expect(result.summary).toEqual({ added: 1, existing: 0, review: 0 });
  });
});
