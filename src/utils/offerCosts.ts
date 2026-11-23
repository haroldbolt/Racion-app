import type { FeedingPlan, FoodCostEntry, FoodItem, Pet } from '../types';
import type { LivePriceOffer } from '../types/livePrices';
import { hasValidVetGuideline } from './calculator';
import { getPlanCostSummary, sameFoodIdentity } from './foodCosts';
import { getPlannedMeals, getPrimaryPlanFood } from './mealPortions';
import { previewFoodChoice } from './offerPlan';

export interface OfferPortions {
  manual?: boolean;
  mixed: boolean;
  meals: { grams: number; time?: string; otherCostCop?: number }[];
}

// Portions follow the formula across retailers. Inventory and purchase identity remain per listing.
function sameManufacturerFormula(left: FoodItem, right: FoodItem): boolean {
  if (left.species !== right.species || left.type !== right.type ||
      left.brand.trim().toLowerCase() !== right.brand.trim().toLowerCase()) return false;
  const productPage = left.manufacturerFormulaUrl ?? right.manufacturerFormulaUrl;
  if (!productPage) return false;
  if (left.manufacturerFormulaName && right.manufacturerFormulaName &&
      left.manufacturerFormulaName !== right.manufacturerFormulaName) return false;
  // An older saved plan can have the verified manufacturer URL but predate the catalogue identifier.
  const verifiedPage = (food: FoodItem) => food.manufacturerFormulaUrl ||
    (food.labelStatus === 'verified_manufacturer' ? food.fichaNutricional?.fuenteUrl : undefined);
  return verifiedPage(left) === productPage && verifiedPage(right) === productPage;
}

/** The compared bag pays for only its own grams, including in a mixed meal. */
export function getOfferPortions(pet: Pet | undefined, plan: FeedingPlan | undefined, food: FoodItem,
  purchases: readonly FoodCostEntry[] = []): OfferPortions | undefined {
  if (!pet || food.species !== pet.species || (plan && pet.id !== plan.petId)) return;
  if (plan?.isVetLocked || pet.vetGuideline?.locked) {
    const order = pet.vetGuideline;
    if (!order || !hasValidVetGuideline(pet)) return;
    // A locked plan can retain an older FoodItem. Read amounts only from the real
    // order when its written brand and formula match the compared food in full.
    const clean = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    const brand = clean(food.brand), name = clean(food.name);
    const fullName = name.startsWith(brand + ' ') ? name : brand + ' ' + name;
    if (!brand || !name || clean(order.prescribedFoodName) !== fullName) return;
    const times = plan?.mealTimes.length === order.mealsPerDay ? plan.mealTimes : [];
    return {mixed:false, meals:Array.from({length:order.mealsPerDay}, (_, i) => ({
      grams:order.prescribedGramsPerMeal, time:times[i],
    }))};
  }
  if (!plan) return;
  const mixed = plan.foodType === 'mixed';
  const matching = (mixed ? [plan.dryFood, plan.wetFood] : [getPrimaryPlanFood(plan)])
    .find(item => item && (sameFoodIdentity(item, food) || sameManufacturerFormula(item, food)));
  const proposed = matching ? plan : previewFoodChoice(pet, plan, food);
  if (!proposed.rationConfirmed || proposed.isVetLocked || !(proposed.gramsPerDay > 0)) return;
  const portions = getPlannedMeals(proposed);
  if (proposed.foodType !== 'mixed') {
    return {mixed:false, meals:portions.map((portion,i) => ({grams:portion.grams, time:proposed.mealTimes[i]}))};
  }

  const isDry = matching === proposed.dryFood;
  const other = getPlanCostSummary(proposed,purchases).components.find(item => item.role === (isDry ? 'wet' : 'dry'));
  const meals: OfferPortions['meals'] = [];
  for (const [i,portion] of portions.entries()) {
    const grams = isDry ? portion.dryGrams : portion.wetGrams;
    const rest = isDry ? portion.wetGrams : portion.dryGrams;
    if (grams === undefined || rest === undefined) return;
    const otherCostCop = rest === 0 ? 0 : other?.costPerGramCop === undefined ? undefined : rest * other.costPerGramCop;
    meals.push({grams, time:proposed.mealTimes[i], otherCostCop});
  }
  return {mixed:true, meals};
}

export function getOfferCosts(offer: LivePriceOffer, postalCode: string | undefined, portions?: OfferPortions) {
  const inScope = (offer.shippingPostalCode ?? undefined) === postalCode;
  const shippingCop = inScope ? offer.shippingCop : null;
  const totalCop = shippingCop === null ? null : offer.totalCop;
  const pricePerGram = (totalCop ?? offer.productPriceCop) / offer.grams;
  const meals = portions?.meals.map(meal => {
    const costCop = meal.grams * pricePerGram;
    return {...meal, costCop, mixedMealCop:meal.otherCostCop === undefined ? undefined : costCop + meal.otherCostCop};
  });
  return {shippingCop, totalCop, meals};
}
