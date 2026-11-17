import type {
  FeedingPlan,
  FoodItem,
  MealLog,
  MealMixedComponent,
  MeasurementBasis,
  NutrientQualifier,
  NutrientValue,
  NutritionDatasheet,
} from '../types';
import {
  getComponentPlanFood,
  getFoodKcalPerKg,
  getPlannedMeals,
  getPrimaryPlanFood,
  splitMixedPortion,
} from './mealPortions';

const trackedNutrients = ['proteina', 'grasa', 'fibra', 'carbohidratos'] as const;
export type TrackedMealNutrient = typeof trackedNutrients[number];

export interface MealNutrientTotal {
  grams: number | null;
  qualifier?: NutrientQualifier;
  coverage: 'complete' | 'partial' | 'unavailable' | 'empty';
  mixedQualifiers: boolean;
}

export type MealNutrientTotals = Record<TrackedMealNutrient, MealNutrientTotal>;

type PortionNutrient = TrackedMealNutrient | 'humedad' | 'cenizas';
type LabelNutrient = PortionNutrient | 'kcalPerKg';

export interface NutrientPortionComputation {
  key: PortionNutrient | 'energia';
  label: string;
  available: boolean;
  grams?: number;
  kcal?: number;
  qualifier?: NutrientQualifier;
  basis?: MeasurementBasis;
  displayText: string;
}

export interface FoodPortionNutrition {
  foodBrand: string;
  foodName: string;
  gramsServed: number;
  basisNote: string;
  energia: NutrientPortionComputation;
  proteina: NutrientPortionComputation;
  grasa: NutrientPortionComputation;
  fibra: NutrientPortionComputation;
  humedad?: NutrientPortionComputation;
  cenizas?: NutrientPortionComputation;
  carbohidratos?: NutrientPortionComputation;
  missingFields: string[];
}

export interface DailyMealNutritionSummary {
  totalPlannedGrams: number;
  totalServedGrams: number;
  completedMealsCount: number;
  kcalServedTotal: number | null;
  kcalServedPartial: boolean;
  proteinaGramsTotal: number | null;
  proteinaQualifier?: NutrientQualifier;
  proteinaPhrase: string;
  grasaGramsTotal: number | null;
  grasaQualifier?: NutrientQualifier;
  grasaPhrase: string;
  fibraGramsTotal: number | null;
  fibraQualifier?: NutrientQualifier;
  fibraPhrase: string;
  isMixedMealOrDay: boolean;
  isPartialTotal: boolean;
  partialWarning?: string;
  perFoodBreakdown: FoodPortionNutrition[];
  plannedPerFoodBreakdown: FoodPortionNutrition[];
  plannedNutrients: MealNutrientTotals;
  servedNutrients: MealNutrientTotals;
  usesCurrentPlanForLegacyLogs: boolean;
}

const labels: Record<PortionNutrient, string> = {
  proteina: 'Proteína',
  grasa: 'Grasa',
  fibra: 'Fibra cruda',
  carbohidratos: 'Carbohidratos',
  humedad: 'Humedad',
  cenizas: 'Cenizas',
};

const legacyFields: Record<LabelNutrient, keyof Pick<FoodItem,
  'kcalPerKg' | 'proteinPct' | 'fatPct' | 'fiberPct' | 'moisturePct' | 'ashPct' | 'carbsPct'>> = {
  kcalPerKg: 'kcalPerKg',
  proteina: 'proteinPct',
  grasa: 'fatPct',
  fibra: 'fiberPct',
  humedad: 'moisturePct',
  cenizas: 'ashPct',
  carbohidratos: 'carbsPct',
};

/** Rounds once for display, without tightening a guaranteed minimum or maximum. */
export function roundNutrientGrams(grams: number, qualifier: NutrientQualifier = 'tipico'): number {
  // Normalize floating-point residue around a whole tenth before directed rounding.
  const scaled = Number((grams * 10).toPrecision(14));
  if (qualifier === 'minimo') return Math.floor(scaled) / 10;
  if (qualifier === 'maximo') return Math.ceil(scaled) / 10;
  return Math.round(scaled) / 10;
}

export function formatQualifierNutrientPhrase(
  grams: number,
  nutrientLabelLower: string,
  qualifier: NutrientQualifier = 'tipico'
): string {
  const rounded = roundNutrientGrams(grams, qualifier);
  const numStr = String(rounded).replace('.', ',');
  if (qualifier === 'minimo') {
    return `Al menos ${numStr} g de ${nutrientLabelLower} según la etiqueta`;
  }
  if (qualifier === 'maximo') {
    return `Hasta ${numStr} g de ${nutrientLabelLower} según la etiqueta`;
  }
  return `Aprox. ${numStr} g de ${nutrientLabelLower} según la etiqueta`;
}

/** Returns the label value in its original basis, including explicitly declared zero. */
export function getEffectiveNutrientField(
  food: FoodItem | undefined,
  field: LabelNutrient
): NutrientValue | undefined {
  if (!food) return undefined;
  const ficha: NutritionDatasheet | undefined = food.fichaNutricional;
  const value = ficha?.[field];
  const unit = field === 'kcalPerKg' ? 'kcal/kg' : '%';

  if (value) {
    // An unconfirmed calorie density does not invalidate an independently verified nutrient.
    return ficha?.coincidenciaEstado === 'verificado' &&
      Number.isFinite(value.valor) &&
      (field === 'kcalPerKg' ? value.valor > 0 : value.valor >= 0 && value.valor <= 100) &&
      (value.baseMedicion === 'tal_como_se_vende' || value.baseMedicion === 'materia_seca') &&
      (value.calificador === 'tipico' || value.calificador === 'minimo' || value.calificador === 'maximo') &&
      value.unidadOriginal === unit
      ? value
      : undefined;
  }

  if (food.labelStatus === 'unconfirmed' || ficha) return undefined;
  // Older manual cards could fill in default percentages when only kcal/kg were entered.
  if (field !== 'kcalPerKg' && (food.labelStatus === 'user_confirmed_label' || /^(label|custom)_/.test(food.id))) {
    return undefined;
  }
  const raw = food[legacyFields[field]];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0 || (unit === '%' && raw > 100)) {
    return undefined;
  }

  return {
    valor: raw,
    unidadOriginal: unit,
    baseMedicion: 'tal_como_se_vende',
    // The original catalogue did not store guarantee qualifiers for its flat fields.
    calificador: 'tipico',
  };
}

function computeSinglePctNutrient(
  key: PortionNutrient,
  gramsServed: number,
  value?: NutrientValue,
  moisture?: NutrientValue
): NutrientPortionComputation {
  const label = labels[key];
  if (!value) return { key, label, available: false, displayText: 'Sin dato verificado' };

  let basisGrams = gramsServed;
  if (value.baseMedicion === 'materia_seca') {
    // Maximum moisture cannot convert a dry-matter percentage into a typical as-sold percentage.
    // Likewise, typical moisture cannot guarantee a serving-level minimum or maximum.
    if (
      value.calificador !== 'tipico' || moisture?.baseMedicion !== 'tal_como_se_vende' ||
      moisture.calificador !== 'tipico' || moisture.valor >= 100
    ) {
      return {
        key,
        label,
        available: false,
        qualifier: value.calificador,
        basis: value.baseMedicion,
        displayText: 'Sin dato tal como se vende',
      };
    }
    basisGrams *= (100 - moisture.valor) / 100;
  }

  const grams = (basisGrams * value.valor) / 100;
  return {
    key,
    label,
    available: true,
    grams,
    qualifier: value.calificador,
    basis: value.baseMedicion,
    displayText: formatQualifierNutrientPhrase(grams, label.toLowerCase(), value.calificador),
  };
}

export function calculateFoodPortionNutrients(
  food: FoodItem | undefined,
  gramsServed: number,
  fallbackIdentity?: { brand: string; name: string }
): FoodPortionNutrition {
  const safeGrams = nonnegative(gramsServed);
  const kcalField = getEffectiveNutrientField(food, 'kcalPerKg');
  const kcalPerKg = kcalField?.baseMedicion === 'tal_como_se_vende' ? getFoodKcalPerKg(food) : undefined;
  const moisture = getEffectiveNutrientField(food, 'humedad');
  const nutrient = (key: PortionNutrient) =>
    computeSinglePctNutrient(key, safeGrams, getEffectiveNutrientField(food, key), moisture);

  const energia: NutrientPortionComputation = kcalPerKg && safeGrams > 0
    ? {
        key: 'energia',
        label: 'Energía',
        available: true,
        kcal: kcalPerKg * safeGrams / 1000,
        qualifier: kcalField?.calificador,
        basis: kcalField?.baseMedicion,
        displayText: `${Math.round(kcalPerKg * safeGrams / 1000)} kcal`,
      }
    : { key: 'energia', label: 'Energía', available: false, displayText: 'Sin dato verificado' };

  const proteina = nutrient('proteina');
  const grasa = nutrient('grasa');
  const fibra = nutrient('fibra');
  const carbohidratos = nutrient('carbohidratos');
  const humedad = nutrient('humedad');
  const cenizas = nutrient('cenizas');
  const missingFields = [energia, proteina, grasa, fibra, carbohidratos]
    .filter((entry) => !entry.available)
    .map((entry) => entry.label);

  return {
    foodBrand: food?.brand || fallbackIdentity?.brand || 'Alimento',
    foodName: food?.name || fallbackIdentity?.name || 'Sin especificar',
    gramsServed: safeGrams,
    basisNote: 'Tal como se vende',
    energia,
    proteina,
    grasa,
    fibra,
    humedad,
    cenizas,
    carbohidratos,
    missingFields,
  };
}

function nonnegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function snapshotFood(
  comp: MealMixedComponent,
  fallback?: FoodItem
): FoodItem | undefined {
  const hasSnapshot = comp.kcalPerKg !== undefined || comp.proteinPct !== undefined ||
    comp.fatPct !== undefined || comp.fiberPct !== undefined || comp.moisturePct !== undefined ||
    comp.ashPct !== undefined || comp.carbsPct !== undefined || comp.fichaNutricional !== undefined;
  if (!hasSnapshot) return undefined;
  // Preserve the original status on new records. Older records used flat default macros for manual labels.
  const labelStatus = comp.foodLabelStatus === null ? undefined : comp.foodLabelStatus ?? (
    fallback?.labelStatus === 'user_confirmed_label' ? fallback.labelStatus : undefined
  );
  return {
    id: comp.foodId || comp.foodName,
    brand: fallback?.brand || '',
    name: comp.foodName,
    species: fallback?.species || 'dog',
    lifeStage: fallback?.lifeStage || 'adult',
    type: comp.role === 'wet' ? 'wet' : 'dry',
    kcalPerKg: comp.kcalPerKg ?? 0,
    proteinPct: comp.proteinPct ?? 0,
    fatPct: comp.fatPct ?? 0,
    fiberPct: comp.fiberPct ?? 0,
    moisturePct: comp.moisturePct ?? 0,
    ashPct: comp.ashPct,
    carbsPct: comp.carbsPct,
    country: fallback?.country || '',
    labelStatus,
    fichaNutricional: comp.fichaNutricional,
  };
}

type Components = Map<string, { food?: FoodItem; brand: string; name: string; grams: number }>;

function addComponent(components: Components, grams: number, brand: string, name: string, food?: FoodItem) {
  if (nonnegative(grams) === 0) return;
  // Keep distinct versions of a label separate, even if they have the same brand and name.
  const key = JSON.stringify([
    food?.id, brand, name, food?.labelStatus, food?.fichaNutricional,
    ...Object.values(legacyFields).map((field) => food?.[field]),
  ]);
  const previous = components.get(key);
  components.set(key, { food, brand, name, grams: (previous?.grams ?? 0) + grams });
}

function addPlanPortion(
  components: Components,
  plan: FeedingPlan | undefined,
  grams: number,
  fallbackFood?: FoodItem,
  portions?: { dryGrams: number; wetGrams: number }
): boolean {
  if (grams <= 0) return false;
  if (plan?.isVetLocked) {
    const kcalPerKg = plan.rationConfirmed && plan.gramsPerDay > 0
      ? (plan.foodMerKcal ?? plan.mer) * 1000 / plan.gramsPerDay
      : undefined;
    const food = snapshotFood({
      foodName: plan.foodName,
      role: 'main',
      gramsFed: grams,
      gramsPlanned: grams,
      kcalPerKg,
    });
    addComponent(components, grams, 'Pauta veterinaria', plan.foodName, food);
    return Boolean(food);
  }
  if (plan?.foodType === 'mixed') {
    const split = portions ?? splitMixedPortion(plan, grams);
    if (!split) {
      addComponent(components, grams, 'Ración mixta', plan.foodName);
      return false;
    }
    const { dryFood, wetFood } = plan;
    addComponent(components, split.dryGrams, dryFood?.brand ?? 'Seco', dryFood?.name ?? plan.foodName, dryFood);
    addComponent(components, split.wetGrams, wetFood?.brand ?? 'Húmedo', wetFood?.name ?? plan.foodName, wetFood);
    return Boolean((dryFood && split.dryGrams > 0) || (wetFood && split.wetGrams > 0));
  }
  const food = getPrimaryPlanFood(plan) ?? fallbackFood;
  addComponent(components, grams, food?.brand || plan?.foodBrand || 'Alimento habitual', food?.name || plan?.foodName || '', food);
  return Boolean(food);
}

function nutritionBreakdown(components: Components): FoodPortionNutrition[] {
  return Array.from(components.values(), ({ food, grams, brand, name }) =>
    calculateFoodPortionNutrients(food, grams, { brand, name })
  );
}

function sumNutrient(key: TrackedMealNutrient, portions: FoodPortionNutrition[]): MealNutrientTotal {
  const declared = portions
    .map((portion) => portion[key])
    .filter((value): value is NutrientPortionComputation & { grams: number; qualifier: NutrientQualifier } =>
      value?.available === true && value.grams !== undefined && value.qualifier !== undefined
    );
  if (declared.length === 0) {
    return { grams: null, mixedQualifiers: false, coverage: portions.length === 0 ? 'empty' : 'unavailable' };
  }
  const coverage = declared.length === portions.length ? 'complete' : 'partial';
  const qualifier = declared[0].qualifier;
  if (declared.some((value) => value.qualifier !== qualifier)) {
    // A minimum plus a maximum cannot be presented as a guaranteed bound or a typical amount.
    return { grams: null, mixedQualifiers: true, coverage };
  }
  const grams = declared.reduce((sum, value) => sum + value.grams, 0);
  return { grams: roundNutrientGrams(grams, qualifier), qualifier, mixedQualifiers: false, coverage };
}

function summarizeNutrients(portions: FoodPortionNutrition[]): MealNutrientTotals {
  return {
    proteina: sumNutrient('proteina', portions),
    grasa: sumNutrient('grasa', portions),
    fibra: sumNutrient('fibra', portions),
    carbohidratos: sumNutrient('carbohidratos', portions),
  };
}

function formatLegacyTotal(total: MealNutrientTotal, label: string): string {
  if (total.mixedQualifiers) return 'Consulta los valores de cada alimento';
  if (total.grams === null) return 'Sin dato verificado';
  const phrase = formatQualifierNutrientPhrase(total.grams, label, total.qualifier);
  return total.coverage === 'partial' ? `${phrase} (Total parcial)` : phrase;
}

/** Compares the full planned ration with the food recorded in completed meals. */
export function calculateDailyMealNutritionSummary(params: {
  plan?: FeedingPlan;
  mealLogs: MealLog[];
  dryFood?: FoodItem;
  wetFood?: FoodItem;
}): DailyMealNutritionSummary {
  const { plan, mealLogs, dryFood, wetFood } = params;
  const completed = mealLogs.filter((meal) => meal.completed);
  const plannedComponents: Components = new Map();
  const servedComponents: Components = new Map();
  const basePortions = plan ? getPlannedMeals(plan) : [];
  const currentPortions = plan?.trainingRationGramsToday
    ? getPlannedMeals(plan, plan.trainingRationGramsToday)
    : basePortions;
  const fallbackFood = dryFood ?? wetFood;
  let totalPlannedGrams = 0;
  let totalServedGrams = 0;
  let usesCurrentPlanForLegacyLogs = false;

  for (const portion of basePortions) {
    totalPlannedGrams += portion.grams;
    const split = portion.dryGrams !== undefined && portion.wetGrams !== undefined
      ? { dryGrams: portion.dryGrams, wetGrams: portion.wetGrams }
      : undefined;
    addPlanPortion(plannedComponents, plan, portion.grams, fallbackFood, split);
  }

  for (const log of completed) {
    const components = Array.isArray(log.mixedComponents) ? log.mixedComponents : [];
    const componentGrams = components.reduce((total, component) => total + nonnegative(component.gramsFed), 0);
    const recordedAmount = components.length > 0 ? componentGrams : log.plannedGrams ?? currentPortions[log.mealIndex]?.grams ?? 0;
    const served = nonnegative(log.gramsFed ?? recordedAmount);
    totalServedGrams += served;
    if (!plan?.rationConfirmed) totalPlannedGrams += nonnegative(log.plannedGrams ?? 0);

    if (components.length > 0) {
      if (componentGrams - served > 0.001) {
        addComponent(servedComponents, served, 'Alimento', 'Sin especificar');
        continue;
      }
      for (const component of components) {
        const grams = nonnegative(component.gramsFed);
        if (grams === 0) continue;
        const fallback = getComponentPlanFood(component, plan);
        const snapshot = snapshotFood(component, fallback);
        if (!snapshot && fallback) usesCurrentPlanForLegacyLogs = true;
        const food = snapshot ?? fallback;
        const brand = fallback?.brand || (component.role === 'wet' ? 'Húmedo' : component.role === 'dry' ? 'Seco' : 'Alimento');
        addComponent(servedComponents, grams, brand, component.foodName, food);
      }
      // A legacy log with an incomplete component list cannot claim complete nutrient totals.
      if (served - componentGrams > 0.001) {
        addComponent(servedComponents, served - componentGrams, 'Alimento', 'Sin especificar');
      }
    } else if (addPlanPortion(servedComponents, plan, served, fallbackFood)) {
      usesCurrentPlanForLegacyLogs = true;
    }
  }

  const perFoodBreakdown = nutritionBreakdown(servedComponents);
  const plannedPerFoodBreakdown = nutritionBreakdown(plannedComponents);
  const servedNutrients = summarizeNutrients(perFoodBreakdown);
  const plannedNutrients = summarizeNutrients(plannedPerFoodBreakdown);
  const availableEnergy = perFoodBreakdown.flatMap((item) => item.energia.kcal ?? []);
  const kcalServedTotal = availableEnergy.length
    ? Math.round(availableEnergy.reduce((sum, kcal) => sum + kcal, 0))
    : perFoodBreakdown.length === 0 ? 0 : null;
  const kcalServedPartial = availableEnergy.length > 0 && availableEnergy.length < perFoodBreakdown.length;

  const { proteina, grasa, fibra } = servedNutrients;
  const missing = trackedNutrients.filter((key) => servedNutrients[key].coverage === 'partial');
  const isPartialTotal = missing.length > 0 || kcalServedPartial;
  return {
    totalPlannedGrams,
    totalServedGrams,
    completedMealsCount: completed.length,
    kcalServedTotal,
    kcalServedPartial,
    proteinaGramsTotal: proteina.coverage === 'empty' ? 0 : proteina.grams,
    proteinaQualifier: proteina.qualifier,
    proteinaPhrase: formatLegacyTotal(proteina, 'proteína'),
    grasaGramsTotal: grasa.coverage === 'empty' ? 0 : grasa.grams,
    grasaQualifier: grasa.qualifier,
    grasaPhrase: formatLegacyTotal(grasa, 'grasa'),
    fibraGramsTotal: fibra.coverage === 'empty' ? 0 : fibra.grams,
    fibraQualifier: fibra.qualifier,
    fibraPhrase: formatLegacyTotal(fibra, 'fibra cruda'),
    isMixedMealOrDay: perFoodBreakdown.length > 1 || plan?.foodType === 'mixed',
    isPartialTotal,
    partialWarning: missing.length
      ? `Total parcial: falta confirmar ${missing.map((key) => labels[key].toLowerCase()).join(', ')} en al menos un alimento.`
      : undefined,
    perFoodBreakdown,
    plannedPerFoodBreakdown,
    plannedNutrients,
    servedNutrients,
    usesCurrentPlanForLegacyLogs,
  };
}
