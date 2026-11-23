import type { FeedingPlan, FoodItem, MealLog, Pet } from '../types';
import { defaultMealTimes, recalculatePlanForPet, requiresVetGuidance } from './calculator';
import { getEffectiveNutrientField } from './mealNutrition';
import { sameFoodIdentity } from './foodCosts';
import { canUseManualRation, getApplicableFeedingRange, getSavedRationInputs, isValidDailyGrams } from './manufacturerRation';
import { getFoodKcalPerKg, getPlannedMeals, getPrimaryPlanFood } from './mealPortions';

export type FormulaType = 'dry' | 'wet' | 'mixed';

export interface FeedingPlanAdjustment {
  foodType: FeedingPlan['foodType'];
  dryFood?: FoodItem;
  wetFood?: FoodItem;
  manufacturerGramsPerDay?: number;
  manualGramsPerDay?: number;
  dryEnergy: string;
  wetEnergy: string;
  mixedDryPct: number;
  mealsPerDay: number;
  mealTimes: string[];
}

export function minimumMealCount(logs: readonly MealLog[]): number {
  return Math.max(1, ...logs
    .filter((log) => log.completed && Number.isInteger(log.mealIndex) && log.mealIndex >= 0 && log.mealIndex < 6)
    .map((log) => log.mealIndex + 1));
}

export function canEditFormula(pet: Pet, plan: FeedingPlan): boolean {
  return !plan.isVetLocked && !pet.vetGuideline?.locked &&
    !requiresVetGuidance(pet, plan) && plan.foodType !== 'barf';
}

export function retainManufacturerPortion(previous: FoodItem | undefined, next: FoodItem | undefined, grams?: number): number | undefined {
  return previous && next?.feedingGuide && sameFoodIdentity(previous, next) && getFoodKcalPerKg(next) === undefined
    ? grams : undefined;
}

export function retainManualPortion(previous: FoodItem | undefined, next: FoodItem | undefined, grams?: number): number | undefined {
  return previous && next && sameFoodIdentity(previous, next) && getFoodKcalPerKg(next) === undefined
    ? grams : undefined;
}

export function createFeedingPlanAdjustment(plan: FeedingPlan, food?: FoodItem): FeedingPlanAdjustment {
  const existingDryFood = plan.dryFood?.type === 'dry' ? plan.dryFood :
    plan.wetFood?.type === 'dry' ? plan.wetFood : undefined;
  const existingWetFood = plan.wetFood?.type === 'wet' ? plan.wetFood :
    plan.dryFood?.type === 'wet' ? plan.dryFood : undefined;
  const dryFood = food?.type === 'dry' ? food : existingDryFood;
  const wetFood = food?.type === 'wet' ? food : existingWetFood;
  const defaultTimes = defaultMealTimes(plan.mealsPerDay);
  const primary = getPrimaryPlanFood(plan);
  const chosen = getSavedRationInputs(plan);
  return {
    foodType: plan.foodType === 'mixed' || food?.type === 'barf' ? plan.foodType : food?.type ?? plan.foodType,
    dryFood,
    wetFood,
    manufacturerGramsPerDay: food ? retainManufacturerPortion(primary, food, chosen.manufacturerGramsPerDay) : chosen.manufacturerGramsPerDay,
    manualGramsPerDay: food ? retainManualPortion(primary, food, chosen.manualGramsPerDay) : chosen.manualGramsPerDay,
    dryEnergy: String(getFoodKcalPerKg(dryFood) ?? ''),
    wetEnergy: String(getFoodKcalPerKg(wetFood) ?? ''),
    mixedDryPct: Number.isFinite(plan.mixedDryPct) ? plan.mixedDryPct : 50,
    mealsPerDay: defaultTimes.length,
    mealTimes: defaultTimes.map((time, index) => plan.mealTimes[index] || time),
  };
}

function readEnergy(energy: string): number | undefined {
  const value = energy.trim();
  if (!value) return undefined;
  return /^\d+(?:[.,]\d+)?$/.test(value) ? Number(value.replace(',', '.')) : NaN;
}

function updateLabelEnergy(food: FoodItem | undefined, energy: number | undefined): FoodItem | undefined {
  if (!food || getFoodKcalPerKg(food) === energy) return food;

  const ficha = food.fichaNutricional?.coincidenciaEstado === 'verificado' ? food.fichaNutricional : undefined;
  return {
    ...food,
    kcalPerKg: energy ?? 0,
    kcalPerCup: undefined,
    kcalPerCan: undefined,
    labelStatus: energy === undefined ? 'unconfirmed' : 'user_confirmed_label',
    fichaNutricional: {
      ...ficha,
      proteina: getEffectiveNutrientField(food, 'proteina'),
      grasa: getEffectiveNutrientField(food, 'grasa'),
      fibra: getEffectiveNutrientField(food, 'fibra'),
      humedad: getEffectiveNutrientField(food, 'humedad'),
      cenizas: getEffectiveNutrientField(food, 'cenizas'),
      carbohidratos: getEffectiveNutrientField(food, 'carbohidratos'),
      coincidenciaEstado: 'verificado',
      kcalPerKg: energy === undefined ? undefined : {
        valor: energy,
        unidadOriginal: 'kcal/kg',
        baseMedicion: 'tal_como_se_vende',
        calificador: 'tipico',
        nota: 'Energía indicada en la etiqueta por el usuario',
        source: { name: 'Etiqueta confirmada por el usuario', observedAt: new Date().toISOString() },
      },
    },
  };
}

type AdjustmentPreview = { plan: FeedingPlan } | { error: 'schedule' | 'mealCount' | 'formula' | 'density' | 'guide' };

export function previewFeedingPlanAdjustment(
  pet: Pet,
  original: FeedingPlan,
  draft: FeedingPlanAdjustment,
  logs: readonly MealLog[]
): AdjustmentPreview {
  const { mealsPerDay, mealTimes } = draft;
  const formulaEditable = canEditFormula(pet, original);
  const minimum = formulaEditable ? minimumMealCount(logs) : original.mealsPerDay;
  if (!Number.isInteger(mealsPerDay) || mealsPerDay < minimum || mealsPerDay > 6 ||
      (!formulaEditable && mealsPerDay !== original.mealsPerDay)) {
    return { error: 'mealCount' };
  }
  if (mealTimes.length !== mealsPerDay || mealTimes.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return { error: 'schedule' };
  }

  const foodKcal = original.foodMerKcal ??
    (original.kcalPerMeal > 0 ? Math.min(original.mer, original.kcalPerMeal * original.mealsPerDay) : original.mer);
  const schedule = {
    mealsPerDay,
    mealTimes: [...mealTimes],
    scheduleConfigured: true,
    kcalPerMeal: original.kcalPerMeal > 0 ? Math.round(foodKcal / mealsPerDay) : 0,
  };

  if (!formulaEditable) return { plan: { ...original, mealTimes: schedule.mealTimes, scheduleConfigured: true } };

  const includesDry = draft.foodType === 'dry' || draft.foodType === 'mixed';
  const includesWet = draft.foodType === 'wet' || draft.foodType === 'mixed';
  if (
    (!includesDry && !includesWet) ||
    (draft.foodType === 'mixed' && (!Number.isFinite(draft.mixedDryPct) || draft.mixedDryPct < 0 || draft.mixedDryPct > 100)) ||
    (draft.dryFood && (draft.dryFood.species !== pet.species || draft.dryFood.type !== 'dry')) ||
    (draft.wetFood && (draft.wetFood.species !== pet.species || draft.wetFood.type !== 'wet'))
  ) return { error: 'formula' };

  if ((includesDry && !draft.dryFood) || (includesWet && !draft.wetFood)) {
    const previousDraft = createFeedingPlanAdjustment(original);
    const formulaUnchanged = draft.foodType === previousDraft.foodType &&
      (!includesDry || (draft.dryFood === previousDraft.dryFood && draft.dryEnergy === previousDraft.dryEnergy)) &&
      (!includesWet || (draft.wetFood === previousDraft.wetFood && draft.wetEnergy === previousDraft.wetEnergy)) &&
      (draft.foodType !== 'mixed' || draft.mixedDryPct === previousDraft.mixedDryPct);
    return !original.rationConfirmed && formulaUnchanged
      ? { plan: { ...original, ...schedule } }
      : { error: 'formula' };
  }

  const dryEnergy = includesDry ? readEnergy(draft.dryEnergy) : undefined;
  const wetEnergy = includesWet ? readEnergy(draft.wetEnergy) : undefined;
  if ([dryEnergy, wetEnergy].some((energy) => energy !== undefined && (!Number.isFinite(energy) || energy <= 0))) {
    return { error: 'density' };
  }
  const dryFood = includesDry ? updateLabelEnergy(draft.dryFood, dryEnergy) : original.dryFood;
  const wetFood = includesWet ? updateLabelEnergy(draft.wetFood, wetEnergy) : original.wetFood;
  const primaryFood = draft.foodType === 'wet' ? wetFood : dryFood;
  const goal = original.goal ?? 'maintain';
  const singleFood = draft.foodType === 'mixed' ? undefined : primaryFood;
  const needsGrams = singleFood && getFoodKcalPerKg(singleFood) === undefined;
  const guideGrams = needsGrams ? draft.manufacturerGramsPerDay : undefined;
  const range = getApplicableFeedingRange(singleFood, pet, goal);
  if (guideGrams !== undefined && (!range || !isValidDailyGrams(guideGrams) ||
      guideGrams < range.minGrams || guideGrams > range.maxGrams)) return { error: 'guide' };
  const manualGrams = needsGrams && !range ? draft.manualGramsPerDay : undefined;
  if (manualGrams !== undefined && (!canUseManualRation(singleFood, pet, goal) || !isValidDailyGrams(manualGrams))) {
    return { error: 'guide' };
  }
  const primaryChanged = original.foodId !== primaryFood?.id;
  const bagWeightKg = primaryChanged ? primaryFood?.bagSizeKg : primaryFood?.bagSizeKg ?? original.bagWeightKg;
  const updated: FeedingPlan = {
    ...original,
    ...schedule,
    rationSource: guideGrams !== undefined ? 'manufacturer_adjusted' : undefined,
    manufacturerGramsPerDay: guideGrams,
    manualGramsPerDay: manualGrams,
    foodType: draft.foodType,
    dryFood,
    wetFood,
    mixedDryPct: draft.mixedDryPct,
    mixedWetPct: 100 - draft.mixedDryPct,
    foodId: primaryFood?.id ?? original.foodId,
    foodBrand: primaryFood?.brand ?? original.foodBrand,
    foodName: primaryFood?.name ?? original.foodName,
    bagWeightKg,
    ...(primaryChanged || bagWeightKg !== original.bagWeightKg
      ? { bagPriceCop: undefined, dailyCostCop: undefined, monthlyCostCop: undefined }
      : {}),
  };

  const rationChanged = range !== undefined || manualGrams !== undefined ||
    updated.manufacturerGramsPerDay !== original.manufacturerGramsPerDay || manualGrams !== original.manualGramsPerDay || updated.foodType !== original.foodType || primaryChanged ||
    (draft.foodType === 'mixed' && draft.mixedDryPct !== (original.mixedDryPct ?? 50)) ||
    (includesDry && (dryFood?.id !== original.dryFood?.id || dryEnergy !== getFoodKcalPerKg(original.dryFood))) ||
    (includesWet && (wetFood?.id !== original.wetFood?.id || wetEnergy !== getFoodKcalPerKg(original.wetFood)));
  if (rationChanged) return { plan: recalculatePlanForPet(pet, { ...updated, foodMerKcal: foodKcal }) };
  return { plan: { ...updated, rationSource: original.rationSource, gramsPerMeal: getPlannedMeals(updated)[0]?.grams ?? 0 } };
}
