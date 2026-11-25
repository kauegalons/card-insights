/** The `settings` store: one record per key (spec v1 §2). Settings are per device and not synced. */
import type { Db, SettingKey, SettingRecord, Settings } from './db';

export async function getSetting<K extends SettingKey>(db: Db, key: K): Promise<Settings[K] | undefined> {
  const record = await db.get('settings', key);
  return record?.value as Settings[K] | undefined;
}

export async function setSetting<K extends SettingKey>(db: Db, key: K, value: Settings[K]): Promise<void> {
  await db.put('settings', { key, value } as SettingRecord);
}

/** The device's id: a random UUID created on first call and kept from then on (ADR 008). */
export async function ensureDeviceId(db: Db, newId: () => string = () => crypto.randomUUID()): Promise<string> {
  const tx = db.transaction('settings', 'readwrite');
  const existing = await tx.store.get('deviceId');
  const deviceId = existing?.key === 'deviceId' ? existing.value : newId();
  if (!existing) await tx.store.put({ key: 'deviceId', value: deviceId });
  await tx.done;
  return deviceId;
}
