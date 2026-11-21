import type { FoodItem, Pet } from '../types';
import { isPetPuppy } from './petLifeStage';
import { getFoodKcalPerKg } from './mealPortions';

/** Adult maintenance feeding guides describe a range in grams, not energy density. */
export function getApplicableFeedingRange(food: FoodItem | undefined, pet: Pet) {
  if (!food?.feedingGuide || food.species !== pet.species || food.lifeStage !== 'adult' ||
      isPetPuppy(pet) || getFoodKcalPerKg(food) !== undefined ||
      food.nutritionalUse === 'complementary' || food.nutritionalUse === 'treat' ||
      pet.dietType === 'therapeutic' || pet.dietType === 'barf' || pet.hasVetGuideline || pet.vetGuideline?.locked ||
      (pet.specialState && pet.specialState !== 'none') || pet.restrictions?.length ||
      pet.bcs < 4 || pet.bcs > 6) return undefined;
  return food.feedingGuide.ranges.find(({ minWeightKg, maxWeightKg, minGrams, maxGrams }) =>
    [minWeightKg, maxWeightKg, minGrams, maxGrams].every(Number.isFinite) &&
    minGrams > 0 && minGrams <= maxGrams &&
    pet.currentWeightKg >= minWeightKg && pet.currentWeightKg <= maxWeightKg);
}
