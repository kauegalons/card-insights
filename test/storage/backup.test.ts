import { describe, expect, it } from 'vitest';
import { deleteAllData, exportBackup, restoreBackup, type Backup } from '../../src/storage/backup';
import { SCHEMA_VERSION, openDatabase, type Db } from '../../src/storage/db';
import { createRepository } from '../../src/storage/repository';
import { ensureDeviceId, setSetting } from '../../src/storage/settings';
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
  time.set('2026-11-24T11:00:00.000Z');
  await transactions.remove('t2');
}

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
    expect(backup.data.settings).toContainEqual({ key: 'deviceId', value: 'device-1' });
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

  const invalid: [string, (b: Backup) => unknown, string][] = [
    ['not an object', () => 'hello', 'Invalid backup: not a card-insights backup'],
    ['another app', (b) => ({ ...b, app: 'other-app' }), 'Invalid backup: not a card-insights backup'],
    ['another schema version', (b) => ({ ...b, schemaVersion: SCHEMA_VERSION + 1 }), `Invalid backup: schemaVersion ${SCHEMA_VERSION + 1} is not supported (expected ${SCHEMA_VERSION})`],
    ['a missing store', (b) => ({ ...b, data: { ...b.data, dismissed: undefined } }), 'Invalid backup: data.dismissed must be an array'],
    ['a record without its key', (b) => ({ ...b, data: { ...b.data, rules: [{ pattern: 'x', updatedAt: '2026-11-24T10:00:00.000Z' }] } }), 'Invalid backup: data.rules[0] has no id'],
    ['a synced record without updatedAt', (b) => ({ ...b, data: { ...b.data, imports: [{ id: 'i1' }] } }), 'Invalid backup: data.imports[0] has no updatedAt'],
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

describe('deleteAllData', () => {
  it('clears every store, tombstones and settings included', async () => {
    const db = await openDatabase();
    await seed(db);

    await deleteAllData(db);

    for (const store of STORES) expect(await db.count(store)).toBe(0);
    db.close();
  });
});
