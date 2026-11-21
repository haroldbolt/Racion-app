import type { FeedingPlan, FoodCostEntry, MealLog, TreatLog } from '../types';
import { canonicalFormulaName, getPlanCostSummary, sameFormulaName } from './foodCosts';
import { localDateKey } from './localDate';

type FoodIdentity = { foodId?: string; sourceFoodId?: string; foodName: string; brand?: string };
export interface StockBalance {
  key: string;
  foodName: string;
  petIds: string[];
  remainingGrams: number;
  servedGrams: number;
  runsOut?: string;
}

function matchesFood(left: FoodIdentity, right: FoodIdentity) {
  const sameId = Boolean((left.sourceFoodId && left.sourceFoodId === right.sourceFoodId) || (left.foodId && left.foodId === right.foodId));
  if (!sameId) return false;
  // Older diary entries may have only a formula name and its original id.
  if (!left.brand || !right.brand) return left.foodName === right.foodName;
  return sameFormulaName({brand:left.brand, name:left.foodName, sourceFoodId:left.sourceFoodId},
    {brand:right.brand, name:right.foodName, sourceFoodId:right.sourceFoodId});
}

/** Allocate each recorded serving once, using the oldest open matching purchase for that pet. */
export function getStockBalances(purchases: FoodCostEntry[], logs: MealLog[], plans: FeedingPlan[], today = localDateKey(), treats: TreatLog[] = []): StockBalance[] {
  const groups = new Map<string, StockBalance>();
  const lots = purchases.filter(p => p.openedOn && p.openedOn <= today && p.bagSizeKg > 0)
    .sort((a, b) => a.openedOn!.localeCompare(b.openedOn!) || a.createdAt.localeCompare(b.createdAt))
    .map(p => {
      const petIds = [...new Set([p.petId, ...(p.sharedWithPetIds ?? [])])].sort();
      const key = JSON.stringify([p.sourceFoodId || p.foodId, canonicalFormulaName({brand:p.foodBrand, name:p.foodName, sourceFoodId:p.sourceFoodId}), petIds]);
      if (!groups.has(key)) groups.set(key, { key, foodName: p.foodBrand + ' ' + p.foodName, petIds,
        remainingGrams: 0, servedGrams: 0 });
      return { purchase: p, group: groups.get(key)!, grams: p.bagSizeKg * 1000 };
    });
  if (!lots.length) return [];
  const eligible = (petId: string, food: FoodIdentity, date: string) => lots.filter(lot =>
    lot.grams > 0 && lot.purchase.openedOn! <= date && lot.group.petIds.includes(petId) && matchesFood({...lot.purchase, brand:lot.purchase.foodBrand}, food));
  const meals = [...logs.filter(log => log.completed && log.date <= today),
    ...treats.filter(treat => treat.date <= today && treat.nutritionComponent).map(treat => ({
      petId: treat.petId, date: treat.date, mealTime: treat.loggedAt.slice(11,16),
      mixedComponents: [treat.nutritionComponent!],
    }))].sort((a, b) => a.date.localeCompare(b.date) || a.mealTime.localeCompare(b.mealTime));
  for (const meal of meals) {
    for (const component of meal.mixedComponents ?? []) {
      let grams = component.gramsFed;
      if (!Number.isFinite(grams) || grams <= 0) continue;
      for (const lot of eligible(meal.petId, component, meal.date)) {
        const taken = Math.min(grams, lot.grams);
        lot.grams -= taken;
        lot.group.servedGrams += taken;
        grams -= taken;
        if (grams <= 0) break;
      }
    }
  }
  for (const lot of lots) lot.group.remainingGrams += lot.grams;
  // Forecast from the outstanding servings today, then advance to the next empty lot.
  const daily = plans.flatMap(plan => !plan.rationConfirmed || plan.isVetLocked ? [] :
    getPlanCostSummary(plan).components.filter(c => c.gramsPerDay > 0).map(c => ({
      petId: plan.petId, grams: c.gramsPerDay, foodId: c.food.id, sourceFoodId: c.food.sourceFoodId,
      brand: c.food.brand, foodName: c.food.name,
    })));
  const dateAfter = (days: number) => {
    const date = new Date(today + 'T12:00:00');
    date.setDate(date.getDate() + Math.max(0, days));
    return localDateKey(date);
  };
  const todayMeals = meals.filter(log => log.date === today);
  for (const component of daily) {
    const served = todayMeals.filter(log => log.petId === component.petId).flatMap(log => log.mixedComponents ?? [])
      .filter(c => matchesFood(c, component))
      .reduce((sum, c) => sum + c.gramsFed, 0);
    let remaining = Math.max(0, component.grams - served);
    for (const lot of eligible(component.petId, component, today)) {
      const take = Math.min(remaining, lot.grams);
      lot.grams -= take;
      remaining -= take;
      if (!remaining) break;
    }
  }
  for (const lot of lots) if (lot.grams === 0) lot.group.runsOut = today;
  let elapsed = 0;
  for (let i = 0; i < lots.length; i++) {
    const rates = new Map<typeof lots[number], number>();
    for (const item of daily) {
      const first = eligible(item.petId, item, today)[0];
      if (first) rates.set(first, (rates.get(first) ?? 0) + item.grams);
    }
    if (!rates.size) break;
    const span = Math.min(...Array.from(rates, ([lot, rate]) => lot.grams / rate));
    elapsed += span;
    for (const [lot, rate] of rates) {
      lot.grams = Math.max(0, lot.grams - span * rate);
      if (lot.grams < 0.000001) {
        lot.grams = 0;
        lot.group.runsOut = dateAfter(Math.ceil(elapsed - 0.0000001));
      }
    }
  }
  for (const lot of lots) if (lot.grams > 0) lot.group.runsOut = undefined;
  return [...groups.values()];
}
