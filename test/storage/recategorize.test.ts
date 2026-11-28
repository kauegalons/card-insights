import { describe, expect, it } from 'vitest';
import { LEARNED_RULE_PRIORITY, learnedRulePattern } from '../../src/categorize/learn';
import { commitRecategorization, seedDefaults } from '../../src/storage/categories';
import { openDatabase, type Db } from '../../src/storage/db';
import { commitImport, createRepository } from '../../src/storage/repository';
import { defaultSubcategoryId } from '../../src/categorize/tree';
import { ensureDeviceId, getSetting } from '../../src/storage/settings';
import { fakeClock, importRecord, stamped, transaction } from './helpers';

const RESTAURANT = defaultSubcategoryId('Alimentação', 'Restaurante');
const BAKERY = defaultSubcategoryId('Alimentação', 'Padaria');
const FOOD = '00000000-0000-4000-8000-000000000200';

/** A database with the defaults and four fictitious transactions, stamped at 10:00. */
async function setup(): Promise<{ db: Db; set: (iso: string) => void; clock: () => Date }> {
  const db = await openDatabase();
  await ensureDeviceId(db, () => 'device-1');
  const { clock, set } = fakeClock('2026-11-24T10:00:00.000Z');
  await seedDefaults(db, clock);
  await commitImport(db, {
    record: importRecord('import-1'),
    transactions: [
      transaction('t1', { merchant: 'Cafe Exemplo' }),
      transaction('t2', { merchant: 'CAFE exemplo' }),
      transaction('t3', { merchant: 'Cafe Exemplo', categoryId: BAKERY, categorySource: 'manual' }),
      transaction('t4', { merchant: 'Cafe Exemplo Filial' }),
    ],
  }, clock);
  set('2026-11-24T11:00:00.000Z');
  return { db, set, clock };
}

const byId = async (db: Db) => new Map((await createRepository(db, 'transactions').list()).map((t) => [t.id, t]));
const learnedRules = async (db: Db) => (await createRepository(db, 'rules').list()).filter((r) => r.origin === 'user');

describe('commitRecategorization', () => {
  it('saves the transaction as manual and the learned rule with one stamp; with "no", the others stay as they were', async () => {
    const { db, clock } = await setup();
    const before = await byId(db);
    await commitRecategorization(db, 't1', RESTAURANT, false, clock, () => 'rule-1');

    const after = await byId(db);
    const stamp = stamped('2026-11-24T11:00:00.000Z');
    expect(after.get('t1')).toEqual({ ...before.get('t1'), categoryId: RESTAURANT, categorySource: 'manual', ...stamp });
    for (const id of ['t2', 't3', 't4']) expect(after.get(id)).toEqual(before.get(id));
    expect(await learnedRules(db)).toEqual([
      { id: 'rule-1', match: 'regex', pattern: learnedRulePattern('Cafe Exemplo'), categoryId: RESTAURANT, priority: LEARNED_RULE_PRIORITY, origin: 'user', ...stamp },
    ]);
    expect(await getSetting(db, 'lastStampAt')).toBe('2026-11-24T11:00:00.000Z');
    db.close();
  });

  it('with "yes", moves the past non-manual transactions of that merchant only, as rule decisions, in the same stamp', async () => {
    const { db, clock } = await setup();
    const before = await byId(db);
    const result = await commitRecategorization(db, 't1', RESTAURANT, true, clock, () => 'rule-1');

    const after = await byId(db);
    const stamp = stamped('2026-11-24T11:00:00.000Z');
    expect(after.get('t2')).toEqual({ ...before.get('t2'), categoryId: RESTAURANT, categorySource: 'rule', ...stamp });
    expect(after.get('t3')).toEqual(before.get('t3'));
    expect(after.get('t4')).toEqual(before.get('t4'));
    expect(result.past.map((t) => t.id)).toEqual(['t2']);
    db.close();
  });

  it('updates the learned rule of the merchant instead of adding a second one', async () => {
    const { db, clock, set } = await setup();
    await commitRecategorization(db, 't1', RESTAURANT, false, clock, () => 'rule-1');
    set('2026-11-24T12:00:00.000Z');
    await commitRecategorization(db, 't2', BAKERY, false, clock, () => 'rule-2');

    expect(await learnedRules(db)).toEqual([
      expect.objectContaining({ id: 'rule-1', categoryId: BAKERY, ...stamped('2026-11-24T12:00:00.000Z') }),
    ]);
    db.close();
  });

  it('writes nothing for an unknown or deleted transaction', async () => {
    const { db, clock } = await setup();
    await createRepository(db, 'transactions').remove('t4');
    const stampBefore = await getSetting(db, 'lastStampAt');
    await expect(commitRecategorization(db, 'missing', RESTAURANT, true, clock)).rejects.toThrow('No transaction "missing"');
    await expect(commitRecategorization(db, 't4', RESTAURANT, true, clock)).rejects.toThrow('No transaction "t4"');
    expect(await learnedRules(db)).toEqual([]);
    expect(await getSetting(db, 'lastStampAt')).toBe(stampBefore);
    db.close();
  });

  it('writes nothing for a transaction with a blank merchant', async () => {
    const { db, clock } = await setup();
    await commitImport(db, { record: importRecord('import-2'), transactions: [transaction('blank', { merchant: '  ' })] }, clock);
    const stampBefore = await getSetting(db, 'lastStampAt');
    await expect(commitRecategorization(db, 'blank', RESTAURANT, false, clock)).rejects.toThrow('Cannot learn a rule for a blank merchant');
    expect(await learnedRules(db)).toEqual([]);
    expect(await getSetting(db, 'lastStampAt')).toBe(stampBefore);
    db.close();
  });

  it('writes nothing when the category is not a live subcategory', async () => {
    const { db, clock } = await setup();
    await createRepository(db, 'categories').remove(BAKERY);
    const stampBefore = await getSetting(db, 'lastStampAt');
    for (const id of [FOOD, BAKERY, 'unknown']) {
      await expect(commitRecategorization(db, 't1', id, true, clock)).rejects.toThrow(`Category "${id}" is not a live subcategory`);
    }
    expect(await learnedRules(db)).toEqual([]);
    expect((await byId(db)).get('t1')?.categorySource).toBeUndefined();
    expect(await getSetting(db, 'lastStampAt')).toBe(stampBefore);
    db.close();
  });
});

describe('commitImport categorizes with the stored rules', () => {
  it('after a correction, a new import of the same merchant comes categorized', async () => {
    const { db, clock } = await setup();
    await commitRecategorization(db, 't1', RESTAURANT, false, clock, () => 'rule-1');
    await commitImport(db, {
      record: importRecord('import-2'),
      transactions: [
        transaction('n1', { merchant: 'Cafe Exemplo', importId: 'import-2' }),
        transaction('n2', { merchant: 'Padaria Exemplo', importId: 'import-2' }),
        transaction('n3', { merchant: 'Loja Sem Regra', importId: 'import-2' }),
        transaction('n4', { merchant: 'Cafe Exemplo', importId: 'import-2', categoryId: BAKERY, categorySource: 'manual' }),
      ],
    }, clock);

    const after = await byId(db);
    expect(after.get('n1')).toMatchObject({ categoryId: RESTAURANT, categorySource: 'rule' });
    expect(after.get('n2')).toMatchObject({ categoryId: BAKERY, categorySource: 'rule' });
    expect(after.get('n3')?.categoryId).toBeUndefined();
    expect(after.get('n4')).toMatchObject({ categoryId: BAKERY, categorySource: 'manual' });
    db.close();
  });

  it('ignores deleted rules', async () => {
    const { db, clock } = await setup();
    await commitRecategorization(db, 't1', RESTAURANT, false, clock, () => 'rule-1');
    await createRepository(db, 'rules').remove('rule-1');
    await commitImport(db, { record: importRecord('import-2'), transactions: [transaction('n1', { merchant: 'Cafe Exemplo' })] }, clock);
    expect((await byId(db)).get('n1')?.categoryId).toBeUndefined();
    db.close();
  });
});
