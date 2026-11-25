import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/storage/db';
import { ensureDeviceId, getSetting, setSetting } from '../../src/storage/settings';
import './helpers';

describe('settings', () => {
  it('returns undefined for a setting never written, then the value written', async () => {
    const db = await openDatabase();
    expect(await getSetting(db, 'monthlyIncomeCents')).toBeUndefined();

    await setSetting(db, 'monthlyIncomeCents', 850000);

    expect(await getSetting(db, 'monthlyIncomeCents')).toBe(850000);
    db.close();
  });

  it('creates the deviceId once and keeps it on later calls', async () => {
    const db = await openDatabase();
    const ids = ['device-1', 'device-2'];
    const newId = () => ids.shift() ?? 'unexpected';

    expect(await ensureDeviceId(db, newId)).toBe('device-1');
    expect(await ensureDeviceId(db, newId)).toBe('device-1');
    expect(await getSetting(db, 'deviceId')).toBe('device-1');
    db.close();
  });

  it('creates a random UUID deviceId by default', async () => {
    const db = await openDatabase();
    expect(await ensureDeviceId(db)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    db.close();
  });
});
