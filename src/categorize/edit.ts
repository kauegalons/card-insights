/**
 * Editing the category tree (spec v1 §5): create, rename and delete categories and subcategories, defaults included.
 * Pure: each operation returns the records to write; storage writes them in one transaction.
 */
import type { Category, Rule } from '../domain/category';
import { stripAccents } from '../domain/merchant';
import type { Transaction } from '../domain/transaction';

/** Delete target meaning "no category": transactions lose their category and rules pointing there are deleted. */
export const UNCATEGORIZED = 'uncategorized';

function find(categories: readonly Category[], id: string): Category {
  const category = categories.find((c) => c.id === id);
  if (!category) throw new Error(`Unknown category ${id}`);
  return category;
}

/** The trimmed name; throws if blank or if a sibling (same parent, other id) has it, ignoring case and accents. */
function checkName(categories: readonly Category[], name: string, parentId: string | undefined, selfId?: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('Category name must not be empty');
  const key = (text: string) => stripAccents(text).toLowerCase();
  if (categories.some((c) => c.parentId === parentId && c.id !== selfId && key(c.name) === key(trimmed))) {
    throw new Error(`A category named "${trimmed}" already exists there`);
  }
  return trimmed;
}

/** A new category, top-level or under the top-level `parentId` (two levels only), with a random id by default. */
export function createCategory(
  categories: readonly Category[],
  input: { name: string; parentId?: string },
  id: string = crypto.randomUUID(),
): Category {
  const { parentId } = input;
  if (parentId !== undefined && find(categories, parentId).parentId !== undefined) {
    throw new Error(`Category ${parentId} is a subcategory: only two levels are allowed`);
  }
  const name = checkName(categories, input.name, parentId);
  return parentId === undefined ? { id, name } : { id, name, parentId };
}

/** The category `id` with its new name; id and parent stay. */
export function renameCategory(categories: readonly Category[], id: string, name: string): Category {
  const category = find(categories, id);
  return { ...category, name: checkName(categories, name, category.parentId, id) };
}

type Categorized = Pick<Transaction, 'id' | 'categoryId' | 'categorySource'>;

export interface CategoryDeletion<T> {
  /** The category and, for a top-level one, its subcategories. */
  deletedIds: string[];
  /** Transactions that pointed to a deleted id, moved to the target (or without a category). */
  transactions: T[];
  /** Rules that pointed to a deleted id, moved to the target. */
  rules: Rule[];
  /** Rules that pointed to a deleted id when the target is Uncategorized: a rule always needs a category. */
  deletedRuleIds: string[];
}

/**
 * Deletes category `id` (with its subcategories if top-level) and says where everything pointing to it goes:
 * `target` is a live subcategory outside the deletion, or `UNCATEGORIZED`. After applying the result, no
 * transaction or rule points to a deleted category. A manual choice moved to the target stays manual.
 */
export function deleteCategory<T extends Categorized>(
  categories: readonly Category[],
  transactions: readonly T[],
  rules: readonly Rule[],
  id: string,
  target: string,
): CategoryDeletion<T> {
  find(categories, id);
  const deleted = new Set([id, ...categories.filter((c) => c.parentId === id).map((c) => c.id)]);
  const targetCategory = categories.find((c) => c.id === target);
  if (target !== UNCATEGORIZED && (targetCategory?.parentId === undefined || deleted.has(target))) {
    throw new Error(`Target ${target} must be a subcategory that is not being deleted, or "${UNCATEGORIZED}"`);
  }
  const hit = (categoryId: string | undefined) => categoryId !== undefined && deleted.has(categoryId);
  const movedTransactions = transactions.filter((t) => hit(t.categoryId)).map((t): T => {
    if (target !== UNCATEGORIZED) return { ...t, categoryId: target };
    const { categoryId: _id, categorySource: _source, ...rest } = t;
    return rest as T; // T without its category fields, which are optional in Transaction.
  });
  const hitRules = rules.filter((r) => hit(r.categoryId));
  return {
    deletedIds: [...deleted],
    transactions: movedTransactions,
    rules: target === UNCATEGORIZED ? [] : hitRules.map((r) => ({ ...r, categoryId: target })),
    deletedRuleIds: target === UNCATEGORIZED ? hitRules.map((r) => r.id) : [],
  };
}
