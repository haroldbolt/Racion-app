import { Pet, FoodItem, Goal, FeedingPlan, BreedSize } from '../types';
import { findBreedProfile, getIdealWeightForBreedAndSex, BreedProfile } from '../data/breeds';
import { distributeWholeGrams, getFoodKcalPerKg } from './mealPortions';
import { localDateKey } from './localDate';
import { getApplicableFeedingRange } from './manufacturerRation';
import { withPlanCosts } from './foodCosts';

export interface CalculationInputs {
  pet: Pet;
  goal: Goal;
  bcs: number;
  foodType: 'dry' | 'wet' | 'mixed' | 'barf';
  dryFood?: FoodItem;
  wetFood?: FoodItem;
  mixedDryPct?: number; // 0 - 100, share of meal energy
  mealsPerDay: number;
  mealTimes?: string[];
  treatsKcal?: number;
  manufacturerGramsPerDay?: number;
  manualAdjustmentPct?: number;
  manualAdjustmentReason?: string;
  bagWeightKg?: number;
  scheduleConfigured?: boolean;
}

export interface CalculationResult {
  rer: number;
  baseFactor: number;
  factor: number;
  factorExplanation: string;
  breedSize: BreedSize;
  breedAdjustmentPct: number;
  sexAdjustmentNote: string;
  breedAdjustmentNote: string;
  idealWeightRangeKg: [number, number];
  mer: number;
  weightUsedKg: number;
  treatsBudgetKcal: number;
  foodMerKcal: number;
  gramsPerDay: number;
  gramsPerMeal: number;
  kcalPerMeal: number;
  rationConfirmed: boolean;
  requiresVetGuidance: boolean;
  cupsPerDay?: number;
  cansPerDay?: number;
  dryGramsPerDay?: number;
  wetGramsPerDay?: number;
  dryGramsPerMeal?: number;
  wetGramsPerMeal?: number;
  dailyWaterMl: number;
  bagDaysRemaining?: number;
  reorderDate?: string;
  safeLossRateKgPerWeek?: { min: number; max: number };
  catHepaticLipidosisWarning: boolean;
}

/**
 * Calculates Resting Energy Requirement (RER) based on NRC 2006:
 * RER = 70 * (weight in kg) ^ 0.75
 */
export function calculateRER(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  return Math.round(70 * Math.pow(weightKg, 0.75));
}

function getBreedMetabolicAdjustment(
  profile: BreedProfile,
  goal: Goal,
  bcs: number,
  isPuppyOrKitten: boolean
): { multiplier: number; pct: number; note: string } {
  // Weight loss / therapeutic gain / early rapid growth follow strict clinical targets
  if (goal === 'lose' || bcs >= 7 || goal === 'gain' || bcs <= 3) {
    return {
      multiplier: 1.0,
      pct: 0,
      note: `Raza ${profile.name} (prioridad meta clínica de peso)`,
    };
  }

  if (isPuppyOrKitten) {
    if (profile.size === 'large' || profile.size === 'giant') {
      return {
        multiplier: 0.95,
        pct: -5,
        note: `Cachorro raza ${profile.size === 'giant' ? 'gigante' : 'grande'} (-5% control articular NRC)`,
      };
    }
    return {
      multiplier: 1.0,
      pct: 0,
      note: `Cachorro raza ${profile.name}`,
    };
  }

  switch (profile.metabolismProfile) {
    case 'small_high':
      return {
        multiplier: 1.05,
        pct: 5,
        note: `${profile.name} / talla pequeña (+5% mayor demanda termorreguladora)`,
      };
    case 'high_energy':
      return {
        multiplier: 1.05,
        pct: 5,
        note: `${profile.name} (+5% perfil metabólico activo)`,
      };
    case 'obesity_prone':
      return {
        multiplier: 0.94,
        pct: -6,
        note: `${profile.name} (-6% prevención por menor gasto basal de raza)`,
      };
    case 'giant_low':
      return {
        multiplier: 0.92,
        pct: -8,
        note: `${profile.name} / talla gigante (-8% eficiencia metabólica NRC 2006)`,
      };
    default:
      return {
        multiplier: 1.0,
        pct: 0,
        note: `${profile.name} (metabolismo estándar)`,
      };
  }
}

/**
 * Determines factor for Maintenance Energy Requirement (MER)
 * based on species, breed, breed size, sex, neuter status, life stage, activity, and weight goal.
 */
export function determineFactor(
  pet: Pet,
  goal: Goal,
  bcs: number
): {
  factor: number;
  baseFactor: number;
  breedSize: BreedSize;
  breedAdjustmentPct: number;
  sexAdjustmentNote: string;
  breedAdjustmentNote: string;
  idealWeightRangeKg: [number, number];
  explanation: string;
} {
  const isDog = pet.species === 'dog';
  const isMale = pet.sex !== 'female';
  const isNeutered = pet.isNeutered;
  const breedProfile = findBreedProfile(pet.breed, pet.species, pet.breedSize);
  const weightRef = getIdealWeightForBreedAndSex(
    pet.breed,
    pet.species,
    pet.sex || 'male',
    pet.breedSize
  );
  const idealWeightRangeKg: [number, number] = [weightRef.min, weightRef.max];

  const ageMonths =
    pet.ageMonths !== undefined
      ? pet.ageMonths
      : (pet.ageYears ?? 2) * 12;
  const isPuppyOrKitten =
    goal === 'growth' ||
    ((pet.ageMonths !== undefined || pet.ageYears !== undefined) &&
      ageMonths < breedProfile.growthMonths);
  const ageYearsEffective = ageMonths / 12;
  const isSenior = ageYearsEffective >= breedProfile.seniorAgeYears;

  const sexLabel = isMale ? 'Macho' : 'Hembra';
  const reproLabel = isNeutered
    ? isMale
      ? 'castrado'
      : 'esterilizada'
    : isMale
    ? 'entero'
    : 'entera';

  let baseFactor = 1.6;
  let baseReason = '';
  let sexAdjustmentNote = `${sexLabel} ${reproLabel}`;

  // Pregnancy / Lactation clinical factors (females only)
  if (!isMale && pet.specialState === 'pregnancy') {
    baseFactor = 2.0;
    baseReason = 'Hembra en gestación: Factor base 2.0';
    sexAdjustmentNote = 'Hembra gestante (demanda embrionaria)';
  } else if (!isMale && pet.specialState === 'lactation') {
    baseFactor = 3.0;
    baseReason = 'Hembra en lactancia: Factor base 3.0';
    sexAdjustmentNote = 'Hembra lactante (alta producción láctea)';
  } else if (isDog) {
    if (isPuppyOrKitten) {
      if (ageMonths < 4) {
        baseFactor = breedProfile.size === 'large' || breedProfile.size === 'giant' ? 2.8 : 3.0;
        baseReason = `Cachorro (< 4 meses, ${sexLabel.toLowerCase()}): Factor base ${baseFactor.toFixed(1)}`;
      } else if (ageMonths < 12) {
        baseFactor = isMale ? 2.0 : 1.95;
        baseReason = `Cachorro en desarrollo (4-12 meses, ${sexLabel.toLowerCase()}): Factor base ${baseFactor.toFixed(2)}`;
      } else {
        // Large/Giant adolescents between 12 and growthMonths
        baseFactor = isMale ? 1.75 : 1.68;
        baseReason = `Cachorro juvenil raza grande/gigante (${Math.round(ageMonths)} meses, ${sexLabel.toLowerCase()}): Factor base ${baseFactor.toFixed(2)}`;
      }
      sexAdjustmentNote = isMale
        ? 'Macho en crecimiento (ligero mayor desarrollo magro)'
        : 'Hembra en crecimiento';
    } else if (goal === 'lose' || bcs >= 7) {
      baseFactor = isMale ? 1.0 : 0.96;
      baseReason = `Pérdida de peso controlada sobre peso ideal (${sexLabel.toLowerCase()}): Factor base ${baseFactor.toFixed(2)}`;
      sexAdjustmentNote = isMale
        ? 'Macho en plan de reducción'
        : 'Hembra en reducción (-4% menor masa magra basal)';
    } else if (goal === 'gain' || bcs <= 3) {
      baseFactor = isMale ? 1.8 : 1.75;
      baseReason = `Recuperación de peso corporal (${sexLabel.toLowerCase()}): Factor base ${baseFactor.toFixed(2)}`;
    } else if (isSenior) {
      baseFactor = isMale ? (isNeutered ? 1.38 : 1.44) : (isNeutered ? 1.32 : 1.38);
      baseReason = `Perro senior (≥ ${breedProfile.seniorAgeYears} años para talla ${breedProfile.size}, ${sexLabel.toLowerCase()} ${reproLabel}): Factor base ${baseFactor.toFixed(2)}`;
      sexAdjustmentNote = `${sexLabel} senior ${reproLabel}`;
    } else if (pet.activityLevel === 'high') {
      baseFactor = isMale ? (isNeutered ? 2.45 : 2.55) : (isNeutered ? 2.35 : 2.45);
      baseReason = `Perro adulto activo / trabajo (${sexLabel.toLowerCase()} ${reproLabel}): Factor base ${baseFactor.toFixed(2)}`;
      sexAdjustmentNote = `${sexLabel} ${reproLabel} de alta actividad`;
    } else if (pet.activityLevel === 'low') {
      baseFactor = isMale ? (isNeutered ? 1.40 : 1.46) : (isNeutered ? 1.32 : 1.38);
      baseReason = `Perro adulto baja actividad (${sexLabel.toLowerCase()} ${reproLabel}): Factor base ${baseFactor.toFixed(2)}`;
      sexAdjustmentNote = isMale
        ? `${sexLabel} ${reproLabel} sedentario`
        : `${sexLabel} ${reproLabel} sedentaria (-5% ajuste metabólico)`;
    } else {
      // Standard moderate maintenance
      if (isMale) {
        baseFactor = isNeutered ? 1.60 : 1.85;
        sexAdjustmentNote = isNeutered
          ? 'Macho castrado (mantenimiento estándar 1.60)'
          : 'Macho entero (+3% masa magra: 1.85)';
      } else {
        baseFactor = isNeutered ? 1.52 : 1.73;
        sexAdjustmentNote = isNeutered
          ? 'Hembra esterilizada (-5% gasto basal post-esterilización: 1.52)'
          : 'Hembra entera (-6% vs macho entero: 1.73)';
      }
      baseReason = `Perro adulto ${sexLabel.toLowerCase()} ${reproLabel}: Factor base ${baseFactor.toFixed(2)}`;
    }
  } else {
    // Cats
    if (isPuppyOrKitten) {
      baseFactor = isMale ? 2.5 : 2.42;
      baseReason = `Gatito en crecimiento (${sexLabel.toLowerCase()}): Factor base ${baseFactor.toFixed(2)}`;
    } else if (goal === 'lose' || bcs >= 7) {
      baseFactor = isMale ? 0.80 : 0.78;
      baseReason = `Gato pérdida gradual sobre peso ideal (${sexLabel.toLowerCase()}): Factor base ${baseFactor.toFixed(2)}`;
    } else if (goal === 'gain' || bcs <= 3) {
      baseFactor = isMale ? 1.40 : 1.35;
      baseReason = `Gato bajo peso / recuperación (${sexLabel.toLowerCase()}): Factor base ${baseFactor.toFixed(2)}`;
    } else if (isSenior) {
      baseFactor = isMale ? (isNeutered ? 1.12 : 1.18) : (isNeutered ? 1.06 : 1.12);
      baseReason = `Gato senior (≥ ${breedProfile.seniorAgeYears} años, ${sexLabel.toLowerCase()} ${reproLabel}): Factor base ${baseFactor.toFixed(2)}`;
    } else {
      if (isMale) {
        baseFactor = isNeutered ? 1.20 : 1.44;
        sexAdjustmentNote = isNeutered
          ? 'Gato macho castrado (1.20)'
          : 'Gato macho entero (1.44)';
      } else {
        baseFactor = isNeutered ? 1.14 : 1.36;
        sexAdjustmentNote = isNeutered
          ? 'Gata esterilizada (-5% menor gasto basal: 1.14)'
          : 'Gata entera (1.36)';
      }
      baseReason = `Gato adulto ${sexLabel.toLowerCase()} ${reproLabel}: Factor base ${baseFactor.toFixed(2)}`;
    }
  }

  const breedAdj = getBreedMetabolicAdjustment(breedProfile, goal, bcs, isPuppyOrKitten);
  const finalFactor = Number((baseFactor * breedAdj.multiplier).toFixed(2));

  const breedSuffix =
    breedAdj.pct !== 0
      ? ` • Ajuste raza (${breedAdj.pct > 0 ? `+${breedAdj.pct}%` : `${breedAdj.pct}%`}): ${breedProfile.name}`
      : ` • Raza: ${breedProfile.name}`;

  return {
    factor: finalFactor,
    baseFactor: Number(baseFactor.toFixed(2)),
    breedSize: breedProfile.size,
    breedAdjustmentPct: breedAdj.pct,
    sexAdjustmentNote,
    breedAdjustmentNote: breedAdj.note,
    idealWeightRangeKg,
    explanation: `${baseReason}${breedSuffix} → Factor final ${finalFactor.toFixed(2)}`,
  };
}

export function isClinicalOrVetPlan(pet: Pet, plan?: Pick<FeedingPlan, 'isVetLocked'>): boolean {
  return Boolean(
    pet.dietType === 'therapeutic' ||
    (pet.specialState && pet.specialState !== 'none') ||
    pet.restrictions?.length ||
    pet.hasVetGuideline ||
    pet.vetGuideline?.locked ||
    plan?.isVetLocked
  );
}

export function hasValidVetGuideline(pet: Pet): boolean {
  const vet = pet.vetGuideline;
  return Boolean(
    vet?.locked &&
    vet.prescribedFoodName?.trim() &&
    vet.vetName?.trim() &&
    vet.clinicName?.trim() &&
    Number.isFinite(vet.prescribedKcal) && vet.prescribedKcal > 0 &&
    Number.isFinite(vet.prescribedGramsPerMeal) && vet.prescribedGramsPerMeal > 0 &&
    Number.isInteger(vet.mealsPerDay) && vet.mealsPerDay >= 1 && vet.mealsPerDay <= 6 &&
    Number.isFinite(vet.prescribedGramsPerMeal * vet.mealsPerDay)
  );
}

export function requiresVetGuidance(pet: Pet, plan?: Pick<FeedingPlan, 'foodType' | 'isVetLocked'>): boolean {
  return !hasValidVetGuideline(pet) && (
    isClinicalOrVetPlan(pet, plan) || pet.dietType === 'barf' || plan?.foodType === 'barf'
  );
}

function normalizeMealsPerDay(meals: number): number {
  return Number.isFinite(meals) ? Math.min(6, Math.max(1, Math.trunc(meals))) : 2;
}

function normalizeMixedDryPct(dryPct: number): number {
  return Number.isFinite(dryPct) ? Math.min(100, Math.max(0, dryPct)) : 50;
}

/** Executes the feeding calculation for an automatic or veterinarian-prescribed plan. */
export function calculateFeedingPlan(inputs: CalculationInputs): CalculationResult {
  const {
    pet,
    goal,
    bcs,
    foodType,
    dryFood,
    wetFood,
    mixedDryPct = 50,
    mealsPerDay,
    treatsKcal = 0,
    manualAdjustmentPct = 0,
    bagWeightKg,
  } = inputs;

  // Weight determination: If overweight (BCS >= 7) or goal is weight loss,
  // calculation MUST be on ideal/target weight, NEVER on current weight!
  const isOverweight = bcs >= 7 || goal === 'lose';
  const weightToUse = isOverweight
    ? (pet.idealWeightKg || pet.targetWeightKg || pet.currentWeightKg * 0.85)
    : pet.currentWeightKg;

  const rer = calculateRER(weightToUse);
  const factorData = determineFactor(pet, goal, bcs);
  let mer = Math.round(rer * factorData.factor);

  // Apply manual +/- 10% adjustment if present
  if (Number.isFinite(manualAdjustmentPct) && manualAdjustmentPct !== 0) {
    const adj = Math.min(10, Math.max(-10, manualAdjustmentPct));
    mer = Math.round(mer * (1 + adj / 100));
  }

  const validMeals = normalizeMealsPerDay(mealsPerDay);

  // Respect locked veterinary prescription if active
  if (pet.vetGuideline && hasValidVetGuideline(pet)) {
    const vetMeals = pet.vetGuideline.mealsPerDay;
    const vetGramsPerMeal = pet.vetGuideline.prescribedGramsPerMeal;
    const vetGramsPerDay = vetGramsPerMeal * vetMeals;
    const vetMer = pet.vetGuideline.prescribedKcal;
    const prescribedFood = foodType === 'wet' ? wetFood : dryFood;
    const bagToUseKg = prescribedFood?.name === pet.vetGuideline.prescribedFoodName
      ? bagWeightKg || prescribedFood.bagSizeKg || 0
      : 0;
    let bagDaysRemaining: number | undefined;
    let reorderDate: string | undefined;
    if (vetGramsPerDay > 0 && bagToUseKg > 0) {
      const days = Math.floor((bagToUseKg * 1000) / vetGramsPerDay);
      bagDaysRemaining = days;
      const alertDays = Math.max(3, days - 5);
      const d = new Date();
      d.setDate(d.getDate() + alertDays);
      reorderDate = localDateKey(d);
    }

    return {
      rer,
      baseFactor: factorData.baseFactor,
      factor: factorData.factor,
      factorExplanation: `${factorData.explanation} · Pauta veterinaria registrada`,
      breedSize: factorData.breedSize,
      breedAdjustmentPct: factorData.breedAdjustmentPct,
      sexAdjustmentNote: factorData.sexAdjustmentNote,
      breedAdjustmentNote: factorData.breedAdjustmentNote,
      idealWeightRangeKg: factorData.idealWeightRangeKg,
      mer: vetMer,
      weightUsedKg: Number(weightToUse.toFixed(2)),
      treatsBudgetKcal: 0,
      foodMerKcal: vetMer,
      gramsPerDay: vetGramsPerDay,
      gramsPerMeal: vetGramsPerMeal,
      kcalPerMeal: Math.round(vetMer / vetMeals),
      rationConfirmed: vetGramsPerDay > 0,
      requiresVetGuidance: false,
      dailyWaterMl: 0, // Vet-managed hydration
      bagDaysRemaining,
      reorderDate,
      safeLossRateKgPerWeek: {
        min: Number((pet.currentWeightKg * (pet.species === 'cat' ? 0.005 : 0.01)).toFixed(2)),
        max: Number((pet.currentWeightKg * 0.02).toFixed(2)),
      },
      catHepaticLipidosisWarning: pet.species === 'cat' && (goal === 'lose' || bcs >= 7),
    };
  }

  const vetGuidanceRequired = requiresVetGuidance(pet, { foodType });
  const maxTreatsAllowed = vetGuidanceRequired ? 0 : Math.round(mer * 0.10);
  const effectiveTreatsKcal = Number.isFinite(treatsKcal)
    ? Math.min(Math.max(0, treatsKcal), maxTreatsAllowed)
    : 0;
  const foodMerKcal = vetGuidanceRequired ? 0 : Math.max(0, mer - effectiveTreatsKcal);
  const dryDensity = dryFood?.type === 'dry' ? (getFoodKcalPerKg(dryFood) ?? 0) : 0;
  const wetDensity = wetFood?.type === 'wet' ? (getFoodKcalPerKg(wetFood) ?? 0) : 0;

  let totalGramsPerDay = 0;
  let dryGramsPerDay = 0;
  let wetGramsPerDay = 0;
  let dryGramsPerMeal = 0;
  let wetGramsPerMeal = 0;
  let cupsPerDay: number | undefined;
  let cansPerDay: number | undefined;
  let rationConfirmed = false;

  const singleFood = foodType === 'dry' ? dryFood : foodType === 'wet' ? wetFood : undefined;
  const guideRange = !vetGuidanceRequired ? getApplicableFeedingRange(singleFood, pet, goal) : undefined;
  const chosenGrams = inputs.manufacturerGramsPerDay;
  const usingGuide = Boolean(guideRange && chosenGrams !== undefined && Number.isInteger(chosenGrams) &&
    chosenGrams >= guideRange.minGrams && chosenGrams <= guideRange.maxGrams);
  if (usingGuide && chosenGrams !== undefined) {
    totalGramsPerDay = chosenGrams;
    dryGramsPerDay = foodType === 'dry' ? chosenGrams : 0;
    wetGramsPerDay = foodType === 'wet' ? chosenGrams : 0;
    rationConfirmed = true;
  } else if (!vetGuidanceRequired && foodType === 'dry' && dryFood && dryDensity > 400) {
    const kcalPerG = dryDensity / 1000;
    totalGramsPerDay = Math.round(foodMerKcal / kcalPerG);
    dryGramsPerDay = totalGramsPerDay;
    rationConfirmed = true;
    if (dryFood.kcalPerCup && dryFood.kcalPerCup > 0) {
      cupsPerDay = Number((foodMerKcal / dryFood.kcalPerCup).toFixed(2));
    }
  } else if (!vetGuidanceRequired && foodType === 'wet' && wetFood && wetDensity > 400) {
    const kcalPerG = wetDensity / 1000;
    totalGramsPerDay = Math.round(foodMerKcal / kcalPerG);
    wetGramsPerDay = totalGramsPerDay;
    rationConfirmed = true;
    if (wetFood.kcalPerCan && wetFood.kcalPerCan > 0) {
      cansPerDay = Number((foodMerKcal / wetFood.kcalPerCan).toFixed(2));
    }
  } else if (!vetGuidanceRequired && foodType === 'mixed' && dryDensity > 400 && wetDensity > 400) {
    const dryShare = normalizeMixedDryPct(mixedDryPct) / 100;
    const dryKcalTarget = foodMerKcal * dryShare;
    const wetKcalTarget = foodMerKcal * (1 - dryShare);

    const dryKcalPerG = dryDensity / 1000;
    const wetKcalPerG = wetDensity / 1000;

    dryGramsPerDay = Math.round(dryKcalTarget / dryKcalPerG);
    wetGramsPerDay = Math.round(wetKcalTarget / wetKcalPerG);
    totalGramsPerDay = dryGramsPerDay + wetGramsPerDay;

    dryGramsPerMeal = distributeWholeGrams(dryGramsPerDay, validMeals)[0];
    wetGramsPerMeal = distributeWholeGrams(wetGramsPerDay, validMeals, dryGramsPerDay % validMeals)[0];
    rationConfirmed = true;
  } else {
    // Label or manufacturer datasheet is missing/unconfirmed: DO NOT fabricate exact grams
    rationConfirmed = false;
    totalGramsPerDay = 0;
  }

  rationConfirmed = rationConfirmed && totalGramsPerDay > 0;
  const gramsPerMeal = rationConfirmed ? distributeWholeGrams(totalGramsPerDay, validMeals)[0] : 0;
  const kcalPerMeal = usingGuide ? 0 : Math.round(foodMerKcal / validMeals);

  // Daily water reference (approx. 50-60 ml/kg/day) — only used when validated rule applies
  const dailyWaterMl = vetGuidanceRequired ? 0 : Math.round(pet.currentWeightKg * 55);

  const isCat = pet.species === 'cat';
  const safeLossRateKgPerWeek = {
    min: Number((pet.currentWeightKg * (isCat ? 0.005 : 0.01)).toFixed(2)),
    max: Number((pet.currentWeightKg * 0.02).toFixed(2)),
  };

  const catHepaticLipidosisWarning = isCat && (goal === 'lose' || bcs >= 7);

  // Bag duration calculator: ONLY when ration is confirmed and bag size is known
  let bagDaysRemaining: number | undefined;
  let reorderDate: string | undefined;

  const mainFood = foodType === 'wet' ? wetFood : dryFood;
  const mainGramsPerDay = foodType === 'wet' ? wetGramsPerDay : dryGramsPerDay;
  const bagToUseKg = bagWeightKg || mainFood?.bagSizeKg;
  if (rationConfirmed && mainGramsPerDay > 0 && bagToUseKg && bagToUseKg > 0) {
    const totalBagGrams = bagToUseKg * 1000;
    const days = Math.floor(totalBagGrams / mainGramsPerDay);
    bagDaysRemaining = days;

    const alertDays = Math.max(3, days - 5);
    const date = new Date();
    date.setDate(date.getDate() + alertDays);
    reorderDate = localDateKey(date);
  }

  return {
    rer,
    baseFactor: factorData.baseFactor,
    factor: factorData.factor,
    factorExplanation: vetGuidanceRequired ? 'Requiere una pauta veterinaria registrada' : factorData.explanation,
    breedSize: factorData.breedSize,
    breedAdjustmentPct: factorData.breedAdjustmentPct,
    sexAdjustmentNote: factorData.sexAdjustmentNote,
    breedAdjustmentNote: factorData.breedAdjustmentNote,
    idealWeightRangeKg: factorData.idealWeightRangeKg,
    mer: vetGuidanceRequired ? 0 : mer,
    weightUsedKg: Number(weightToUse.toFixed(2)),
    treatsBudgetKcal: maxTreatsAllowed,
    foodMerKcal,
    gramsPerDay: totalGramsPerDay,
    gramsPerMeal,
    kcalPerMeal,
    rationConfirmed,
    requiresVetGuidance: vetGuidanceRequired,
    cupsPerDay,
    cansPerDay,
    dryGramsPerDay,
    wetGramsPerDay,
    dryGramsPerMeal,
    wetGramsPerMeal,
    dailyWaterMl,
    bagDaysRemaining,
    reorderDate,
    safeLossRateKgPerWeek,
    catHepaticLipidosisWarning,
  };
}

/**
 * Creates a FeedingPlan record from inputs and result
 */
export function buildFeedingPlan(inputs: CalculationInputs, result: CalculationResult): FeedingPlan {
  const { pet, foodType, dryFood, wetFood, mealTimes = [], scheduleConfigured } = inputs;
  const mixedDryPct = normalizeMixedDryPct(inputs.mixedDryPct ?? 50);
  const vet = hasValidVetGuideline(pet) ? pet.vetGuideline : undefined;
  const mealsPerDay = vet?.mealsPerDay ?? normalizeMealsPerDay(inputs.mealsPerDay);
  const chosenTimes = mealTimes.length === mealsPerDay ? mealTimes : defaultMealTimes(mealsPerDay);
  const mainFood = foodType === 'dry' ? dryFood : (foodType === 'wet' ? wetFood : dryFood);

  return withPlanCosts({
    id: 'plan_' + Date.now(),
    petId: pet.id,
    createdAt: new Date().toISOString(),
    foodId: mainFood?.id || (foodType === 'barf' ? 'barf_custom' : 'custom'),
    foodName:
      vet?.prescribedFoodName ||
      mainFood?.name ||
      (foodType === 'barf' ? 'Dieta BARF / Natural Cruda' : 'Alimento habitual por confirmar'),
    foodBrand: vet && vet.prescribedFoodName !== mainFood?.name
      ? ''
      : mainFood?.brand || (foodType === 'barf' ? 'BARF' : 'Por confirmar'),
    foodType,
    dryFood,
    wetFood,
    mixedDryPct,
    mixedWetPct: 100 - mixedDryPct,
    mealsPerDay,
    mealTimes: chosenTimes,
    rer: result.rer,
    factor: result.factor,
    goal: inputs.goal,
    mer: result.mer,
    manufacturerGramsPerDay: !vet && !result.kcalPerMeal && result.rationConfirmed &&
      result.gramsPerDay === inputs.manufacturerGramsPerDay ? inputs.manufacturerGramsPerDay : undefined,
    foodMerKcal: result.foodMerKcal,
    treatsKcal: inputs.treatsKcal ?? 0,
    gramsPerDay: result.gramsPerDay,
    dryGramsPerDay: result.dryGramsPerDay,
    wetGramsPerDay: result.wetGramsPerDay,
    gramsPerMeal: result.gramsPerMeal,
    kcalPerMeal: result.kcalPerMeal,
    cupsPerDay: result.cupsPerDay,
    cansPerDay: result.cansPerDay,
    treatsBudgetKcal: result.treatsBudgetKcal,
    treatsCountToday: 0,
    manualAdjustmentPct: inputs.manualAdjustmentPct || 0,
    manualAdjustmentReason: inputs.manualAdjustmentReason,
    bagWeightKg: inputs.bagWeightKg || mainFood?.bagSizeKg,
    bagDaysRemaining: result.bagDaysRemaining,
    isVetLocked: Boolean(vet),
    rationConfirmed: result.rationConfirmed,
    scheduleConfigured: scheduleConfigured ?? false,
  });
}

export function defaultMealTimes(meals: number): string[] {
  const defaults = [
    ['08:00'],
    ['08:00', '20:00'],
    ['08:00', '14:00', '20:00'],
    ['08:00', '12:00', '16:00', '20:00'],
    ['08:00', '11:00', '14:00', '17:00', '20:00'],
    ['08:00', '10:30', '13:00', '15:30', '18:00', '20:00'],
  ];
  return defaults[normalizeMealsPerDay(meals) - 1];
}

function estimateLegacyTreatsKcal(plan: FeedingPlan): number {
  if (plan.isVetLocked || plan.mer <= 0) return 0;
  const configuredMeals = normalizeMealsPerDay(plan.mealsPerDay);
  const foodKcal = plan.foodMerKcal ?? (plan.kcalPerMeal > 0 ? plan.kcalPerMeal * configuredMeals : plan.mer);
  return Math.max(0, Math.min(plan.mer - foodKcal, Math.round(plan.mer * 0.1)));
}

/**
 * Recalculates an existing FeedingPlan whenever a pet's breed, sex, neuter status,
 * weight, or age changes, preserving the plan's inputs and any prescribed amounts.
 */
export function recalculatePlanForPet(pet: Pet, existingPlan: FeedingPlan): FeedingPlan {
  const ageMonths =
    pet.ageMonths !== undefined
      ? pet.ageMonths
      : (pet.ageYears ?? 2) * 12;
  const breedProfile = findBreedProfile(pet.breed, pet.species, pet.breedSize);
  const isPuppyOrKitten = ageMonths < breedProfile.growthMonths;

  const profileGoal: Goal =
    pet.bcs >= 7
      ? 'lose'
      : pet.bcs <= 3
      ? 'gain'
      : isPuppyOrKitten
      ? 'growth'
      : 'maintain';

  // Old plans omitted the chosen goal; keep it if a single current factor matches the saved one.
  const matchingGoals = existingPlan.goal || existingPlan.isVetLocked || existingPlan.mer <= 0
    ? []
    : (['maintain', 'lose', 'gain', 'growth'] as const).filter(
        (candidate) => Math.abs(determineFactor(pet, candidate, pet.bcs || 5).factor - existingPlan.factor) < 0.001
      );
  const goal = existingPlan.goal ?? (matchingGoals.length === 1 ? matchingGoals[0] : profileGoal);
  const orphanedVetLock = existingPlan.isVetLocked && !hasValidVetGuideline(pet);
  const calculationInputs: CalculationInputs = {
    pet: orphanedVetLock ? { ...pet, hasVetGuideline: true } : pet,
    goal,
    bcs: pet.bcs || 5,
    foodType: pet.dietType === 'barf' ? 'barf' : existingPlan.foodType || 'dry',
    dryFood: existingPlan.dryFood,
    wetFood: existingPlan.wetFood,
    mixedDryPct: existingPlan.mixedDryPct ?? 50,
    mealsPerDay: existingPlan.mealsPerDay || 2,
    mealTimes: existingPlan.mealTimes,
    manufacturerGramsPerDay: existingPlan.manufacturerGramsPerDay,
    treatsKcal: existingPlan.treatsKcal ?? estimateLegacyTreatsKcal(existingPlan),
    manualAdjustmentPct: existingPlan.manualAdjustmentPct || 0,
    manualAdjustmentReason: existingPlan.manualAdjustmentReason,
    bagWeightKg: existingPlan.bagWeightKg,
    scheduleConfigured: existingPlan.scheduleConfigured,
  };
  const result = calculateFeedingPlan(calculationInputs);
  const computed = buildFeedingPlan(calculationInputs, result);

  return {
    ...existingPlan,
    ...computed,
    id: existingPlan.id,
    createdAt: existingPlan.createdAt,
    foodId: existingPlan.foodId,
    foodName: computed.isVetLocked ? computed.foodName : existingPlan.foodName,
    foodBrand: computed.isVetLocked ? computed.foodBrand : existingPlan.foodBrand,
    treatsCountToday: existingPlan.treatsCountToday,
    isVetLocked: Boolean(computed.isVetLocked || orphanedVetLock),
  };
}
