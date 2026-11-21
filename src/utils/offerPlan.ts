import type { FeedingPlan, FoodItem, FoodPriceBasis, Pet } from '../types';
import { recalculatePlanForPet } from './calculator';
import { sameFoodIdentity, withPurchasedPackage, withPlanCosts } from './foodCosts';
import { getFoodKcalPerKg, getPrimaryPlanFood } from './mealPortions';

/** Preview the exact package, preserving the other component of an existing mixed plan. */
export function previewFoodChoice(pet: Pet, current: FeedingPlan, food: FoodItem, price?: FoodPriceBasis): FeedingPlan {
  const packageKg = price?.packageKg ?? food.bagSizeKg;
  const existing = [current.dryFood, current.wetFood].find(item => item && sameFoodIdentity(item, food));
  if (existing && (current.foodType === 'mixed' || existing === getPrimaryPlanFood(current))) {
    const next = packageKg ? withPurchasedPackage(current, food, packageKg) : current;
    // A price selection changes only the package. An explicit formula selection can
    // refresh its published composition, while preserving an owner-confirmed label.
    const refresh = !price && existing.labelStatus !== 'user_confirmed_label' &&
      food.labelStatus === 'verified_manufacturer';
    const update = (component?: FoodItem) => {
      if (!component || !sameFoodIdentity(component, food)) return component;
      return { ...component, ...(refresh ? food : {}), id: component.id, bagSizeKg: packageKg ?? component.bagSizeKg,
        priceBasis: price ?? food.priceBasis ?? component.priceBasis,
        buyUrl: price?.sourceUrl ?? food.buyUrl ?? component.buyUrl };
    };
    const proposed = { ...next, dryFood: update(next.dryFood), wetFood: update(next.wetFood) };
    return refresh && (getFoodKcalPerKg(existing) !== getFoodKcalPerKg(food) || current.manufacturerGramsPerDay)
      ? recalculatePlanForPet(pet, proposed) : withPlanCosts(proposed);
  }
  const candidate = { ...food, bagSizeKg: packageKg, priceBasis: price ?? food.priceBasis,
    barcode: packageKg === food.bagSizeKg ? food.barcode : undefined };
  return recalculatePlanForPet(pet, {
    ...current, foodId: food.id, foodName: food.name, foodBrand: food.brand, foodType: food.type,
    dryFood: food.type === 'wet' ? undefined : candidate, wetFood: food.type === 'wet' ? candidate : undefined,
    manufacturerGramsPerDay: undefined, bagWeightKg: packageKg, bagPriceCop: undefined,
    dailyCostCop: undefined, monthlyCostCop: undefined,
  });
}
