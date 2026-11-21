import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeedingPlan, FoodCostEntry, FoodItem, FoodPriceBasis, Pet } from '../src/types';
import { getPlanCostSummary, resolveFoodPrice, sameFoodIdentity, withPlanCosts, withPurchasedPackage } from '../src/utils/foodCosts';
import { buildFeedingPlan, calculateFeedingPlan } from '../src/utils/calculator';

const dry: FoodItem = {
  id: 'rc37', brand: 'Royal Canin', name: 'Sterilised 37', type: 'dry', species: 'cat', lifeStage: 'adult',
  kcalPerKg: 4000, proteinPct: 0, fatPct: 0, fiberPct: 0, moisturePct: 0, country: 'Colombia',
  labelStatus: 'user_confirmed_label', bagSizeKg: 2,
  priceBasis: { packageKg: 2, priceCop: 137000, source: 'online', observedAt: '2026-11-20T10:00:00Z' },
};
const plan: FeedingPlan = {
  id: 'plan', petId: 'luna', createdAt: '2026-11-20', foodId: dry.id, foodName: dry.name, foodBrand: dry.brand,
  foodType: 'dry', dryFood: dry, mixedDryPct: 100, mixedWetPct: 0, mealsPerDay: 2, mealTimes: ['08:30', '19:30'],
  rer: 200, factor: 1, mer: 216, gramsPerDay: 54, gramsPerMeal: 27, kcalPerMeal: 108,
  treatsBudgetKcal: 0, treatsCountToday: 0, manualAdjustmentPct: 0, rationConfirmed: true, bagWeightKg: 2,
};
const purchase: FoodCostEntry = {
  id: 'receipt', petId: plan.petId, foodId: dry.id, foodBrand: dry.brand, foodName: dry.name, foodType: 'dry',
  bagSizeKg: 4, quantity: 2, pricePaidCop: 280000, costPerKgCop: 70000, date: '2026-11-20', createdAt: '2026-11-20T12:00:00Z',
};

test('costs each actual planned portion from its exact online package price without rounding intermediates', () => {
  const summary = getPlanCostSummary(plan);
  assert.equal(summary.costPerDayCop, 3699);
  assert.equal(summary.costPerMonthCop, 3699 * 30.5);
  assert.deepEqual(summary.meals.map((meal) => meal.costCop), [1849.5, 1849.5]);
  assert.equal(summary.partial, false);
  assert.equal(summary.estimated, true);
  assert.equal(getPlanCostSummary({ ...plan, gramsPerDay: 55 }).meals.reduce((sum, meal) => sum + meal.costCop!, 0), 55 * 68.5);
});

test('uses paid total divided by total purchased mass, scoped to pet, formula and unit package', () => {
  const unrelated = { ...purchase, id: 'other', pricePaidCop: 100, createdAt: '2026-11-20T13:00:00Z' };
  assert.equal(getPlanCostSummary(plan, [purchase]).costPerDayCop, 3780);
  assert.equal(getPlanCostSummary(plan, [purchase, { ...unrelated, petId: 'milo' }]).costPerDayCop, 3780);
  assert.equal(getPlanCostSummary(plan, [purchase, { ...unrelated, foodId: 'other-food' }]).costPerDayCop, 3780);
  assert.equal(getPlanCostSummary(plan, [purchase, { ...unrelated, bagSizeKg: 10 }]).costPerDayCop, 3780);
  assert.equal(getPlanCostSummary(plan, [purchase]).estimated, false);
});

test('preserves purchase compatibility for exact legacy names and never falls back to another formula', () => {
  assert.equal(resolveFoodPrice(dry, 2, [{ ...purchase, foodId: undefined }])?.source, 'manual');
  assert.equal(resolveFoodPrice(dry, 2, [{ ...purchase, foodId: undefined, foodName: 'Sterilised 7+' }])?.source, 'online');
  assert.equal(getPlanCostSummary({ ...plan, dryFood: { ...dry, priceBasis: undefined }, bagPriceCop: 99999 }).costPerDayCop, undefined);
});

test('recognizes the same online formula after label review creates a personal id, without confusing a 7+ formula', () => {
  const online = { ...dry, id: 'online_laia_123', sourceFoodId: 'online_laia_123', buyUrl: 'https://www.laiapets.com.co/productos/rc37/?variant=2' };
  const reviewed = { ...online, id: 'custom_reviewed' };
  assert.equal(sameFoodIdentity(online, reviewed), true);
  assert.equal(getPlanCostSummary({ ...plan, foodId: reviewed.id, dryFood: reviewed },
    [{ ...purchase, foodId: online.id, sourceFoodId: online.sourceFoodId, foodSourceUrl: online.buyUrl }]).costPerDayCop, 3780);
  assert.equal(sameFoodIdentity({ ...online, sourceFoodId: undefined }, { ...reviewed, sourceFoodId: undefined }), true);
  assert.equal(sameFoodIdentity({ ...online, name: 'Sterilised 7+' }, { ...reviewed, name: 'Sterilised 7' }), false);
  assert.equal(sameFoodIdentity(online, { ...reviewed, species: 'dog' }), false);
});

test('explicit selection can use product price or confirmed shipping total and survives a JSON reload', () => {
  const offer: FoodPriceBasis = { ...dry.priceBasis!, priceCop: 120000, shippingCop: 10000, selectedAt: '2026-11-20T14:00:00Z' };
  const updated = { ...plan, dryFood: { ...dry, priceBasis: offer } };
  assert.equal(getPlanCostSummary(updated, [purchase]).costPerDayCop, 3240);
  updated.dryFood.priceBasis.includeShipping = true;
  assert.equal(getPlanCostSummary(JSON.parse(JSON.stringify(updated)), [purchase]).costPerDayCop, 3510);
  updated.dryFood.priceBasis.shippingCop = null;
  assert.equal(resolveFoodPrice(updated.dryFood, 2), undefined);
});

test('prices mixed food components separately and flags a partial total when one price is missing', () => {
  const wet: FoodItem = { ...dry, id: 'wet', type: 'wet', name: 'Húmedo', bagSizeKg: 0.085,
    priceBasis: { packageKg: 0.085, priceCop: 1299, source: 'manual', observedAt: '2026-11-20' } };
  const mixed: FeedingPlan = { ...plan, foodType: 'mixed', wetFood: wet, gramsPerDay: 150, dryGramsPerDay: 50, wetGramsPerDay: 100 };
  const summary = getPlanCostSummary(mixed);
  assert.equal(summary.partial, false);
  assert.equal(summary.costPerDayCop, 50 * 68.5 + 100 * (1299 / 85));
  assert.equal(summary.meals.reduce((sum, meal) => sum + meal.costCop!, 0), summary.costPerDayCop);
  const partial = getPlanCostSummary({ ...mixed, wetFood: { ...wet, priceBasis: undefined } });
  assert.equal(partial.partial, true);
  assert.equal(partial.costPerDayCop, 50 * 68.5);
  assert.equal(withPlanCosts({ ...mixed, wetFood: { ...wet, priceBasis: undefined } }).dailyCostCop, undefined);
});

test('changing presentation never reuses another package price and unconfirmed grams never assume a ration', () => {
  assert.equal(getPlanCostSummary({ ...plan, bagWeightKg: 0.4 }).costPerDayCop, undefined);
  assert.equal(getPlanCostSummary({ ...plan, rationConfirmed: false }).costPerDayCop, undefined);
  assert.equal(getPlanCostSummary(undefined).costPerDayCop, undefined);
  assert.equal(resolveFoodPrice({ ...dry, bagSizeKg: undefined }, undefined, [purchase]), undefined);
});

test('wet-only plan keeps the selected wet package and recalculates its linked cost', () => {
  const pet: Pet = { id: 'luna', name: 'Luna', species: 'cat', breed: 'Mestizo', sex: 'female', isNeutered: true,
    currentWeightKg: 4.3, idealWeightKg: 4.3, targetWeightKg: 4.3, specialState: 'none', ageYears: 3, bcs: 5, activityLevel: 'moderate', createdAt: '2026-01-01' };
  const wet: FoodItem = { ...dry, type: 'wet', bagSizeKg: 0.085, priceBasis: { ...dry.priceBasis!, packageKg: 0.085, priceCop: 1299 } };
  const inputs = { pet, goal: 'maintain' as const, bcs: 5, foodType: 'wet' as const, wetFood: wet, mealsPerDay: 2 };
  const built = buildFeedingPlan(inputs, calculateFeedingPlan(inputs));
  assert.equal(built.bagWeightKg, 0.085);
  assert.equal(built.dailyCostCop, built.gramsPerDay * (1299 / 85));
});

test('confirming a purchased package changes only packaging and its linked cost, preserving portions and labels', () => {
  const updated = withPurchasedPackage(plan, dry, 4);
  assert.equal(updated.bagWeightKg, 4);
  assert.equal(updated.dryFood?.bagSizeKg, 4);
  assert.equal(updated.dryFood?.kcalPerKg, plan.dryFood?.kcalPerKg);
  assert.deepEqual(updated.mealTimes, plan.mealTimes);
  assert.equal(updated.gramsPerDay, 54);
  assert.equal(updated.foodId, plan.foodId);
  assert.equal(getPlanCostSummary(updated, [{ ...purchase, bagSizeKg: 4, quantity: 1, pricePaidCop: 253000 }]).costPerDayCop, 253000 / 4000 * 54);
  assert.equal(plan.bagWeightKg, 2);
  assert.equal(withPurchasedPackage({ ...plan, isVetLocked: true }, dry, 4).bagWeightKg, 2);
  assert.equal(withPurchasedPackage(plan, { ...dry, id: 'other', name: 'Otra fórmula' }, 4), plan);
});
