import type { FeedingPlan, FoodCostEntry, FoodItem, FoodPriceBasis } from '../types';
import { getPlannedMeals, getPrimaryPlanFood } from './mealPortions';

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const sameWeight = (left: number, right: number) => Math.abs(left - right) < 0.000001;
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();
const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

function productUrl(value?: string): string | undefined {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname !== '/'
      ? `${url.origin}${url.pathname.replace(/\/$/, '')}` : undefined;
  } catch { return undefined; }
}

type FormulaName = { brand?: string; name: string; sourceFoodId?: string };
const isLaiaProduct = (id?: string) => /^online_laia_\d+$/.test(id || '');

/** Older Laia records included the bag sizes and sales description in the formula title.
 * Keep that equivalence strictly scoped to one merchant product id. */
export function canonicalFormulaName({brand, name, sourceFoodId}: FormulaName): string {
  const title = (brand ?? '') + ' ' + name;
  return normalized(isLaiaProduct(sourceFoodId)
    ? title.replace(/\s+[–—|-]\s+(?:alimento|concentrado|croquetas)\b.*$/i, '') : title);
}

export function sameFormulaName(left: FormulaName, right: FormulaName): boolean {
  if (normalized(left.brand ?? '') === normalized(right.brand ?? '') && normalized(left.name) === normalized(right.name)) return true;
  return Boolean(left.sourceFoodId && left.sourceFoodId === right.sourceFoodId && isLaiaProduct(left.sourceFoodId) &&
    canonicalFormulaName(left) === canonicalFormulaName(right));
}

export function sameFoodIdentity(left: FoodItem, right: FoodItem): boolean {
  if (left.species !== right.species || left.type !== right.type || !sameFormulaName(left, right)) return false;
  const leftUrl = productUrl(left.buyUrl ?? left.fichaNutricional?.fuenteUrl);
  const rightUrl = productUrl(right.buyUrl ?? right.fichaNutricional?.fuenteUrl);
  return left.id === right.id || Boolean(left.sourceFoodId && left.sourceFoodId === right.sourceFoodId) || Boolean(leftUrl && leftUrl === rightUrl);
}

export function foodPurchaseMatches(purchase: FoodCostEntry, food: FoodItem, packageKg?: number): boolean {
  const formula = sameFormulaName({brand:purchase.foodBrand, name:purchase.foodName, sourceFoodId:purchase.sourceFoodId}, food);
  const purchaseUrl = productUrl(purchase.foodSourceUrl);
  const foodUrl = productUrl(food.buyUrl ?? food.fichaNutricional?.fuenteUrl);
  const identity = formula && (!purchase.foodId || purchase.foodId === food.id ||
    Boolean(purchase.sourceFoodId && purchase.sourceFoodId === food.sourceFoodId) || Boolean(purchaseUrl && purchaseUrl === foodUrl));
  const quantity = positive(purchase.quantity) ? purchase.quantity : 1;
  return identity && purchase.foodType === food.type && positive(purchase.bagSizeKg) && positive(purchase.pricePaidCop) &&
    (!positive(packageKg) || sameWeight(purchase.bagSizeKg / quantity, packageKg));
}

export function getPricePerGram(basis?: FoodPriceBasis): number | undefined {
  if (!basis || !positive(basis.packageKg) || !positive(basis.priceCop)) return undefined;
  if (basis.includeShipping && !(typeof basis.shippingCop === 'number' && Number.isFinite(basis.shippingCop) && basis.shippingCop >= 0)) return undefined;
  return (basis.priceCop + (basis.includeShipping ? basis.shippingCop! : 0)) / (basis.packageKg * 1000);
}

export function resolveFoodPrice(food: FoodItem, packageKg?: number, purchases: readonly FoodCostEntry[] = []): FoodPriceBasis | undefined {
  const selectedKg = positive(packageKg) ? packageKg : food.bagSizeKg;
  if (!positive(selectedKg)) return undefined;
  const candidates: FoodPriceBasis[] = [food.priceBasis, ...(food.packagePrices ?? [])]
    .filter((basis): basis is FoodPriceBasis => Boolean(basis && getPricePerGram(basis) !== undefined &&
      (!positive(selectedKg) || sameWeight(basis.packageKg, selectedKg))));
  for (const purchase of purchases) {
    if (!foodPurchaseMatches(purchase, food, selectedKg)) continue;
    candidates.push({
      packageKg: purchase.bagSizeKg,
      priceCop: purchase.pricePaidCop,
      source: purchase.receiptPhotoUrl ? 'receipt' : 'manual',
      observedAt: purchase.createdAt || purchase.date,
      storeName: purchase.storeName,
    });
  }
  return candidates.sort((a, b) => timestamp(b.selectedAt || b.observedAt) - timestamp(a.selectedAt || a.observedAt))[0];
}

export interface FoodCostComponent {
  food: FoodItem;
  role: 'dry' | 'wet' | 'main';
  gramsPerDay: number;
  packageKg?: number;
  basis?: FoodPriceBasis;
  costPerGramCop?: number;
  costPerDayCop?: number;
}

export interface PlanCostSummary {
  components: FoodCostComponent[];
  costPerDayCop?: number;
  costPerMonthCop?: number;
  meals: Array<{ index: number; time: string; grams: number; costCop?: number; partial: boolean }>;
  partial: boolean;
  estimated: boolean;
}

/** All costs use the plan's exact portions. A missing component stays visibly partial. */
export function getPlanCostSummary(plan: FeedingPlan | undefined, purchases: readonly FoodCostEntry[] = []): PlanCostSummary {
  if (!plan) return { components: [], meals: [], partial: true, estimated: false };
  const portions = getPlannedMeals(plan);
  const primary = getPrimaryPlanFood(plan);
  const scopedPurchases = purchases.filter((purchase) => purchase.petId === plan.petId);
  const descriptors: Array<{ food?: FoodItem; role: FoodCostComponent['role']; grams: number }> = plan.foodType === 'mixed'
    ? [
      { food: plan.dryFood, role: 'dry', grams: portions.reduce((sum, meal) => sum + (meal.dryGrams ?? 0), 0) },
      { food: plan.wetFood, role: 'wet', grams: portions.reduce((sum, meal) => sum + (meal.wetGrams ?? 0), 0) },
    ]
    : [{ food: primary, role: 'main', grams: portions.reduce((sum, meal) => sum + meal.grams, 0) }];
  const components = descriptors.flatMap(({ food, role, grams }): FoodCostComponent[] => {
    if (!food) return [];
    const packageKg = food === primary ? plan.bagWeightKg ?? food.bagSizeKg : food.bagSizeKg;
    const basis = resolveFoodPrice(food, packageKg, scopedPurchases);
    const costPerGramCop = getPricePerGram(basis);
    return [{ food, role, gramsPerDay: grams, packageKg, basis, costPerGramCop,
      costPerDayCop: plan.rationConfirmed && positive(grams) && costPerGramCop !== undefined ? costPerGramCop * grams : undefined }];
  });
  const hasRation = Boolean(plan.rationConfirmed && positive(plan.gramsPerDay));
  const partial = !hasRation || descriptors.some(({ food, grams }) => !food ||
    (grams > 0 && components.find((component) => component.food === food)?.costPerGramCop === undefined)) ||
    (plan.foodType === 'mixed' && portions.some((meal) => meal.grams > 0 && (meal.dryGrams === undefined || meal.wetGrams === undefined)));
  const priced = components.filter((component) => component.costPerDayCop !== undefined);
  const costPerDayCop = hasRation && priced.length ? priced.reduce((sum, component) => sum + component.costPerDayCop!, 0) : undefined;
  const meals = portions.map((meal, index) => {
    const values = components.map((component) => {
      const grams = component.role === 'dry' ? meal.dryGrams : component.role === 'wet' ? meal.wetGrams : meal.grams;
      return grams !== undefined && component.costPerGramCop !== undefined ? grams * component.costPerGramCop : undefined;
    }).filter((value): value is number => value !== undefined);
    return { index, time: plan.mealTimes[index] ?? '', grams: meal.grams,
      costCop: hasRation && values.length ? values.reduce((sum, value) => sum + value, 0) : undefined, partial };
  });
  return { components, costPerDayCop, costPerMonthCop: costPerDayCop === undefined ? undefined : costPerDayCop * 30.5,
    meals, partial, estimated: components.some((component) => component.basis?.source === 'online') };
}

export function withPlanCosts(plan: FeedingPlan, purchases: readonly FoodCostEntry[] = []): FeedingPlan {
  const summary = getPlanCostSummary(plan, purchases);
  const primary = summary.components.find((component) => component.food.id === plan.foodId);
  const price = primary?.costPerGramCop;
  const bagWeightKg = primary?.packageKg;
  return { ...plan,
    bagPriceCop: price !== undefined && positive(bagWeightKg) ? price * bagWeightKg * 1000 : undefined,
    dailyCostCop: summary.partial ? undefined : summary.costPerDayCop,
    monthlyCostCop: summary.partial ? undefined : summary.costPerMonthCop,
  };
}

/** Only an explicitly confirmed purchase may change the package; portions and labels stay intact. */
export function withPurchasedPackage(plan: FeedingPlan, food: FoodItem, packageKg: number): FeedingPlan {
  if (!positive(packageKg) || plan.isVetLocked || ![plan.dryFood, plan.wetFood].some((item) => item && sameFoodIdentity(item, food))) return plan;
  const primary = getPrimaryPlanFood(plan);
  const isPrimary = Boolean(primary && sameFoodIdentity(primary, food));
  const component = getPlanCostSummary(plan).components.find((item) => sameFoodIdentity(item.food, food));
  const replace = (item?: FoodItem): FoodItem | undefined => {
    if (!item || !sameFoodIdentity(item, food)) return item;
    const priceBasis = item.priceBasis?.packageKg === packageKg ? item.priceBasis :
      item.packagePrices?.find((basis) => basis.packageKg === packageKg);
    let buyUrl = item.buyUrl;
    if (priceBasis?.sourceUrl) buyUrl = priceBasis.sourceUrl;
    else if (item.bagSizeKg !== packageKg && buyUrl) {
      try { const base = new URL(buyUrl); base.searchParams.delete('variant'); buyUrl = base.href; }
      catch { buyUrl = undefined; }
    }
    return { ...item, bagSizeKg: packageKg, buyUrl, priceBasis,
      barcode: item.bagSizeKg === packageKg ? item.barcode : undefined };
  };
  return withPlanCosts({ ...plan, dryFood: replace(plan.dryFood), wetFood: replace(plan.wetFood),
    ...(isPrimary ? { bagWeightKg: packageKg,
      bagDaysRemaining: component?.gramsPerDay ? packageKg * 1000 / component.gramsPerDay : undefined } : {}),
  });
}
