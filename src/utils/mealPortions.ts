import type { FeedingPlan, FoodItem, MealLog, MealMixedComponent } from '../types';

export interface PlannedMealPortion {
  grams: number;
  dryGrams?: number;
  wetGrams?: number;
}

function positive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getFoodKcalPerKg(food?: FoodItem): number | undefined {
  if (!food || food.labelStatus === 'unconfirmed') return undefined;
  const label = food.fichaNutricional?.kcalPerKg;
  if (label) {
    return label.baseMedicion === 'tal_como_se_vende' && positive(label.valor)
      ? label.valor
      : undefined;
  }
  return positive(food.kcalPerKg) ? food.kcalPerKg : undefined;
}

/** Distribute grams as evenly as possible, without losing or adding grams. */
export function distributeWholeGrams(grams: number, meals: number, offset = 0): number[] {
  const total = positive(grams) ? Math.round(grams) : 0;
  const count = positive(meals) ? Math.max(1, Math.trunc(meals)) : 1;
  const base = Math.floor(total / count);
  const extra = total % count;
  return Array.from({ length: count }, (_, index) =>
    base + ((index - (offset % count) + count) % count < extra ? 1 : 0)
  );
}

/** The recipe percentage is a share of energy, converted to mass using both labels. */
export function getMixedMassFraction(
  plan: Pick<FeedingPlan, 'mixedDryPct' | 'dryFood' | 'wetFood'>
): number | undefined {
  const dryDensity = getFoodKcalPerKg(plan.dryFood);
  const wetDensity = getFoodKcalPerKg(plan.wetFood);
  if (!dryDensity || !wetDensity) return undefined;
  const dryShare = Number.isFinite(plan.mixedDryPct)
    ? Math.min(1, Math.max(0, plan.mixedDryPct / 100))
    : 0.5;
  const dryMass = dryShare / dryDensity;
  return dryMass / (dryMass + (1 - dryShare) / wetDensity);
}

export function splitMixedPortion(
  plan: FeedingPlan,
  grams: number
): { dryGrams: number; wetGrams: number } | undefined {
  const total = positive(grams) ? grams : 0;
  const savedDry = plan.dryGramsPerDay;
  const savedWet = plan.wetGramsPerDay;
  const hasSavedComponents = typeof savedDry === 'number' && typeof savedWet === 'number' &&
    savedDry >= 0 && savedWet >= 0 && positive(plan.gramsPerDay) && savedDry + savedWet === plan.gramsPerDay;
  const massFraction = hasSavedComponents ? savedDry / plan.gramsPerDay : getMixedMassFraction(plan);
  if (massFraction === undefined) return undefined;
  const dryGrams = Math.min(total, Math.round(total * massFraction));
  return { dryGrams, wetGrams: total - dryGrams };
}

export function getPlannedMeals(plan: FeedingPlan, trainingGrams = 0): PlannedMealPortion[] {
  const count = positive(plan.mealsPerDay) ? Math.min(6, Math.max(1, Math.trunc(plan.mealsPerDay))) : 2;
  const total = plan.rationConfirmed && positive(plan.gramsPerDay) ? plan.gramsPerDay : 0;
  if (plan.isVetLocked && total > 0) {
    return Array.from({ length: count }, () => ({ grams: total / count }));
  }
  const totalGrams = Math.round(total);
  const available = Math.max(0, totalGrams - (positive(trainingGrams) ? Math.round(trainingGrams) : 0));

  if (plan.foodType === 'mixed') {
    const savedDry = plan.dryGramsPerDay;
    const savedWet = plan.wetGramsPerDay;
    const components =
      typeof savedDry === 'number' && typeof savedWet === 'number' &&
      savedDry >= 0 && savedWet >= 0 && savedDry + savedWet === totalGrams
        ? { dryGrams: savedDry, wetGrams: savedWet }
        : splitMixedPortion(plan, totalGrams);
    if (components) {
      const dry = totalGrams > 0
        ? components.dryGrams - Math.round((totalGrams - available) * components.dryGrams / totalGrams)
        : 0;
      const dryMeals = distributeWholeGrams(dry, count);
      // Stagger the remainders so mixed portions are as even as the whole-gram total.
      const wetMeals = distributeWholeGrams(available - dry, count, dry % count);
      return dryMeals.map((dryGrams, index) => ({
        grams: dryGrams + wetMeals[index],
        dryGrams,
        wetGrams: wetMeals[index],
      }));
    }
  }

  return distributeWholeGrams(available, count).map((grams) => ({ grams }));
}

export function getPrimaryPlanFood(plan?: FeedingPlan): FoodItem | undefined {
  if (!plan) return undefined;
  if (plan.foodType === 'wet') return plan.wetFood ?? (plan.dryFood?.type === 'wet' ? plan.dryFood : undefined);
  if (plan.foodType === 'dry') return plan.dryFood ?? (plan.wetFood?.type === 'dry' ? plan.wetFood : undefined);
  return plan.dryFood ?? plan.wetFood;
}

export function getComponentPlanFood(component: MealMixedComponent, plan?: FeedingPlan): FoodItem | undefined {
  if (plan?.isVetLocked) return undefined;
  const food = component.role === 'dry' ? plan?.dryFood :
    component.role === 'wet' ? plan?.wetFood : getPrimaryPlanFood(plan);
  return food && (component.foodId ? food.id === component.foodId : food.name === component.foodName)
    ? food
    : undefined;
}

export function getPlannedMealComponents(
  plan: FeedingPlan,
  portion: PlannedMealPortion,
  actualGrams = portion.grams
): MealMixedComponent[] | undefined {
  const gramsFed = positive(actualGrams) ? actualGrams : 0;
  if (plan.isVetLocked && plan.rationConfirmed && positive(plan.gramsPerDay)) {
    return [{
      foodName: plan.foodName,
      role: 'main',
      gramsPlanned: portion.grams,
      gramsFed,
      kcalPerKg: (plan.foodMerKcal ?? plan.mer) * 1000 / plan.gramsPerDay,
    }];
  }

  function snapshot(food: FoodItem, role: MealMixedComponent['role'], planned: number, fed: number): MealMixedComponent {
    const knownLabel = food.labelStatus !== 'unconfirmed';
    return {
      foodId: food.id,
      foodName: food.name,
      foodLabelStatus: food.labelStatus ?? null,
      role,
      gramsPlanned: planned,
      gramsFed: fed,
      kcalPerKg: getFoodKcalPerKg(food) ?? 0,
      proteinPct: knownLabel ? food.proteinPct : undefined,
      fatPct: knownLabel ? food.fatPct : undefined,
      fiberPct: knownLabel ? food.fiberPct : undefined,
      moisturePct: knownLabel ? food.moisturePct : undefined,
      ashPct: knownLabel ? food.ashPct : undefined,
      carbsPct: knownLabel ? food.carbsPct : undefined,
      fichaNutricional: knownLabel || food.fichaNutricional?.coincidenciaEstado === 'verificado'
        ? food.fichaNutricional
        : undefined,
    };
  }

  if (plan.foodType === 'mixed' && plan.dryFood && plan.wetFood) {
    const planned = portion.dryGrams !== undefined && portion.wetGrams !== undefined
      ? { dryGrams: portion.dryGrams, wetGrams: portion.wetGrams }
      : splitMixedPortion(plan, portion.grams);
    const actual = gramsFed === portion.grams ? planned : splitMixedPortion(plan, gramsFed);
    return planned && actual ? [
      snapshot(plan.dryFood, 'dry', planned.dryGrams, actual.dryGrams),
      snapshot(plan.wetFood, 'wet', planned.wetGrams, actual.wetGrams),
    ] : undefined;
  }

  const food = getPrimaryPlanFood(plan);
  return food ? [snapshot(food, 'main', portion.grams, gramsFed)] : undefined;
}

export function getPlanFoodKcalForGrams(plan: FeedingPlan | undefined, grams: number): number {
  if (!plan || !positive(grams)) return 0;
  if (plan.isVetLocked) {
    const prescribedKcal = plan.foodMerKcal ?? plan.mer;
    return plan.rationConfirmed && positive(plan.gramsPerDay) && positive(prescribedKcal)
      ? grams * prescribedKcal / plan.gramsPerDay
      : 0;
  }
  if (plan.foodType === 'mixed') {
    const portions = splitMixedPortion(plan, grams);
    const dryDensity = getFoodKcalPerKg(plan.dryFood);
    const wetDensity = getFoodKcalPerKg(plan.wetFood);
    return portions && dryDensity && wetDensity
      ? (portions.dryGrams * dryDensity + portions.wetGrams * wetDensity) / 1000
      : 0;
  }
  return grams * (getFoodKcalPerKg(getPrimaryPlanFood(plan)) ?? 0) / 1000;
}

type LoggedPortion = Pick<MealLog, 'mealIndex' | 'gramsFed' | 'plannedGrams' | 'mixedComponents'>;

export function getLoggedMealKcal(log: LoggedPortion, plan?: FeedingPlan): number {
  if (log.mixedComponents?.length) {
    return log.mixedComponents.reduce((total, component) => {
      const density = component.kcalPerKg ?? getFoodKcalPerKg(getComponentPlanFood(component, plan));
      return total + (positive(density) && positive(component.gramsFed) ? component.gramsFed * density / 1000 : 0);
    }, 0);
  }
  const grams = log.gramsFed ?? log.plannedGrams ?? (plan ? getPlannedMeals(plan)[log.mealIndex]?.grams : 0);
  return getPlanFoodKcalForGrams(plan, grams ?? 0);
}
