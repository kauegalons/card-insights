import { describe, expect, it } from 'vitest';
import { categorize, ruleMatcher, validateRule } from '../../src/categorize/rules';
import type { Rule } from '../../src/domain/category';
import type { Transaction } from '../../src/domain/transaction';

const rule = (over: Partial<Rule> & Pick<Rule, 'id' | 'pattern'>): Rule => ({
  match: 'contains',
  categoryId: 'cat-a',
  priority: 100,
  origin: 'user',
  ...over,
});

type Row = Pick<Transaction, 'merchant' | 'categoryId' | 'categorySource'>;

describe('ruleMatcher', () => {
  it('matches contains case- and accent-insensitively over the normalized merchant', () => {
    const match = ruleMatcher([rule({ id: 'r1', pattern: 'Farmácia' })]);
    expect(match('FARMACIA  Central')?.id).toBe('r1');
    expect(match('Farmácia Central')?.id).toBe('r1');
  });

  it('matches regex with the i flag, accent-insensitively', () => {
    const match = ruleMatcher([rule({ id: 'r1', match: 'regex', pattern: '^caf[eé]\\b' })]);
    expect(match('CAFÉ Exemplo')?.id).toBe('r1');
    expect(match('Cafeteria Exemplo')).toBeUndefined();
  });

  it('runs rules in ascending priority and the first match wins', () => {
    const match = ruleMatcher([
      rule({ id: 'late', pattern: 'exemplo', priority: 200 }),
      rule({ id: 'early', pattern: 'posto', priority: 10 }),
    ]);
    expect(match('Posto Exemplo')?.id).toBe('early');
    expect(match('Loja Exemplo')?.id).toBe('late');
  });

  it('breaks priority ties by id, so every device picks the same rule', () => {
    const rules = [rule({ id: 'b', pattern: 'posto' }), rule({ id: 'a', pattern: 'posto' })];
    expect(ruleMatcher(rules)('Posto Exemplo')?.id).toBe('a');
    expect(ruleMatcher([...rules].reverse())('Posto Exemplo')?.id).toBe('a');
  });

  it('returns undefined when no rule matches (Uncategorized)', () => {
    expect(ruleMatcher([rule({ id: 'r1', pattern: 'posto' })])('Loja Exemplo')).toBeUndefined();
  });

  it('throws a clear error naming the rule when a stored regex is invalid', () => {
    expect(() => ruleMatcher([rule({ id: 'r9', match: 'regex', pattern: '(' })])).toThrow(
      /^Rule r9: Invalid regular expression "\("/,
    );
  });
});

describe('validateRule', () => {
  it('accepts a valid contains and a valid regex rule', () => {
    expect(() => validateRule({ match: 'contains', pattern: 'posto', priority: 1 })).not.toThrow();
    expect(() => validateRule({ match: 'regex', pattern: '^posto\\b', priority: 1 })).not.toThrow();
  });

  it('rejects an invalid regex at creation with a clear error', () => {
    expect(() => validateRule({ match: 'regex', pattern: '(posto', priority: 1 })).toThrow(
      /^Invalid regular expression "\(posto": /,
    );
  });

  it('rejects an empty or blank pattern', () => {
    expect(() => validateRule({ match: 'contains', pattern: '  ', priority: 1 })).toThrow('Rule pattern must not be empty');
  });

  it('rejects a priority that is not an integer', () => {
    expect(() => validateRule({ match: 'contains', pattern: 'posto', priority: 1.5 })).toThrow(
      'Rule priority must be an integer (got 1.5)',
    );
  });
});

describe('categorize', () => {
  const rules = [rule({ id: 'r1', pattern: 'posto', categoryId: 'fuel' })];

  it('sets the matched subcategory with categorySource rule', () => {
    expect(categorize<Row>([{ merchant: 'Posto Exemplo' }], rules)).toEqual([
      { merchant: 'Posto Exemplo', categoryId: 'fuel', categorySource: 'rule' },
    ]);
  });

  it('leaves an unmatched row Uncategorized, clearing a previous rule category', () => {
    expect(categorize<Row>([{ merchant: 'Loja Exemplo', categoryId: 'old', categorySource: 'rule' }], rules)).toEqual([
      { merchant: 'Loja Exemplo' },
    ]);
  });

  it('never overwrites a manual choice', () => {
    const manual: Row = { merchant: 'Posto Exemplo', categoryId: 'mine', categorySource: 'manual' };
    expect(categorize<Row>([manual], rules)).toEqual([manual]);
  });
});
