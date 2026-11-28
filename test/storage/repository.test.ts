import { describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../../src/storage/db';
import { nubankCardCsv } from '../../src/import/adapters/nubank-card-csv';
import { dedupe } from '../../src/import/dedupe';
import { commitImport, createRepository } from '../../src/storage/repository';
import { ensureDeviceId, getSetting } from '../../src/storage/settings';
import { defaultSubcategoryId } from '../../src/categorize/tree';
import { dismissed, fakeClock, importRecord, stamped, transaction } from './helpers';

const BAKERY = defaultSubcategoryId('Alimentação', 'Padaria');

/** A database whose deviceId is `device-1`. */
async function open(name?: string): Promise<Db> {
  const db = await openDatabase(name);
  await ensureDeviceId(db, () => 'device-1');
  return db;
}

describe('repository', () => {
  it('put stamps updatedAt from the clock and updatedBy with the deviceId; get and list return the record', async () => {
    const db = await open();
    const { clock } = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'transactions', clock);

    const saved = await repo.put(transaction('t1'));

    expect(saved).toEqual({ ...transaction('t1'), ...stamped('2026-11-24T10:00:00.000Z') });
    expect(await repo.get('t1')).toEqual(saved);
    expect(await repo.list()).toEqual([saved]);
    db.close();
  });

  it('creates the deviceId on the first write when there is none', async () => {
    const db = await openDatabase();
    const saved = await createRepository(db, 'rules').put({ id: 'r1', match: 'contains', pattern: 'x', categoryId: 'c', priority: 1, origin: 'user' });
    expect(saved.updatedBy).toBe(await getSetting(db, 'deviceId'));
    expect(saved.updatedBy).toMatch(/^[0-9a-f-]{36}$/);
    db.close();
  });

  it('put stamps a new updatedAt on every write, overwriting the one passed in', async () => {
    const db = await open();
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'transactions', time.clock);
    const first = await repo.put(transaction('t1'));

    time.set('2026-11-24T11:00:00.000Z');
    const second = await repo.put({ ...first, categoryId: 'bakery', updatedBy: 'other-device' } as typeof first);

    expect(second).toEqual({ ...transaction('t1'), categoryId: 'bakery', ...stamped('2026-11-24T11:00:00.000Z') });
    expect(await repo.get('t1')).toEqual(second);
    db.close();
  });

  it('stamps strictly increasing updatedAt within the same millisecond and when the clock goes back', async () => {
    const db = await open();
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'transactions', time.clock);

    const a = await repo.put(transaction('t1'));
    const b = await repo.put(transaction('t2'));
    time.set('2026-11-24T09:00:00.000Z');
    const c = await repo.put(transaction('t3'));

    expect([a.updatedAt, b.updatedAt, c.updatedAt]).toEqual([
      '2026-11-24T10:00:00.000Z',
      '2026-11-24T10:00:00.001Z',
      '2026-11-24T10:00:00.002Z',
    ]);
    db.close();
  });

  it('keeps the last stamp across repositories and connections', async () => {
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    const first = await open('stamps');
    await createRepository(first, 'transactions', time.clock).put(transaction('t1'));
    first.close();

    const second = await openDatabase('stamps');
    const saved = await createRepository(second, 'rules', time.clock).put({ id: 'r1', match: 'contains', pattern: 'x', categoryId: 'c', priority: 1, origin: 'user' });

    expect(saved.updatedAt).toBe('2026-11-24T10:00:00.001Z');
    expect(await getSetting(second, 'lastStampAt')).toBe('2026-11-24T10:00:00.001Z');
    second.close();
  });

  it('changedSince the last record seen misses nothing written in the same millisecond', async () => {
    const db = await open();
    const { clock } = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'transactions', clock);
    const seen = await repo.put(transaction('t1'));

    await repo.put(transaction('t2'));

    expect((await repo.changedSince(seen.updatedAt)).map((t) => t.id)).toEqual(['t2']);
    db.close();
  });

  it('get returns undefined for an unknown key', async () => {
    const db = await open();
    expect(await createRepository(db, 'imports').get('missing')).toBeUndefined();
    db.close();
  });

  it('remove leaves a tombstone: get and list skip it, changedSince returns it with deletedAt', async () => {
    const db = await open();
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'transactions', time.clock);
    await repo.put(transaction('t1'));
    await repo.put(transaction('t2'));

    time.set('2026-11-24T12:00:00.000Z');
    await repo.remove('t1');

    expect(await repo.get('t1')).toBeUndefined();
    expect((await repo.list()).map((t) => t.id)).toEqual(['t2']);
    expect(await repo.changedSince('2026-11-24T11:00:00.000Z')).toEqual([
      { ...transaction('t1'), ...stamped('2026-11-24T12:00:00.000Z'), deletedAt: '2026-11-24T12:00:00.000Z' },
    ]);
    // The record stays in the store as a tombstone.
    expect(await db.count('transactions')).toBe(2);
    db.close();
  });

  it('remove of a tombstone is a no-op: the first deletion keeps its stamps', async () => {
    const db = await open();
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'transactions', time.clock);
    await repo.put(transaction('t1'));
    time.set('2026-11-24T12:00:00.000Z');
    await repo.remove('t1');
    const tombstone = await db.get('transactions', 't1');

    time.set('2026-11-24T13:00:00.000Z');
    await repo.remove('t1');

    expect(await db.get('transactions', 't1')).toEqual(tombstone);
    expect(await getSetting(db, 'lastStampAt')).toBe('2026-11-24T12:00:00.000Z');
    db.close();
  });

  it('remove of an unknown key throws, naming the store and key', async () => {
    const db = await open();
    await expect(createRepository(db, 'rules').remove('nope')).rejects.toThrow('No record "nope" in rules');
    db.close();
  });

  it('changedSince returns only records written strictly after the timestamp, in updatedAt order', async () => {
    const db = await open();
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'dismissed', time.clock);
    await repo.put(dismissed('d-a', 'fp-a'));
    time.set('2026-11-24T11:00:00.000Z');
    await repo.put(dismissed('d-c', 'fp-c'));
    time.set('2026-11-24T12:00:00.000Z');
    await repo.put(dismissed('d-b', 'fp-b'));

    const changed = await repo.changedSince('2026-11-24T10:00:00.000Z');

    expect(changed.map((d) => d.id)).toEqual(['d-c', 'd-b']);
    expect(await repo.changedSince('2026-11-24T12:00:00.000Z')).toEqual([]);
    db.close();
  });

  it('keeps one dismissed record per occurrence, so two dismissals of a fingerprint are two records', async () => {
    const db = await open();
    const repo = createRepository(db, 'dismissed');
    await repo.put(dismissed('d-1', 'fp-a'));
    await repo.put(dismissed('d-2', 'fp-a'));
    await repo.put(dismissed('d-3', 'fp-b'));
    await repo.remove('d-3');

    expect((await repo.list()).map((d) => [d.id, d.fingerprint])).toEqual([['d-1', 'fp-a'], ['d-2', 'fp-a']]);
    expect(await db.getAllKeysFromIndex('dismissed', 'fingerprint', 'fp-a')).toEqual(['d-1', 'd-2']);
    db.close();
  });
});

describe('commitImport', () => {
  it('stores the transactions, categorized by the seeded defaults, and the import record together, with one stamp', async () => {
    const db = await open();
    const { clock } = fakeClock('2026-11-24T10:00:00.000Z');

    await commitImport(db, { record: importRecord('import-1'), transactions: [transaction('t1'), transaction('t2')] }, clock);

    const stamp = stamped('2026-11-24T10:00:00.000Z');
    expect(await createRepository(db, 'imports').list()).toEqual([{ ...importRecord('import-1'), ...stamp }]);
    expect(await createRepository(db, 'transactions').list()).toEqual([
      { ...transaction('t1'), categoryId: BAKERY, categorySource: 'rule', ...stamp },
      { ...transaction('t2'), categoryId: BAKERY, categorySource: 'rule', ...stamp },
    ]);
    expect(await getSetting(db, 'lastStampAt')).toBe('2026-11-24T10:00:00.000Z');
    db.close();
  });

  it('a stored row both moved and filled by the seeded rules keeps both changes', async () => {
    const db = await open();
    await createRepository(db, 'transactions').put(transaction('p1', { statementId: '2026-10-20' }));
    await commitImport(db, { record: importRecord('import-2'), transactions: [], moveToStatement: ['p1'] });
    expect(await createRepository(db, 'transactions').get('p1')).toMatchObject({ statementId: '2026-11-11', categoryId: BAKERY, categorySource: 'rule' });
    db.close();
  });

  it('stores nothing when one record fails', async () => {
    const db = await open();
    const broken = { ...transaction('t2'), id: undefined } as unknown as ReturnType<typeof transaction>;

    await expect(commitImport(db, { record: importRecord('import-1'), transactions: [transaction('t1'), broken] })).rejects.toThrow();

    expect(await db.count('transactions')).toBe(0);
    expect(await db.count('imports')).toBe(0);
    expect(await getSetting(db, 'lastStampAt')).toBeUndefined();
    db.close();
  });

  it('a partial export then the closed statement leaves one statement (spec v1 §4)', async () => {
    const db = await open();
    const { clock } = fakeClock('2026-11-24T10:00:00.000Z');
    const transactions = createRepository(db, 'transactions');
    const header = 'date,title,amount\n';
    const partialText = `${header}2026-10-15,Mercado Exemplo,"123,45"\n2026-10-20,Cafe Exemplo,"12,00"\n`;
    const closedText = `${partialText}2026-11-02,Posto Exemplo,"200,00"\n`;

    const importFile = async (importId: string, fileName: string, text: string) => {
      const rows = nubankCardCsv.parse(text, { fileName });
      const result = dedupe(rows, await transactions.list());
      const statementId = rows[0]?.statementId ?? '';
      await commitImport(db, {
        record: { ...importRecord(importId), fileName, statementId, summary: result.summary },
        transactions: result.toAdd.map((r, i) => ({ ...r, id: `${importId}-${i}`, importId })),
        moveToStatement: result.moveToStatement,
      }, clock);
    };

    await importFile('partial', 'fatura.csv', partialText);
    expect(new Set((await transactions.list()).map((t) => t.statementId))).toEqual(new Set(['2026-10-20']));

    await importFile('closed', 'Nubank_2026-11-11 (1).csv', closedText);
    const all = await transactions.list();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((t) => t.statementId))).toEqual(new Set(['2026-11-11']));
    expect(all.find((t) => t.id === 'partial-0')).toMatchObject({ importId: 'partial', ...stamped('2026-11-24T10:00:00.001Z') });
    db.close();
  });
});
