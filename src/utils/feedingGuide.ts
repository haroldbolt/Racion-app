import {
  BreedSize,
  FeedingPlan,
  FoodItem,
  HydrationDailyState,
  Pet,
  TreatCatalogItem,
  TreatLog,
} from '../types';
import { findBreedProfile } from '../data/breeds';
import { PET_FOODS_DATABASE } from '../data/foods';

export interface RuleSourceItem {
  rule: string;
  source: string;
  detail: string;
}

export interface VerifiedFoodAlternative {
  food: FoodItem;
  fitReason: string;
}

export interface FoodCompatibilityReview {
  status: 'compatible' | 'needs_label' | 'incompatible' | 'vet_supervised' | 'barf_vet_referral';
  productTitle: string;
  oneSentenceReason: string;
  isPuppy: boolean;
  puppyGrowthChecks: {
    applicable: boolean;
    isCompleteConfirmed: boolean;
    suitableForGrowthConfirmed: boolean;
    summary: string;
  };
  breedFormatGuidance: string;
  needsLabelReview: boolean;
  missingFields: string[];
  alternatives: VerifiedFoodAlternative[];
  alternativesBlockedByVetPlan: boolean;
  vetLockNote: string | null;
  sources: RuleSourceItem[];
}

export interface HydrationGuidance {
  hasValidatedRule: boolean;
  alwaysAvailableText: string;
  dailyReferenceMl: { min: number; max: number; midpoint: number } | null;
  includesFoodMoisture: boolean;
  foodMoistureEstimatedMl: number;
  moistureNote: string;
  notAQuotaNote: string;
  vetReferralRequired: boolean;
  vetReferralReason: string | null;
  sources: RuleSourceItem[];
}

export interface TreatsGuidance {
  isEligibleFor10PctCap: boolean;
  dailyBudgetKcal: number;
  usedKcalToday: number;
  remainingKcalToday: number;
  treatCountToday: number;
  maxPiecesForSelectedTreat: number | null;
  pieceCalculationNote: string;
  canAllocatePuppyTrainingFromRation: boolean;
  trainingGramsAllocatedToday: number;
  bowlGramsTotalToday: number;
  vetRestrictionNote: string | null;
  sources: RuleSourceItem[];
}

export interface BarfAndSpecialGuidance {
  showCard: boolean;
  isBarf: boolean;
  isTherapeuticOrRestricted: boolean;
  barfRisks: Array<{ title: string; detail: string }>;
  vetReferralBanner: string;
  respectsVetPlan: boolean;
  registeredVetPlanSummary: string | null;
}

export interface NextStepRecommendation {
  id: 'complete_label' | 'configure_schedule' | 'refine_profile';
  title: string;
  description: string;
  ctaLabel: string;
}

export interface NextMealStatus {
  nextMealIndex: number | null;
  nextMealTime: string | null;
  nextMealGrams: number | null;
  allMealsCompleted: boolean;
  completedMealsCount: number;
  totalMealsCount: number;
  consumedGramsMeals: number;
  trainingGramsToday: number;
  consumedKcalTotal: number;
  targetKcalTotal: number;
}

export function getPetAgeMonths(pet: Pet): number {
  if (typeof pet.ageMonths === 'number' && pet.ageMonths > 0) {
    return pet.ageMonths;
  }
  return Math.max(1, Math.round((pet.ageYears ?? 2) * 12));
}

export function isPetPuppy(pet: Pet): boolean {
  const profile = findBreedProfile(pet.breed, pet.species, pet.breedSize);
  const ageMonths = getPetAgeMonths(pet);
  return ageMonths < profile.growthMonths;
}

export function isPetSenior(pet: Pet): boolean {
  const profile = findBreedProfile(pet.breed, pet.species, pet.breedSize);
  const ageYears = getPetAgeMonths(pet) / 12;
  return ageYears >= profile.seniorAgeYears;
}

export function getEffectiveFoodItem(plan?: FeedingPlan): FoodItem | undefined {
  if (!plan) return undefined;
  if (plan.foodType === 'wet') return plan.wetFood || plan.dryFood;
  return plan.dryFood || plan.wetFood;
}

export function hasConfirmedLabel(food?: FoodItem): boolean {
  if (!food) return false;
  if (food.type === 'barf') return false;
  const statusOk =
    food.labelStatus === 'verified_manufacturer' || food.labelStatus === 'user_confirmed_label';
  return statusOk && typeof food.kcalPerKg === 'number' && food.kcalPerKg > 400;
}

export function hasClinicalOrVetPlan(pet: Pet, plan?: FeedingPlan): boolean {
  const hasRestrictions = Array.isArray(pet.restrictions) && pet.restrictions.length > 0;
  return Boolean(
    pet.hasVetGuideline ||
      pet.vetGuideline?.locked ||
      plan?.isVetLocked ||
      pet.dietType === 'therapeutic' ||
      pet.specialState !== 'none' ||
      hasRestrictions
  );
}

function getEffectiveBreedSize(pet: Pet): { size: BreedSize; isAdultWeightKnown: boolean } {
  const profile = findBreedProfile(pet.breed, pet.species, pet.breedSize);
  if (pet.expectedAdultWeightKg && pet.expectedAdultWeightKg > 0) {
    const w = pet.expectedAdultWeightKg;
    if (w < 5) return { size: 'toy', isAdultWeightKnown: true };
    if (w <= 10) return { size: 'small', isAdultWeightKnown: true };
    if (w <= 25) return { size: 'medium', isAdultWeightKnown: true };
    if (w <= 44) return { size: 'large', isAdultWeightKnown: true };
    return { size: 'giant', isAdultWeightKnown: true };
  }
  const isUnknownMixed =
    /mestizo|no s[eé]|mixed/i.test(pet.breed || '') &&
    Boolean(pet.profileRefinementPending?.adultWeight);
  return {
    size: pet.breedSize || profile.size,
    isAdultWeightKnown: !isUnknownMixed,
  };
}

function getBreedFormatOrientation(pet: Pet): string {
  if (pet.species !== 'dog') {
    return 'Formato sugerido: croqueta pequeña o alimento húmedo completo según preferencia.';
  }
  const { size, isAdultWeightKnown } = getEffectiveBreedSize(pet);
  const puppy = isPetPuppy(pet);

  if (!isAdultWeightKnown && puppy) {
    return 'Como aún no se conoce su peso adulto esperado, el formato ideal (croqueta mini, mediana o maxicontrolada) se afina al estimar su talla adulta.';
  }

  switch (size) {
    case 'toy':
      return puppy
        ? `Para ${pet.breed.split('/')[0].trim()} cachorro (talla toy): prioriza croqueta mini/extra-pequeña fácil de masticar o húmedo completo para crecimiento.`
        : `Para ${pet.breed.split('/')[0].trim()} (talla toy): conviene croqueta extra-pequeña que facilite la prensión y masticación.`;
    case 'small':
      return puppy
        ? 'Para talla pequeña en crecimiento: croqueta pequeña de alta digestibilidad o fórmula húmeda completa para cachorros.'
        : 'Para talla pequeña: croqueta pequeña adaptada a mandíbula compacta.';
    case 'large':
    case 'giant':
      return puppy
        ? 'Para talla grande/gigante en crecimiento: croqueta grande con calcio/fósforo controlados y energía moderada para cuidar articulaciones.'
        : 'Para talla grande/gigante: croqueta grande que fomente la masticación lenta y soporte articular.';
    default:
      return puppy
        ? 'Para talla mediana en crecimiento: croqueta mediana completa para cachorros o alimentación mixta calculada por kcal.'
        : 'Para talla mediana: croqueta mediana o combinación seco + húmedo balanceada por kcal.';
  }
}

function getVerifiedAlternatives(
  pet: Pet,
  currentFood: FoodItem | undefined,
  catalog: FoodItem[]
): VerifiedFoodAlternative[] {
  const puppy = isPetPuppy(pet);
  const { size, isAdultWeightKnown } = getEffectiveBreedSize(pet);
  const restrictionText = `${(pet.restrictions || []).join(' ')} ${pet.restrictionNotes || ''}`.toLowerCase();

  const candidates = catalog.filter((f) => {
    if (f.species !== pet.species) return false;
    if (currentFood && f.id === currentFood.id) return false;
    if (!hasConfirmedLabel(f)) return false;

    // Exclude therapeutic prescription formulas from general healthy OTC swaps
    if (/veterinary|satiety|renal|urinary/i.test(f.name)) return false;

    if (puppy) {
      if (f.isCompleteAndBalanced === false) return false;
      if (!f.suitableForGrowth && f.lifeStage !== 'puppy' && f.lifeStage !== 'all') return false;
    } else {
      if (f.lifeStage === 'puppy' || f.lifeStage === 'kitten') return false;
    }

    // Basic mild ingredient avoidance if user noted one (e.g. "sin pollo")
    if (restrictionText.includes('pollo') && /pollo|chicken|ave/i.test(f.ingredientsSummary || f.name)) {
      return false;
    }
    if (restrictionText.includes('maíz') && /ma[íi]z/i.test(f.ingredientsSummary || '')) {
      return false;
    }

    return true;
  });

  const scored = candidates.map((food) => {
    let score = food.score || 80;
    const kibbleSizes = food.kibbleSizeSuitability || [];
    const matchesSize = kibbleSizes.includes(size);
    if (matchesSize) score += 25;
    if (puppy && food.lifeStage === 'puppy') score += 15;
    if (!puppy && food.lifeStage === 'adult') score += 10;
    if (food.type === 'dry') score += 5;

    const sizeLabel =
      size === 'toy'
        ? 'talla toy'
        : size === 'small'
        ? 'talla pequeña'
        : size === 'large'
        ? 'talla grande'
        : size === 'giant'
        ? 'talla gigante'
        : 'talla mediana';

    let fitReason = '';
    if (puppy) {
      fitReason = matchesSize
        ? `Encaja por ser alimento completo para crecimiento con croqueta adaptada a ${sizeLabel} (${food.kcalPerKg} kcal/kg verificadas).`
        : `Fórmula completa verificada para etapa de crecimiento (${food.kcalPerKg} kcal/kg según fabricante).`;
    } else {
      const adultNote = isAdultWeightKnown ? `para ${sizeLabel}` : 'para perro adulto';
      fitReason = matchesSize
        ? `Encaja ${adultNote}: nutrición completa de mantenimiento y formato adecuado (${food.kcalPerKg} kcal/kg).`
        : `Fórmula completa de mantenimiento verificada por fabricante (${food.kcalPerKg} kcal/kg).`;
    }

    return { food, fitReason, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(({ food, fitReason }) => ({ food, fitReason }));
}

export function evaluateCurrentFood(
  pet: Pet,
  plan?: FeedingPlan,
  catalog: FoodItem[] = PET_FOODS_DATABASE
): FoodCompatibilityReview {
  const puppy = isPetPuppy(pet);
  const senior = isPetSenior(pet);
  const food = getEffectiveFoodItem(plan);
  const clinicalOrVet = hasClinicalOrVetPlan(pet, plan);
  const isBarf = pet.dietType === 'barf' || plan?.foodType === 'barf';
  const breedFormatGuidance = getBreedFormatOrientation(pet);

  const productTitle = isBarf
    ? 'Dieta BARF / Natural Cruda'
    : food
    ? `${food.brand} ${food.name}`
    : plan
    ? `${plan.foodBrand} ${plan.foodName}`
    : 'Sin alimento confirmado';

  const baseSources: RuleSourceItem[] = [
    {
      rule: 'Evaluación de etapa de vida y crecimiento',
      source: 'Guías nutricionales WSAVA / AAFCO / FEDIAF',
      detail: puppy
        ? 'Los cachorros en crecimiento requieren alimento declarado completo y formulado específicamente para crecimiento o todas las etapas incluido crecimiento.'
        : 'Los perros adultos requieren alimento completo de mantenimiento acorde a su etapa, tamaño y estado fisiológico.',
    },
    {
      rule: 'Requerimiento energético basal y diario (RER / MER)',
      source: 'NRC 2006 (National Research Council) & AAHA',
      detail: 'RER = 70 × (peso en kg)^0.75 ajustado por etapa de vida, sexo, esterilización, actividad y talla racial.',
    },
  ];

  // 1. BARF diet
  if (isBarf) {
    return {
      status: 'barf_vet_referral',
      productTitle,
      oneSentenceReason:
        'Registraste dieta BARF: su formulación, cantidades y transición requieren supervisión veterinaria para evitar desbalances o riesgos sanitarios.',
      isPuppy: puppy,
      puppyGrowthChecks: {
        applicable: puppy,
        isCompleteConfirmed: false,
        suitableForGrowthConfirmed: false,
        summary: puppy
          ? 'En cachorros, una dieta cruda sin formulación veterinaria conlleva alto riesgo de desbalance calcio/fósforo y déficit calórico.'
          : 'No aplica etiqueta comercial estándar.',
      },
      breedFormatGuidance:
        'Para textura y tamaño de porciones BARF o inclusión de huesos, sigue exactamente la indicación de un nutricionista veterinario.',
      needsLabelReview: false,
      missingFields: [],
      alternatives: [],
      alternativesBlockedByVetPlan: true,
      vetLockNote:
        'Al tener dieta BARF activa, derivamos la elección de fórmulas, cantidades o transiciones a tu médico veterinario.',
      sources: [
        ...baseSources,
        {
          rule: 'Protocolo para dietas crudas (BARF)',
          source: 'WSAVA Global Nutrition Committee',
          detail: 'Advierte sobre contaminación bacteriana/parasitaria, riesgo mecánico de huesos y desequilibrios nutricionales sin formulación clínica.',
        },
      ],
    };
  }

  const labelOk = hasConfirmedLabel(food);
  const missingFields: string[] = [];
  if (!labelOk) {
    missingFields.push('Densidad calórica confirmada (kcal/kg)');
    missingFields.push('Fórmula exacta confirmada en etiqueta o ficha del fabricante');
  }
  if (puppy && (!food?.isCompleteAndBalanced || !food?.suitableForGrowth)) {
    if (!missingFields.includes('Declaración de alimento completo y adecuado para crecimiento')) {
      missingFields.push('Declaración de alimento completo y adecuado para crecimiento');
    }
  }

  // 2. Therapeutic / Registered Vet Plan / Clinical Restrictions
  if (clinicalOrVet) {
    const vetFoodName = pet.vetGuideline?.prescribedFoodName || productTitle;
    const conditionNote = pet.vetGuideline?.locked
      ? `Plan regido por la pauta veterinaria registrada (${vetFoodName}) para respetar la prescripción clínica.`
      : `Por la condición clínica o restricción registrada (${pet.restrictionNotes || pet.specialState}), la elección de fórmula y porciones debe validarla su veterinario.`;

    return {
      status: 'vet_supervised',
      productTitle: vetFoodName,
      oneSentenceReason: conditionNote,
      isPuppy: puppy,
      puppyGrowthChecks: {
        applicable: puppy,
        isCompleteConfirmed: Boolean(food?.isCompleteAndBalanced),
        suitableForGrowthConfirmed: Boolean(food?.suitableForGrowth),
        summary: puppy
          ? 'En cachorros con dieta veterinaria, el médico tratante define el balance de crecimiento.'
          : 'Supervisión veterinaria activa.',
      },
      breedFormatGuidance,
      needsLabelReview: !plan?.isVetLocked && !labelOk,
      missingFields: plan?.isVetLocked ? [] : missingFields,
      alternatives: [], // Respect registered vet plan — do not suggest commercial OTC swaps
      alternativesBlockedByVetPlan: true,
      vetLockNote:
        'Las recomendaciones comerciales están desactivadas para respetar su plan veterinario o restricción clínica. Consulta con tu veterinario antes de cambiar de fórmula.',
      sources: [
        ...baseSources,
        {
          rule: 'Respeto a pauta terapéutica y restricciones clínicas',
          source: 'Criterio clínico veterinario',
          detail: 'Las dietas terapéuticas y patologías médicas no se reemplazan por fórmulas comerciales estándar ni cálculos automáticos.',
        },
      ],
    };
  }

  // 3. Healthy dog WITHOUT confirmed label / manufacturer sheet (e.g., Ringo Cachorros from catalog)
  if (!labelOk) {
    const missingDesc = puppy
      ? 'Falta confirmar en la etiqueta su fórmula exacta, las kcal/kg y si declara ser alimento completo y adecuado para crecimiento.'
      : 'El catálogo aporta nombre y presentación, pero falta confirmar en la etiqueta sus kcal/kg y datos de respaldo para calcular la ración.';

    return {
      status: 'needs_label',
      productTitle,
      oneSentenceReason: missingDesc,
      isPuppy: puppy,
      puppyGrowthChecks: {
        applicable: puppy,
        isCompleteConfirmed: false,
        suitableForGrowthConfirmed: false,
        summary: puppy
          ? 'Pendiente por verificar en la etiqueta: (1) alimento completo y (2) adecuado para crecimiento.'
          : 'No aplica verificación de crecimiento (etapa adulta).',
      },
      breedFormatGuidance,
      needsLabelReview: true,
      missingFields,
      alternatives: getVerifiedAlternatives(pet, food, catalog),
      alternativesBlockedByVetPlan: false,
      vetLockNote: null,
      sources: [
        ...baseSources,
        {
          rule: 'Validación estricta de etiqueta o ficha técnica',
          source: 'Regla de datos verificados Ración App',
          detail: 'No asumimos ni inventamos kcal/kg ni declaraciones de crecimiento cuando el catálogo no trae ficha nutricional confirmada.',
        },
      ],
    };
  }

  // 4. Label IS confirmed — evaluate life stage & breed fit
  const isCompleteConfirmed = food?.isCompleteAndBalanced !== false;
  const suitableForGrowthConfirmed =
    Boolean(food?.suitableForGrowth) || food?.lifeStage === 'puppy' || food?.lifeStage === 'all';

  if (puppy && (!isCompleteConfirmed || !suitableForGrowthConfirmed)) {
    return {
      status: 'incompatible',
      productTitle,
      oneSentenceReason: !isCompleteConfirmed
        ? `La etiqueta de ${productTitle} no declara que sea un alimento completo; para un cachorro requiere una fórmula completa de crecimiento.`
        : `${productTitle} figura para mantenimiento adulto y no declara adecuación para crecimiento de cachorro.`,
      isPuppy: true,
      puppyGrowthChecks: {
        applicable: true,
        isCompleteConfirmed,
        suitableForGrowthConfirmed,
        summary: 'No cumple ambos requisitos de etiqueta para cachorro (alimento completo + adecuado para crecimiento).',
      },
      breedFormatGuidance,
      needsLabelReview: true,
      missingFields: ['Confirmar declaración de alimento completo para crecimiento'],
      alternatives: getVerifiedAlternatives(pet, food, catalog),
      alternativesBlockedByVetPlan: false,
      vetLockNote: null,
      sources: baseSources,
    };
  }

  if (!puppy && food?.lifeStage === 'puppy') {
    return {
      status: 'incompatible',
      productTitle,
      oneSentenceReason: `${productTitle} está formulado para cachorros en crecimiento y puede aportar exceso calórico para un perro adulto.`,
      isPuppy: false,
      puppyGrowthChecks: {
        applicable: false,
        isCompleteConfirmed,
        suitableForGrowthConfirmed,
        summary: 'No aplica (etapa adulta).',
      },
      breedFormatGuidance,
      needsLabelReview: false,
      missingFields: [],
      alternatives: getVerifiedAlternatives(pet, food, catalog),
      alternativesBlockedByVetPlan: false,
      vetLockNote: null,
      sources: baseSources,
    };
  }

  const dataSourceLabel = food?.dataSource || 'ficha confirmada';
  const stageSentence = puppy
    ? `Compatible con crecimiento: ${dataSourceLabel} confirma alimento completo y adecuado para cachorros (${food?.kcalPerKg} kcal/kg).`
    : senior
    ? `Compatible para etapa senior/adulto: ${dataSourceLabel} respalda nutrición completa (${food?.kcalPerKg} kcal/kg).`
    : `Compatible para perro adulto: ${dataSourceLabel} confirma nutrición completa de mantenimiento (${food?.kcalPerKg} kcal/kg).`;

  return {
    status: 'compatible',
    productTitle,
    oneSentenceReason: stageSentence,
    isPuppy: puppy,
    puppyGrowthChecks: {
      applicable: puppy,
      isCompleteConfirmed,
      suitableForGrowthConfirmed,
      summary: puppy
        ? 'Etiqueta confirmada: alimento completo y adecuado para crecimiento.'
        : 'No aplica (etapa adulta).',
    },
    breedFormatGuidance,
    needsLabelReview: false,
    missingFields: [],
    alternatives: getVerifiedAlternatives(pet, food, catalog),
    alternativesBlockedByVetPlan: false,
    vetLockNote: null,
    sources: [
      ...baseSources,
      {
        rule: 'Fuente del producto evaluado',
        source: dataSourceLabel,
        detail: `Densidad calórica verificada: ${food?.kcalPerKg} kcal/kg · Etapa: ${food?.lifeStage}.`,
      },
    ],
  };
}

export function evaluateHydration(
  pet: Pet,
  plan?: FeedingPlan,
  hydrationState?: HydrationDailyState
): HydrationGuidance {
  const intakeChangeFlag = hydrationState?.intakeChangeFlag || 'none';
  const hasWaterIntakeShift = intakeChangeFlag === 'much_more' || intakeChangeFlag === 'much_less';
  const isBarf = pet.dietType === 'barf' || plan?.foodType === 'barf';
  const hasHydrationPathology =
    pet.specialState === 'kidney' ||
    pet.specialState === 'diabetes' ||
    pet.specialState === 'hospitalised' ||
    pet.specialState === 'pancreatitis';
  const isVetLocked = Boolean(pet.hasVetGuideline || plan?.isVetLocked || pet.dietType === 'therapeutic');

  const hasValidatedRule =
    !hasWaterIntakeShift && !isBarf && !hasHydrationPathology && !isVetLocked && pet.currentWeightKg > 0;

  let foodMoistureEstimatedMl = 0;
  if (plan?.rationConfirmed && plan.gramsPerDay > 0) {
    if (plan.foodType === 'wet') {
      const moisture = (plan.wetFood?.moisturePct ?? 80) / 100;
      foodMoistureEstimatedMl = Math.round(plan.gramsPerDay * moisture);
    } else if (plan.foodType === 'mixed' && plan.dryFood && plan.wetFood) {
      const dryGrams = Math.round(plan.gramsPerDay * ((plan.mixedDryPct || 50) / 100));
      const wetGrams = Math.max(0, plan.gramsPerDay - dryGrams);
      foodMoistureEstimatedMl = Math.round(
        dryGrams * ((plan.dryFood.moisturePct ?? 10) / 100) +
          wetGrams * ((plan.wetFood.moisturePct ?? 80) / 100)
      );
    } else {
      const moisture = (plan?.dryFood?.moisturePct ?? 10) / 100;
      foodMoistureEstimatedMl = Math.round(plan.gramsPerDay * moisture);
    }
  }

  let vetReferralReason: string | null = null;
  if (hasWaterIntakeShift) {
    vetReferralReason =
      intakeChangeFlag === 'much_more'
        ? 'Reportaste que está tomando mucha más agua de lo habitual: consulta al veterinario pronto para descartar causas renales, endocrinas o metabólicas.'
        : 'Reportaste una disminución marcada en el consumo de agua: consulta al veterinario para evaluar hidratación y estado clínico.';
  } else if (hasHydrationPathology || isVetLocked) {
    vetReferralReason =
      'Con dieta veterinaria o condición clínica activa, la pauta hídrica debe seguir exactamente la indicación de tu veterinario.';
  } else if (isBarf) {
    vetReferralReason =
      'Las dietas BARF tienen humedad variable (~65-75%). Mantén agua fresca disponible y valida requerimientos hídricos con tu veterinario.';
  }

  const dailyReferenceMl = hasValidatedRule
    ? {
        min: Math.round(pet.currentWeightKg * 50),
        max: Math.round(pet.currentWeightKg * 60),
        midpoint: Math.round(pet.currentWeightKg * 55),
      }
    : null;

  const moistureNote =
    foodMoistureEstimatedMl > 0
      ? `Esta cifra de ingesta total incluye el agua contenida en su alimento (~${foodMoistureEstimatedMl} ml/día aprox. según la humedad de su ración).`
      : 'Esta cifra de ingesta total incluye tanto el agua que bebe del plato como la humedad propia del alimento (aprox. 8–10% en croquetas secas y 75–82% en húmedo).';

  return {
    hasValidatedRule,
    alwaysAvailableText: 'Agua fresca y limpia disponible siempre (ad libitum).',
    dailyReferenceMl,
    includesFoodMoisture: true,
    foodMoistureEstimatedMl,
    moistureNote,
    notAQuotaNote:
      'Es una referencia fisiológica orientativa, nunca una cuota obligatoria que el perro deba terminar.',
    vetReferralRequired: !hasValidatedRule,
    vetReferralReason,
    sources: [
      {
        rule: 'Referencia hídrica diaria (50–60 ml/kg/día)',
        source: 'NRC 2006 / FEDIAF Nutritional Guidelines',
        detail: 'Representa la ingesta total de agua (bebida + humedad del alimento) en perros sanos en ambiente templado.',
      },
    ],
  };
}

export function evaluateTreatsBudget(
  pet: Pet,
  plan?: FeedingPlan,
  treatsToday: TreatLog[] = [],
  selectedTreat?: Pick<TreatCatalogItem, 'name' | 'kcalPerUnit' | 'hasKcalPerUnitOnLabel'> | null
): TreatsGuidance {
  const clinicalOrVet = hasClinicalOrVetPlan(pet, plan);
  const puppy = isPetPuppy(pet);
  const mer = plan?.mer || 0;
  const isEligibleFor10PctCap = !clinicalOrVet && mer > 0;
  const dailyBudgetKcal = isEligibleFor10PctCap ? Math.round(mer * 0.1) : 0;

  const usedKcalToday = treatsToday.reduce((sum, t) => sum + (Number(t.kcal) || 0), 0);
  const remainingKcalToday = Math.max(0, dailyBudgetKcal - usedKcalToday);

  let maxPiecesForSelectedTreat: number | null = null;
  let pieceCalculationNote =
    'Calculamos piezas únicamente cuando la etiqueta indica kcal por unidad (siempre redondeando hacia abajo).';

  if (!isEligibleFor10PctCap) {
    pieceCalculationNote =
      'Con dieta veterinaria o restricción clínica activa, los premios requieren aprobación previa del veterinario.';
  } else if (selectedTreat) {
    if (
      selectedTreat.hasKcalPerUnitOnLabel &&
      typeof selectedTreat.kcalPerUnit === 'number' &&
      selectedTreat.kcalPerUnit > 0
    ) {
      maxPiecesForSelectedTreat = Math.floor(remainingKcalToday / selectedTreat.kcalPerUnit);
      pieceCalculationNote = `Tope restante de ${remainingKcalToday} kcal ÷ ${selectedTreat.kcalPerUnit} kcal/unidad = máximo ${maxPiecesForSelectedTreat} ${
        maxPiecesForSelectedTreat === 1 ? 'pieza' : 'piezas'
      } hoy (redondeado hacia abajo).`;
    } else {
      maxPiecesForSelectedTreat = null;
      pieceCalculationNote = `${selectedTreat.name} no indica kcal por unidad en etiqueta: no estimamos piezas al azar; registra el consumo por kcal totales.`;
    }
  }

  const rationConfirmed = Boolean(plan?.rationConfirmed && plan.gramsPerDay > 0);
  const canAllocatePuppyTrainingFromRation =
    puppy && rationConfirmed && !plan?.isVetLocked && pet.dietType !== 'barf';

  const rawTraining = Math.max(0, Math.round(plan?.trainingRationGramsToday || 0));
  const trainingGramsAllocatedToday = rationConfirmed
    ? Math.min(rawTraining, plan?.gramsPerDay || 0)
    : 0;
  const bowlGramsTotalToday = rationConfirmed
    ? Math.max(0, (plan?.gramsPerDay || 0) - trainingGramsAllocatedToday)
    : 0;

  return {
    isEligibleFor10PctCap,
    dailyBudgetKcal,
    usedKcalToday,
    remainingKcalToday,
    treatCountToday: treatsToday.length,
    maxPiecesForSelectedTreat,
    pieceCalculationNote,
    canAllocatePuppyTrainingFromRation,
    trainingGramsAllocatedToday,
    bowlGramsTotalToday,
    vetRestrictionNote: clinicalOrVet
      ? 'Respetando la restricción clínica o plan veterinario, evita premios comerciales sin autorización del médico.'
      : null,
    sources: [
      {
        rule: 'Regla del 10 % para premios (perros sanos)',
        source: 'WSAVA Global Nutrition Toolkit / AAHA',
        detail: 'Los premios y snacks no deben superar el 10 % del requerimiento energético diario (MER) para evitar desequilibrios nutricionales.',
      },
    ],
  };
}

export function getBarfAndSpecialDietGuidance(pet: Pet, plan?: FeedingPlan): BarfAndSpecialGuidance {
  const isBarf = pet.dietType === 'barf' || plan?.foodType === 'barf';
  const isTherapeuticOrRestricted = hasClinicalOrVetPlan(pet, plan);
  const showCard = isBarf || isTherapeuticOrRestricted;

  const barfRisks = isBarf
    ? [
        {
          title: 'Contaminación microbiana y parasitaria',
          detail:
            'Las carnes crudas pueden portar Salmonella, E. coli, Campylobacter o parásitos. Mantén cadena de frío estricta, desinfecta utensilios y lava tus manos tras manipularlas (especial cuidado si hay niños o personas inmunocomprometidas).',
        },
        {
          title: 'Riesgo mecánico con huesos',
          detail:
            'Nunca des huesos cocidos (se astillan y perforan). Incluso con huesos carnosos crudos existe riesgo de fractura dental, atragantamiento u obstrucción intestinal.',
        },
        {
          title: 'Equilibrio nutricional completo',
          detail:
            'Una dieta casera o cruda mal balanceada suele presentar déficit o exceso de calcio, fósforo, zinc, yodo o vitaminas (crítico en cachorros en desarrollo).',
        },
      ]
    : [];

  const vetReferralBanner = isBarf
    ? 'Derivación veterinaria recomendada: acude a un médico veterinario o nutricionista veterinario para definir fórmulas, cantidades exactas o transiciones seguras.'
    : 'Derivación veterinaria activa: las fórmulas terapéuticas, cantidades clínicas y transiciones deben ser indicadas y ajustadas por su veterinario tratante.';

  const registeredVetPlanSummary =
    pet.hasVetGuideline && pet.vetGuideline
      ? `${pet.vetGuideline.prescribedFoodName} · ${pet.vetGuideline.prescribedGramsPerMeal} g/comida × ${pet.vetGuideline.mealsPerDay} tomas (${pet.vetGuideline.prescribedKcal} kcal/día) — ${pet.vetGuideline.vetName}`
      : null;

  return {
    showCard,
    isBarf,
    isTherapeuticOrRestricted,
    barfRisks,
    vetReferralBanner,
    respectsVetPlan: Boolean(pet.hasVetGuideline || plan?.isVetLocked),
    registeredVetPlanSummary,
  };
}

export function getNextBestStepForToday(
  pet: Pet,
  plan?: FeedingPlan,
  review?: FoodCompatibilityReview
): NextStepRecommendation | null {
  if (review?.needsLabelReview && !pet.dietType?.includes('barf')) {
    return {
      id: 'complete_label',
      title: 'Completar la etiqueta',
      description:
        'Confirma las kcal/kg y los datos del reverso de la bolsa para evaluar compatibilidad y calcular gramos exactos.',
      ctaLabel: 'Revisar etiqueta',
    };
  }

  if (plan && !plan.scheduleConfigured) {
    return {
      id: 'configure_schedule',
      title: 'Configurar horarios',
      description: `Ajusta cuántas comidas al día recibe ${pet.name} y sus horarios habituales para priorizar la próxima toma.`,
      ctaLabel: 'Configurar horarios',
    };
  }

  const ref = pet.profileRefinementPending;
  if (ref && (ref.adultWeight || ref.activity || ref.bcs)) {
    return {
      id: 'refine_profile',
      title: 'Afinar datos opcionales',
      description:
        'Cuando quieras, completa su peso adulto esperado, actividad o condición corporal para afinar aún más la guía.',
      ctaLabel: 'Completar después / ahora',
    };
  }

  return null;
}

export function getNextMealStatus(
  plan: FeedingPlan | undefined,
  mealLogs: Array<{ mealIndex: number; completed: boolean; gramsFed: number }>,
  treatLogsToday: TreatLog[] = [],
  now: Date = new Date()
): NextMealStatus {
  if (!plan) {
    return {
      nextMealIndex: null,
      nextMealTime: null,
      nextMealGrams: null,
      allMealsCompleted: false,
      completedMealsCount: 0,
      totalMealsCount: 0,
      consumedGramsMeals: 0,
      trainingGramsToday: 0,
      consumedKcalTotal: 0,
      targetKcalTotal: 0,
    };
  }

  const totalMealsCount = Math.max(1, plan.mealsPerDay || 2);
  const mealTimes = plan.mealTimes && plan.mealTimes.length > 0 ? plan.mealTimes : ['08:00', '20:00'];
  const completedLogs = mealLogs.filter((l) => l.completed);
  const completedSet = new Set(completedLogs.map((l) => l.mealIndex));

  const trainingGramsToday = plan.rationConfirmed
    ? Math.min(plan.trainingRationGramsToday || 0, plan.gramsPerDay || 0)
    : 0;
  const bowlGramsTotal = plan.rationConfirmed
    ? Math.max(0, (plan.gramsPerDay || 0) - trainingGramsToday)
    : 0;
  const perMealBowlGrams = plan.rationConfirmed ? Math.round(bowlGramsTotal / totalMealsCount) : 0;

  const nowMins = now.getHours() * 60 + now.getMinutes();
  let nextMealIndex: number | null = null;
  let bestDistance = Infinity;

  for (let idx = 0; idx < totalMealsCount; idx++) {
    if (completedSet.has(idx)) continue;
    const tStr = mealTimes[idx] || (idx === 0 ? '08:00' : '20:00');
    const [hh, mm] = tStr.split(':').map((n) => parseInt(n, 10) || 0);
    const mins = hh * 60 + mm;
    const dist = mins >= nowMins ? mins - nowMins : mins + 1440 - nowMins;
    if (dist < bestDistance) {
      bestDistance = dist;
      nextMealIndex = idx;
    }
  }

  const consumedGramsMeals = completedLogs.reduce((sum, l) => sum + (l.gramsFed || 0), 0);
  const kcalPerGram =
    plan.rationConfirmed && plan.gramsPerDay > 0 ? plan.mer / plan.gramsPerDay : 0;

  const consumedMealKcal = completedLogs.reduce((sum, l) => {
    if (kcalPerGram > 0 && l.gramsFed > 0) return sum + Math.round(l.gramsFed * kcalPerGram);
    if (plan.rationConfirmed && plan.kcalPerMeal > 0) return sum + plan.kcalPerMeal;
    return sum;
  }, 0);

  const treatsKcalToday = treatLogsToday.reduce((sum, t) => sum + (t.kcal || 0), 0);
  const trainingKcalToday =
    kcalPerGram > 0 && trainingGramsToday > 0 ? Math.round(trainingGramsToday * kcalPerGram) : 0;

  return {
    nextMealIndex,
    nextMealTime: nextMealIndex !== null ? mealTimes[nextMealIndex] || '08:00' : null,
    nextMealGrams: nextMealIndex !== null && plan.rationConfirmed ? perMealBowlGrams : null,
    allMealsCompleted: completedLogs.length >= totalMealsCount,
    completedMealsCount: completedLogs.length,
    totalMealsCount,
    consumedGramsMeals,
    trainingGramsToday,
    consumedKcalTotal: consumedMealKcal + treatsKcalToday + trainingKcalToday,
    targetKcalTotal: plan.mer || 0,
  };
}
