import { describe, expect, it } from 'vitest';
import { MAX_MATCHED_MERCHANT_LENGTH, categorize, recategorizeAll, ruleMatcher, validateRule } from '../../src/categorize/rules';
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

  it('skips a stored rule that is invalid and reports it, so the other rules still run', () => {
    const match = ruleMatcher([
      rule({ id: 'r9', match: 'regex', pattern: '(', priority: 1 }),
      rule({ id: 'r8', match: 'regex', pattern: '(a+)+$', priority: 2 }),
      rule({ id: 'r1', pattern: 'posto' }),
    ]);
    expect(match('Posto Exemplo')?.id).toBe('r1');
    expect(match.invalid.map((i) => i.rule.id)).toEqual(['r9', 'r8']);
    expect(match.invalid[0]?.error).toMatch(/^Invalid regular expression "\("/);
    expect(match.invalid[1]?.error).toMatch(/nested quantifier/);
  });

  it('reports no invalid rule when all compile', () => {
    expect(ruleMatcher([rule({ id: 'r1', pattern: 'posto' })]).invalid).toEqual([]);
  });

  it('tests only the first MAX_MATCHED_MERCHANT_LENGTH characters of the normalized merchant', () => {
    const match = ruleMatcher([rule({ id: 'r1', match: 'regex', pattern: 'posto$' })]);
    expect(match(`${'a'.repeat(MAX_MATCHED_MERCHANT_LENGTH - 6)} posto`)?.id).toBe('r1');
    expect(match(`${'a'.repeat(MAX_MATCHED_MERCHANT_LENGTH)} posto`)).toBeUndefined();
  });
});

describe('validateRule', () => {
  it.each(['(a+)+', '(a*)*', '(\\w+\\s?)*$', '((ab)+c)+', '(?:x+){2,}', '(a+){3,9}'])(
    'rejects the nested quantifier %s, which can hang the app (ReDoS)',
    (pattern) => {
      expect(() => validateRule({ match: 'regex', pattern, priority: 1 })).toThrow(`Rule pattern has a nested quantifier: "${pattern}"`);
    },
  );

  it.each(['(a+)?', '(?:auto ?)?posto', '\\b(?:hortifrut+i|feira)\\b', '\\(a+\\)+', '([+*])+', '(ab){2}'])(
    'accepts %s, which has no nested quantifier',
    (pattern) => {
      expect(() => validateRule({ match: 'regex', pattern, priority: 1 })).not.toThrow();
    },
  );

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

describe('recategorizeAll', () => {
  const rules = [rule({ id: 'r1', pattern: 'posto', categoryId: 'fuel' })];
  type IdRow = Row & { id: string };

  it('returns only the non-manual rows whose category the rules change, with the decision of the rules', () => {
    const rows: IdRow[] = [
      { id: 'a', merchant: 'Posto Exemplo' },
      { id: 'b', merchant: 'Posto Exemplo', categoryId: 'fuel', categorySource: 'rule' },
      { id: 'c', merchant: 'Loja Exemplo', categoryId: 'old', categorySource: 'rule' },
      { id: 'd', merchant: 'Posto Exemplo', categoryId: 'mine', categorySource: 'manual' },
      { id: 'e', merchant: 'Loja Exemplo' },
    ];
    expect(recategorizeAll(rows, rules)).toEqual([
      { id: 'a', merchant: 'Posto Exemplo', categoryId: 'fuel', categorySource: 'rule' },
      { id: 'c', merchant: 'Loja Exemplo' },
    ]);
  });

  it('returns nothing when the rows already agree with the rules', () => {
    expect(recategorizeAll<IdRow>([{ id: 'a', merchant: 'Posto Exemplo', categoryId: 'fuel', categorySource: 'rule' }], rules)).toEqual([]);
  });
});
