/** Rules engine (spec v1 §5, ADR 007): first match by ascending priority wins; no match is Uncategorized. */
import type { Rule } from '../domain/category';
import { normalizeMerchant, stripAccents } from '../domain/merchant';
import type { Transaction } from '../domain/transaction';

type Matcher = (normalizedMerchant: string) => boolean;

/**
 * The rule's test over a normalized merchant. Both sides drop accents; `contains` also ignores case and spacing,
 * `regex` uses the `i` flag. Throws `Invalid regular expression "<pattern>": <reason>` for a bad regex.
 */
function compile(rule: Pick<Rule, 'match' | 'pattern'>): Matcher {
  if (rule.match === 'contains') {
    const needle = normalizeMerchant(rule.pattern);
    return (merchant) => merchant.includes(needle);
  }
  let regex: RegExp;
  try {
    regex = new RegExp(stripAccents(rule.pattern), 'i');
  } catch (error) {
    throw new Error(`Invalid regular expression "${rule.pattern}": ${(error as Error).message}`);
  }
  return (merchant) => regex.test(merchant);
}

/** Checks a rule before it is saved, so a bad pattern fails at creation, never while categorizing. */
export function validateRule(rule: Pick<Rule, 'match' | 'pattern' | 'priority'>): void {
  if (rule.pattern.trim() === '') throw new Error('Rule pattern must not be empty');
  if (!Number.isSafeInteger(rule.priority)) throw new Error(`Rule priority must be an integer (got ${rule.priority})`);
  compile(rule);
}

/**
 * Compiles `rules` once and returns the first that matches a merchant, by ascending `priority` then `id` (so every
 * device picks the same rule), or undefined. A stored rule that fails to compile throws `Rule <id>: …`.
 */
export function ruleMatcher(rules: readonly Rule[]): (merchant: string) => Rule | undefined {
  const compiled = [...rules]
    .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((rule) => {
      try {
        return { rule, test: compile(rule) };
      } catch (error) {
        throw new Error(`Rule ${rule.id}: ${(error as Error).message}`);
      }
    });
  return (merchant) => {
    const normalized = normalizeMerchant(merchant);
    return compiled.find(({ test }) => test(normalized))?.rule;
  };
}

type CategoryFields = Pick<Transaction, 'categoryId' | 'categorySource'>;

/**
 * Applies the rules to each row: a match sets `categoryId` and `categorySource: 'rule'`, no match leaves it
 * Uncategorized (both fields removed). Rows with `categorySource: 'manual'` are returned unchanged.
 */
export function categorize<T extends Pick<Transaction, 'merchant'> & CategoryFields>(
  rows: readonly T[],
  rules: readonly Rule[],
): (T & CategoryFields)[] {
  const match = ruleMatcher(rules);
  return rows.map((row) => {
    if (row.categorySource === 'manual') return row;
    const { categoryId: _id, categorySource: _source, ...rest } = row;
    const rule = match(row.merchant);
    // `rest` is `T` without its category fields: the cast puts back what the rule decided.
    return (rule ? { ...rest, categoryId: rule.categoryId, categorySource: 'rule' } : rest) as T & CategoryFields;
  });
}
