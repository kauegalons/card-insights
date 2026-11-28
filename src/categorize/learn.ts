/**
 * Learning from a correction (spec v1 §5, ADR 007): changing a transaction's category makes it manual and creates
 * (or updates) a user rule for exactly that merchant; applying it to past transactions is a separate, asked step.
 */
import type { Rule } from '../domain/category';
import { normalizeMerchant } from '../domain/merchant';
import type { Transaction } from '../domain/transaction';
import { byPriorityThenId } from './rules';

/**
 * Priority of a learned rule: below `DEFAULT_RULE_PRIORITY` (1000), so it runs before every default. Learned rules
 * match one exact merchant each, so they never compete with one another and can share one number.
 */
export const LEARNED_RULE_PRIORITY = 100;

type Categorizable = Pick<Transaction, 'merchant' | 'categoryId' | 'categorySource'>;

/**
 * Regex matching exactly the normalized `merchant`: `^padaria exemplo$`. A `contains` rule would also catch
 * "Padaria Exemplo Filial", a different merchant the user never corrected.
 */
export function learnedRulePattern(merchant: string): string {
  const normalized = normalizeMerchant(merchant);
  if (normalized === '') throw new Error('Cannot learn a rule for a blank merchant');
  return `^${normalized.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`;
}

/**
 * The transaction with `categoryId` as a manual choice, and the user rule that sends its merchant there: the
 * existing learned rule for that merchant with the new category (same id and priority), or a new one. Two devices
 * offline (or a restore) can leave several user rules with the same pattern: the first by priority then id (the
 * one the matcher picks) is updated and the others are returned in `deletedRuleIds`, to tombstone.
 */
export function recategorize<T extends Categorizable>(
  transaction: T,
  categoryId: string,
  rules: readonly Rule[],
  newId: () => string = () => crypto.randomUUID(),
): { transaction: T; rule: Rule; deletedRuleIds: string[] } {
  const pattern = learnedRulePattern(transaction.merchant);
  const [existing, ...duplicates] = rules
    .filter((r) => r.origin === 'user' && r.match === 'regex' && r.pattern === pattern)
    .sort(byPriorityThenId);
  return {
    deletedRuleIds: duplicates.map((r) => r.id),
    transaction: { ...transaction, categoryId, categorySource: 'manual' },
    rule: existing
      ? { ...existing, categoryId }
      : { id: newId(), match: 'regex', pattern, categoryId, priority: LEARNED_RULE_PRIORITY, origin: 'user' },
  };
}

/**
 * The transactions "Aplicar às outras N transações?" would change: other than `transaction`, live, same merchant
 * (normalized), not manual, and not already in `categoryId`, whatever their date (later rows too). N is the length.
 */
export function otherMatchesFor<T extends Categorizable & Pick<Transaction, 'id'> & { deletedAt?: string }>(
  transaction: Pick<Transaction, 'id' | 'merchant'>,
  categoryId: string,
  transactions: readonly T[],
): T[] {
  const merchant = normalizeMerchant(transaction.merchant);
  return transactions.filter(
    (t) =>
      t.id !== transaction.id &&
      t.deletedAt === undefined &&
      t.categorySource !== 'manual' &&
      t.categoryId !== categoryId &&
      normalizeMerchant(t.merchant) === merchant,
  );
}

/** The "yes" answer: each past transaction in `categoryId`, as a rule decision (never manual). */
export function applyToPast<T extends Categorizable>(past: readonly T[], categoryId: string): T[] {
  return past.map((t) => ({ ...t, categoryId, categorySource: 'rule' }));
}
