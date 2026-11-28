/** Sync-ready repositories (spec v1 §7, ADR 008, ADR 009): every write is stamped; deletes are tombstones. */
import type { StoreValue } from 'idb';
import { categorize } from '../categorize/rules';
import type { Transaction } from '../domain/transaction';
import { planSeed } from './categories';
import { isLive, runInTransaction, systemClock, type Clock, type Db, type ImportRecord, type Schema, type SyncFields, type SyncedStoreName } from './db';
import { nextStamp } from './stamp';

/** A synced store's record without its sync fields: what callers write. */
export type RecordOf<S extends SyncedStoreName> = Omit<StoreValue<Schema, S>, keyof SyncFields>;

export interface Repository<S extends SyncedStoreName> {
  /** The live record, or undefined if missing or deleted. */
  get(key: string): Promise<StoreValue<Schema, S> | undefined>;
  /** Live records in key order. */
  list(): Promise<StoreValue<Schema, S>[]>;
  /** Writes the record live (any `deletedAt` is dropped), stamping `updatedAt` and `updatedBy`. */
  put(record: RecordOf<S>): Promise<StoreValue<Schema, S>>;
  /** Soft delete: stamps and sets `deletedAt`. Throws if the key is unknown; a tombstone is left as it is. */
  remove(key: string): Promise<void>;
  /** Records written strictly after `timestamp`, tombstones included, in `updatedAt` order. */
  changedSince(timestamp: string): Promise<StoreValue<Schema, S>[]>;
}

export { isLive };

/** `record` without any sync fields passed in, so the stamp always comes from the repository. */
function withoutSyncFields<T extends object>(record: T): Omit<T, keyof SyncFields> {
  const { updatedAt: _a, updatedBy: _b, deletedAt: _c, ...rest } = record as T & Partial<SyncFields>;
  return rest;
}

export function createRepository<S extends SyncedStoreName>(db: Db, store: S, clock: Clock = systemClock): Repository<S> {
  // idb can't narrow index names and values through a generic store name; these records are what `S` holds.
  type Value = StoreValue<Schema, S>;
  const index = (range: IDBKeyRange) => db.getAllFromIndex(store, 'updatedAt' as never, range) as Promise<Value[]>;

  return {
    async get(key) {
      const record = (await db.get(store, key)) as Value | undefined;
      return record && isLive(record) ? record : undefined;
    },
    async list() {
      return ((await db.getAll(store)) as Value[]).filter(isLive);
    },
    async put(record) {
      const tx = db.transaction([store, 'settings'], 'readwrite');
      const stored = { ...withoutSyncFields(record), ...(await nextStamp(tx.objectStore('settings'), clock)) } as Value;
      await runInTransaction(tx, [() => tx.objectStore(store).put(stored as never)]);
      return stored;
    },
    async remove(key) {
      const tx = db.transaction([store, 'settings'], 'readwrite');
      const record = (await tx.objectStore(store).get(key)) as Value | undefined;
      if (!record) throw new Error(`No record ${JSON.stringify(key)} in ${store}`);
      if (!isLive(record)) return tx.done;
      const stamp = await nextStamp(tx.objectStore('settings'), clock);
      const tombstone = { ...record, ...stamp, deletedAt: stamp.updatedAt };
      await runInTransaction(tx, [() => tx.objectStore(store).put(tombstone as never)]);
    },
    changedSince(timestamp) {
      return index(IDBKeyRange.lowerBound(timestamp, true));
    },
  };
}

export interface ImportCommit {
  record: ImportRecord;
  /** The new transactions. */
  transactions: readonly Transaction[];
  /** Stored transaction ids to move to `record.statementId` (dedupe's `moveToStatement`, spec v1 §4). */
  moveToStatement?: readonly string[];
}

/**
 * Saves an import in one IndexedDB transaction (spec v1 §8.1), all or nothing, with one stamp: the missing default
 * categories and rules (`planSeed`, so an import never runs without them), its record, its new transactions
 * categorized by the live rules (`categorize`: learned rules first, manual rows kept), and the stored ones it moves
 * to its statement (an unknown or deleted id is skipped). A non-manual category set by the caller is replaced by
 * the rules' decision (or removed on no match).
 */
export async function commitImport(db: Db, commit: ImportCommit, clock: Clock = systemClock): Promise<void> {
  const tx = db.transaction(['transactions', 'imports', 'rules', 'categories', 'settings'], 'readwrite');
  const transactions = tx.objectStore('transactions');
  const [storedCategories, storedRules] = await Promise.all([tx.objectStore('categories').getAll(), tx.objectStore('rules').getAll()]);
  const seed = await planSeed(storedCategories, storedRules, () => transactions.getAll());
  const added = categorize(commit.transactions, [...storedRules.filter(isLive), ...seed.rules]);
  const stamp = await nextStamp(tx.objectStore('settings'), clock);
  const filled = new Map(seed.transactions.map((t) => [t.id, t]));
  const moved = (await Promise.all((commit.moveToStatement ?? []).map((id) => transactions.get(id))))
    .filter((t): t is NonNullable<typeof t> => t !== undefined && isLive(t))
    .map((t) => ({ ...(filled.get(t.id) ?? t), statementId: commit.record.statementId }));
  for (const t of moved) filled.delete(t.id);
  await runInTransaction(tx, [
    ...seed.categories.map((c) => () => tx.objectStore('categories').put({ ...c, ...stamp })),
    ...seed.rules.map((r) => () => tx.objectStore('rules').put({ ...r, ...stamp })),
    () => tx.objectStore('imports').put({ ...withoutSyncFields(commit.record), ...stamp }),
    ...added.map((t) => () => transactions.put({ ...withoutSyncFields(t), ...stamp })),
    ...[...filled.values(), ...moved].map((t) => () => transactions.put({ ...t, ...stamp })),
  ]);
}
