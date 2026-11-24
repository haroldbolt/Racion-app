import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { FeedingPlan, FoodCostEntry, FoodItem, Pet } from '../src/types';
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
  StorageService.savePetProfile({ ...milo, name: 'Milo editado' });
  assert.deepEqual(StorageService.getWeightRecords('milo'), [], 'editing a legacy profile cannot establish its original weight');
});

test('creation weight is recorded once, on the local day, and remains independent of later weigh-ins', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-24T03:45:00Z') });
  const luna: Pet = {
    id: 'luna', name: 'Luna', species: 'dog', breed: 'Mestiza', sex: 'female', isNeutered: true,
    currentWeightKg: 20, idealWeightKg: 20, targetWeightKg: 20, bcs: 5, activityLevel: 'moderate',
    specialState: 'none', createdAt: new Date().toISOString(),
  };
  StorageService.savePetProfile(luna);
  StorageService.savePetProfile(luna);
  const first = StorageService.getWeightRecords('luna');
  assert.equal(first.length, 1, 'retrying profile creation keeps a single initial measurement');
  assert.equal(first[0].source, 'profile_creation');
  assert.equal(first[0].weightKg, 20);
  assert.equal(first[0].date, '2026-11-23');

  const notes = 'Pesaje de prueba escenario de bolsa compartida.\nLuna pesó 20,5 kg antes de su segunda toma.';
  assert.equal(StorageService.addWeightRecord({ id: 'older', petId: 'luna', date: '2026-11-22', weightKg: 19 }), false);
  assert.equal(StorageService.getPets()[0].currentWeightKg, 20);
  assert.equal(StorageService.addWeightRecord({ id: 'control', petId: 'luna', date: '2026-11-23', weightKg: 20.5, notes }), true);
  StorageService.savePetProfile({ ...luna, name: 'Luna editada', currentWeightKg: 20.5 });
  StorageService.savePetProfile({ ...luna, id: 'rocky', name: 'Rocky', currentWeightKg: 12 });
  StorageService.initialize();
  const history = StorageService.getWeightRecords('luna');
  assert.deepEqual(history.map(record => record.weightKg), [19, 20, 20.5]);
  assert.deepEqual(history[1], first[0]);
  assert.equal(history[2].notes, notes);
  assert.deepEqual(StorageService.getWeightRecords('rocky').map(record => record.weightKg), [12]);
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

test('stored purchases price the current rations of their named pets after reload or unsharing', () => {
  const food: FoodItem = {id:'shared-dog-food', name:'Adultos', brand:'Marca de prueba', species:'dog', type:'dry',
    lifeStage:'adult', country:'Colombia', kcalPerKg:3610, proteinPct:0, fatPct:0, fiberPct:0, moisturePct:0, bagSizeKg:10};
  const rocky: FeedingPlan = {id:'plan-rocky', petId:'rocky', createdAt:'2026-11-20', foodId:food.id, foodName:food.name, foodBrand:food.brand,
    foodType:'dry', dryFood:food, mixedDryPct:100, mixedWetPct:0, mealsPerDay:2, mealTimes:['08:00','20:00'],
    rer:451, mer:722, factor:1.6, gramsPerDay:200, gramsPerMeal:100, kcalPerMeal:361,
    treatsBudgetKcal:0, treatsCountToday:0, manualAdjustmentPct:0, rationConfirmed:true, bagWeightKg:10};
  const luna = {...rocky, id:'plan-luna', petId:'luna', gramsPerDay:279, gramsPerMeal:140};
  const bag: FoodCostEntry = {id:'one-bag', petId:'luna', date:'2026-11-22', createdAt:'2026-11-22T12:00:00Z',
    foodId:food.id, foodName:food.name, foodBrand:food.brand, foodType:'dry', quantity:1, bagSizeKg:10,
    pricePaidCop:150000, costPerKgCop:15000};
  StorageService.savePlan(rocky);
  StorageService.savePlan(luna);
  StorageService.addFoodPurchase(bag);
  assert.equal(StorageService.getPlan('rocky')?.dailyCostCop,undefined);
  const shared = {...bag, openedOn:bag.date, sharedWithPetIds:['rocky']};
  StorageService.updateFoodPurchase(shared);
  assert.deepEqual(StorageService.getFoodPurchases('rocky').map(p => p.id),[bag.id]);
  assert.deepEqual(StorageService.getFoodPurchases('otro'),[]);
  assert.equal(StorageService.getFoodPurchases().length,1);
  assert.equal(StorageService.getPlans().rocky.dailyCostCop,3000);
  assert.equal(StorageService.getPlans().luna.dailyCostCop,4185);
  StorageService.toggleMealCompleted('rocky',0,'Yo',100,'08:00');
  StorageService.updateFoodPurchase({...shared, sharedWithPetIds:[]});
  assert.deepEqual(StorageService.getFoodPurchases('rocky'),[]);
  assert.equal(StorageService.getPlans().rocky.dailyCostCop,undefined);
  assert.equal(StorageService.getMealHistory('rocky')[0].mixedComponents?.[0].priceSnapshot?.copPerGram,15);
  StorageService.updateFoodPurchase(shared);
  StorageService.savePlan({...luna, gramsPerDay:284, gramsPerMeal:142});
  assert.equal(StorageService.getPlan('luna')?.dailyCostCop,4260);
  assert.equal(StorageService.getPlan('luna')?.monthlyCostCop,129930);
  assert.equal(StorageService.getPlan('rocky')?.dailyCostCop,3000);
  StorageService.deleteFoodPurchase(bag.id);
  assert.equal(StorageService.getPlan('luna')?.dailyCostCop,undefined);
  assert.equal(StorageService.getPlan('rocky')?.dailyCostCop,undefined);
});

test('sparse historical plan costs survive reads and only matching receipt caches are cleared', () => {
  const plansKey = 'racion_plans_v1';
  for (const invalid of ['null', '[]', '"invalid"']) {
    entries.set(plansKey, invalid);
    assert.deepEqual(StorageService.getPlans(), {});
    assert.equal(StorageService.getPlan('luna'), undefined);
  }
  const historical = {petId:'viejo', dailyCostCop:231, bagPriceCop:70000};
  const food = {id:'k', name:'Adultos', type:'dry', bagSizeKg:10};
  const legacyPlan = {petId:'luna', foodType:'dry', dryFood:food, mealsPerDay:2, gramsPerDay:284, rationConfirmed:true,
    bagPriceCop:150000, dailyCostCop:4260, monthlyCostCop:129930};
  entries.set(plansKey, JSON.stringify({viejo:historical, luna:legacyPlan, broken:null}));
  const bag: FoodCostEntry = {id:'p', petId:'rocky', sharedWithPetIds:['luna'], date:'2026-11-20',
    createdAt:'2026-11-20', foodId:'k', foodName:'Adultos', foodBrand:'', foodType:'dry', bagSizeKg:10,
    pricePaidCop:150000, costPerKgCop:15000};
  StorageService.addFoodPurchase(bag);
  assert.deepEqual(StorageService.getPlans().viejo, historical);
  assert.equal(StorageService.getPlans().broken, undefined);
  assert.equal(StorageService.getPlan('luna')?.bagPriceCop, 150000);
  assert.equal(StorageService.getPlan('luna')?.monthlyCostCop, 129930);
  StorageService.updateFoodPurchase({...bag, sharedWithPetIds:[]});
  assert.equal(StorageService.getPlans().luna.dailyCostCop, undefined);
  assert.deepEqual(StorageService.getPlans().viejo, historical);
});
