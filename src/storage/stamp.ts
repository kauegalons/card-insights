/** The sync clock (ADR 009): per-device, strictly increasing `updatedAt`, plus `updatedBy` as the tiebreak. */
import type { IDBPObjectStore } from 'idb';
import type { Clock, Schema, StoreName, SyncFields } from './db';

/** The `settings` store inside a readwrite transaction, whatever other stores it spans. */
export type SettingsStore<Tx extends ArrayLike<StoreName>> = IDBPObjectStore<Schema, Tx, 'settings', 'readwrite'>;

/** The deviceId, created (random UUID) and saved on first use. */
export async function readOrCreateDeviceId<Tx extends ArrayLike<StoreName>>(
  settings: SettingsStore<Tx>,
  newId: () => string = () => crypto.randomUUID(),
): Promise<string> {
  const existing = await settings.get('deviceId');
  if (existing?.key === 'deviceId') return existing.value;
  const deviceId = newId();
  await settings.put({ key: 'deviceId', value: deviceId });
  return deviceId;
}

/**
 * The stamp for one write transaction: `updatedAt = max(now, lastStampAt + 1 ms)`, saved back as `lastStampAt`
 * in the same transaction. Writes are serialized on `settings`, so every committed stamp is greater than every
 * earlier one, even within one millisecond or when the system clock goes back; `changedSince(lastSeen)` misses nothing.
 */
export async function nextStamp<Tx extends ArrayLike<StoreName>>(
  settings: SettingsStore<Tx>,
  clock: Clock,
): Promise<Pick<SyncFields, 'updatedAt' | 'updatedBy'>> {
  const updatedBy = await readOrCreateDeviceId(settings);
  const last = await settings.get('lastStampAt');
  const lastMs = last?.key === 'lastStampAt' ? Date.parse(last.value) : Number.NEGATIVE_INFINITY;
  const updatedAt = new Date(Math.max(clock().getTime(), lastMs + 1)).toISOString();
  await settings.put({ key: 'lastStampAt', value: updatedAt });
  return { updatedAt, updatedBy };
}
