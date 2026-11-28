import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deleteAllData, exportBackup, restoreBackup, upgradeBackupData, type Backup } from '../../src/storage/backup';
import { SCHEMA_VERSION, openDatabase, type Db } from '../../src/storage/db';
import { createRepository } from '../../src/storage/repository';
import { ensureDeviceId, getSetting, setSetting } from '../../src/storage/settings';
import { category, dismissed, fakeClock, importRecord, rule, stamped, transaction } from './helpers';

const STORES = ['transactions', 'imports', 'rules', 'categories', 'settings', 'dismissed'] as const;

/** One record in every store, plus a tombstone. */
async function seed(db: Db): Promise<void> {
  await ensureDeviceId(db, () => 'device-1');
  const time = fakeClock('2026-11-24T10:00:00.000Z');
  const transactions = createRepository(db, 'transactions', time.clock);
  await transactions.put(transaction('t1'));
  await transactions.put(transaction('t2', { amountCents: -6000, kind: 'refund' }));
  await createRepository(db, 'imports', time.clock).put(importRecord('import-1'));
  await createRepository(db, 'rules', time.clock).put(rule('rule-1'));
  await createRepository(db, 'categories', time.clock).put(category('food'));
  await createRepository(db, 'categories', time.clock).put(category('bakery', 'food'));
  await createRepository(db, 'dismissed', time.clock).put(dismissed('d-x', 'fp-x'));
  await setSetting(db, 'statementClosingDay', 11);
  await setSetting(db, 'lastSyncAt', '2026-11-24T09:00:00.000Z');
  time.set('2026-11-24T11:00:00.000Z');
  await transactions.remove('t2');
}

/** A fictitious backup written by schema version 1. */
const fixture = (): unknown => JSON.parse(readFileSync('test/fixtures/backup-v1.json', 'utf8'));

describe('exportBackup', () => {
  it('exports every store, tombstones and dismissed included, with app, schemaVersion and exportedAt', async () => {
    const db = await openDatabase();
    await seed(db);
    const { clock } = fakeClock('2026-11-24T12:00:00.000Z');

    const backup = await exportBackup(db, clock);

    expect(backup.app).toBe('card-insights');
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    expect(backup.exportedAt).toBe('2026-11-24T12:00:00.000Z');
    expect(Object.keys(backup.data).sort()).toEqual([...STORES].sort());
    expect(backup.data.transactions.map((t) => [t.id, t.deletedAt])).toEqual([
      ['t1', undefined],
      ['t2', '2026-11-24T11:00:00.000Z'],
    ]);
    // One stamp per write, strictly increasing (ADR 009): the dismissed record is the seventh.
    expect(backup.data.dismissed).toEqual([{ ...dismissed('d-x', 'fp-x'), ...stamped('2026-11-24T10:00:00.006Z') }]);
    db.close();
  });

  it('leaves device-local settings out: deviceId, lastStampAt, lastSyncAt, backupFileHandle', async () => {
    const db = await openDatabase();
    await seed(db);

    const { settings } = (await exportBackup(db)).data;

    expect(settings).toEqual([{ key: 'statementClosingDay', value: 11 }]);
    db.close();
  });
});

describe('restoreBackup', () => {
  it('restores a backup that, exported again, is identical to the original', async () => {
    const source = await openDatabase('source');
    await seed(source);
    const { clock } = fakeClock('2026-11-24T12:00:00.000Z');
    const original = await exportBackup(source, clock);
    const file = JSON.stringify(original);

    const target = await openDatabase('target');
    await restoreBackup(target, JSON.parse(file));
    const again = await exportBackup(target, clock);

    expect(again).toEqual(original);
    expect(JSON.stringify(again)).toBe(file);
    source.close();
    target.close();
  });

  it('replaces everything that was there before', async () => {
    const source = await openDatabase('source');
    await seed(source);
    const backup = await exportBackup(source);
    const target = await openDatabase('target');
    await createRepository(target, 'transactions').put(transaction('old'));
    await createRepository(target, 'rules').put(rule('old-rule'));

    await restoreBackup(target, backup);

    expect(await target.getAllKeys('transactions')).toEqual(['t1', 't2']);
    expect(await target.getAllKeys('rules')).toEqual(['rule-1']);
    source.close();
    target.close();
  });

  it('restores a version 1 backup (fictitious fixture)', async () => {
    const db = await openDatabase();

    await restoreBackup(db, fixture());

    expect((await createRepository(db, 'transactions').list()).map((t) => t.id)).toEqual(['tx-0001']);
    expect(await db.count('transactions')).toBe(2);
    expect(await createRepository(db, 'categories').get('electronics')).toMatchObject({ name: 'Eletrônicos', parentId: 'shopping' });
    expect(await db.getAllKeysFromIndex('dismissed', 'fingerprint', '2026-11-05|cafe exemplo|1200|-')).toEqual(['dismissed-0001']);
    expect(await getSetting(db, 'statementClosingDay')).toBe(11);
    expect(await getSetting(db, 'monthlyIncomeCents')).toBe(850000);
    db.close();
  });

  it("keeps the target's device-local settings and ignores the backup's", async () => {
    const db = await openDatabase();
    await ensureDeviceId(db, () => 'device-target');
    await setSetting(db, 'lastSyncAt', '2026-11-23T09:00:00.000Z');
    await setSetting(db, 'lastStampAt', '2026-11-24T10:00:00.000Z');
    await setSetting(db, 'monthlyIncomeCents', 1);

    await restoreBackup(db, fixture());

    expect(await getSetting(db, 'deviceId')).toBe('device-target');
    expect(await getSetting(db, 'lastSyncAt')).toBe('2026-11-23T09:00:00.000Z');
    expect(await getSetting(db, 'lastStampAt')).toBe('2026-11-24T10:00:00.000Z');
    expect(await getSetting(db, 'monthlyIncomeCents')).toBe(850000);
    db.close();
  });

  it('moves lastStampAt up to the newest restored updatedAt, so later local writes outrank it (ADR 009)', async () => {
    const db = await openDatabase();
    await ensureDeviceId(db, () => 'device-target');
    const { clock } = fakeClock('2026-11-20T08:00:00.000Z');

    await restoreBackup(db, fixture());
    const saved = await createRepository(db, 'rules', clock).put(rule('rule-2'));

    expect(saved.updatedAt).toBe('2026-11-20T08:30:00.001Z');
    expect(saved.updatedBy).toBe('device-target');
    db.close();
  });

  const firstTransaction = (b: Backup, patch: Record<string, unknown>) => ({
    ...b,
    data: { ...b.data, transactions: [{ ...b.data.transactions[0], ...patch }] },
  });
  const settings = (b: Backup, ...records: unknown[]) => ({ ...b, data: { ...b.data, settings: records } });

  const invalid: [string, (b: Backup) => unknown, string][] = [
    ['not an object', () => 'hello', 'Invalid backup: not a card-insights backup'],
    ['another app', (b) => ({ ...b, app: 'other-app' }), 'Invalid backup: not a card-insights backup'],
    ['a newer schema version', (b) => ({ ...b, schemaVersion: SCHEMA_VERSION + 1 }), `Invalid backup: schemaVersion ${SCHEMA_VERSION + 1} is newer than this app supports (${SCHEMA_VERSION}); update the app first`],
    ['a schema version that is not a positive integer', (b) => ({ ...b, schemaVersion: 0 }), 'Invalid backup: schemaVersion 0 is not a version'],
    ['a missing store', (b) => ({ ...b, data: { ...b.data, dismissed: undefined } }), 'Invalid backup: data.dismissed must be an array'],
    ['a record that is not an object', (b) => ({ ...b, data: { ...b.data, rules: ['x'] } }), 'Invalid backup: data.rules[0] must be an object'],
    ['a record without its key', (b) => ({ ...b, data: { ...b.data, rules: [{ ...rule('r'), id: undefined, ...stamped('2026-11-24T10:00:00.000Z') }] } }), 'Invalid backup: data.rules[0].id must be a string (got undefined)'],
    ['a synced record without updatedAt', (b) => ({ ...b, data: { ...b.data, imports: [{ ...importRecord('i1'), updatedBy: 'device-1' }] } }), 'Invalid backup: data.imports[0].updatedAt must be an ISO timestamp (got undefined)'],
    ['fractional cents', (b) => firstTransaction(b, { amountCents: 12.5 }), 'Invalid backup: data.transactions[0].amountCents must be an integer number of cents (got 12.5)'],
    ['cents as a string', (b) => firstTransaction(b, { amountCents: '1850' }), 'Invalid backup: data.transactions[0].amountCents must be an integer number of cents (got "1850")'],
    ['an invalid date', (b) => firstTransaction(b, { date: '2026-02-30' }), 'Invalid backup: data.transactions[0].date must be a YYYY-MM-DD date (got "2026-02-30")'],
    ['an unknown kind', (b) => firstTransaction(b, { kind: 'gift' }), 'Invalid backup: data.transactions[0].kind must be one of "purchase", "refund", "payment", "fee" (got "gift")'],
    ['a malformed installment', (b) => firstTransaction(b, { installment: { n: 7, total: 6 } }), 'Invalid backup: data.transactions[0].installment must be { n, total } with 1 ≤ n ≤ total (got {"n":7,"total":6})'],
    ['a non-string deletedAt', (b) => firstTransaction(b, { deletedAt: 1 }), 'Invalid backup: data.transactions[0].deletedAt must be an ISO timestamp (got 1)'],
    ['a rule whose regex does not compile', (b) => ({ ...b, data: { ...b.data, rules: [{ ...rule('r'), match: 'regex', pattern: '(', ...stamped('2026-11-24T10:00:00.000Z') }] } }), 'Invalid backup: data.rules[0].pattern must be a valid rule pattern (got "(": Invalid regular expression "(":'],
    ['an unknown setting', (b) => settings(b, { key: 'theme', value: 'dark' }), 'Invalid backup: data.settings[0].key must be one of "monthlyIncomeCents", "statementClosingDay", "demo", "lastBackupAt" (got "theme")'],
    ['a closing day out of range', (b) => settings(b, { key: 'statementClosingDay', value: 40 }), 'Invalid backup: data.settings[0].value must be a day of the month, 1 to 31 (got 40)'],
  ];

  it.each(invalid)('rejects %s and keeps the current data', async (_name, corrupt, message) => {
    const db = await openDatabase();
    await seed(db);
    const backup = await exportBackup(db);
    const before = await exportBackup(db);

    await expect(restoreBackup(db, corrupt(backup))).rejects.toThrow(message);

    expect(await exportBackup(db)).toEqual({ ...before, exportedAt: expect.any(String) });
    db.close();
  });
});

describe('upgradeBackupData', () => {
  it('runs the registered upgraders from the backup version up to the current one, in order', () => {
    const ran: number[] = [];
    const upgraders = {
      1: (data: Record<string, unknown>) => {
        ran.push(1);
        return { ...data, rules: [] };
      },
      3: (data: Record<string, unknown>) => {
        ran.push(3);
        return data;
      },
    };

    const data = upgradeBackupData({ rules: [{ id: 'r' }] }, 1, 4, upgraders);

    expect(ran).toEqual([1, 3]); // no upgrader for 2 → 3: its records are unchanged
    expect(data).toEqual({ rules: [] });
  });

  it('leaves a current backup unchanged', () => {
    const data = { rules: [{ id: 'r' }] };
    expect(upgradeBackupData(data, 4, 4, { 1: () => ({}) })).toBe(data);
  });
});

describe('deleteAllData', () => {
  it('clears every store, tombstones and settings included', async () => {
    const db = await openDatabase();
    await seed(db);

    await deleteAllData(db);

    for (const store of STORES) expect(await db.count(store)).toBe(0);
    db.close();
  });
});
