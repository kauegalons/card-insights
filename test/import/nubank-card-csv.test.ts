import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nubankCardCsv } from '../../src/import/adapters/nubank-card-csv';
import type { ParsedRow } from '../../src/import/types';

const fixture = (name: string): string => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const NUBANK = fixture('Nubank_2026-11-11.csv');
const HEADER = 'date,title,amount';
const parseRows = (body: string, fileName = 'fatura.csv', statementClosingDay?: number): ParsedRow[] =>
  nubankCardCsv.parse(`${HEADER}\n${body}\n`, statementClosingDay === undefined ? { fileName } : { fileName, statementClosingDay });

describe('nubankCardCsv.detect', () => {
  it('has the id from the spec', () => {
    expect(nubankCardCsv.id).toBe('nubank-card-csv');
  });

  it('detects a file whose header is exactly date,title,amount', () => {
    expect(nubankCardCsv.detect({ name: 'Nubank_2026-11-11.csv', text: NUBANK })).toBe(true);
  });

  it('detects the header with a BOM and CRLF, whatever the file name', () => {
    expect(nubankCardCsv.detect({ name: 'export.csv', text: `﻿${NUBANK.replaceAll('\n', '\r\n')}` })).toBe(true);
  });

  it('does not detect a CSV of another format', () => {
    expect(nubankCardCsv.detect({ name: 'other-bank.csv', text: fixture('other-bank.csv') })).toBe(false);
  });

  it('does not detect a header with extra columns or a different order', () => {
    expect(nubankCardCsv.detect({ name: 'a.csv', text: 'date,title,amount,category\n' })).toBe(false);
    expect(nubankCardCsv.detect({ name: 'a.csv', text: 'title,date,amount\n' })).toBe(false);
    expect(nubankCardCsv.detect({ name: 'a.csv', text: '' })).toBe(false);
  });
});

describe('nubankCardCsv.parse', () => {
  it('turns the fictitious fixture into the expected rows', () => {
    const s = '2026-11-11';
    expect(nubankCardCsv.parse(NUBANK, { fileName: 'Nubank_2026-11-11.csv' })).toEqual<ParsedRow[]>([
      { date: '2026-11-09', rawTitle: 'Padaria Exemplo', merchant: 'Padaria Exemplo', amountCents: 1850, kind: 'purchase', statementId: s },
      { date: '2026-11-09', rawTitle: 'Padaria Exemplo', merchant: 'Padaria Exemplo', amountCents: 725, kind: 'purchase', statementId: s },
      { date: '2026-11-05', rawTitle: 'Cafe Exemplo I*Vmt*Cielo', merchant: 'Cafe Exemplo', amountCents: 1200, kind: 'purchase', statementId: s },
      {
        date: '2026-11-03', rawTitle: 'Mlp*Loja Exemplo - Parcela 2/6', merchant: 'Loja Exemplo', amountCents: 14990,
        kind: 'purchase', installment: { n: 2, total: 6 }, statementId: s,
      },
      { date: '2026-10-30', rawTitle: 'Wl *Mercado Exemplo', merchant: 'Mercado Exemplo', amountCents: 123456, kind: 'purchase', statementId: s },
      { date: '2026-10-28', rawTitle: 'Dl*Streaming Exemplo', merchant: 'Streaming Exemplo', amountCents: 3990, kind: 'purchase', statementId: s },
      { date: '2026-10-25', rawTitle: 'Htm*Hotel Exemplo', merchant: 'Hotel Exemplo', amountCents: 48000, kind: 'purchase', statementId: s },
      { date: '2026-10-22', rawTitle: 'Pg *Farmacia Exemplo', merchant: 'Farmacia Exemplo', amountCents: 6000, kind: 'purchase', statementId: s },
      { date: '2026-10-20', rawTitle: 'Loja Exemplo', merchant: 'Loja Exemplo', amountCents: -4990, kind: 'refund', statementId: s },
      { date: '2026-10-18', rawTitle: 'IOF de compra internacional', merchant: 'IOF de compra internacional', amountCents: 312, kind: 'fee', statementId: s },
      { date: '2026-10-15', rawTitle: 'Juros de dívida encerrada', merchant: 'Juros de dívida encerrada', amountCents: 540, kind: 'fee', statementId: s },
      { date: '2026-10-12', rawTitle: 'Pagamento recebido', merchant: 'Pagamento recebido', amountCents: -234567, kind: 'payment', statementId: s },
    ].map((r) => ({ ...r, statementIdFrom: 'fileName' as const })));
  });

  it('parses the same rows from a file with a BOM and CRLF line endings', () => {
    const meta = { fileName: 'Nubank_2026-11-11.csv' };
    expect(nubankCardCsv.parse(`﻿${NUBANK.replaceAll('\n', '\r\n')}`, meta)).toEqual(nubankCardCsv.parse(NUBANK, meta));
  });

  it('extracts the installment and strips the suffix from the merchant, keeping the raw title', () => {
    const [row] = parseRows('2026-10-04,Loja Exemplo - Parcela 10/12,"149,90"');
    expect(row).toMatchObject({ rawTitle: 'Loja Exemplo - Parcela 10/12', merchant: 'Loja Exemplo', installment: { n: 10, total: 12 } });
  });

  it('leaves the installment out when the title has none', () => {
    const [row] = parseRows('2026-10-04,Loja Exemplo,"149,90"');
    expect(row).not.toHaveProperty('installment');
  });

  it('classifies kinds: payment, fee, refund, purchase', () => {
    const kinds = parseRows([
      '2026-10-06,Pagamento recebido,"- 1.234,56"',
      '2026-10-05,IOF de compra internacional,"3,12"',
      '2026-10-05,Juros rotativos,"9,99"',
      '2026-10-04,Loja Exemplo,"- 20,00"',
      '2026-10-03,Loja Exemplo,"20,00"',
    ].join('\n')).map((r) => r.kind);
    expect(kinds).toEqual(['payment', 'fee', 'fee', 'refund', 'purchase']);
  });

  it('does not treat a title that only contains IOF or Juros later as a fee', () => {
    const [row] = parseRows('2026-10-03,Loja Juros Exemplo,"20,00"');
    expect(row?.kind).toBe('purchase');
  });

  it('takes the statement id from a Nubank_YYYY-MM-DD.csv file name', () => {
    const [row] = parseRows('2026-10-03,Loja Exemplo,"20,00"', 'Nubank_2026-11-11.csv', 5);
    expect(row).toMatchObject({ statementId: '2026-11-11', statementIdFrom: 'fileName' });
  });

  it('accepts the copy suffix browsers add to a downloaded file name', () => {
    for (const fileName of ['Nubank_2026-11-11 (1).csv', 'Nubank_2026-11-11 (12).csv']) {
      expect(parseRows('2026-10-03,Loja Exemplo,"20,00"', fileName)[0]).toMatchObject({ statementId: '2026-11-11', statementIdFrom: 'fileName' });
    }
    expect(parseRows('2026-10-03,Loja Exemplo,"20,00"', 'Nubank_2026-11-11 copy.csv')[0]?.statementIdFrom).toBe('latestDate');
  });

  it('without a dated file name and no closing day, uses the latest row date for every row', () => {
    const rows = parseRows('2026-10-03,Loja Exemplo,"20,00"\n2026-10-21,Padaria Exemplo,"8,00"\n2026-10-09,Posto Exemplo,"90,00"');
    expect(rows.map((r) => [r.statementId, r.statementIdFrom])).toEqual(Array(3).fill(['2026-10-21', 'latestDate']));
  });

  it('marks a statement id derived from the closing day', () => {
    expect(parseRows('2026-10-20,Loja Exemplo,"20,00"', 'fatura.csv', 11)[0]).toMatchObject({ statementId: '2026-11-11', statementIdFrom: 'closingDay' });
  });

  it('collapses internal whitespace in the merchant, keeping the raw title', () => {
    const [row] = parseRows('2026-10-03,Padaria   Exemplo\t Centro,"20,00"');
    expect(row).toMatchObject({ rawTitle: 'Padaria   Exemplo\t Centro', merchant: 'Padaria Exemplo Centro' });
  });

  it('with a closing day, uses the first closing date on or after the latest row date', () => {
    const latest = (date: string, closingDay: number): string | undefined =>
      parseRows(`${date},Loja Exemplo,"20,00"`, 'fatura.csv', closingDay)[0]?.statementId;
    expect(latest('2026-10-20', 11)).toBe('2026-11-11');
    expect(latest('2026-10-11', 11)).toBe('2026-10-11');
    expect(latest('2026-12-20', 11)).toBe('2027-01-11');
    expect(latest('2026-02-10', 31)).toBe('2026-02-28');
  });

  it('rejects a closing day outside 1..31', () => {
    expect(() => parseRows('2026-10-03,Loja Exemplo,"20,00"', 'fatura.csv', 0)).toThrow('Invalid statementClosingDay: 0');
  });

  it('returns no rows for a file with only the header', () => {
    expect(nubankCardCsv.parse(`${HEADER}\n`, { fileName: 'fatura.csv' })).toEqual([]);
  });

  it('throws when the header is not date,title,amount', () => {
    expect(() => nubankCardCsv.parse('Data,Descricao,Valor\n', { fileName: 'a.csv' })).toThrow(
      'Line 1: expected the header "date,title,amount"',
    );
  });

  it('throws naming the line of an invalid amount instead of dropping the row', () => {
    expect(() => parseRows('2026-10-03,Loja Exemplo,"20,00"\n2026-10-04,Loja Exemplo,"12,3"')).toThrow(
      'Line 3: Invalid BRL amount: "12,3"',
    );
  });

  it('throws naming the line of an invalid date', () => {
    expect(() => parseRows('2026-13-03,Loja Exemplo,"20,00"')).toThrow('Line 2: Invalid date: "2026-13-03"');
  });

  it('throws naming the line of a row with the wrong number of fields', () => {
    expect(() => parseRows('2026-10-03,Loja Exemplo,20,00')).toThrow('Line 2: expected 3 fields, got 4');
  });

  it('throws naming the line of a row with an empty title', () => {
    expect(() => parseRows('2026-10-03,,"20,00"')).toThrow('Line 2: empty title');
  });
});
