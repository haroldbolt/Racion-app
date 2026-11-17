import {
  FeedingPlan,
  FoodItem,
  MealLog,
  MealMixedComponent,
  MeasurementBasis,
  NutrientQualifier,
  NutrientValue,
  NutritionDatasheet,
} from '../types';
import { getComponentPlanFood, getFoodKcalPerKg, getPlannedMeals, getPrimaryPlanFood, splitMixedPortion } from './mealPortions';

export interface NutrientPortionComputation {
  key: 'energia' | 'proteina' | 'grasa' | 'fibra' | 'humedad' | 'cenizas' | 'carbohidratos';
  label: string;
  available: boolean;
  grams?: number;
  kcal?: number;
  qualifier?: NutrientQualifier;
  basis?: MeasurementBasis;
  /** Human phrasing required by spec, e.g. "Al menos 12 g de proteína según la etiqueta" or "Sin dato verificado" */
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
}

function roundNutrientGrams(val: number): number {
  const rounded = Math.round(val * 10) / 10;
  return Number.isInteger(rounded) ? rounded : rounded;
}

function formatNumEs(val: number): string {
  const r = roundNutrientGrams(val);
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

export function formatQualifierNutrientPhrase(
  grams: number,
  nutrientLabelLower: string,
  qualifier: NutrientQualifier = 'tipico'
): string {
  const numStr = formatNumEs(grams);
  if (qualifier === 'minimo') {
    return `Al menos ${numStr} g de ${nutrientLabelLower} según la etiqueta`;
  }
  if (qualifier === 'maximo') {
    return `Hasta ${numStr} g de ${nutrientLabelLower} según la etiqueta`;
  }
  return `Aprox. ${numStr} g de ${nutrientLabelLower} según la etiqueta`;
}

function getEffectiveNutrientField(
  food: FoodItem | undefined,
  field: 'kcalPerKg' | 'proteina' | 'grasa' | 'fibra' | 'humedad' | 'cenizas' | 'carbohidratos'
): NutrientValue | undefined {
  if (!food || food.labelStatus === 'unconfirmed') return undefined;
  const ficha: NutritionDatasheet | undefined = food.fichaNutricional;
  if (ficha && ficha[field] && ficha[field]!.valor > 0) {
    return ficha[field];
  }

  // Fallback to flat legacy FoodItem numeric fields only if > 0 and not unconfirmed empty
  const defaultQual: NutrientQualifier =
    field === 'fibra' || field === 'humedad' || field === 'cenizas'
      ? 'maximo'
      : field === 'kcalPerKg' || field === 'carbohidratos'
      ? 'tipico'
      : 'minimo';

  let raw = 0;
  if (field === 'kcalPerKg') raw = food.kcalPerKg;
  else if (field === 'proteina') raw = food.proteinPct;
  else if (field === 'grasa') raw = food.fatPct;
  else if (field === 'fibra') raw = food.fiberPct;
  else if (field === 'humedad') raw = food.moisturePct;
  else if (field === 'cenizas') raw = food.ashPct || 0;
  else if (field === 'carbohidratos') raw = food.carbsPct || 0;

  if (!raw || raw <= 0) return undefined;

  return {
    valor: raw,
    unidadOriginal: field === 'kcalPerKg' ? 'kcal/kg' : '%',
    baseMedicion: 'tal_como_se_vende',
    calificador: defaultQual,
  };
}

function computeSinglePctNutrient(
  key: 'proteina' | 'grasa' | 'fibra' | 'humedad' | 'cenizas' | 'carbohidratos',
  labelCapitalized: string,
  labelLower: string,
  gramsServed: number,
  nVal?: NutrientValue
): NutrientPortionComputation {
  if (!nVal || nVal.valor <= 0) {
    return {
      key,
      label: labelCapitalized,
      available: false,
      displayText: 'Sin dato verificado',
    };
  }

  // Only "tal como se vende" percentages apply directly to served grams
  if (nVal.baseMedicion === 'materia_seca') {
    return {
      key,
      label: labelCapitalized,
      available: false,
      qualifier: nVal.calificador,
      basis: nVal.baseMedicion,
      displayText: 'Sin dato verificado (dato solo en materia seca)',
    };
  }

  const grams = roundNutrientGrams((gramsServed * nVal.valor) / 100);
  return {
    key,
    label: labelCapitalized,
    available: true,
    grams,
    qualifier: nVal.calificador,
    basis: nVal.baseMedicion,
    displayText: formatQualifierNutrientPhrase(grams, labelLower, nVal.calificador),
  };
}

/**
 * Calculates exact nutrient intake for a single food and served weight in grams ("tal como se vende").
 * Energy = (kcalPerKg * gramsServed) / 1000
 * Nutrients (%) = (gramsServed * pct) / 100
 */
export function calculateFoodPortionNutrients(
  food: FoodItem | undefined,
  gramsServed: number,
  fallbackIdentity?: { brand: string; name: string }
): FoodPortionNutrition {
  const brand = food?.brand || fallbackIdentity?.brand || 'Alimento';
  const name = food?.name || fallbackIdentity?.name || 'Sin especificar';
  const safeGrams = Math.max(0, gramsServed || 0);

  const kcalField = getEffectiveNutrientField(food, 'kcalPerKg');
  const kcalPerKg = getFoodKcalPerKg(food);
  const protField = getEffectiveNutrientField(food, 'proteina');
  const fatField = getEffectiveNutrientField(food, 'grasa');
  const fiberField = getEffectiveNutrientField(food, 'fibra');
  const moistureField = getEffectiveNutrientField(food, 'humedad');
  const ashField = getEffectiveNutrientField(food, 'cenizas');
  const carbsField = getEffectiveNutrientField(food, 'carbohidratos');

  const energia: NutrientPortionComputation =
    kcalPerKg && safeGrams > 0
      ? {
          key: 'energia',
          label: 'Energía',
          available: true,
          kcal: (kcalPerKg * safeGrams) / 1000,
          qualifier: kcalField?.calificador,
          basis: kcalField?.baseMedicion,
          displayText: `${Math.round((kcalPerKg * safeGrams) / 1000)} kcal`,
        }
      : {
          key: 'energia',
          label: 'Energía',
          available: false,
          displayText: 'Sin dato verificado',
        };

  const proteina = computeSinglePctNutrient('proteina', 'Proteína', 'proteína', safeGrams, protField);
  const grasa = computeSinglePctNutrient('grasa', 'Grasa', 'grasa', safeGrams, fatField);
  const fibra = computeSinglePctNutrient('fibra', 'Fibra cruda', 'fibra cruda', safeGrams, fiberField);
  const humedad = moistureField
    ? computeSinglePctNutrient('humedad', 'Humedad', 'humedad', safeGrams, moistureField)
    : undefined;
  const cenizas = ashField
    ? computeSinglePctNutrient('cenizas', 'Cenizas', 'cenizas', safeGrams, ashField)
    : undefined;
  const carbohidratos = carbsField
    ? computeSinglePctNutrient('carbohidratos', 'Carbohidratos', 'carbohidratos', safeGrams, carbsField)
    : undefined;

  const missingFields: string[] = [];
  if (!energia.available) missingFields.push('Energía (kcal/kg)');
  if (!proteina.available) missingFields.push('Proteína');
  if (!grasa.available) missingFields.push('Grasa');
  if (!fibra.available) missingFields.push('Fibra cruda');

  return {
    foodBrand: brand,
    foodName: name,
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

function resolveComponentFromMeal(
  comp: MealMixedComponent,
  plan?: FeedingPlan
): FoodItem | undefined {
  const hasSnapshot = comp.kcalPerKg !== undefined || comp.proteinPct !== undefined ||
    comp.fatPct !== undefined || comp.fiberPct !== undefined || comp.fichaNutricional !== undefined;
  const fallback = getComponentPlanFood(comp, plan);
  if (!hasSnapshot) return fallback;
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
    moisturePct: 0,
    country: fallback?.country || '',
    fichaNutricional: comp.fichaNutricional,
  };
}

/**
 * Aggregates planned vs served grams and verified nutrient intake across completed meals today.
 * Distinguishes mixed meals and marks "Total parcial" if any component lacks verified data.
 */
export function calculateDailyMealNutritionSummary(params: {
  plan?: FeedingPlan;
  mealLogs: MealLog[];
  dryFood?: FoodItem;
  wetFood?: FoodItem;
}): DailyMealNutritionSummary {
  const { plan, mealLogs, dryFood, wetFood } = params;
  const completedLogs = mealLogs.filter((m) => m.completed);

  const plannedMeals = plan ? getPlannedMeals(plan, plan.trainingRationGramsToday) : [];

  let totalPlannedGrams = plan?.rationConfirmed ? plan.gramsPerDay : 0;
  let totalServedGrams = 0;

  // Map component intakes keyed by "brand__name"
  const componentMap = new Map<
    string,
    { food?: FoodItem; brand: string; name: string; gramsServed: number }
  >();
  const addComponent = (brand: string, name: string, gramsServed: number, food?: FoodItem) => {
    if (gramsServed <= 0) return;
    // A label change does not change the nutrition of a meal already served.
    const key = JSON.stringify([
      food?.id, brand, name, food?.kcalPerKg, food?.proteinPct, food?.fatPct, food?.fiberPct, food?.fichaNutricional,
    ]);
    const previous = componentMap.get(key);
    componentMap.set(key, { food, brand, name, gramsServed: (previous?.gramsServed || 0) + gramsServed });
  };

  for (const log of completedLogs) {
    const served = Math.max(0, log.gramsFed ?? log.plannedGrams ?? plannedMeals[log.mealIndex]?.grams ?? 0);
    totalServedGrams += served;

    if (log.plannedGrams && log.plannedGrams > 0 && !plan?.rationConfirmed) {
      totalPlannedGrams += log.plannedGrams;
    }

    if (Array.isArray(log.mixedComponents) && log.mixedComponents.length > 0) {
      for (const comp of log.mixedComponents) {
        const food = resolveComponentFromMeal(comp, plan);
        const brand = food?.brand || (comp.role === 'wet' ? 'Húmedo' : comp.role === 'dry' ? 'Seco' : 'Alimento');
        addComponent(brand, comp.foodName, comp.gramsFed, food);
      }
    } else if (plan?.isVetLocked) {
      const prescribedKcal = plan.foodMerKcal ?? plan.mer;
      const food = resolveComponentFromMeal({
        foodName: plan.foodName,
        role: 'main',
        gramsFed: served,
        gramsPlanned: served,
        kcalPerKg: plan.rationConfirmed && plan.gramsPerDay > 0
          ? prescribedKcal * 1000 / plan.gramsPerDay
          : undefined,
      }, plan);
      addComponent('Pauta veterinaria', plan.foodName, served, food);
    } else if (plan?.foodType === 'mixed' && plan.dryFood && plan.wetFood) {
      const portions = splitMixedPortion(plan, served);
      if (portions) {
        addComponent(plan.dryFood.brand, plan.dryFood.name, portions.dryGrams, plan.dryFood);
        addComponent(plan.wetFood.brand, plan.wetFood.name, portions.wetGrams, plan.wetFood);
      } else {
        addComponent('Ración mixta', plan.foodName, served);
      }
    } else {
      const primaryFood = getPrimaryPlanFood(plan) || dryFood || wetFood;
      const brand = primaryFood?.brand || plan?.foodBrand || 'Alimento habitual';
      const name = primaryFood?.name || plan?.foodName || '';
      addComponent(brand, name, served, primaryFood);
    }
  }

  // Fallback if 0 meals served yet, show plan target breakdown preview if needed
  const perFoodBreakdown: FoodPortionNutrition[] = Array.from(componentMap.values()).map((c) =>
    calculateFoodPortionNutrients(c.food, c.gramsServed, { brand: c.brand, name: c.name })
  );

  const isMixedMealOrDay = perFoodBreakdown.length > 1 || plan?.foodType === 'mixed';

  if (perFoodBreakdown.length === 0) {
    return {
      totalPlannedGrams,
      totalServedGrams,
      completedMealsCount: completedLogs.length,
      kcalServedTotal: 0,
      proteinaGramsTotal: 0,
      proteinaPhrase: 'Registra una toma para calcular proteína servida',
      grasaGramsTotal: 0,
      grasaPhrase: 'Registra una toma para calcular grasa servida',
      fibraGramsTotal: 0,
      fibraPhrase: 'Registra una toma para calcular fibra servida',
      isMixedMealOrDay,
      isPartialTotal: false,
      perFoodBreakdown: [],
    };
  }

  let kcalSum = 0;
  let kcalHasAny = false;
  let kcalMissingAny = false;

  let protSum = 0;
  let protHasAny = false;
  let protMissingAny = false;
  let protQual: NutrientQualifier | undefined;

  let fatSum = 0;
  let fatHasAny = false;
  let fatMissingAny = false;
  let fatQual: NutrientQualifier | undefined;

  let fiberSum = 0;
  let fiberHasAny = false;
  let fiberMissingAny = false;
  let fiberQual: NutrientQualifier | undefined;

  for (const item of perFoodBreakdown) {
    if (item.energia.available && item.energia.kcal !== undefined) {
      kcalSum += item.energia.kcal;
      kcalHasAny = true;
    } else {
      kcalMissingAny = true;
    }

    if (item.proteina.available && item.proteina.grams !== undefined) {
      protSum += item.proteina.grams;
      protHasAny = true;
      protQual = protQual === undefined ? item.proteina.qualifier : protQual === item.proteina.qualifier ? protQual : 'tipico';
    } else {
      protMissingAny = true;
    }

    if (item.grasa.available && item.grasa.grams !== undefined) {
      fatSum += item.grasa.grams;
      fatHasAny = true;
      fatQual = fatQual === undefined ? item.grasa.qualifier : fatQual === item.grasa.qualifier ? fatQual : 'tipico';
    } else {
      fatMissingAny = true;
    }

    if (item.fibra.available && item.fibra.grams !== undefined) {
      fiberSum += item.fibra.grams;
      fiberHasAny = true;
      fiberQual = fiberQual === undefined ? item.fibra.qualifier : fiberQual === item.fibra.qualifier ? fiberQual : 'tipico';
    } else {
      fiberMissingAny = true;
    }
  }

  const isPartialTotal =
    (isMixedMealOrDay && (kcalMissingAny || protMissingAny || fatMissingAny || fiberMissingAny)) ||
    (!isMixedMealOrDay && (kcalMissingAny && protHasAny));

  const missingNames: string[] = [];
  if (kcalMissingAny) missingNames.push('energía');
  if (protMissingAny) missingNames.push('proteína');
  if (fatMissingAny) missingNames.push('grasa');
  if (fiberMissingAny) missingNames.push('fibra');

  const partialWarning = isPartialTotal
    ? isMixedMealOrDay
      ? `Total parcial: falta dato verificado de ${missingNames.join(', ')} en al menos uno de los alimentos de la comida mixta.`
      : `Total parcial: falta confirmar ${missingNames.join(', ')} en la etiqueta del alimento.`
    : undefined;

  return {
    totalPlannedGrams,
    totalServedGrams,
    completedMealsCount: completedLogs.length,
    kcalServedTotal: kcalHasAny ? Math.round(kcalSum) : null,
    proteinaGramsTotal: protHasAny ? roundNutrientGrams(protSum) : null,
    proteinaQualifier: protQual,
    proteinaPhrase: protHasAny
      ? `${formatQualifierNutrientPhrase(protSum, 'proteína', protQual)}${protMissingAny ? ' (Total parcial)' : ''}`
      : 'Sin dato verificado',
    grasaGramsTotal: fatHasAny ? roundNutrientGrams(fatSum) : null,
    grasaQualifier: fatQual,
    grasaPhrase: fatHasAny
      ? `${formatQualifierNutrientPhrase(fatSum, 'grasa', fatQual)}${fatMissingAny ? ' (Total parcial)' : ''}`
      : 'Sin dato verificado',
    fibraGramsTotal: fiberHasAny ? roundNutrientGrams(fiberSum) : null,
    fibraQualifier: fiberQual,
    fibraPhrase: fiberHasAny
      ? `${formatQualifierNutrientPhrase(fiberSum, 'fibra cruda', fiberQual)}${fiberMissingAny ? ' (Total parcial)' : ''}`
      : 'Sin dato verificado',
    isMixedMealOrDay,
    isPartialTotal,
    partialWarning,
    perFoodBreakdown,
  };
}
