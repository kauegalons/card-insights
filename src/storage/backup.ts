/** JSON backup, restore and delete all (spec v1 §7 and §8.4, ADR 008, ADR 009). Records are copied as stored, tombstones included. */
import type { StoreValue } from 'idb';
import { isObject, validateRecord } from './backup-validate';
import {
  DEVICE_LOCAL_SETTINGS,
  SCHEMA_VERSION,
  STORE_NAMES,
  isDeviceLocalSetting,
  runInTransaction,
  systemClock,
  type Clock,
  type Db,
  type Schema,
  type StoreName,
} from './db';

const APP = 'card-insights';

export type BackupData = { [S in StoreName]: StoreValue<Schema, S>[] };

export interface Backup {
  app: typeof APP;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

/** Every store, minus device-local settings (`deviceId`, `lastStampAt`, `lastSyncAt`, `backupFileHandle`). */
export async function exportBackup(db: Db, clock: Clock = systemClock): Promise<Backup> {
  const tx = db.transaction(STORE_NAMES, 'readonly');
  const entries = await Promise.all(STORE_NAMES.map(async (name) => [name, await tx.objectStore(name).getAll()] as const));
  await tx.done;
  const data = Object.fromEntries(entries) as BackupData;
  data.settings = data.settings.filter((record) => !isDeviceLocalSetting(record.key));
  return { app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: clock().toISOString(), data };
}

/** Turns a backup's `data` written by schema version `v` into version `v + 1`. */
export type BackupUpgrader = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version it upgrades from. A version with no entry changed no record shape (e.g. it only added
 * an index), so its records pass through. Add one whenever a migration changes what records hold.
 */
export const backupUpgraders: Readonly<Record<number, BackupUpgrader>> = {};

/** Runs the upgraders from version `from` up to `to`, in order. */
export function upgradeBackupData(
  data: Record<string, unknown>,
  from: number,
  to: number = SCHEMA_VERSION,
  upgraders: Readonly<Record<number, BackupUpgrader>> = backupUpgraders,
): Record<string, unknown> {
  let result = data;
  for (let version = from; version < to; version++) result = upgraders[version]?.(result) ?? result;
  return result;
}

/** Checks the envelope, upgrades an older version, then checks every record. Throws `Invalid backup: …`. */
function parse(backup: unknown): BackupData {
  try {
    if (!isObject(backup) || backup.app !== APP || !isObject(backup.data)) throw new Error('not a card-insights backup');
    const version = backup.schemaVersion;
    if (!Number.isSafeInteger(version) || (version as number) < 1) throw new Error(`schemaVersion ${String(version)} is not a version`);
    if ((version as number) > SCHEMA_VERSION) {
      throw new Error(`schemaVersion ${String(version)} is newer than this app supports (${SCHEMA_VERSION}); update the app first`);
    }
    const data = upgradeBackupData(backup.data, version as number);
    for (const name of STORE_NAMES) {
      const records = data[name];
      if (!Array.isArray(records)) throw new Error(`data.${name} must be an array`);
      records.forEach((record: unknown, i) => validateRecord(name, record, `data.${name}[${i}]`));
    }
    const valid = data as unknown as BackupData;
    checkRuleTargets(valid);
    return valid;
  } catch (error) {
    throw new Error(`Invalid backup: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** Throws `data.rules[i].categoryId must be a live category (got …)` for a live rule pointing nowhere. */
function checkRuleTargets(data: BackupData): void {
  const live = new Set(data.categories.filter((c) => c.deletedAt === undefined).map((c) => c.id));
  data.rules.forEach((rule, i) => {
    if (rule.deletedAt === undefined && !live.has(rule.categoryId)) {
      throw new Error(`data.rules[${i}].categoryId must be a live category (got ${JSON.stringify(rule.categoryId)})`);
    }
  });
}

/** The newest `updatedAt` among the synced records, if any. */
function newestStamp(data: BackupData): string | undefined {
  let newest: string | undefined;
  for (const name of STORE_NAMES) {
    if (name === 'settings') continue;
    for (const { updatedAt } of data[name]) if (newest === undefined || updatedAt > newest) newest = updatedAt;
  }
  return newest;
}

/**
 * Validates, then replaces every store in one transaction: on any error nothing changes. Device-local settings
 * stay as they are (the backup's are ignored), except `lastStampAt`, which moves up to the newest restored
 * `updatedAt` so later local writes outrank the restored records (ADR 009).
 */
export async function restoreBackup(db: Db, backup: unknown): Promise<void> {
  const data = parse(backup);
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  const settings = tx.objectStore('settings');
  const local = (await Promise.all(DEVICE_LOCAL_SETTINGS.map((key) => settings.get(key)))).filter((r) => r !== undefined);
  const stamps = [newestStamp(data), ...local.map((r) => (r.key === 'lastStampAt' ? r.value : undefined))];
  const lastStampAt = stamps.filter((s) => s !== undefined).sort().at(-1);
  const kept = [
    ...local.filter((r) => r.key !== 'lastStampAt'),
    ...(lastStampAt === undefined ? [] : [{ key: 'lastStampAt' as const, value: lastStampAt }]),
  ];
  await runInTransaction(tx, [
    ...STORE_NAMES.flatMap((name) => {
      const store = tx.objectStore(name);
      const records = name === 'settings' ? data.settings.filter((r) => !isDeviceLocalSetting(r.key)) : data[name];
      return [() => store.clear(), ...records.map((record) => () => store.put(record as never))];
    }),
    ...kept.map((record) => () => settings.put(record)),
  ]);
}

/** Clears every store for real (tombstones and settings too), in one transaction. */
export async function deleteAllData(db: Db): Promise<void> {
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  await runInTransaction(tx, STORE_NAMES.map((name) => () => tx.objectStore(name).clear()));
}
