import type { FoodItem, Goal, Pet } from '../types';
import { isPetPuppy } from './petLifeStage';
import { getFoodKcalPerKg } from './mealPortions';

/** Return the range actually published for this food, life stage and body weight. */
export function getApplicableFeedingRange(food: FoodItem | undefined, pet: Pet, goal: Goal) {
  const guide = food?.feedingGuide;
  if (!guide || !food || food.species !== pet.species || getFoodKcalPerKg(food) !== undefined ||
      food.nutritionalUse === 'complementary' || food.nutritionalUse === 'treat' ||
      pet.dietType === 'therapeutic' || pet.dietType === 'barf' || pet.hasVetGuideline || pet.vetGuideline?.locked ||
      (pet.specialState && pet.specialState !== 'none') || pet.restrictions?.length ||
      pet.bcs < 4 || pet.bcs > 6 || !Number.isFinite(pet.currentWeightKg) || pet.currentWeightKg <= 0) return undefined;

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
