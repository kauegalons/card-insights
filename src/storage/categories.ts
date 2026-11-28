/** Category tree writes that span stores (spec v1 §5): seeding the defaults and deleting with reassignment. */
import { DEFAULT_RULES } from '../categorize/default-rules';
import { deleteCategory, type CategoryDeletion } from '../categorize/edit';
import { DEFAULT_CATEGORIES } from '../categorize/tree';
import type { Rule } from '../domain/category';
import type { Transaction } from '../domain/transaction';
import { runInTransaction, systemClock, type Clock, type Db, type Stored } from './db';
import { isLive } from './repository';
import { nextStamp } from './stamp';

/**
 * Writes each default category and rule whose fixed id isn't stored yet, live or tombstone, in one transaction
 * with one stamp. So a renamed default stays renamed, a deleted one stays deleted, and a later app version can
 * add new defaults. A missing default whose parent category or rule target isn't live (the user deleted it) is
 * skipped, so seeding never points to a deleted category. Writes nothing when there is nothing to add.
 */
export async function seedDefaults(db: Db, clock: Clock = systemClock): Promise<void> {
  const tx = db.transaction(['categories', 'rules', 'settings'], 'readwrite');
  const categories = tx.objectStore('categories');
  const rules = tx.objectStore('rules');
  const [storedCategories, ruleKeys] = await Promise.all([categories.getAll(), rules.getAllKeys()]);
  const stored = new Set(storedCategories.map((c) => c.id));
  const live = new Set(storedCategories.filter(isLive).map((c) => c.id));
  // DEFAULT_CATEGORIES lists each parent before its subcategories, so one pass sees the parents it seeds.
  const missingCategories = DEFAULT_CATEGORIES.filter((c) => {
    if (stored.has(c.id) || (c.parentId !== undefined && !live.has(c.parentId))) return false;
    live.add(c.id);
    return true;
  });
  const missingRules = DEFAULT_RULES.filter((r) => !ruleKeys.includes(r.id) && live.has(r.categoryId));
  if (missingCategories.length === 0 && missingRules.length === 0) return tx.done;
  const stamp = await nextStamp(tx.objectStore('settings'), clock);
  await runInTransaction(tx, [
    ...missingCategories.map((c) => () => categories.put({ ...c, ...stamp })),
    ...missingRules.map((r) => () => rules.put({ ...r, ...stamp })),
  ]);
}

/**
 * Deletes category `id` (with its subcategories if top-level) and moves what points to it to `target`, a
 * subcategory or `UNCATEGORIZED` (see `deleteCategory`), in one IndexedDB transaction with one stamp: reads and
 * writes together, so no transaction or rule is left pointing to a deleted category. Deletes are tombstones.
 * An invalid id or target throws and writes nothing. Returns the deletion with the moved records as stored.
 */
export async function commitCategoryDeletion(
  db: Db,
  id: string,
  target: string,
  clock: Clock = systemClock,
): Promise<CategoryDeletion<Stored<Transaction>> & { rules: Stored<Rule>[] }> {
  const tx = db.transaction(['categories', 'transactions', 'rules', 'settings'], 'readwrite');
  const categories = tx.objectStore('categories');
  const transactions = tx.objectStore('transactions');
  const rules = tx.objectStore('rules');
  const [storedCategories, storedTransactions, storedRules] = await Promise.all([categories.getAll(), transactions.getAll(), rules.getAll()]);
  let deletion: CategoryDeletion<Stored<Transaction>>;
  try {
    deletion = deleteCategory(storedCategories.filter(isLive), storedTransactions.filter(isLive), storedRules.filter(isLive), id, target);
  } catch (error) {
    tx.abort();
    await tx.done.catch(() => undefined); // rejects with AbortError because of the abort above; the cause is `error`
    throw error;
  }
  const stamp = await nextStamp(tx.objectStore('settings'), clock);
  const tombstone = { ...stamp, deletedAt: stamp.updatedAt };
  const deletedCategories = new Set(deletion.deletedIds);
  const deletedRules = new Set(deletion.deletedRuleIds);
  const moved = {
    transactions: deletion.transactions.map((t) => ({ ...t, ...stamp })),
    rules: deletion.rules.map((r) => ({ ...r, ...stamp })),
  };
  await runInTransaction(tx, [
    ...storedCategories.filter((c) => isLive(c) && deletedCategories.has(c.id)).map((c) => () => categories.put({ ...c, ...tombstone })),
    ...moved.transactions.map((t) => () => transactions.put(t)),
    ...moved.rules.map((r) => () => rules.put(r)),
    ...storedRules.filter((r) => isLive(r) && deletedRules.has(r.id)).map((r) => () => rules.put({ ...r, ...tombstone })),
  ]);
  return { ...deletion, ...moved };
}
