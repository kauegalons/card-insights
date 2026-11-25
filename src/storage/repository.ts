/** Sync-ready repositories (spec v1 §7, ADR 008): every write stamps `updatedAt`; deletes are tombstones. */
import type { StoreValue } from 'idb';
import type { Transaction } from '../domain/transaction';
import { runInTransaction, systemClock, type Clock, type Db, type ImportRecord, type Schema, type Stored, type SyncedStoreName } from './db';

/** A synced store's record without its sync fields: what callers write. */
export type RecordOf<S extends SyncedStoreName> = Omit<StoreValue<Schema, S>, 'updatedAt' | 'deletedAt'>;

export interface Repository<S extends SyncedStoreName> {
  /** The live record, or undefined if missing or deleted. */
  get(key: string): Promise<StoreValue<Schema, S> | undefined>;
  /** Live records in key order. */
  list(): Promise<StoreValue<Schema, S>[]>;
  /** Writes the record live (any `deletedAt` is dropped) with `updatedAt` = now. */
  put(record: RecordOf<S>): Promise<StoreValue<Schema, S>>;
  /** Soft delete: sets `deletedAt` and `updatedAt` to now. Throws if the key is unknown. */
  remove(key: string): Promise<void>;
  /** Records written strictly after `timestamp`, tombstones included, in `updatedAt` order. */
  changedSince(timestamp: string): Promise<StoreValue<Schema, S>[]>;
}

const isLive = (record: { deletedAt?: string }): boolean => record.deletedAt === undefined;

/** `record` stamped with `updatedAt`, live. */
function stamp<T extends object>(record: T, now: Date): Stored<Omit<T, 'deletedAt'>> {
  const { deletedAt: _dropped, ...rest } = record as T & { deletedAt?: string };
  return { ...rest, updatedAt: now.toISOString() } as Stored<Omit<T, 'deletedAt'>>;
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
      const stored = stamp(record, clock()) as Value;
      await db.put(store, stored as never);
      return stored;
    },
    async remove(key) {
      const record = (await db.get(store, key)) as Value | undefined;
      if (!record) throw new Error(`No record ${JSON.stringify(key)} in ${store}`);
      const now = clock().toISOString();
      await db.put(store, { ...record, updatedAt: now, deletedAt: now } as never);
    },
    changedSince(timestamp) {
      return index(IDBKeyRange.lowerBound(timestamp, true));
    },
  };
}

/** Saves an import's transactions and its record in one IndexedDB transaction (spec v1 §8.1): all or nothing. */
export async function commitImport(
  db: Db,
  record: ImportRecord,
  transactions: readonly Transaction[],
  clock: Clock = systemClock,
): Promise<void> {
  const now = clock();
  const tx = db.transaction(['transactions', 'imports'], 'readwrite');
  await runInTransaction(tx, [
    () => tx.objectStore('imports').put(stamp(record, now)),
    ...transactions.map((t) => () => tx.objectStore('transactions').put(stamp(t, now))),
  ]);
}
