import { openDB } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { DB_NAME, SCHEMA_VERSION, migrations, openDatabase, type Migration } from '../../src/storage/db';
import './helpers';

describe('openDatabase', () => {
  it('creates the card-insights database with every store at the current schema version', async () => {
    const db = await openDatabase();
    expect(db.name).toBe(DB_NAME);
    expect(DB_NAME).toBe('card-insights');
    expect(db.version).toBe(SCHEMA_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(
      ['categories', 'dismissed', 'imports', 'rules', 'settings', 'transactions'],
    );
    db.close();
  });

  it('indexes transactions by statementId, fingerprint, date and updatedAt, and every synced store by updatedAt', async () => {
    const db = await openDatabase();
    const tx = db.transaction([...db.objectStoreNames], 'readonly');
    expect([...tx.objectStore('transactions').indexNames].sort()).toEqual(['date', 'fingerprint', 'statementId', 'updatedAt']);
    for (const store of ['imports', 'rules', 'categories'] as const) {
      expect([...tx.objectStore(store).indexNames]).toEqual(['updatedAt']);
    }
    expect([...tx.objectStore('dismissed').indexNames].sort()).toEqual(['fingerprint', 'updatedAt']);
    db.close();
  });

  it('keys every synced store by id, never by fingerprint (ADR 009)', async () => {
    const db = await openDatabase();
    const tx = db.transaction([...db.objectStoreNames], 'readonly');
    for (const store of ['transactions', 'imports', 'rules', 'categories', 'dismissed'] as const) {
      expect(tx.objectStore(store).keyPath).toBe('id');
    }
    expect(tx.objectStore('settings').keyPath).toBe('key');
    db.close();
  });

  it('runs only the missing migrations, in order, on an older database', async () => {
    const ran: string[] = [];
    const step = (name: string): Migration => (db) => {
      ran.push(name);
      db.createObjectStore(name as never);
    };
    const v1 = await openDatabase('old-db', [step('one')]);
    v1.close();
    ran.length = 0;

    const v3 = await openDatabase('old-db', [step('one'), step('two'), step('three')]);
    expect(ran).toEqual(['two', 'three']);
    expect(v3.version).toBe(3);
    v3.close();
  });

  it('upgrades a database at the current version through a new step without losing its records', async () => {
    const old = await openDatabase(DB_NAME, migrations);
    await old.put('settings', { key: 'deviceId', value: 'device-1' });
    old.close();

    // A synthetic next step, as a real v2 would be appended.
    const next: Migration = (_db, tx) => {
      tx.objectStore('transactions').createIndex('importId' as never, 'importId');
    };
    const db = await openDatabase(DB_NAME, [...migrations, next]);

    expect(db.version).toBe(SCHEMA_VERSION + 1);
    expect([...db.transaction('transactions').store.indexNames]).toContain('importId');
    expect(await db.get('settings', 'deviceId')).toEqual({ key: 'deviceId', value: 'device-1' });
    db.close();
  });

  it('closes itself when another connection needs a newer version, so the upgrade is not blocked', async () => {
    const onBlocked = vi.fn();
    const old = await openDatabase('shared', migrations);
    const next: Migration = (db) => {
      db.createObjectStore('extra' as never);
    };

    const db = await openDatabase('shared', [...migrations, next], { onBlocked });

    expect(db.version).toBe(SCHEMA_VERSION + 1);
    expect(onBlocked).not.toHaveBeenCalled();
    await expect(old.get('settings', 'deviceId')).rejects.toThrow();
    db.close();
  });

  it('reports blocked when an older connection does not close', async () => {
    const onBlocked = vi.fn();
    const stubborn = await openDB('shared', 1); // no versionchange handler, like an old tab
    const opening = openDatabase('shared', [() => undefined, () => undefined], { onBlocked });
    await vi.waitFor(() => expect(onBlocked).toHaveBeenCalled());

    stubborn.close();
    (await opening).close();
  });

  it('does not open a database newer than this build knows', async () => {
    const newer = await openDB(DB_NAME, SCHEMA_VERSION + 1);
    newer.close();
    await expect(openDatabase()).rejects.toThrow();
  });
});
