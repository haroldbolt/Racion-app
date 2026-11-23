import type { FeedingPlan, FoodItem, Goal, Pet } from '../types';
import { isPetPuppy } from './petLifeStage';
import { getFoodKcalPerKg, getPrimaryPlanFood } from './mealPortions';
import { assessFoodForPet } from './foodSafety';

function compatibleSingleFood(food: FoodItem, pet: Pet): boolean {
  return food.type !== 'barf' && getFoodKcalPerKg(food) === undefined &&
    !assessFoodForPet(pet, food).some(notice => notice.level === 'mismatch') &&
    pet.dietType !== 'therapeutic' && pet.dietType !== 'barf' && !pet.hasVetGuideline && !pet.vetGuideline?.locked &&
    (!pet.specialState || pet.specialState === 'none') && !pet.restrictions?.length &&
    Number.isFinite(pet.currentWeightKg) && pet.currentWeightKg > 0;
}

/** Support grams down to a hundredth without converting a blank or invalid entry into a suggestion. */
export function isValidDailyGrams(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 &&
    Number.isSafeInteger(Math.round(value * 100)) && Number(value.toFixed(2)) === value;
}

export function hasStoreFeedingGuide(food?: FoodItem): boolean {
  const guide = food?.feedingGuide;
  return Boolean(guide && (guide.sourceType === 'store' ||
    (guide.sourceType === undefined && guide.sourceUrl === food?.storeProductUrl)));
}

export function getSavedRationInputs(plan?: FeedingPlan) {
  // Older plans could save a retailer chart entry as manufacturer-confirmed.
  const retailerSelection = plan && !plan.rationSource && hasStoreFeedingGuide(getPrimaryPlanFood(plan));
  return {
    manufacturerGramsPerDay: plan?.rationSource === 'manufacturer_midpoint' || retailerSelection ? undefined : plan?.manufacturerGramsPerDay,
    manualGramsPerDay: plan?.manualGramsPerDay ?? (retailerSelection ? plan.manufacturerGramsPerDay : undefined),
  };
}

/** Return the range actually published for this food, life stage and body weight. */
export function getApplicableFeedingRange(food: FoodItem | undefined, pet: Pet, goal: Goal) {
  const guide = food?.feedingGuide;
  if (!guide || !food || !(pet.bcs >= 4 && pet.bcs <= 6) || hasStoreFeedingGuide(food) || !compatibleSingleFood(food, pet)) return undefined;

  if (guide.lifeStage === 'kitten') {
    const age = pet.ageMonths ?? (pet.ageYears === undefined ? undefined : pet.ageYears * 12);
    if (pet.species !== 'cat' || goal !== 'growth' || food.lifeStage !== 'kitten' || !food.suitableForGrowth ||
        age === undefined || !Number.isFinite(age) || age < 1 || age >= 12 || !isPetPuppy(pet) ||
        (food.labelStatus !== 'verified_manufacturer' && food.labelStatus !== 'user_confirmed_label')) return undefined;
  } else if (goal !== 'maintain' || food.lifeStage !== 'adult' || isPetPuppy(pet)) return undefined;

  const matches = guide.ranges.filter(({ minWeightKg, maxWeightKg, minGrams, maxGrams }) =>
    [minWeightKg, maxWeightKg, minGrams, maxGrams].every(Number.isFinite) &&
    minGrams > 0 && minGrams <= maxGrams && pet.currentWeightKg >= minWeightKg && pet.currentWeightKg <= maxWeightKg);
  if (matches.length) {
    const minGrams = Math.max(...matches.map(row => row.minGrams));
    const maxGrams = Math.min(...matches.map(row => row.maxGrams));
    return minGrams <= maxGrams ? {minGrams, maxGrams} : undefined;
  }
  const above = guide.aboveWeight;
  if (above && [above.afterKg, above.startGrams, above.gramsPerKg].every(n => Number.isFinite(n) && n > 0) &&
      pet.currentWeightKg > above.afterKg) {
    const grams = Math.round(above.startGrams + (pet.currentWeightKg - above.afterKg) * above.gramsPerKg);
    return {minGrams: grams, maxGrams: grams};
  }
}

export function getSuggestedManufacturerGrams(food: FoodItem | undefined, pet: Pet, goal: Goal): number | undefined {
  const range = getApplicableFeedingRange(food, pet, goal);
  return range && (range.minGrams + range.maxGrams) / 2;
}

export function canUseManualRation(food: FoodItem | undefined, pet: Pet, goal: Goal): boolean {
  return Boolean(food && compatibleSingleFood(food, pet) && !getApplicableFeedingRange(food, pet, goal));
}
