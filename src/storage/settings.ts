/** The `settings` store: one record per key (spec v1 §2). Settings are per device and not synced. */
import type { Db, SettingKey, SettingRecord, Settings } from './db';
import { readOrCreateDeviceId } from './stamp';

export async function getSetting<K extends SettingKey>(db: Db, key: K): Promise<Settings[K] | undefined> {
  const record = await db.get('settings', key);
  return record?.value as Settings[K] | undefined;
}

export async function setSetting<K extends SettingKey>(db: Db, key: K, value: Settings[K]): Promise<void> {
  await db.put('settings', { key, value } as SettingRecord);
}

/** The device's id: a random UUID created on first call and kept from then on (ADR 008). */
export async function ensureDeviceId(db: Db, newId?: () => string): Promise<string> {
  const tx = db.transaction('settings', 'readwrite');
  const deviceId = await readOrCreateDeviceId(tx.store, newId);
  await tx.done;
  return deviceId;
}
