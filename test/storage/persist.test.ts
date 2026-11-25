import { describe, expect, it } from 'vitest';
import { requestPersistentStorage } from '../../src/storage/persist';

describe('requestPersistentStorage', () => {
  it('reports granted when the browser grants persistent storage', async () => {
    expect(await requestPersistentStorage({ persist: async () => true })).toBe('granted');
  });

  it('reports denied when the browser refuses', async () => {
    expect(await requestPersistentStorage({ persist: async () => false })).toBe('denied');
  });

  it('reports unsupported when there is no StorageManager', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unsupported');
  });
});
