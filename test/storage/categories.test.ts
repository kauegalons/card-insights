import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../src/categorize/default-rules';
import { UNCATEGORIZED } from '../../src/categorize/edit';
import { DEFAULT_CATEGORIES } from '../../src/categorize/tree';
import { commitCategoryDeletion, seedDefaults } from '../../src/storage/categories';
import { openDatabase, type Db } from '../../src/storage/db';
import { createRepository } from '../../src/storage/repository';
import { ensureDeviceId, getSetting } from '../../src/storage/settings';
import { category, fakeClock, rule, stamped, transaction } from './helpers';

async function open(name?: string): Promise<Db> {
  const db = await openDatabase(name);
  await ensureDeviceId(db, () => 'device-1');
  return db;
}

const ids = (records: readonly { id: string }[]) => records.map((r) => r.id).sort();

describe('seedDefaults', () => {
  it('writes the default tree and rules, live, with one stamp', async () => {
    const db = await open();
    await seedDefaults(db, fakeClock('2026-11-24T10:00:00.000Z').clock);
    const categories = await createRepository(db, 'categories').list();
    const rules = await createRepository(db, 'rules').list();
    expect(categories).toEqual(
      expect.arrayContaining(DEFAULT_CATEGORIES.map((c) => ({ ...c, ...stamped('2026-11-24T10:00:00.000Z') }))),
    );
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(ids(rules)).toEqual(ids(DEFAULT_RULES));
    db.close();
  });

  it('gives two devices the same ids, so sync merges defaults instead of duplicating them', async () => {
    const a = await open('device-a');
    const b = await open('device-b');
    await seedDefaults(a);
    await seedDefaults(b);
    expect(ids(await createRepository(a, 'categories').list())).toEqual(ids(await createRepository(b, 'categories').list()));
    expect(ids(await createRepository(a, 'rules').list())).toEqual(ids(await createRepository(b, 'rules').list()));
    a.close();
    b.close();
  });

  it('never overwrites a renamed default nor brings back a deleted one', async () => {
    const db = await open();
    const time = fakeClock('2026-11-24T10:00:00.000Z');
    await seedDefaults(db, time.clock);
    const categories = createRepository(db, 'categories', time.clock);
    const [first, second] = DEFAULT_CATEGORIES;
    if (!first || !second) throw new Error('empty default tree');
    time.set('2026-11-24T11:00:00.000Z');
    const renamed = await categories.put({ ...first, name: 'Mobilidade' });
    await categories.remove(second.id);
    const changes = await categories.changedSince('2026-11-24T11:00:00.000Z');

    time.set('2026-11-24T12:00:00.000Z');
    await seedDefaults(db, time.clock);

    expect(await categories.get(first.id)).toEqual(renamed);
    expect(await categories.get(second.id)).toBeUndefined();
    expect(await categories.changedSince('2026-11-24T11:00:00.000Z')).toEqual(changes);
    db.close();
  });

  it('skips a new default whose parent the user deleted, and the rules pointing to it, so nothing is orphaned', async () => {
    const db = await open();
    await seedDefaults(db);
    const transport = DEFAULT_CATEGORIES.find((c) => c.name === 'Transporte');
    const fuel = DEFAULT_CATEGORIES.find((c) => c.name === 'Combustível');
    const fuelRules = DEFAULT_RULES.filter((r) => r.categoryId === fuel?.id);
    if (!transport || !fuel || fuelRules.length === 0) throw new Error('default tree changed');
    await createRepository(db, 'categories').remove(transport.id);
    // As if a later version added "Combustível" and its rule: neither is stored yet.
    await db.delete('categories', fuel.id);
    for (const r of fuelRules) await db.delete('rules', r.id);

    await seedDefaults(db);

    expect(await db.get('categories', fuel.id)).toBeUndefined();
    for (const r of fuelRules) expect(await db.get('rules', r.id)).toBeUndefined();
    db.close();
  });
});

describe('commitCategoryDeletion', () => {
  async function setup(): Promise<Db> {
    const db = await open();
    const { clock } = fakeClock('2026-11-24T10:00:00.000Z');
    const categories = createRepository(db, 'categories', clock);
    for (const c of [category('food'), category('bakery', 'food'), category('grocery', 'food'), category('health'), category('pharmacy', 'health')]) {
      await categories.put(c);
    }
    const transactions = createRepository(db, 'transactions', clock);
    await transactions.put(transaction('t1', { categoryId: 'bakery', categorySource: 'rule' }));
    await transactions.put(transaction('t2', { categoryId: 'bakery', categorySource: 'manual' }));
    await transactions.put(transaction('t3', { categoryId: 'pharmacy', categorySource: 'rule' }));
    await transactions.put(transaction('t4', { categoryId: 'bakery', categorySource: 'rule' }));
    await transactions.remove('t4');
    const rules = createRepository(db, 'rules', clock);
    await rules.put(rule('r1')); // points to bakery
    await rules.put({ ...rule('r2'), categoryId: 'pharmacy' });
    return db;
  }

  async function expectNoOrphans(db: Db): Promise<void> {
    const live = new Set(ids(await createRepository(db, 'categories').list()));
    for (const t of await createRepository(db, 'transactions').list()) if (t.categoryId) expect(live.has(t.categoryId)).toBe(true);
    for (const r of await createRepository(db, 'rules').list()) expect(live.has(r.categoryId)).toBe(true);
  }

  it('tombstones the category and moves its transactions and rules to the target, in one stamp', async () => {
    const db = await setup();
    await commitCategoryDeletion(db, 'food', 'pharmacy', fakeClock('2026-11-25T10:00:00.000Z').clock);

    const at = '2026-11-25T10:00:00.000Z';
    const changed = await createRepository(db, 'categories').changedSince('2026-11-24T23:00:00.000Z');
    expect(ids(changed)).toEqual(['bakery', 'food', 'grocery']);
    for (const c of changed) expect(c.deletedAt).toBe(at);
    const transactions = createRepository(db, 'transactions');
    expect(await transactions.get('t1')).toEqual({ ...transaction('t1', { categoryId: 'pharmacy', categorySource: 'rule' }), ...stamped(at) });
    expect((await transactions.get('t2'))?.categorySource).toBe('manual');
    expect((await transactions.get('t2'))?.categoryId).toBe('pharmacy');
    expect(ids(await transactions.changedSince('2026-11-24T23:00:00.000Z'))).toEqual(['t1', 't2']);
    expect(await createRepository(db, 'rules').get('r1')).toEqual({ ...rule('r1'), categoryId: 'pharmacy', ...stamped(at) });
    await expectNoOrphans(db);
    db.close();
  });

  it('with Uncategorized, removes the transactions\' category and tombstones the rules', async () => {
    const db = await setup();
    await commitCategoryDeletion(db, 'bakery', UNCATEGORIZED);
    const t1 = await createRepository(db, 'transactions').get('t1');
    expect(t1?.categoryId).toBeUndefined();
    expect(t1?.categorySource).toBeUndefined();
    expect(await createRepository(db, 'rules').get('r1')).toBeUndefined();
    expect(ids(await createRepository(db, 'rules').list())).toEqual(['r2']);
    await expectNoOrphans(db);
    db.close();
  });

  it('writes nothing when the target is invalid', async () => {
    const db = await setup();
    const before = await createRepository(db, 'categories').changedSince('');
    const rulesBefore = await createRepository(db, 'rules').changedSince('');
    const stampBefore = await getSetting(db, 'lastStampAt');
    await expect(commitCategoryDeletion(db, 'bakery', 'food')).rejects.toThrow(
      `Target food must be a subcategory that is not being deleted, or "${UNCATEGORIZED}"`,
    );
    expect(await createRepository(db, 'categories').changedSince('')).toEqual(before);
    expect((await createRepository(db, 'transactions').get('t1'))?.categoryId).toBe('bakery');
    expect(await createRepository(db, 'rules').changedSince('')).toEqual(rulesBefore);
    expect(await getSetting(db, 'lastStampAt')).toBe(stampBefore);
    db.close();
  });

  it('returns the moved records as stored, with the new stamp', async () => {
    const db = await setup();
    const at = '2026-11-25T10:00:00.000Z';
    const result = await commitCategoryDeletion(db, 'bakery', 'grocery', fakeClock(at).clock);
    const transactions = createRepository(db, 'transactions');
    expect(result.transactions).toEqual([await transactions.get('t1'), await transactions.get('t2')]);
    expect(result.rules).toEqual([await createRepository(db, 'rules').get('r1')]);
    expect(result.rules[0]?.updatedAt).toBe(at);
    db.close();
  });

  it('ignores deleted categories and transactions', async () => {
    const db = await setup();
    await expect(commitCategoryDeletion(db, 'nope', UNCATEGORIZED)).rejects.toThrow('Unknown category nope');
    await commitCategoryDeletion(db, 'bakery', 'grocery');
    await expect(commitCategoryDeletion(db, 'bakery', UNCATEGORIZED)).rejects.toThrow('Unknown category bakery');
    const t4 = (await createRepository(db, 'transactions').changedSince('')).find((t) => t.id === 't4');
    expect(t4?.categoryId).toBe('bakery');
    db.close();
  });
});
