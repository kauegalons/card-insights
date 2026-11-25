/**
 * Money helpers (ADR 005): amounts are integer cents; strings are converted only at the edges,
 * with string and integer operations, never `parseFloat`.
 */

// Optional sign, optional spaces after it, digits (plain or grouped by `.` in threes), `,` and exactly two decimals.
const BRL_AMOUNT = /^([+-]?) *(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/;

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Parses a pt-BR amount (`"1.234,56"`, `"- 1.234,56"`) into integer cents. Throws on anything else. */
export function parseBrlAmount(text: string): number {
  const match = BRL_AMOUNT.exec(text.trim());
  const cents = match ? Number(`${match[2]?.replaceAll('.', '')}${match[3]}`) : NaN;
  if (!match || !Number.isSafeInteger(cents)) {
    throw new Error(`Invalid BRL amount: ${JSON.stringify(text)} (expected e.g. "1.234,56" or "- 60,00")`);
  }
  return match[1] === '-' && cents !== 0 ? -cents : cents;
}

/** Formats integer cents for display: `123456` → `"R$ 1.234,56"` (no-break space, as Intl writes it). */
export function formatBrl(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`Invalid cents: ${cents} (expected an integer)`);
  const abs = Math.abs(cents);
  // A decimal string keeps Intl exact: no division by 100 in floating point.
  const decimal = `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return BRL.format(decimal as `${number}`);
}
