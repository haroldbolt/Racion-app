import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { Pet } from '../src/types';
import { localDateKey } from '../src/utils/localDate';
import { StorageService } from '../src/utils/storage';

process.env.TZ = 'America/Bogota';

const entries = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  },
});
Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });

beforeEach(() => {
  entries.clear();
  StorageService.initialize();
});

test('Bogotá uses the same diary day after UTC midnight and advances at local midnight', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-17T00:30:00Z') });
  const diaryDay = '2026-11-16';
  assert.deepEqual(StorageService.getPets(), []);
  assert.equal(localDateKey(), diaryDay);

  const meal = StorageService.toggleMealCompleted('luna', 1, 'Yo', 29, '19:30');
  StorageService.setTrainingRationGramsToday('luna', 5);
  StorageService.setWaterGlassesToday('luna', 2);

  assert.equal(meal.date, diaryDay);
  assert.equal(StorageService.getTodayMealLogs('luna')[0]?.completed, true);
  assert.equal(StorageService.getTrainingRationGramsToday('luna'), 5);
  assert.equal(StorageService.getWaterGlassesToday('luna'), 2);
  assert.deepEqual(StorageService.getTodayMealLogs('milo'), []);
  StorageService.toggleMealCompleted('luna', 1, 'Yo', 29, '19:30');
  assert.equal(StorageService.getTodayMealLogs('luna')[0]?.completed, false);

  context.mock.timers.setTime(new Date('2026-11-17T05:00:00Z').getTime());
  assert.equal(localDateKey(), '2026-11-17');
  assert.deepEqual(StorageService.getTodayMealLogs('luna'), []);
  assert.equal(StorageService.getTrainingRationGramsToday('luna'), 0);
  assert.equal(StorageService.getWaterGlassesToday('luna'), 0);
});

test('same and backdated weigh-ins persist without changing the latest weight or another pet', () => {
  const luna: Pet = {
    id: 'luna', name: 'Luna', species: 'cat', breed: 'Mestizo', sex: 'female',
    isNeutered: true, ageYears: 3, currentWeightKg: 4.3, idealWeightKg: 4.3, targetWeightKg: 4.3,
    bcs: 5, activityLevel: 'moderate', specialState: 'none', createdAt: '2026-11-14',
  };
  const milo: Pet = {
    ...luna, id: 'milo', name: 'Milo', species: 'dog', sex: 'male',
    currentWeightKg: 14.2, idealWeightKg: 14.2, targetWeightKg: 14.2,
  };
  StorageService.savePets([luna, milo]);

  assert.equal(StorageService.addWeightRecord({ id: 'luna-a', petId: 'luna', weightKg: 4.3, date: '2026-11-16' }), false);
  assert.equal(StorageService.addWeightRecord({ id: 'luna-b', petId: 'luna', weightKg: 4.1, date: '2026-11-15' }), false);
  assert.equal(StorageService.addWeightRecord({ id: 'luna-c', petId: 'luna', weightKg: 4.4, date: '2026-11-16' }), true);
  assert.deepEqual(StorageService.getWeightRecords('luna').map((record) => record.weightKg), [4.1, 4.3, 4.4]);
  assert.deepEqual(StorageService.getWeightRecords('milo'), []);
  assert.deepEqual(StorageService.getPets().map((pet) => pet.currentWeightKg), [4.4, 14.2]);
});
