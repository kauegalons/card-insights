/** JSON backup, restore and delete all (spec v1 §7 and §8.4, ADR 008). Records are copied as stored, tombstones included. */
import type { StoreValue } from 'idb';
import { KEY_PATHS, SCHEMA_VERSION, STORE_NAMES, runInTransaction, systemClock, type Clock, type Db, type Schema, type StoreName } from './db';

const APP = 'card-insights';

export type BackupData = { [S in StoreName]: StoreValue<Schema, S>[] };

export interface Backup {
  app: typeof APP;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export async function exportBackup(db: Db, clock: Clock = systemClock): Promise<Backup> {
  const tx = db.transaction(STORE_NAMES, 'readonly');
  const entries = await Promise.all(STORE_NAMES.map(async (name) => [name, await tx.objectStore(name).getAll()] as const));
  await tx.done;
  return { app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: clock().toISOString(), data: Object.fromEntries(entries) as BackupData };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Checks the envelope and every record's key (and `updatedAt` on synced stores). Throws `Invalid backup: …`. */
function validate(backup: unknown): Backup {
  const fail = (reason: string): never => {
    throw new Error(`Invalid backup: ${reason}`);
  };
  if (!isObject(backup) || backup.app !== APP || !isObject(backup.data)) return fail('not a card-insights backup');
  if (backup.schemaVersion !== SCHEMA_VERSION) {
    fail(`schemaVersion ${String(backup.schemaVersion)} is not supported (expected ${SCHEMA_VERSION})`);
  }
  for (const name of STORE_NAMES) {
    const records = backup.data[name];
    if (!Array.isArray(records)) return fail(`data.${name} must be an array`);
    records.forEach((record: unknown, i) => {
      const where = `data.${name}[${i}]`;
      if (!isObject(record) || typeof record[KEY_PATHS[name]] !== 'string') fail(`${where} has no ${KEY_PATHS[name]}`);
      else if (name !== 'settings' && typeof record.updatedAt !== 'string') fail(`${where} has no updatedAt`);
    });
  }
  return backup as unknown as Backup;
}

/** Validates, then replaces every store in one transaction: on any error nothing changes. */
export async function restoreBackup(db: Db, backup: unknown): Promise<void> {
  const { data } = validate(backup);
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  await runInTransaction(
    tx,
    STORE_NAMES.flatMap((name) => {
      const store = tx.objectStore(name);
      return [() => store.clear(), ...data[name].map((record) => () => store.put(record as never))];
    }),
  );
}

/** Clears every store for real (tombstones and settings too), in one transaction. */
export async function deleteAllData(db: Db): Promise<void> {
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  await runInTransaction(tx, STORE_NAMES.map((name) => () => tx.objectStore(name).clear()));
}
