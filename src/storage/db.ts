/** IndexedDB schema and migrations: spec v1 §2 and §7, ADR 003, ADR 008. The only module that opens the database. */
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type { Category, Rule } from '../domain/category';
import type { Transaction } from '../domain/transaction';
import type { DismissedOccurrences, ImportSummary } from '../import/dedupe';

export const DB_NAME = 'card-insights';

/** Returns the current time; injected so tests control `updatedAt`. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

/** Sync fields every synced record carries (ADR 008). ISO timestamps. */
export interface SyncFields {
  updatedAt: string;
  /** Tombstone: set by `remove`; `get` and `list` skip the record. */
  deletedAt?: string;
}
export type Stored<T> = T & SyncFields;

/** One import, never the file content. */
export interface ImportRecord {
  id: string;
  adapterId: string;
  fileName: string;
  statementId: string;
  importedAt: string;
  summary: ImportSummary;
}

/** Occurrences of a fingerprint the user deleted, so a re-import doesn't bring them back. Keyed by fingerprint. */
export interface DismissedRecord extends DismissedOccurrences {
  dismissedAt: string;
}

export interface Settings {
  deviceId: string;
  monthlyIncomeCents: number;
  statementClosingDay: number;
  demo: boolean;
  lastBackupAt: string;
  /** Unused until Phase 6 (sync). */
  lastSyncAt: string;
}
export type SettingKey = keyof Settings;
export type SettingRecord = { [K in SettingKey]: { key: K; value: Settings[K] } }[SettingKey];

type SyncedStore<T, Indexes = object> = { key: string; value: Stored<T>; indexes: Indexes & { updatedAt: string } };

export interface Schema extends DBSchema {
  transactions: SyncedStore<Transaction, { statementId: string; fingerprint: string; date: string }>;
  imports: SyncedStore<ImportRecord>;
  rules: SyncedStore<Rule>;
  categories: SyncedStore<Category>;
  dismissed: SyncedStore<DismissedRecord>;
  settings: { key: SettingKey; value: SettingRecord };
}

export type Db = IDBPDatabase<Schema>;
export type StoreName = StoreNames<Schema>;
export type SyncedStoreName = Exclude<StoreName, 'settings'>;

/** Key path of each store; every key is a string. */
export const KEY_PATHS = {
  transactions: 'id',
  imports: 'id',
  rules: 'id',
  categories: 'id',
  dismissed: 'fingerprint',
  settings: 'key',
} as const satisfies Record<StoreName, string>;
export const STORE_NAMES = Object.keys(KEY_PATHS) as StoreName[];

export type Migration = (db: Db, tx: IDBPTransaction<Schema, StoreName[], 'versionchange'>) => void;

/** Ordered: `migrations[n]` upgrades version `n` to `n + 1`. Never edit a released step; append a new one. */
export const migrations: readonly Migration[] = [
  // v1: every store keyed per KEY_PATHS; an `updatedAt` index on synced stores serves `changedSince`.
  (db) => {
    const transactions = db.createObjectStore('transactions', { keyPath: KEY_PATHS.transactions });
    for (const index of ['statementId', 'fingerprint', 'date', 'updatedAt'] as const) transactions.createIndex(index, index);
    for (const name of ['imports', 'rules', 'categories', 'dismissed'] as const) {
      db.createObjectStore(name, { keyPath: KEY_PATHS[name] }).createIndex('updatedAt', 'updatedAt');
    }
    db.createObjectStore('settings', { keyPath: KEY_PATHS.settings });
  },
];

export const SCHEMA_VERSION = migrations.length;

/**
 * Issues `requests` inside `tx` and waits for it to commit. A request that throws while being issued (e.g. a
 * record without its key) aborts `tx`, so the transaction stays all or nothing; the error is rethrown.
 */
export async function runInTransaction(
  tx: { done: Promise<void>; abort(): void },
  requests: readonly (() => Promise<unknown>)[],
): Promise<void> {
  const pending: Promise<unknown>[] = [tx.done];
  try {
    for (const request of requests) pending.push(request());
  } catch (error) {
    tx.abort();
    await Promise.allSettled(pending); // the aborted requests reject too; the cause is `error`
    throw error;
  }
  await Promise.all(pending);
}

/** Opens (creating or upgrading) the database, running the missing migrations in order. */
export function openDatabase(name = DB_NAME, steps: readonly Migration[] = migrations): Promise<Db> {
  return openDB<Schema>(name, steps.length, {
    upgrade(db, oldVersion, _newVersion, tx) {
      for (const step of steps.slice(oldVersion)) step(db, tx);
    },
  });
}
