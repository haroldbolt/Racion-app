export type Language = 'es' | 'en';
export type UnitSystem = 'metric' | 'imperial';

export const TRANSLATIONS = {
  es: {
    appName: 'Ración App',
    tagline: 'La ración exacta de cualquier alimento, para cualquier perro o gato, con seguimiento hasta su peso ideal.',
    disclaimer: 'Guía educativa basada en NRC 2006, WSAVA y AAHA. No diagnostica ni sustituye la consulta con un médico veterinario con licencia.',
    tabToday: 'Hoy',
    tabPets: 'Mis Mascotas',
    tabCalculate: '+ Calcular',
    tabProgress: 'Progreso',
    tabMore: 'Más',
    // Home
    todayTitle: 'Hoy para {name}',
    heroGramsPerMeal: '{grams} g por comida',
    heroKcalPerMeal: '({kcal} kcal en cada toma)',
    nextMealTitle: 'Próxima comida',
    hasEatenQuestion: '¿Ya comió?',
    markEaten: 'Marcar "Ya comió"',
    markedBy: 'Comió a las {time} con {name}',
    undoMeal: 'Desmarcar',
    waterGoalTitle: 'Meta de agua del día',
    waterGoalSubtitle: 'Aprox. 50-60 ml por kg para cuidar sus riñones',
    waterGlasses: '{count} tazones ({ml} ml)',
    addBowl: '+ 1 tazón',
    treatsTitle: 'Premios permitidos hoy',
    treatsSubtitle: 'Máximo el 10% de su energía diaria (ya descontado de la ración)',
    treatsBudgetRemaining: '{kcal} kcal restantes en premios',
    bagDurationTitle: 'Duración del bulto',
    bagDaysLeft: 'Te quedan {days} días de comida',
    bagReorderAlert: 'Reordenar antes del {date}',
    reorderButton: 'Comprar este alimento',
    // Progress
    progressTitle: 'Progreso de {name}',
    weighTodayButton: '+ Pesar hoy',
    targetWeight: 'Meta: {weight} kg',
    currentWeight: 'Actual: {weight} kg',
    weightDiffGood: 'Vas bien',
    weightDiffCheck: 'Revisemos',
    weightAlert: 'Alerta de salud',
    weightRecalcPrompt: 'Su ración cambia de {oldGrams} g a {newGrams} g al día. ¿Aplicar?',
    applyRecalc: 'Sí, aplicar nueva ración',
    dismissRecalc: 'Mantener la actual',
    growthCurveTitle: 'Curva de crecimiento esperada',
    healthLogTitle: 'Diario de salud y bienestar',
    addHealthEvent: '+ Registrar evento',
    // Calculator Wizard
    calcStep1: 'Paso 1 de 5: Mascota',
    calcStep2: 'Paso 2 de 5: Condición corporal',
    calcStep3: 'Paso 3 de 5: Objetivo de peso',
    calcStep4: 'Paso 4 de 5: Tipo de alimento',
    calcStep5: 'Paso 5 de 5: Comidas al día',
    nextStep: 'Continuar',
    backStep: 'Atrás',
    seePlan: 'Ver su plan',
    bcsHelp: 'Tócalo: debes sentir las costillas con una capa fina de grasa.',
    bcsRibsNoticeable: 'Se le notan las costillas',
    bcsWaistVisible: 'Cintura visible (Ideal)',
    bcsNoWaist: 'Sin cintura (Sobrepeso)',
    goalMaintain: 'Mantener peso',
    goalLose: 'Bajar de peso saludablemente',
    goalGain: 'Subir de peso / Recuperación',
    goalGrowth: 'Crecimiento (cachorro o gatito)',
    foodDry: 'Solo seco (croquetas)',
    foodWet: 'Solo húmedo (latas o sobres)',
    foodMixed: 'Mixto (seco + húmedo por kcal)',
    mealsCount: '¿Cuántas comidas al día?',
    savePlanButton: 'Guardar este plan',
    // Vet Module
    vetModuleTitle: 'Módulo Veterinario',
    vetGuidelineNotice: 'Pauta médica prescrita por el veterinario',
    lockedByVet: 'Bloqueado por pauta veterinaria',
    exportPdfForVet: 'Generar Informe PDF para el veterinario',
    shareWhatsapp: 'Compartir por WhatsApp',
    emergencyTitle: 'Pantalla de Emergencia',
    emergencyCallVet: 'Llamar a mi veterinario de urgencia',
    emergencyClinicSearch: 'Clínicas veterinarias 24h cercanas',
    toxicFirstStepsTitle: 'Primeros auxilios ante comida tóxica',
    // Payment
    unlockLifetimeTitle: 'Desbloquear para siempre - $ 80.000 COP (~20 USD)',
    oneTimePaymentTag: 'Pago único - sin suscripción',
    unlockLifetimeDesc: 'La ración exacta de cualquier alimento, para todas tus mascotas, para siempre en todos tus dispositivos.',
    activateKey: 'Tengo una clave de licencia',
    // Settings
    settingsTitle: 'Ajustes y Familia',
    familyRolesTitle: 'Familia compartida',
    exportDataTitle: 'Exportar mis datos (CSV / PDF)',
    deleteAccountTitle: 'Borrar todos mis datos',
    languageLabel: 'Idioma',
    unitsLabel: 'Unidades',
    // PWA
    installApp: 'Instalar Ración App',
    offlineModeNotice: 'Sin conexión — Usando tus datos guardados localmente.',
  },
  en: {
    appName: 'Ración App',
    tagline: 'The exact feeding ration of ANY food, for any dog or cat, tracking until their ideal weight.',
    disclaimer: 'Educational guide based on NRC 2006, WSAVA and AAHA. Does not diagnose or replace a licensed veterinarian.',
    tabToday: 'Today',
    tabPets: 'My Pets',
    tabCalculate: '+ Calculate',
    tabProgress: 'Progress',
    tabMore: 'More',
    todayTitle: 'Today for {name}',
    heroGramsPerMeal: '{grams} g per meal',
    heroKcalPerMeal: '({kcal} kcal each feeding)',
    nextMealTitle: 'Next meal',
    hasEatenQuestion: 'Already ate?',
    markEaten: 'Mark as "Fed"',
    markedBy: 'Ate at {time} with {name}',
    undoMeal: 'Undo',
    waterGoalTitle: 'Daily water goal',
    waterGoalSubtitle: 'Approx. 50-60 ml per kg to protect their kidneys',
    waterGlasses: '{count} bowls ({ml} ml)',
    addBowl: '+ 1 bowl',
    treatsTitle: 'Treats allowed today',
    treatsSubtitle: 'Maximum 10% of daily energy (already subtracted from ration)',
    treatsBudgetRemaining: '{kcal} kcal remaining in treats',
    bagDurationTitle: 'Food bag duration',
    bagDaysLeft: '{days} days of food left in bag',
    bagReorderAlert: 'Reorder before {date}',
    reorderButton: 'Reorder this food',
    progressTitle: "Progress for {name}",
    weighTodayButton: '+ Weigh today',
    targetWeight: 'Goal: {weight} kg',
    currentWeight: 'Current: {weight} kg',
    weightDiffGood: "You're on track",
    weightDiffCheck: "Let's review",
    weightAlert: 'Health alert',
    weightRecalcPrompt: 'Their ration changes from {oldGrams} g to {newGrams} g per day. Apply?',
    applyRecalc: 'Yes, apply new ration',
    dismissRecalc: 'Keep current',
    growthCurveTitle: 'Expected growth curve',
    healthLogTitle: 'Health & wellness journal',
    addHealthEvent: '+ Log health event',
    calcStep1: 'Step 1 of 5: Pet',
    calcStep2: 'Step 2 of 5: Body condition',
    calcStep3: 'Step 3 of 5: Weight goal',
    calcStep4: 'Step 4 of 5: Food selection',
    calcStep5: 'Step 5 of 5: Meals per day',
    nextStep: 'Continue',
    backStep: 'Back',
    seePlan: 'See their plan',
    bcsHelp: 'Feel them: you should feel the ribs under a thin layer of fat.',
    bcsRibsNoticeable: 'Ribs easily noticeable',
    bcsWaistVisible: 'Visible waist (Ideal)',
    bcsNoWaist: 'No waist (Overweight)',
    goalMaintain: 'Maintain weight',
    goalLose: 'Healthy weight loss',
    goalGain: 'Weight gain / Recovery',
    goalGrowth: 'Growth (puppy or kitten)',
    foodDry: 'Dry only (kibble)',
    foodWet: 'Wet only (cans or pouches)',
    foodMixed: 'Mixed (dry + wet by kcal)',
    mealsCount: 'How many meals per day?',
    savePlanButton: 'Save this plan',
    vetModuleTitle: 'Veterinary Module',
    vetGuidelineNotice: 'Prescribed vet guideline',
    lockedByVet: 'Locked by veterinary guideline',
    exportPdfForVet: 'Generate PDF Vet Report',
    shareWhatsapp: 'Share via WhatsApp',
    emergencyTitle: 'Emergency Screen',
    emergencyCallVet: 'Call my emergency veterinarian',
    emergencyClinicSearch: 'Nearest 24h vet clinics',
    toxicFirstStepsTitle: 'First aid for toxic foods',
    unlockLifetimeTitle: 'Unlock forever - $ 80,000 COP (~$20 USD)',
    oneTimePaymentTag: 'One-time payment - no subscription',
    unlockLifetimeDesc: 'The exact feeding ration for any food, for all your pets, forever on all your household devices.',
    activateKey: 'I have a license key',
    settingsTitle: 'Settings & Family',
    familyRolesTitle: 'Family sharing',
    exportDataTitle: 'Export my data (CSV / PDF)',
    deleteAccountTitle: 'Delete all my data',
    languageLabel: 'Language',
    unitsLabel: 'Units',
    installApp: 'Install Ración App',
    offlineModeNotice: 'Offline mode — Using locally saved data.',
  },
};

export function t(key: keyof typeof TRANSLATIONS.es, lang: Language = 'es', params?: Record<string, string | number>): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.es;
  let text = dict[key] || TRANSLATIONS.es[key] || (key as string);

  if (params) {
    Object.entries(params).forEach(([paramKey, val]) => {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(val));
    });
  }

  return text;
}

/**
 * Format weight according to metric/imperial
 */
export function formatWeight(kg: number, units: UnitSystem = 'metric'): string {
  if (units === 'imperial') {
    const lb = (kg * 2.20462).toFixed(1);
    return `${lb} lb`;
  }
  return `${kg.toFixed(1)} kg`;
}

/**
 * Format food ration in grams or ounces
 */
export function formatRation(grams: number, units: UnitSystem = 'metric'): string {
  if (units === 'imperial') {
    const oz = (grams / 28.3495).toFixed(1);
    return `${oz} oz`;
  }
  return `${grams} g`;
}

/**
 * Format currency in Colombian Pesos (COP - $)
 * e.g. formatCOP(280000) => "$ 280.000" or "$ 280.000 COP"
 */
export function formatCOP(amount: number, showCode: boolean = false): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '$ 0';
  }
  const rounded = Math.round(amount);
  const formatted = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(rounded);

  return showCode ? `${formatted} COP` : formatted;
}
