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

test('keeps the food, price paid per gram, servings and intake bound to the original meal across plan changes', () => {
  const food = {
    id:'agility', sourceFoodId:'store-agility', name:'Grandes Adultos', brand:'Agility Gold', type:'dry', species:'dog',
    lifeStage:'adult', country:'Colombia', kcalPerKg:0, proteinPct:23, fatPct:15, fiberPct:4, moisturePct:11,
    bagSizeKg:3, priceBasis:{packageKg:3, priceCop:90000, source:'online', observedAt:'2026-10-01'},
  } as const;
  const original = {
    id:'p', petId:'luna', createdAt:'2026-11-20', foodId:food.id, foodName:food.name, foodBrand:food.brand, foodType:'dry',
    dryFood:food, mixedDryPct:100, mixedWetPct:0, mealsPerDay:2, mealTimes:['08:00','20:00'], rer:600, mer:1000,
    factor:1.5, gramsPerDay:300, gramsPerMeal:150, kcalPerMeal:0, treatsBudgetKcal:100, treatsCountToday:0,
    manualAdjustmentPct:0, rationConfirmed:true, bagWeightKg:3,
  } as const;
  const plan = {...original, mealTimes:[...original.mealTimes]};
  StorageService.savePlan(plan);
  StorageService.toggleMealCompleted('luna', 0, 'Ana', 150, '08:00', 150, true, undefined, 100);
  StorageService.savePlan({...plan, dryFood:{ ...food, proteinPct:35, priceBasis:{...food.priceBasis,priceCop:120000} }});
  const past = StorageService.getMealHistory('luna')[0];
  assert.deepEqual([past.gramsFed, past.gramsEaten], [150,100]);
  assert.equal(past.mixedComponents?.[0].sourceFoodId, 'store-agility');
  assert.equal(past.mixedComponents?.[0].proteinPct, 23);
  assert.equal(past.mixedComponents?.[0].priceSnapshot?.copPerGram, 30);
  assert.equal(past.mixedComponents?.[0].gramsEaten, 100);
  assert.equal(StorageService.getMealHistory('milo').length, 0);
  StorageService.toggleMealCompleted('luna', 0, 'Ana', 0, '08:00');
  assert.equal(StorageService.getMealHistory('luna').length, 0);
});
