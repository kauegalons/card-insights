/** Category writes that span stores (spec v1 §5): seeding the defaults, deleting with reassignment, recategorizing. */
import { DEFAULT_RULES } from '../categorize/default-rules';
import { deleteCategory, type CategoryDeletion } from '../categorize/edit';
import { applyToPast, pastMatchesFor, recategorize } from '../categorize/learn';
import { recategorizeAll, ruleMatcher } from '../categorize/rules';
import { DEFAULT_CATEGORIES } from '../categorize/tree';
import type { Category, Rule } from '../domain/category';
import type { Transaction } from '../domain/transaction';
import { isLive, runInTransaction, systemClock, type Clock, type Db, type Stored } from './db';
import { nextStamp } from './stamp';

/** Aborts `tx` (nothing is written) and rethrows `error`, the cause. */
async function abortWith(tx: { abort(): void; done: Promise<void> }, error: unknown): Promise<never> {
  tx.abort();
  await tx.done.catch(() => undefined); // rejects with AbortError because of the abort above
  throw error;
}

export interface Seed {
  categories: Category[];
  rules: Rule[];
  /** Live uncategorized, non-manual stored rows a seeded rule now decides, with its category. */
  transactions: Stored<Transaction>[];
}

/**
 * What seeding writes, given every stored category and rule (tombstones included): each default whose fixed id
 * isn't stored yet, so a renamed default stays renamed, a deleted one stays deleted, and a later app version can
 * add new defaults. A missing default whose parent category or rule target isn't live (the user deleted it) is
 * skipped, so seeding never points to a deleted category. When rules are added, a live uncategorized, non-manual
 * row gets a category only when a seeded rule wins over all live rules: seeding fills gaps, never overrides a
 * decided category, and never fills a row a higher-priority rule (e.g. a learned rule answered "no") leaves alone.
 * Known limit: a row the user sent to Uncategorized by deleting its category looks like a gap. `transactions`
 * reads the stored rows, only when rules are added.
 */
export async function planSeed(
  storedCategories: readonly Stored<Category>[],
  storedRules: readonly Stored<Rule>[],
  transactions: () => Promise<Stored<Transaction>[]>,
): Promise<Seed> {
  const stored = new Set(storedCategories.map((c) => c.id));
  const live = new Set(storedCategories.filter(isLive).map((c) => c.id));
  // DEFAULT_CATEGORIES lists each parent before its subcategories, so one pass sees the parents it seeds.
  const categories = DEFAULT_CATEGORIES.filter((c) => {
    if (stored.has(c.id) || (c.parentId !== undefined && !live.has(c.parentId))) return false;
    live.add(c.id);
    return true;
  });
  const ruleIds = new Set(storedRules.map((r) => r.id));
  const rules = DEFAULT_RULES.filter((r) => !ruleIds.has(r.id) && live.has(r.categoryId));
  if (rules.length === 0) return { categories, rules, transactions: [] };
  const seeded = new Set(rules.map((r) => r.id));
  const match = ruleMatcher([...storedRules.filter(isLive), ...rules]);
  const filled = (await transactions()).flatMap((t) => {
    const rule = isLive(t) && t.categoryId === undefined && t.categorySource !== 'manual' ? match(t.merchant) : undefined;
    return rule && seeded.has(rule.id) ? [{ ...t, categoryId: rule.categoryId, categorySource: 'rule' as const }] : [];
  });
  return { categories, rules, transactions: filled };
}

/**
 * Seeds the defaults (`planSeed`) in one IndexedDB transaction with one stamp; writes nothing when there is
 * nothing to add. `commitImport` seeds the same way inside its own transaction, so no import runs without them.
 */
export async function seedDefaults(db: Db, clock: Clock = systemClock): Promise<void> {
  const tx = db.transaction(['categories', 'rules', 'transactions', 'settings'], 'readwrite');
  const categories = tx.objectStore('categories');
  const rules = tx.objectStore('rules');
  const transactions = tx.objectStore('transactions');
  const [storedCategories, storedRules] = await Promise.all([categories.getAll(), rules.getAll()]);
  const seed = await planSeed(storedCategories, storedRules, () => transactions.getAll());
  if (seed.categories.length === 0 && seed.rules.length === 0) return tx.done;
  const stamp = await nextStamp(tx.objectStore('settings'), clock);
  await runInTransaction(tx, [
    ...seed.categories.map((c) => () => categories.put({ ...c, ...stamp })),
    ...seed.rules.map((r) => () => rules.put({ ...r, ...stamp })),
    ...seed.transactions.map((t) => () => transactions.put({ ...t, ...stamp })),
  ]);
}

/**
 * Re-runs the live rules over every live non-manual transaction (`recategorizeAll`) and writes the changed ones in
 * one IndexedDB transaction with one stamp; writes nothing when all agree. It is the explicit "apply the rules
 * again" (e.g. after the user edits a rule), so it also moves rows kept out of a learned rule by a "no" (spec v1 §5).
 */
export async function commitRecategorizeAll(db: Db, clock: Clock = systemClock): Promise<Stored<Transaction>[]> {
  const tx = db.transaction(['transactions', 'rules', 'settings'], 'readwrite');
  const transactions = tx.objectStore('transactions');
  const [storedTransactions, storedRules] = await Promise.all([transactions.getAll(), tx.objectStore('rules').getAll()]);
  const changed = recategorizeAll(storedTransactions.filter(isLive), storedRules.filter(isLive));
  if (changed.length === 0) {
    await tx.done;
    return [];
  }
  const stamp = await nextStamp(tx.objectStore('settings'), clock);
  const written = changed.map((t) => ({ ...t, ...stamp }));
  await runInTransaction(tx, written.map((t) => () => transactions.put(t)));
  return written;
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
    return abortWith(tx, error);
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

/**
 * Changes transaction `id` to `categoryId` (spec v1 §5, §8.2) in one IndexedDB transaction with one stamp: the
 * transaction as a manual choice, the learned rule for its merchant (`recategorize`, `newId` for a new rule) and,
 * only with `applyPast` (the user's yes), the past transactions `pastMatchesFor` lists. An unknown or deleted
 * transaction, or a category that isn't a live subcategory, throws and writes nothing.
 */
export async function commitRecategorization(
  db: Db,
  id: string,
  categoryId: string,
  applyPast: boolean,
  clock: Clock = systemClock,
  newId?: () => string,
): Promise<{ transaction: Stored<Transaction>; rule: Stored<Rule>; past: Stored<Transaction>[] }> {
  const tx = db.transaction(['categories', 'transactions', 'rules', 'settings'], 'readwrite');
  const transactions = tx.objectStore('transactions');
  const rules = tx.objectStore('rules');
  const [category, target, storedRules, storedTransactions] = await Promise.all([
    tx.objectStore('categories').get(categoryId),
    transactions.get(id),
    rules.getAll(),
    applyPast ? transactions.getAll() : [],
  ]);
  if (target === undefined || !isLive(target)) return abortWith(tx, new Error(`No transaction ${JSON.stringify(id)}`));
  if (category === undefined || !isLive(category) || category.parentId === undefined) {
    return abortWith(tx, new Error(`Category ${JSON.stringify(categoryId)} is not a live subcategory`));
  }
  let learned: ReturnType<typeof recategorize<Stored<Transaction>>>;
  try {
    learned = recategorize(target, categoryId, storedRules.filter(isLive), newId);
  } catch (error) {
    return abortWith(tx, error); // a blank merchant can't have a learned rule
  }
  const past = applyToPast(pastMatchesFor(target, categoryId, storedTransactions), categoryId);
  const stamp = await nextStamp(tx.objectStore('settings'), clock);
  const written = {
    transaction: { ...learned.transaction, ...stamp },
    rule: { ...learned.rule, ...stamp },
    past: past.map((t) => ({ ...t, ...stamp })),
  };
  await runInTransaction(tx, [
    () => transactions.put(written.transaction),
    () => rules.put(written.rule),
    ...written.past.map((t) => () => transactions.put(t)),
  ]);
  return written;
}
