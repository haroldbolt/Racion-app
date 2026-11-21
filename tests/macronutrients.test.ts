import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeedingPlan, FoodItem, MealLog, NutrientQualifier, NutrientValue, NutritionDatasheet } from '../src/types';
import { calculateDailyMealNutritionSummary, calculateFoodPortionNutrients } from '../src/utils/mealNutrition';
import { getPlannedMealComponents, getPlannedMeals } from '../src/utils/mealPortions';

function percentage(valor: number, calificador: NutrientQualifier, baseMedicion: NutrientValue['baseMedicion'] = 'tal_como_se_vende'): NutrientValue {
  return { valor, unidadOriginal: '%', baseMedicion, calificador };
}

function food(id: string, type: FoodItem['type'], kcalPerKg: number, fields: Partial<NutritionDatasheet>): FoodItem {
  return {
    id, name: id, brand: 'Marca', species: 'cat', lifeStage: 'adult', type, kcalPerKg,
    proteinPct: 0, fatPct: 0, fiberPct: 0, moisturePct: 0, country: 'Colombia', labelStatus: 'user_confirmed_label',
    fichaNutricional: {
      coincidenciaEstado: 'verificado',
      kcalPerKg: { ...percentage(kcalPerKg, 'tipico'), unidadOriginal: 'kcal/kg' },
      ...fields,
    },
  };
}

const dry = food('seco', 'dry', 4000, {
  proteina: percentage(30, 'minimo'),
  grasa: percentage(12, 'minimo'),
  fibra: percentage(2, 'maximo'),
  carbohidratos: percentage(0, 'tipico'),
});
const wet = food('húmedo', 'wet', 1000, {
  proteina: percentage(8, 'minimo'),
  fibra: percentage(1.2, 'maximo'),
  carbohidratos: percentage(50, 'tipico', 'materia_seca'),
  humedad: percentage(80, 'tipico'),
});
const plan: FeedingPlan = {
  id: 'plan', petId: 'luna', createdAt: '2026-11-16', foodId: dry.id, foodName: dry.name, foodBrand: dry.brand,
  foodType: 'mixed', dryFood: dry, wetFood: wet, mixedDryPct: 50, mixedWetPct: 50,
  mealsPerDay: 2, mealTimes: ['08:30', '19:30'], rer: 209, factor: 1.14, mer: 239,
  rationConfirmed: true, gramsPerDay: 149, dryGramsPerDay: 30, wetGramsPerDay: 119,
  gramsPerMeal: 75, kcalPerMeal: 120, treatsBudgetKcal: 24, treatsCountToday: 0, manualAdjustmentPct: 0,
};

function mealLog(override: Partial<MealLog> = {}): MealLog {
  return {
    id: 'meal', petId: plan.petId, date: '2026-11-16', mealIndex: 0, mealTime: '08:30',
    gramsFed: 75, completed: true, fedBy: 'Yo', ...override,
  };
}

test('uses exact mixed portions, preserves guarantee direction and separates missing nutrients', () => {
  const portions = getPlannedMeals(plan);
  const served = mealLog({ mixedComponents: getPlannedMealComponents(plan, portions[0]) });
  const undone = mealLog({ mealIndex: 1, completed: false, gramsFed: 74, mixedComponents: getPlannedMealComponents(plan, portions[1]) });
  const totals = calculateDailyMealNutritionSummary({ plan: { ...plan, trainingRationGramsToday: 7 }, mealLogs: [served, undone] });

  assert.equal(totals.totalPlannedGrams, 149);
  assert.deepEqual(totals.plannedPerFoodBreakdown.map((item) => item.gramsServed), [30, 119]);
  assert.equal(totals.totalServedGrams, 75);
  assert.equal(totals.completedMealsCount, 1);
  assert.equal(totals.kcalServedTotal, 120);
  assert.deepEqual(totals.plannedNutrients, {
    proteina: { grams: 18.5, qualifier: 'minimo', coverage: 'complete', mixedQualifiers: false },
    grasa: { grams: 3.6, qualifier: 'minimo', coverage: 'partial', mixedQualifiers: false },
    fibra: { grams: 2.1, qualifier: 'maximo', coverage: 'complete', mixedQualifiers: false },
    carbohidratos: { grams: 11.9, qualifier: 'tipico', coverage: 'complete', mixedQualifiers: false },
  });
  assert.equal(totals.servedNutrients.proteina.grams, 9.3);
  assert.equal(totals.servedNutrients.fibra.grams, 1.1);
});

test('records a declared zero and leaves dry-matter bounds without typical moisture unavailable', () => {
  const unsupported = {
    ...wet,
    fichaNutricional: { ...wet.fichaNutricional!, humedad: percentage(80, 'maximo') },
  };
  const verifiedWithoutKcal = { ...dry, labelStatus: 'unconfirmed' as const, kcalPerKg: 0, fichaNutricional: { ...dry.fichaNutricional!, kcalPerKg: undefined } };
  assert.equal(calculateFoodPortionNutrients(verifiedWithoutKcal, 100).carbohidratos?.grams, 0);
  assert.equal(calculateFoodPortionNutrients(unsupported, 100).carbohidratos?.available, false);
  assert.equal(calculateFoodPortionNutrients(wet, 100).carbohidratos?.grams, 10);
  const legacyCatalog = { ...dry, labelStatus: undefined, fichaNutricional: undefined, proteinPct: 30 };
  assert.equal(calculateFoodPortionNutrients(legacyCatalog, 100).proteina.qualifier, 'tipico');
});

test('shows separate food values when minimum, maximum or typical qualifiers conflict', () => {
  const wetWithMaxProtein = {
    ...wet, fichaNutricional: { ...wet.fichaNutricional!, proteina: percentage(8, 'maximo') },
  };
  const totals = calculateDailyMealNutritionSummary({ plan: { ...plan, wetFood: wetWithMaxProtein }, mealLogs: [] });
  assert.deepEqual(totals.plannedNutrients.proteina, { grams: null, coverage: 'complete', mixedQualifiers: true });
  assert.deepEqual(totals.plannedPerFoodBreakdown.map((item) => item.proteina.qualifier), ['minimo', 'maximo']);
  assert.equal(totals.servedNutrients.proteina.coverage, 'empty');
});

test('keeps the logged label and does not claim old placeholder macros or missing component weights', () => {
  const originalPortion = getPlannedMeals(plan)[0];
  const snapshots = getPlannedMealComponents(plan, originalPortion)!;
  const changedDry = { ...dry, fichaNutricional: { ...dry.fichaNutricional!, proteina: percentage(45, 'minimo') } };
  const updated = { ...plan, dryFood: changedDry };
  const today = calculateDailyMealNutritionSummary({ plan: updated, mealLogs: [mealLog({ mixedComponents: snapshots })] });
  assert.equal(today.plannedNutrients.proteina.grams, 23);
  assert.equal(today.servedNutrients.proteina.grams, 9.3);
  assert.equal(today.usesCurrentPlanForLegacyLogs, false);

  const partial = calculateDailyMealNutritionSummary({ plan, mealLogs: [mealLog({ mixedComponents: snapshots.slice(0, 1) })] });
  assert.equal(partial.servedNutrients.proteina.coverage, 'partial');
  assert.equal(partial.kcalServedPartial, true);

  const oldManual = { ...dry, id: 'label_legacy', fichaNutricional: undefined, proteinPct: 26, fatPct: 14, fiberPct: 3.5 };
  const oldPlan: FeedingPlan = { ...plan, foodType: 'dry', foodId: oldManual.id, dryFood: oldManual };
  const oldSnapshot = [{
    role: 'main' as const, foodId: oldManual.id, foodName: 'Etiqueta anterior', gramsPlanned: 75, gramsFed: 75,
    kcalPerKg: 4000, proteinPct: 26, fatPct: 14, fiberPct: 3.5,
  }];
  const old = calculateDailyMealNutritionSummary({ plan: oldPlan, mealLogs: [mealLog({ mixedComponents: oldSnapshot })] });
  assert.equal(old.kcalServedTotal, 300);
  assert.equal(old.plannedNutrients.proteina.coverage, 'unavailable');
  assert.equal(old.servedNutrients.proteina.coverage, 'unavailable');

  const legacy = calculateDailyMealNutritionSummary({ plan, mealLogs: [mealLog()] });
  assert.equal(legacy.usesCurrentPlanForLegacyLogs, true);
});

test('counts the amounts eaten from each food, preserves a true zero and keeps snacks without a label partial', async () => {
  const { getLoggedMealEnergy } = await import('../src/utils/mealPortions');
  const parts = getPlannedMealComponents(plan, getPlannedMeals(plan)[0])!;
  const log = mealLog({ gramsEaten: 65, mixedComponents: parts.map((part) => ({
    ...part, gramsEaten: part.role === 'wet' ? 50 : 15,
  })) });
  const eatenSnack = { id: 'snack', petId: 'luna', date: log.date, loggedAt: '12:00',
    name: 'Premio', kcal: 2, hasKcalPerUnitOnLabel: false };
  const totals = calculateDailyMealNutritionSummary({ plan, mealLogs: [log], treatLogs: [eatenSnack] });
  assert.deepEqual([totals.totalServedGrams, totals.totalEatenGrams], [75, 65]);
  assert.equal(totals.servedNutrients.proteina.grams, 9.3);
  assert.equal(totals.consumedNutrients.proteina.grams, 8.5);
  assert.equal(totals.consumedNutrients.proteina.coverage, 'partial');
  assert.equal(totals.treatsWithoutLabel, true);
  assert.deepEqual(getLoggedMealEnergy(log, plan), {kcal:110, partial:false});
  const untouched = { ...log, gramsEaten: 0, mixedComponents: parts.map((part) => ({ ...part, gramsEaten: 0 })) };
  assert.deepEqual(getLoggedMealEnergy(untouched, plan), {kcal:0, partial:false});

  const { getNextMealStatus } = await import('../src/utils/feedingGuide');
  assert.equal(getNextMealStatus({...plan, trainingRationGramsToday: 7}, [log], [eatenSnack]).consumedKcalTotal, 112);
  const missing = { ...log, mixedComponents: log.mixedComponents!.map(part => ({...part, kcalPerKg: 0})) };
  assert.equal(getNextMealStatus(plan, [missing], [eatenSnack]).energyIncomplete, true);
  assert.equal(getNextMealStatus(plan, [missing], [eatenSnack]).consumedKcalTotal, 2);
});
