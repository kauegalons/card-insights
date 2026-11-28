import { describe, expect, it } from 'vitest';
import { createCategory, deleteCategory, renameCategory, UNCATEGORIZED } from '../../src/categorize/edit';
import { DEFAULT_CATEGORIES } from '../../src/categorize/tree';
import type { Category, Rule } from '../../src/domain/category';
import type { Transaction } from '../../src/domain/transaction';

type Tx = Pick<Transaction, 'id' | 'merchant' | 'categoryId' | 'categorySource'>;

const categories: Category[] = [
  { id: 'food', name: 'Alimentação' },
  { id: 'bakery', name: 'Padaria', parentId: 'food' },
  { id: 'grocery', name: 'Mercado', parentId: 'food' },
  { id: 'health', name: 'Saúde' },
  { id: 'pharmacy', name: 'Farmácia', parentId: 'health' },
];

const rule = (id: string, categoryId: string): Rule => ({
  id, match: 'contains', pattern: id, categoryId, priority: 1000, origin: 'default',
});

const transactions: Tx[] = [
  { id: 't1', merchant: 'Padaria Exemplo', categoryId: 'bakery', categorySource: 'rule' },
  { id: 't2', merchant: 'Padaria Exemplo', categoryId: 'bakery', categorySource: 'manual' },
  { id: 't3', merchant: 'Mercado Exemplo', categoryId: 'grocery', categorySource: 'rule' },
  { id: 't4', merchant: 'Farmacia Exemplo', categoryId: 'pharmacy', categorySource: 'rule' },
  { id: 't5', merchant: 'Loja Exemplo' },
];
const rules = [rule('r-bakery', 'bakery'), rule('r-grocery', 'grocery'), rule('r-pharmacy', 'pharmacy')];

/** Applies a deletion's changes to the lists, the way storage will. */
function apply(result: ReturnType<typeof deleteCategory<Tx>>) {
  const txById = new Map(result.transactions.map((t) => [t.id, t]));
  const ruleById = new Map(result.rules.map((r) => [r.id, r]));
  return {
    categories: categories.filter((c) => !result.deletedIds.includes(c.id)),
    transactions: transactions.map((t) => txById.get(t.id) ?? t),
    rules: rules.filter((r) => !result.deletedRuleIds.includes(r.id)).map((r) => ruleById.get(r.id) ?? r),
  };
}

function expectNoOrphans(after: ReturnType<typeof apply>): void {
  const ids = new Set(after.categories.map((c) => c.id));
  for (const t of after.transactions) if (t.categoryId !== undefined) expect(ids.has(t.categoryId)).toBe(true);
  for (const r of after.rules) expect(ids.has(r.categoryId)).toBe(true);
}

describe('createCategory', () => {
  it('creates a top-level category with the given id and trimmed name', () => {
    expect(createCategory(categories, { name: '  Viagem ' }, 'new-id')).toEqual({ id: 'new-id', name: 'Viagem' });
  });

  it('creates a subcategory under a top-level category', () => {
    expect(createCategory(categories, { name: 'Delivery', parentId: 'food' }, 'n')).toEqual({ id: 'n', name: 'Delivery', parentId: 'food' });
  });

  it('gives a new category a random UUID by default, never its name', () => {
    expect(createCategory(categories, { name: 'Viagem' }).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a blank name', () => {
    expect(() => createCategory(categories, { name: '   ' }, 'n')).toThrow('Category name must not be empty');
  });

  it('rejects an unknown parent', () => {
    expect(() => createCategory(categories, { name: 'X', parentId: 'nope' }, 'n')).toThrow('Unknown category nope');
  });

  it('rejects a third level', () => {
    expect(() => createCategory(categories, { name: 'X', parentId: 'bakery' }, 'n')).toThrow(
      'Category bakery is a subcategory: only two levels are allowed',
    );
  });

  it('rejects a name already used by a sibling, ignoring case and accents', () => {
    expect(() => createCategory(categories, { name: 'padaria', parentId: 'food' }, 'n')).toThrow(
      'A category named "padaria" already exists there',
    );
    expect(() => createCategory(categories, { name: 'SAUDE' }, 'n')).toThrow('A category named "SAUDE" already exists there');
    expect(createCategory(categories, { name: 'Padaria', parentId: 'health' }, 'n').parentId).toBe('health');
  });

  it('works on the default tree', () => {
    const transport = DEFAULT_CATEGORIES.find((c) => c.name === 'Transporte');
    expect(createCategory(DEFAULT_CATEGORIES, { name: 'Bicicleta', parentId: transport?.id ?? '' }, 'n').name).toBe('Bicicleta');
  });
});

describe('renameCategory', () => {
  it('returns the category with the new trimmed name, same id and parent', () => {
    expect(renameCategory(categories, 'bakery', ' Padaria e café ')).toEqual({ id: 'bakery', name: 'Padaria e café', parentId: 'food' });
  });

  it('renames a default category', () => {
    const fuel = DEFAULT_CATEGORIES.find((c) => c.name === 'Combustível');
    expect(renameCategory(DEFAULT_CATEGORIES, fuel?.id ?? '', 'Gasolina')).toEqual({ ...fuel, name: 'Gasolina' });
  });

  it('allows a change of case of its own name', () => {
    expect(renameCategory(categories, 'bakery', 'PADARIA').name).toBe('PADARIA');
  });

  it('rejects an unknown id, a blank name and a sibling name', () => {
    expect(() => renameCategory(categories, 'nope', 'X')).toThrow('Unknown category nope');
    expect(() => renameCategory(categories, 'bakery', ' ')).toThrow('Category name must not be empty');
    expect(() => renameCategory(categories, 'bakery', 'Mercado')).toThrow('A category named "Mercado" already exists there');
  });
});

describe('deleteCategory', () => {
  it('moves a subcategory\'s transactions and rules to the target, keeping manual choices manual', () => {
    const result = deleteCategory(categories, transactions, rules, 'bakery', 'grocery');
    expect(result.deletedIds).toEqual(['bakery']);
    expect(result.transactions).toEqual([
      { id: 't1', merchant: 'Padaria Exemplo', categoryId: 'grocery', categorySource: 'rule' },
      { id: 't2', merchant: 'Padaria Exemplo', categoryId: 'grocery', categorySource: 'manual' },
    ]);
    expect(result.rules).toEqual([rule('r-bakery', 'grocery')]);
    expect(result.deletedRuleIds).toEqual([]);
    expectNoOrphans(apply(result));
  });

  it('sends transactions to Uncategorized and deletes the rules when the target is Uncategorized', () => {
    const result = deleteCategory(categories, transactions, rules, 'bakery', UNCATEGORIZED);
    expect(result.transactions).toEqual([
      { id: 't1', merchant: 'Padaria Exemplo' },
      { id: 't2', merchant: 'Padaria Exemplo' },
    ]);
    expect(result.rules).toEqual([]);
    expect(result.deletedRuleIds).toEqual(['r-bakery']);
    expectNoOrphans(apply(result));
  });

  it('deletes a top-level category with its subcategories and moves everything under them', () => {
    const result = deleteCategory(categories, transactions, rules, 'food', 'pharmacy');
    expect(result.deletedIds).toEqual(['food', 'bakery', 'grocery']);
    expect(result.transactions.map((t) => [t.id, t.categoryId])).toEqual([
      ['t1', 'pharmacy'],
      ['t2', 'pharmacy'],
      ['t3', 'pharmacy'],
    ]);
    expect(result.rules.map((r) => [r.id, r.categoryId])).toEqual([
      ['r-bakery', 'pharmacy'],
      ['r-grocery', 'pharmacy'],
    ]);
    expectNoOrphans(apply(result));
  });

  it('leaves no orphan when a top-level category goes to Uncategorized', () => {
    const result = deleteCategory(categories, transactions, rules, 'food', UNCATEGORIZED);
    expect(result.deletedRuleIds).toEqual(['r-bakery', 'r-grocery']);
    expectNoOrphans(apply(result));
  });

  it('returns only what changed', () => {
    const result = deleteCategory(categories, transactions, rules, 'pharmacy', UNCATEGORIZED);
    expect(result.transactions.map((t) => t.id)).toEqual(['t4']);
    expect(result.deletedRuleIds).toEqual(['r-pharmacy']);
  });

  it('deletes a default category', () => {
    const fuel = DEFAULT_CATEGORIES.find((c) => c.name === 'Combustível')?.id ?? '';
    expect(deleteCategory(DEFAULT_CATEGORIES, [], [], fuel, UNCATEGORIZED).deletedIds).toEqual([fuel]);
  });

  it('rejects an unknown category', () => {
    expect(() => deleteCategory(categories, transactions, rules, 'nope', UNCATEGORIZED)).toThrow('Unknown category nope');
  });

  it('rejects a target that is unknown, top-level or being deleted', () => {
    const message = (t: string) => `Target ${t} must be a subcategory that is not being deleted, or "${UNCATEGORIZED}"`;
    expect(() => deleteCategory(categories, transactions, rules, 'bakery', 'nope')).toThrow(message('nope'));
    expect(() => deleteCategory(categories, transactions, rules, 'bakery', 'health')).toThrow(message('health'));
    expect(() => deleteCategory(categories, transactions, rules, 'bakery', 'bakery')).toThrow(message('bakery'));
    expect(() => deleteCategory(categories, transactions, rules, 'food', 'grocery')).toThrow(message('grocery'));
  });
});
