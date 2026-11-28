/** Strips accents (combining marks after NFD): `Farmácia` → `Farmacia`. */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Case-, accent- and spacing-insensitive merchant (spec v1 §4, §5): used by dedupe fingerprints and rules. */
export function normalizeMerchant(merchant: string): string {
  return stripAccents(merchant).toLowerCase().trim().replace(/\s+/g, ' ');
}
