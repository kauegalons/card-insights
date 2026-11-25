import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
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
    const tx = db.transaction(db.objectStoreNames, 'readonly');
    expect([...tx.objectStore('transactions').indexNames].sort()).toEqual(['date', 'fingerprint', 'statementId', 'updatedAt']);
    for (const store of ['imports', 'rules', 'categories', 'dismissed'] as const) {
      expect([...tx.objectStore(store).indexNames]).toEqual(['updatedAt']);
    }
    expect(tx.objectStore('dismissed').keyPath).toBe('fingerprint');
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

  it('upgrades a database left at version 1 by the real migrations without losing its records', async () => {
    const first = migrations[0];
    if (!first) throw new Error('expected at least one migration');
    const old = await openDatabase(DB_NAME, [first]);
    await old.put('settings', { key: 'deviceId', value: 'device-1' });
    old.close();

    const db = await openDatabase();
    expect(db.version).toBe(SCHEMA_VERSION);
    expect(await db.get('settings', 'deviceId')).toEqual({ key: 'deviceId', value: 'device-1' });
    db.close();
  });

  it('does not open a database newer than this build knows', async () => {
    const newer = await openDB(DB_NAME, SCHEMA_VERSION + 1);
    newer.close();
    await expect(openDatabase()).rejects.toThrow();
  });
});
