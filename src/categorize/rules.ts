/** Rules engine (spec v1 §5, ADR 007): first match by ascending priority wins; no match is Uncategorized. */
import type { Rule } from '../domain/category';
import { normalizeMerchant, stripAccents } from '../domain/merchant';
import type { Transaction } from '../domain/transaction';

type Matcher = (normalizedMerchant: string) => boolean;

/** Rules test at most this many characters of the normalized merchant, bounding the work of any regex. */
export const MAX_MATCHED_MERCHANT_LENGTH = 200;

const QUANTIFIER = /[+*]|\{\d*,/;

/**
 * Whether a quantified group has a quantified body, `(a+)+` or `(\w+\s?)*`: the shape behind catastrophic
 * backtracking (ReDoS). Escapes and character classes count as one plain character; groups are folded from the
 * innermost out, so `((ab)+c)+` is caught too. Conservative: it may reject a harmless pattern, never the reverse
 * for this shape.
 */
function hasNestedQuantifier(pattern: string): boolean {
  let rest = pattern.replace(/\\./g, '_').replace(/\[[^\]]*\]/g, '_');
  for (;;) {
    let nested = false;
    const folded = rest.replace(/\(([^()]*)\)([+*]|\{\d*,)?/g, (_group, body: string, quantifier: string | undefined) => {
      const quantified = QUANTIFIER.test(body);
      if (quantified && quantifier !== undefined) nested = true;
      return quantified || quantifier !== undefined ? '_+' : '_'; // keeps a repetition visible to the outer group
    });
    if (nested) return true;
    if (folded === rest) return false;
    rest = folded;
  }
}

/**
 * The rule's test over a normalized merchant. Both sides drop accents; `contains` also ignores case and spacing,
 * `regex` uses the `i` flag. Throws `Invalid regular expression "<pattern>": <reason>` for a bad regex and
 * `Rule pattern has a nested quantifier: "<pattern>"` for one that could hang (see `hasNestedQuantifier`).
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
  if (hasNestedQuantifier(rule.pattern)) throw new Error(`Rule pattern has a nested quantifier: "${rule.pattern}"`);
  return (merchant) => regex.test(merchant);
}

/** Checks a rule before it is saved, so a bad pattern fails at creation, never while categorizing. */
export function validateRule(rule: Pick<Rule, 'match' | 'pattern' | 'priority'>): void {
  if (rule.pattern.trim() === '') throw new Error('Rule pattern must not be empty');
  if (!Number.isSafeInteger(rule.priority)) throw new Error(`Rule priority must be an integer (got ${rule.priority})`);
  compile(rule);
}

/** Rule order: ascending `priority`, ties by `id`, so every device picks the same rule. */
export const byPriorityThenId = (a: Rule, b: Rule): number => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export interface InvalidRule {
  rule: Rule;
  /** Why it failed `validateRule`'s checks, e.g. `Invalid regular expression "(": …`. */
  error: string;
}

/** Finds the rule for a merchant; `invalid` lists the stored rules it skipped, in rule order, for the UI to show. */
export type RuleMatcher = ((merchant: string) => Rule | undefined) & { invalid: InvalidRule[] };

/**
 * Compiles `rules` once and returns the first that matches a merchant (its first `MAX_MATCHED_MERCHANT_LENGTH`
 * normalized characters), by ascending `priority` then `id` (so every device picks the same rule), or undefined. A
 * stored rule that fails to compile (one synced or restored without `validateRule`) is skipped and reported in
 * `invalid`, so one bad rule never blocks an import.
 */
export function ruleMatcher(rules: readonly Rule[]): RuleMatcher {
  const compiled: { rule: Rule; test: Matcher }[] = [];
  const invalid: InvalidRule[] = [];
  for (const rule of [...rules].sort(byPriorityThenId)) {
    try {
      compiled.push({ rule, test: compile(rule) });
    } catch (error) {
      invalid.push({ rule, error: (error as Error).message });
    }
  }
  const match = (merchant: string) => {
    const normalized = normalizeMerchant(merchant).slice(0, MAX_MATCHED_MERCHANT_LENGTH);
    return compiled.find(({ test }) => test(normalized))?.rule;
  };
  return Object.assign(match, { invalid });
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

/**
 * Re-runs `rules` over stored rows (spec v1 §5): the non-manual rows whose category the rules change, with the
 * rules' decision as `categorize` gives it. Rows that already agree, and manual rows, are left out.
 */
export function recategorizeAll<T extends Pick<Transaction, 'merchant'> & CategoryFields>(
  rows: readonly T[],
  rules: readonly Rule[],
): (T & CategoryFields)[] {
  const automatic = rows.filter((row) => row.categorySource !== 'manual');
  return categorize(automatic, rules).filter(
    (row, i) => row.categoryId !== automatic[i]?.categoryId || row.categorySource !== automatic[i]?.categorySource,
  );
}
