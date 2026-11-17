import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FoodItem, MealLog, Pet, TreatLog, VetGuideline } from '../src/types';
import { buildFeedingPlan, calculateFeedingPlan, recalculatePlanForPet } from '../src/utils/calculator';
import { getNextMealStatus } from '../src/utils/feedingGuide';
import { calculateDailyMealNutritionSummary } from '../src/utils/mealNutrition';
import { getLoggedMealKcal, getPlannedMealComponents, getPlannedMeals } from '../src/utils/mealPortions';

const luna: Pet = {
  id: 'luna', name: 'Luna', species: 'cat', breed: 'Mestizo', sex: 'female',
  isNeutered: true, ageYears: 3, currentWeightKg: 4.3, idealWeightKg: 4.3, targetWeightKg: 4.3,
  bcs: 5, activityLevel: 'moderate', specialState: 'none', createdAt: '2026-11-16',
};

const kibbles: FoodItem = {
  id: 'kibbles', brand: 'Marca', name: 'Seco gato adulto', species: 'cat', lifeStage: 'adult',
  type: 'dry', kcalPerKg: 3641, proteinPct: 30, fatPct: 12, fiberPct: 2, moisturePct: 8, country: 'Colombia',
  labelStatus: 'user_confirmed_label',
};

const wet: FoodItem = { ...kibbles, id: 'wet', name: 'Húmedo gato adulto', type: 'wet', kcalPerKg: 1000, moisturePct: 80 };
const dailyInput = {
  pet: luna, goal: 'maintain', bcs: 5, foodType: 'dry', dryFood: kibbles, mealsPerDay: 2,
  mealTimes: ['08:30', '19:30'], treatsKcal: 20,
} as const;

test('recalculates with the saved goal, treats allowance and schedule', () => {
  const inputs = { ...dailyInput, mealTimes: [...dailyInput.mealTimes], goal: 'gain' as const };
  const savedPlan = buildFeedingPlan(inputs, calculateFeedingPlan(inputs));
  const pet = { ...luna, currentWeightKg: 4.5 };
  const actual = recalculatePlanForPet(pet, savedPlan);
  const expected = calculateFeedingPlan({ ...inputs, pet });

  assert.equal(actual.goal, 'gain');
  assert.equal(actual.treatsKcal, 20);
  assert.equal(actual.foodMerKcal, expected.foodMerKcal);
  assert.equal(actual.gramsPerDay, expected.gramsPerDay);
  assert.deepEqual(actual.mealTimes, ['08:30', '19:30']);
});

test('infers a reasonable treats allowance from a plan saved before the inputs were persisted', () => {
  const inputs = { ...dailyInput, mealTimes: [...dailyInput.mealTimes] };
  const legacy = {
    ...buildFeedingPlan(inputs, calculateFeedingPlan(inputs)),
    mer: 238, kcalPerMeal: 107, gramsPerDay: 59, goal: undefined, treatsKcal: undefined, foodMerKcal: undefined,
    dryGramsPerDay: undefined, wetGramsPerDay: undefined,
  };
  const actual = recalculatePlanForPet({ ...luna, currentWeightKg: 4.4 }, legacy);
  assert.equal(actual.treatsKcal, 24);
  assert.equal(actual.foodMerKcal, actual.mer - Math.min(24, actual.treatsBudgetKcal));
  assert.deepEqual(getPlannedMeals(legacy).map(p => p.grams), [30, 29]);
  assert.deepEqual(getPlannedMeals({ ...legacy, gramsPerDay: 205 }).map(p => p.grams), [103, 102]);
});

test('blocks an automatic clinical ration and keeps a valid prescription when weight changes', () => {
  const clinicalPet = { ...luna, specialState: 'diabetes' as const, dietType: 'therapeutic' as const };
  const clinical = calculateFeedingPlan({ ...dailyInput, mealTimes: [...dailyInput.mealTimes], pet: clinicalPet });
  assert.equal(clinical.requiresVetGuidance, true);
  assert.equal(clinical.rationConfirmed, false);
  assert.equal(clinical.mer, 0);
  assert.equal(clinical.gramsPerDay, 0);

  const guideline: VetGuideline = {
    prescribedKcal: 230, prescribedGramsPerMeal: 34, mealsPerDay: 3,
    prescribedFoodName: 'Alimento prescrito', vetName: 'Veterinaria', clinicName: 'Clínica',
    date: '2026-11-16', locked: true, notes: '',
  };
  const inputs = {
    ...dailyInput, mealTimes: [...dailyInput.mealTimes],
    pet: { ...clinicalPet, hasVetGuideline: true, vetGuideline: guideline },
  };
  assert.equal(calculateFeedingPlan({
    ...inputs,
    pet: { ...clinicalPet, vetGuideline: { ...guideline, prescribedKcal: 0 } },
  }).rationConfirmed, false);
  const lockedPlan = buildFeedingPlan(inputs, calculateFeedingPlan(inputs));
  const afterWeightChange = recalculatePlanForPet({ ...inputs.pet, currentWeightKg: 4.6 }, lockedPlan);
  assert.equal(afterWeightChange.mer, 230);
  assert.equal(afterWeightChange.foodName, guideline.prescribedFoodName);
  assert.deepEqual(getPlannedMeals(afterWeightChange).map(p => p.grams), [34, 34, 34]);
  assert.equal(getLoggedMealKcal({ mealIndex: 0, gramsFed: 34 }, afterWeightChange), 230 / 3);
});

test('uses label kcal, counts treats once, and keeps mixed portion sums exact', () => {
  const dry = { ...kibbles, kcalPerKg: 4000 };
  const inputs = {
    ...dailyInput, mealTimes: [...dailyInput.mealTimes], foodType: 'mixed' as const, dryFood: dry, wetFood: wet,
  };
  const plan = {
    ...buildFeedingPlan(inputs, calculateFeedingPlan(inputs)),
    mer: 259, foodMerKcal: 239, gramsPerDay: 149, dryGramsPerDay: 30, wetGramsPerDay: 119,
  };
  const portions = getPlannedMeals(plan);
  assert.deepEqual(portions, [{ grams: 75, dryGrams: 15, wetGrams: 60 }, { grams: 74, dryGrams: 15, wetGrams: 59 }]);

  const logs: MealLog[] = portions.map((portion, mealIndex) => ({
    id: `luna_${mealIndex}`, petId: luna.id, mealIndex, date: '2026-11-16', fedBy: 'Prueba',
    mealTime: plan.mealTimes[mealIndex], gramsFed: portion.grams, completed: true,
    mixedComponents: getPlannedMealComponents(plan, portion),
  }));
  const treats: TreatLog = {
    id: 'treat', petId: luna.id, date: '2026-11-16', name: 'Premio', kcal: 20, pieces: 1,
    hasKcalPerUnitOnLabel: true, kcalPerUnit: 20, loggedAt: '2026-11-16T14:00:00Z',
  };
  assert.equal(getNextMealStatus(plan, logs, [treats]).consumedKcalTotal, 259);
  assert.equal(calculateDailyMealNutritionSummary({ plan, mealLogs: logs }).kcalServedTotal, 239);
  assert.equal(calculateDailyMealNutritionSummary({
    plan: { ...plan, dryGramsPerDay: undefined, wetGramsPerDay: undefined },
    mealLogs: [{ ...logs[0], gramsFed: 149, mixedComponents: undefined }],
  }).kcalServedTotal, 239);

  const changedLabelPlan = { ...plan, dryFood: { ...dry, kcalPerKg: 6000 } };
  assert.equal(getLoggedMealKcal(logs[0], changedLabelPlan), 120);
  assert.equal(calculateDailyMealNutritionSummary({ plan: changedLabelPlan, mealLogs: logs }).kcalServedTotal, 239);
  assert.equal(getLoggedMealKcal({ ...logs[0], mixedComponents: undefined, gramsFed: 0 }, plan), 0);
});

test('a single food uses the label energy rather than the total daily energy budget', () => {
  const inputs = { ...dailyInput, mealTimes: [...dailyInput.mealTimes] };
  const plan = { ...buildFeedingPlan(inputs, calculateFeedingPlan(inputs)), mer: 238, gramsPerDay: 59 };
  const log = { mealIndex: 0, gramsFed: 30, completed: true };
  assert.equal(getLoggedMealKcal(log, plan), 30 * 3641 / 1000);
  assert.equal(getNextMealStatus(plan, [log], [], new Date(2026, 10, 16, 10)).nextMealGrams, 29);
});
