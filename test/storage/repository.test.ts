import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/storage/db';
import { commitImport, createRepository } from '../../src/storage/repository';
import { dismissed, fakeClock, importRecord, transaction } from './helpers';

describe('repository', () => {
  it('put stamps updatedAt from the clock; get and list return the record', async () => {
    const db = await openDatabase();
    const { clock } = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'transactions', clock);

    const saved = await repo.put(transaction('t1'));

    expect(saved).toEqual({ ...transaction('t1'), updatedAt: '2026-11-24T10:00:00.000Z' });
    expect(await repo.get('t1')).toEqual(saved);
    expect(await repo.list()).toEqual([saved]);
    db.close();
  });

  it('put stamps a new updatedAt on every write, overwriting the one passed in', async () => {
    const db = await openDatabase();
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'transactions', time.clock);
    const first = await repo.put(transaction('t1'));

    time.set('2026-11-24T11:00:00.000Z');
    const second = await repo.put({ ...first, categoryId: 'bakery' });

    expect(second.updatedAt).toBe('2026-11-24T11:00:00.000Z');
    expect(await repo.get('t1')).toEqual({ ...transaction('t1'), categoryId: 'bakery', updatedAt: '2026-11-24T11:00:00.000Z' });
    db.close();
  });

  it('get returns undefined for an unknown key', async () => {
    const db = await openDatabase();
    expect(await createRepository(db, 'imports').get('missing')).toBeUndefined();
    db.close();
  });

  it('remove leaves a tombstone: get and list skip it, changedSince returns it with deletedAt', async () => {
    const db = await openDatabase();
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'transactions', time.clock);
    await repo.put(transaction('t1'));
    await repo.put(transaction('t2'));

    time.set('2026-11-24T12:00:00.000Z');
    await repo.remove('t1');

    expect(await repo.get('t1')).toBeUndefined();
    expect((await repo.list()).map((t) => t.id)).toEqual(['t2']);
    expect(await repo.changedSince('2026-11-24T11:00:00.000Z')).toEqual([
      { ...transaction('t1'), updatedAt: '2026-11-24T12:00:00.000Z', deletedAt: '2026-11-24T12:00:00.000Z' },
    ]);
    // The record stays in the store as a tombstone.
    expect(await db.count('transactions')).toBe(2);
    db.close();
  });

  it('remove of an unknown key throws, naming the store and key', async () => {
    const db = await openDatabase();
    await expect(createRepository(db, 'rules').remove('nope')).rejects.toThrow('No record "nope" in rules');
    db.close();
  });

  it('changedSince returns only records written strictly after the timestamp, in updatedAt order', async () => {
    const db = await openDatabase();
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    const repo = createRepository(db, 'dismissed', time.clock);
    await repo.put(dismissed('fp-a'));
    time.set('2026-11-24T11:00:00.000Z');
    await repo.put(dismissed('fp-c'));
    time.set('2026-11-24T12:00:00.000Z');
    await repo.put(dismissed('fp-b'));

    const changed = await repo.changedSince('2026-11-24T10:00:00.000Z');

    expect(changed.map((d) => d.fingerprint)).toEqual(['fp-c', 'fp-b']);
    expect(await repo.changedSince('2026-11-24T12:00:00.000Z')).toEqual([]);
    db.close();
  });

  it('keys dismissed occurrences by fingerprint', async () => {
    const db = await openDatabase();
    const repo = createRepository(db, 'dismissed');
    await repo.put(dismissed('fp-a'));
    await repo.put({ ...dismissed('fp-a'), count: 2 });
    expect((await repo.list()).map((d) => [d.fingerprint, d.count])).toEqual([['fp-a', 2]]);
    db.close();
  });
});

describe('commitImport', () => {
  it('stores the transactions and the import record together, stamping updatedAt', async () => {
    const db = await openDatabase();
    const { clock } = fakeClock('2026-11-24T10:00:00.000Z');

    await commitImport(db, importRecord('import-1'), [transaction('t1'), transaction('t2')], clock);

    const stamp = { updatedAt: '2026-11-24T10:00:00.000Z' };
    expect(await createRepository(db, 'imports').list()).toEqual([{ ...importRecord('import-1'), ...stamp }]);
    expect(await createRepository(db, 'transactions').list()).toEqual([
      { ...transaction('t1'), ...stamp },
      { ...transaction('t2'), ...stamp },
    ]);
    db.close();
  });

  it('stores nothing when one record fails', async () => {
    const db = await openDatabase();
    const broken = { ...transaction('t2'), id: undefined } as unknown as ReturnType<typeof transaction>;

    await expect(commitImport(db, importRecord('import-1'), [transaction('t1'), broken])).rejects.toThrow();

    expect(await db.count('transactions')).toBe(0);
    expect(await db.count('imports')).toBe(0);
    db.close();
  });
});
