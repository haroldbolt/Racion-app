import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountData, activateAccountStorage, releaseAccountStorage, getLegacyDataAvailable, STORAGE_KEYS } from '../src/utils/accountStorage';

test('a fresh billing account cannot see the anonymous diary or a different account after relogin and clear', async () => {
  const records = new Map([[STORAGE_KEYS.PETS, '["beta"]']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  }});
  assert.equal(getLegacyDataAvailable('cuenta-a'), true);
  await activateAccountStorage('cuenta-a', false);
  assert.equal(accountData.getItem(STORAGE_KEYS.PETS), null);
  accountData.setItem(STORAGE_KEYS.PETS, '["Rocky"]');
  releaseAccountStorage();
  assert.equal(accountData.getItem(STORAGE_KEYS.PETS), null);
  assert.throws(() => accountData.setItem(STORAGE_KEYS.PETS, '[]'));
  await activateAccountStorage('cuenta-b', false);
  assert.equal(accountData.getItem(STORAGE_KEYS.PETS), null);
  accountData.setItem(STORAGE_KEYS.PETS, '["Luna"]');
  accountData.clear();
  await activateAccountStorage('cuenta-a', false);
  assert.equal(accountData.getItem(STORAGE_KEYS.PETS), '["Rocky"]');
  assert.equal(getLegacyDataAvailable('cuenta-a'), false);
  assert.equal(records.get(STORAGE_KEYS.PETS), '["beta"]');
});
