/** Asks the browser not to evict the database (spec v1 §7, ADR 008). The UI shows the result. */
export type PersistResult = 'granted' | 'denied' | 'unsupported';

export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persist'> | undefined = globalThis.navigator?.storage,
): Promise<PersistResult> {
  if (typeof storage?.persist !== 'function') return 'unsupported';
  return (await storage.persist()) ? 'granted' : 'denied';
}
