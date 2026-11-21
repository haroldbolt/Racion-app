import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FoodItem, MealLog, Pet } from '../src/types';
import { buildFeedingPlan, calculateFeedingPlan, type CalculationInputs } from '../src/utils/calculator';
import { createFeedingPlanAdjustment, previewFeedingPlanAdjustment } from '../src/utils/feedingPlanAdjustment';
import { calculateDailyMealNutritionSummary } from '../src/utils/mealNutrition';
import { getPlannedMealComponents, getPlannedMeals } from '../src/utils/mealPortions';

const pet: Pet = {
  id: 'luna', name: 'Luna', species: 'cat', breed: 'Mestizo', sex: 'female', isNeutered: true,
  currentWeightKg: 4.3, idealWeightKg: 4.3, targetWeightKg: 4.3, ageYears: 3, bcs: 5,
  activityLevel: 'moderate', specialState: 'none', createdAt: '2026-01-01',
};

const dry: FoodItem = {
  id: 'dry', type: 'dry', brand: 'Marca', name: 'Adulto seco', species: 'cat', lifeStage: 'adult',
  kcalPerKg: 3641, proteinPct: 30, fatPct: 16, fiberPct: 4, moisturePct: 10,
  labelStatus: 'verified_manufacturer', country: 'Colombia', bagSizeKg: 2,
};

const wet: FoodItem = {
  ...dry, id: 'wet', type: 'wet', name: 'Adulto húmedo', kcalPerKg: 1200, bagSizeKg: 0.4,
};

const inputs: CalculationInputs = {
  pet, bcs: pet.bcs, goal: 'maintain', foodType: 'dry', dryFood: dry, treatsKcal: 25,
  mealsPerDay: 2, mealTimes: ['08:30', '19:30'],
};

const original = buildFeedingPlan(inputs, calculateFeedingPlan(inputs));

test('previews an energy and schedule adjustment while keeping recorded nutrition', () => {
  const first = getPlannedMeals(original)[0];
  const meal: MealLog = {
    id: 'prior', petId: pet.id, date: '2026-01-01', mealIndex: 0,
    mealTime: '08:30', plannedGrams: first.grams, gramsFed: first.grams,
    fedBy: 'Yo', completed: true, mixedComponents: getPlannedMealComponents(original, first),
  };
  const before = calculateDailyMealNutritionSummary({ plan: original, mealLogs: [meal] });
  const draft = {
    ...createFeedingPlanAdjustment(original),
    dryEnergy: '4000,0',
    mealsPerDay: 3,
    mealTimes: ['09:00', '14:00', '20:30'],
  };
  const result = previewFeedingPlanAdjustment(pet, original, draft, [meal]);
  assert.ok('plan' in result);
  assert.equal(result.plan.id, original.id);
  assert.equal(result.plan.dryFood?.kcalPerKg, 4000);
  assert.equal(result.plan.gramsPerDay, Math.round(original.foodMerKcal! / 4));
  assert.deepEqual(result.plan.mealTimes, draft.mealTimes);
  assert.deepEqual(original.mealTimes, ['08:30', '19:30']);
  assert.equal(original.dryFood?.kcalPerKg, 3641);
  assert.equal(meal.mealTime, '08:30');
  const after = calculateDailyMealNutritionSummary({ plan: result.plan, mealLogs: [meal] });
  assert.equal(after.kcalServedTotal, before.kcalServedTotal);
  assert.deepEqual(after.servedNutrients, before.servedNutrients);
  assert.equal(after.plannedNutrients.grasa.coverage, 'complete');
});

test('adds wet food to a mixed plan and distributes the daily portion exactly', () => {
  const draft = {
    ...createFeedingPlanAdjustment(original),
    foodType: 'mixed' as const,
    wetFood: wet,
    wetEnergy: '1200',
    mixedDryPct: 65,
    mealsPerDay: 4,
    mealTimes: ['07:00', '10:30', '15:00', '19:30'],
  };
  const result = previewFeedingPlanAdjustment(pet, original, draft, []);
  assert.ok('plan' in result);
  const portions = getPlannedMeals(result.plan);
  const summed = portions.reduce((total, portion) => total + portion.grams, 0);
  const drySum = portions.reduce((total, portion) => total + (portion.dryGrams ?? 0), 0);
  const wetSum = portions.reduce((total, portion) => total + (portion.wetGrams ?? 0), 0);
  assert.equal(summed, result.plan.gramsPerDay);
  assert.equal(drySum, result.plan.dryGramsPerDay);
  assert.equal(wetSum, result.plan.wetGramsPerDay);
  assert.equal(drySum + wetSum, summed);
});

test('preserves a prescribed ration and stops editing away a serving logged today', () => {
  const locked = { ...original, isVetLocked: true };
  const draft = {
    ...createFeedingPlanAdjustment(locked),
    dryEnergy: '4500',
    mealTimes: ['08:00', '20:00'],
  };
  const sameRation = previewFeedingPlanAdjustment(pet, locked, draft, []);
  assert.ok('plan' in sameRation);
  assert.deepEqual(sameRation.plan, { ...locked, mealTimes: draft.mealTimes, scheduleConfigured: true });
  const fewer = { ...draft, mealsPerDay: 1, mealTimes: ['08:00'] };
  assert.deepEqual(previewFeedingPlanAdjustment(pet, locked, fewer, []), { error: 'mealCount' });
  const servedEvening: MealLog = {
    id: 'evening', petId: pet.id, date: '2026-01-01', mealIndex: 1,
    mealTime: '19:30', gramsFed: 29, completed: true, fedBy: 'Yo',
  };
  assert.deepEqual(previewFeedingPlanAdjustment(pet, original, fewer, [servedEvening]), { error: 'mealCount' });
});

test('edits hours when the diary exists before a formula is chosen', () => {
  const scheduleOnlyInputs = { ...inputs, dryFood: undefined };
  const scheduleOnly = buildFeedingPlan(scheduleOnlyInputs, calculateFeedingPlan(scheduleOnlyInputs));
  const draft = {
    ...createFeedingPlanAdjustment(scheduleOnly),
    mealsPerDay: 3,
    mealTimes: ['09:00', '14:30', '20:45'],
  };
  const result = previewFeedingPlanAdjustment(pet, scheduleOnly, draft, []);
  assert.ok('plan' in result);
  assert.deepEqual(result.plan.mealTimes, draft.mealTimes);
  assert.equal(result.plan.gramsPerDay, 0);
  assert.equal(result.plan.rationConfirmed, false);
  assert.equal(result.plan.dryFood, undefined);
  assert.deepEqual(getPlannedMeals(result.plan).map((meal) => meal.grams), [0, 0, 0]);
});

test('an edited copy of the same official formula retains its guide amount and new energy cites the package', () => {
  const guide = {sourceName:'Fabricante',sourceUrl:'https://example.test/ficha',
    ranges:[{minWeightKg:3,maxWeightKg:5,minGrams:40,maxGrams:65}]};
  const formula: FoodItem = {...dry,sourceFoodId:'source-11',kcalPerKg:0,feedingGuide:guide,labelStatus:'verified_manufacturer',
    fichaNutricional:{coincidenciaEstado:'verificado',fuenteNombre:'Fabricante',fuenteUrl:guide.sourceUrl}};
  const values: CalculationInputs = {...inputs,dryFood:formula,manufacturerGramsPerDay:50};
  const initial = buildFeedingPlan(values,calculateFeedingPlan(values));
  assert.equal(initial.manufacturerGramsPerDay,50);
  const personal = {...formula,id:'custom_new',bagSizeKg:3};
  const changed = createFeedingPlanAdjustment(initial, personal);
  assert.equal(changed.manufacturerGramsPerDay,50);
  const adjusted = previewFeedingPlanAdjustment(pet,initial,changed,[]);
  assert.ok('plan' in adjusted);
  assert.equal(adjusted.plan.gramsPerDay,50);
  assert.equal(adjusted.plan.kcalPerMeal,0);
  assert.equal(adjusted.plan.bagWeightKg,3);
  const renamed = createFeedingPlanAdjustment(initial,{...personal,name:'Otra fórmula'});
  assert.equal(renamed.manufacturerGramsPerDay,undefined);
  assert.deepEqual(previewFeedingPlanAdjustment(pet,initial,{...changed,manufacturerGramsPerDay:70},[]),{error:'guide'});
  const energy = previewFeedingPlanAdjustment(pet,initial,{...changed,dryEnergy:'4000',manufacturerGramsPerDay:undefined},[]);
  assert.ok('plan' in energy);
  const entry = energy.plan.dryFood?.fichaNutricional?.kcalPerKg;
  assert.equal(entry?.valor,4000);
  assert.equal(entry?.source?.name,'Etiqueta confirmada por el usuario');
  assert.equal(entry?.source?.url,undefined);
});
