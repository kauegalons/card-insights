import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULE_PRIORITY, DEFAULT_RULES } from '../../src/categorize/default-rules';
import {
  applyToPast,
  LEARNED_RULE_PRIORITY,
  learnedRulePattern,
  otherMatchesFor,
  recategorize,
} from '../../src/categorize/learn';
import { categorize, ruleMatcher, validateRule } from '../../src/categorize/rules';
import { defaultSubcategoryId } from '../../src/categorize/tree';
import type { Rule } from '../../src/domain/category';
import type { Transaction } from '../../src/domain/transaction';
import { nubankCardCsv } from '../../src/import/adapters/nubank-card-csv';
import { dedupe } from '../../src/import/dedupe';

const RESTAURANT = defaultSubcategoryId('Alimentação', 'Restaurante');
const BAKERY = defaultSubcategoryId('Alimentação', 'Padaria');
const GROCERIES = defaultSubcategoryId('Alimentação', 'Mercado');

type Row = Pick<Transaction, 'id' | 'merchant' | 'categoryId' | 'categorySource'> & { deletedAt?: string };

const row = (id: string, merchant: string, over: Partial<Row> = {}): Row => ({ id, merchant, ...over });
const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);
const fixedId = () => 'rule-new';

describe('learnedRulePattern', () => {
  it('is an anchored regex over the whole normalized merchant, so it never matches a longer name', () => {
    const match = ruleMatcher([{ id: 'r', match: 'regex', pattern: learnedRulePattern('Padaria Exemplo'), categoryId: BAKERY, priority: 1, origin: 'user' }]);
    expect(match('Padaria Exemplo')).toBeDefined();
    expect(match('  PADARIA   exemplo ')).toBeDefined();
    expect(match('Padaria Exemplo Filial')).toBeUndefined();
    expect(match('Nova Padaria Exemplo')).toBeUndefined();
  });

  it('escapes regex characters and ignores accents', () => {
    const pattern = learnedRulePattern('Café (Exemplo) 2.0*');
    expect(() => validateRule({ match: 'regex', pattern, priority: 1 })).not.toThrow();
    const match = ruleMatcher([{ id: 'r', match: 'regex', pattern, categoryId: RESTAURANT, priority: 1, origin: 'user' }]);
    expect(match('cafe (exemplo) 2.0*')).toBeDefined();
    expect(match('cafe (exemplo) 2x0*')).toBeUndefined();
  });

  it('is pinned for fixed merchants: changing it, normalizeMerchant or the adapter cleanup needs a migration (ADR 013)', () => {
    const merchant = (title: string) => nubankCardCsv.parse(`date,title,amount\n2026-11-10,${title},"1,00"\n`, { fileName: 'x.csv' })[0]?.merchant ?? '';
    expect(learnedRulePattern('Padaria Exemplo')).toBe('^padaria exemplo$');
    expect(learnedRulePattern('  Café   (Exemplo) 2.0* ')).toBe('^cafe \\(exemplo\\) 2\\.0\\*$');
    expect(learnedRulePattern(merchant('Dl*Corridas Exemplo'))).toBe('^corridas exemplo$');
    expect(learnedRulePattern(merchant('Drogaria Exemplo - Parcela 1/2'))).toBe('^drogaria exemplo$');
    expect(learnedRulePattern(merchant('Cafe Exemplo I*Vmt*Cielo'))).toBe('^cafe exemplo$');
  });

  it('rejects a blank merchant', () => {
    expect(() => learnedRulePattern('   ')).toThrow('Cannot learn a rule for a blank merchant');
  });
});

describe('recategorize', () => {
  it('makes the transaction manual and creates a user rule for its merchant above every default', () => {
    const { transaction, rule } = recategorize(row('t1', 'Cafe Exemplo'), RESTAURANT, DEFAULT_RULES, fixedId);
    expect(transaction).toEqual({ id: 't1', merchant: 'Cafe Exemplo', categoryId: RESTAURANT, categorySource: 'manual' });
    expect(rule).toEqual({
      id: 'rule-new',
      match: 'regex',
      pattern: learnedRulePattern('Cafe Exemplo'),
      categoryId: RESTAURANT,
      priority: LEARNED_RULE_PRIORITY,
      origin: 'user',
    });
    expect(LEARNED_RULE_PRIORITY).toBeLessThan(DEFAULT_RULE_PRIORITY);
    expect(Math.min(...DEFAULT_RULES.map((r) => r.priority))).toBeGreaterThan(rule.priority);
  });

  it('wins over a default rule that matches the same merchant', () => {
    const { rule } = recategorize(row('t1', 'Padaria Exemplo', { categoryId: BAKERY, categorySource: 'rule' }), GROCERIES, DEFAULT_RULES, fixedId);
    expect(ruleMatcher([...DEFAULT_RULES, rule])('Padaria Exemplo')?.categoryId).toBe(GROCERIES);
    expect(ruleMatcher([...DEFAULT_RULES, rule])('Padaria Exemplo Filial')?.categoryId).toBe(BAKERY);
  });

  it('updates the existing user rule for the same merchant instead of adding a duplicate', () => {
    const existing: Rule = { id: 'rule-old', match: 'regex', pattern: learnedRulePattern('Cafe Exemplo'), categoryId: BAKERY, priority: 50, origin: 'user' };
    const { rule } = recategorize(row('t1', 'CAFE  exemplo'), RESTAURANT, [...DEFAULT_RULES, existing], fixedId);
    expect(rule).toEqual({ ...existing, categoryId: RESTAURANT });
  });

  it('with two user rules sharing the pattern (two offline devices, a restore), updates the first by priority then id and deletes the other', () => {
    const pattern = learnedRulePattern('Cafe Exemplo');
    const a: Rule = { id: 'rule-b', match: 'regex', pattern, categoryId: BAKERY, priority: LEARNED_RULE_PRIORITY, origin: 'user' };
    const b: Rule = { id: 'rule-a', match: 'regex', pattern, categoryId: GROCERIES, priority: LEARNED_RULE_PRIORITY, origin: 'user' };
    const result = recategorize(row('t1', 'Cafe Exemplo'), RESTAURANT, [...DEFAULT_RULES, a, b], fixedId);
    expect(result.rule).toEqual({ ...b, categoryId: RESTAURANT });
    expect(result.deletedRuleIds).toEqual(['rule-b']);
  });

  it('keeps the duplicate with the lower priority even when its id sorts later', () => {
    const pattern = learnedRulePattern('Cafe Exemplo');
    const low: Rule = { id: 'rule-z', match: 'regex', pattern, categoryId: BAKERY, priority: 50, origin: 'user' };
    const high: Rule = { id: 'rule-a', match: 'regex', pattern, categoryId: GROCERIES, priority: LEARNED_RULE_PRIORITY, origin: 'user' };
    const result = recategorize(row('t1', 'Cafe Exemplo'), RESTAURANT, [high, low], fixedId);
    expect(result.rule.id).toBe('rule-z');
    expect(result.deletedRuleIds).toEqual(['rule-a']);
  });

  it('deletes no rule when the merchant has at most one', () => {
    expect(recategorize(row('t1', 'Cafe Exemplo'), RESTAURANT, DEFAULT_RULES, fixedId).deletedRuleIds).toEqual([]);
  });

  it('does not reuse a rule of another merchant or a default rule', () => {
    const other: Rule = { id: 'rule-other', match: 'regex', pattern: learnedRulePattern('Cafe Exemplo Filial'), categoryId: BAKERY, priority: 50, origin: 'user' };
    const { rule } = recategorize(row('t1', 'Cafe Exemplo'), RESTAURANT, [...DEFAULT_RULES, other], fixedId);
    expect(rule.id).toBe('rule-new');
  });
});

describe('otherMatchesFor', () => {
  const corrected = row('t1', 'Cafe Exemplo');
  const stored = [
    corrected,
    row('t2', 'Cafe Exemplo'),
    row('t3', 'CAFÉ exemplo', { categoryId: BAKERY, categorySource: 'rule' }),
    row('t4', 'Cafe Exemplo', { categoryId: BAKERY, categorySource: 'manual' }),
    row('t5', 'Cafe Exemplo', { deletedAt: '2026-11-24T10:00:00.000Z' }),
    row('t6', 'Cafe Exemplo Filial'),
    row('t7', 'Cafe Exemplo', { categoryId: RESTAURANT, categorySource: 'rule' }),
  ];

  it('lists the other live, non-manual transactions of the same merchant that the category would change', () => {
    expect(ids(otherMatchesFor(corrected, RESTAURANT, stored))).toEqual(['t2', 't3']);
  });

  it('never counts manual choices, so N excludes them', () => {
    expect(otherMatchesFor(corrected, RESTAURANT, stored).some((t) => t.categorySource === 'manual')).toBe(false);
  });
});

describe('applyToPast', () => {
  it('sets the category with source rule', () => {
    const past = [row('t2', 'Cafe Exemplo'), row('t3', 'Cafe Exemplo', { categoryId: BAKERY, categorySource: 'rule' })];
    expect(applyToPast(past, RESTAURANT)).toEqual([
      { id: 't2', merchant: 'Cafe Exemplo', categoryId: RESTAURANT, categorySource: 'rule' },
      { id: 't3', merchant: 'Cafe Exemplo', categoryId: RESTAURANT, categorySource: 'rule' },
    ]);
  });
});

describe('learning, end to end (pure)', () => {
  const csv = readFileSync(new URL('../fixtures/Nubank_2026-11-11.csv', import.meta.url), 'utf8');
  const importRows = (rules: readonly Rule[]) =>
    categorize(dedupe(nubankCardCsv.parse(csv, { fileName: 'Nubank_2026-11-11.csv' }), []).toAdd, rules);

  it('a new import of the corrected merchant comes categorized', () => {
    const before = importRows(DEFAULT_RULES).find((t) => t.merchant === 'Cafe Exemplo');
    expect(before?.categoryId).toBeUndefined();
    const { rule } = recategorize(row('t1', 'Cafe Exemplo'), RESTAURANT, DEFAULT_RULES, fixedId);
    const after = importRows([...DEFAULT_RULES, rule]).find((t) => t.merchant === 'Cafe Exemplo');
    expect(after).toMatchObject({ categoryId: RESTAURANT, categorySource: 'rule' });
  });

  it('with "no", the other transactions stay as they were', () => {
    const stored = [row('t1', 'Cafe Exemplo'), row('t2', 'Cafe Exemplo', { categoryId: BAKERY, categorySource: 'rule' })];
    const snapshot = structuredClone(stored);
    recategorize(stored[0] as Row, RESTAURANT, DEFAULT_RULES, fixedId);
    otherMatchesFor(stored[0] as Row, RESTAURANT, stored);
    expect(stored).toEqual(snapshot);
  });
});
