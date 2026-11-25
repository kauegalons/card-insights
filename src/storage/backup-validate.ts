/** Record checks for a backup being restored (spec v1 §7): the rules the domain enforces, per store. */
import { parseIsoDate } from '../domain/date';
import { TRANSACTION_KINDS } from '../domain/transaction';
import { isDeviceLocalSetting, type DeviceLocalSettingKey, type SettingKey, type StoreName, type SyncedStoreName } from './db';

/** What the value must be, or undefined when it is valid. */
type Check = (value: unknown) => string | undefined;

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const when = (valid: boolean, expected: string): string | undefined => (valid ? undefined : expected);

const string: Check = (v) => when(typeof v === 'string', 'a string');
const boolean: Check = (v) => when(typeof v === 'boolean', 'a boolean');
const integer: Check = (v) => when(Number.isSafeInteger(v), 'an integer');
const cents: Check = (v) => when(Number.isSafeInteger(v), 'an integer number of cents');
const count: Check = (v) => when(Number.isSafeInteger(v) && (v as number) >= 0, 'a non-negative integer');
const dayOfMonth: Check = (v) => when(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31, 'a day of the month, 1 to 31');
const timestamp: Check = (v) =>
  when(typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v, 'an ISO timestamp');
const optional = (check: Check): Check => (v) => (v === undefined ? undefined : check(v));
const oneOf = (...values: readonly unknown[]): Check => (v) =>
  when(values.includes(v), `one of ${values.map((x) => JSON.stringify(x)).join(', ')}`);

function isoDate(v: unknown): string | undefined {
  const expected = 'a YYYY-MM-DD date';
  if (typeof v !== 'string') return expected;
  try {
    return when(parseIsoDate(v) === v, expected);
  } catch {
    return expected; // parseIsoDate's own message names the input; ours names the field
  }
}

const installment: Check = (v) =>
  when(
    isObject(v) && Number.isSafeInteger(v.n) && Number.isSafeInteger(v.total) && (v.n as number) >= 1 && (v.n as number) <= (v.total as number),
    '{ n, total } with 1 ≤ n ≤ total',
  );
const summary: Check = (v) =>
  when(isObject(v) && [v.added, v.existing, v.review].every((n) => count(n) === undefined), '{ added, existing, review } counts');

const sync = { updatedAt: timestamp, updatedBy: string, deletedAt: optional(timestamp) };

const RECORDS: Record<SyncedStoreName, Record<string, Check>> = {
  transactions: {
    id: string, date: isoDate, rawTitle: string, merchant: string, amountCents: cents, kind: oneOf(...TRANSACTION_KINDS),
    installment: optional(installment), categoryId: optional(string), categorySource: optional(oneOf('rule', 'manual')),
    statementId: isoDate, fingerprint: string, importId: string, status: oneOf('ok', 'review'), ...sync,
  },
  imports: { id: string, adapterId: string, fileName: string, statementId: isoDate, importedAt: timestamp, summary, ...sync },
  rules: {
    id: string, match: oneOf('contains', 'regex'), pattern: string, categoryId: string, priority: integer,
    origin: oneOf('default', 'user'), ...sync,
  },
  categories: { id: string, name: string, parentId: optional(string), budgetGroup: optional(oneOf('needs', 'wants', 'savings')), ...sync },
  dismissed: { id: string, fingerprint: string, dismissedAt: timestamp, ...sync },
};

/** Settings a backup carries; device-local ones are skipped, not validated. */
const SETTINGS: Record<Exclude<SettingKey, DeviceLocalSettingKey>, Check> = {
  monthlyIncomeCents: cents,
  statementClosingDay: dayOfMonth,
  demo: boolean,
  lastBackupAt: timestamp,
};

const show = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** Throws `<where>.<field> must be <expected> (got <value>)` on the first invalid field. */
export function validateRecord(store: StoreName, record: unknown, where: string): void {
  if (!isObject(record)) throw new Error(`${where} must be an object`);
  const fields: Record<string, Check> =
    store !== 'settings'
      ? RECORDS[store]
      : isDeviceLocalSetting(record.key)
        ? {}
        : { key: oneOf(...Object.keys(SETTINGS)), value: SETTINGS[record.key as keyof typeof SETTINGS] ?? (() => undefined) };
  for (const [field, check] of Object.entries(fields)) {
    const expected = check(record[field]);
    if (expected !== undefined) throw new Error(`${where}.${field} must be ${expected} (got ${show(record[field])})`);
  }
}
