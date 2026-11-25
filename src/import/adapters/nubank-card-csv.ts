/** Nubank credit card CSV (spec v1 §3.2, §3.3): `date,title,amount`, pt-BR amounts. */
import { daysInMonth, parseIsoDate } from '../../domain/date';
import { parseBrlAmount } from '../../domain/money';
import type { Installment, TransactionKind } from '../../domain/transaction';
import { readCsv } from '../csv';
import type { ImportAdapter, ImportMeta, ParsedRow } from '../types';

const HEADER = 'date,title,amount';
const INSTALLMENT = /\s+-\s+Parcela (\d+)\/(\d+)$/;
const ACQUIRER_PREFIX = /^(?:Mlp|Wl|Dl|Htm|Pg) ?\*\s*/i;
const ACQUIRER_SUFFIX = /\s+I\*Vmt\*Cielo$/i;
// ` (1)` is the suffix browsers add when the same file is downloaded again.
const DATED_FILE_NAME = /^Nubank_(\d{4}-\d{2}-\d{2})(?: \(\d+\))?\.csv$/;

function kindOf(title: string, amountCents: number): TransactionKind {
  if (title === 'Pagamento recebido') return 'payment';
  if (/^(?:IOF|Juros)\b/.test(title)) return 'fee';
  return amountCents < 0 ? 'refund' : 'purchase';
}

function splitTitle(title: string): { merchant: string; installment?: Installment } {
  const match = INSTALLMENT.exec(title);
  const base = match ? title.slice(0, match.index) : title;
  const merchant = (base.replace(ACQUIRER_PREFIX, '').replace(ACQUIRER_SUFFIX, '').trim() || base).replace(/\s+/g, ' ');
  return match ? { merchant, installment: { n: Number(match[1]), total: Number(match[2]) } } : { merchant };
}

/** First date on or after `date` that falls on `closingDay` (clamped to the month's last day). */
function nextClosingDate(date: string, closingDay: number): string {
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
    throw new Error(`Invalid statementClosingDay: ${closingDay} (expected 1..31)`);
  }
  let [year, month, day] = date.split('-').map(Number) as [number, number, number];
  if (day > Math.min(closingDay, daysInMonth(year, month))) {
    month = month === 12 ? 1 : month + 1;
    year = month === 1 ? year + 1 : year;
  }
  day = Math.min(closingDay, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function statementIdFor(dates: string[], meta: ImportMeta): Pick<ParsedRow, 'statementId' | 'statementIdFrom'> {
  const named = DATED_FILE_NAME.exec(meta.fileName)?.[1];
  if (named !== undefined) return { statementId: parseIsoDate(named), statementIdFrom: 'fileName' };
  const latest = dates.reduce((a, b) => (b > a ? b : a));
  return meta.statementClosingDay === undefined
    ? { statementId: latest, statementIdFrom: 'latestDate' }
    : { statementId: nextClosingDate(latest, meta.statementClosingDay), statementIdFrom: 'closingDay' };
}

export const nubankCardCsv: ImportAdapter = {
  id: 'nubank-card-csv',

  detect(file) {
    return file.text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] === HEADER;
  },

  parse(text, meta) {
    const [header, ...records] = readCsv(text);
    if (header === undefined || header.fields.join(',') !== HEADER) {
      throw new Error(`Line ${header?.line ?? 1}: expected the header "${HEADER}"`);
    }
    const rows = records.map(({ line, fields }) => {
      try {
        if (fields.length !== 3) throw new Error(`expected 3 fields, got ${fields.length}`);
        const [dateText, rawTitle, amountText] = fields as [string, string, string];
        if (rawTitle.trim() === '') throw new Error('empty title');
        const amountCents = parseBrlAmount(amountText);
        return { date: parseIsoDate(dateText), rawTitle, amountCents, kind: kindOf(rawTitle.trim(), amountCents), ...splitTitle(rawTitle.trim()) };
      } catch (error) {
        throw new Error(`Line ${line}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    });
    if (rows.length === 0) return [];
    const statement = statementIdFor(rows.map((r) => r.date), meta);
    return rows.map((row): ParsedRow => ({ ...row, ...statement }));
  },
};
