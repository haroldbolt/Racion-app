import React, { useState, useMemo, useEffect, useLayoutEffect } from 'react';
import { publicAssetUrl } from '../utils/publicAssetUrl';
import {
  Pet,
  FeedingPlan,
  MealLog,
  MealMixedComponent,
  UserAccount,
  FoodItem,
  WeightRecord,
  HealthLog,
  HydrationDailyState,
  TreatLog,
} from '../types';
import { formatRation, formatCOP } from '../utils/i18n';
import { StorageService } from '../utils/storage';
import { localDateKey } from '../utils/localDate';
import { getPlannedMeals, getPreviewMeals, getPlannedMealComponents, getPlanFoodKcalForGrams, getLoggedMealEnergy } from '../utils/mealPortions';
import { MealDiaryHistory } from '../components/MealDiaryHistory';
import { PlanSafetyAlerts } from '../components/FoodSafetyAlerts';
import { getPlanSafetyNotices } from '../utils/foodSafety';
import { UnifiedFoodSearchModal, resolveFoodThumbnail } from '../components/UnifiedFoodSearchModal';
import { FeedingPlanEditor } from '../components/FeedingPlanEditor';
import { FoodCostTracker } from '../components/FoodCostTracker';
import { getPlanCostSummary } from '../utils/foodCosts';
import { RationSourceNote } from '../components/ManufacturerRationInput';
import { DailyKcalRingChart } from '../components/DailyKcalRingChart';
import { HomeMealCost } from '../components/HomeMealCost';
import { LabelReviewModal } from '../components/LabelReviewModal';
import { NutritionSummary } from '../components/NutritionSummary';
import { WhyThisResultModal } from '../components/WhyThisResultModal';
import {
  ProfileRefinementModal,
  RegisterTreatModal,
  RegisterWeightModal,
  RegisterMealModal,
} from '../components/TodayActionModals';
import {
  evaluateCurrentFood,
  evaluateHydration,
  evaluateTreatsBudget,
  getBarfAndSpecialDietGuidance,
  getNextBestStepForToday,
  getNextMealStatus,
  getEffectiveFoodItem,
} from '../utils/feedingGuide';
import { calculateDailyMealNutritionSummary } from '../utils/mealNutrition';
import { defaultMealTimes, recalculatePlanForPet, requiresVetGuidance } from '../utils/calculator';
import {
  Check,
  CheckCircle2,
  Clock,
  Droplets,
  Cookie,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Lock,
  Receipt,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Edit3,
  Package,
  Trash2,
  FileText,
  ShieldAlert,
} from 'lucide-react';

interface TodayViewProps {
  pet: Pet;
  plan?: FeedingPlan;
  mealLogs: MealLog[];
  onToggleMeal: (
    mealIndex: number,
    fedBy: string,
    grams: number,
    time: string,
    plannedGrams?: number,
    forceComplete?: boolean,
    mixedComponents?: MealMixedComponent[],
    gramsEaten?: number
  ) => void;
  userAccount: UserAccount;
  onNavigateTab: (tab: 'calculate' | 'progress' | 'more' | 'pets') => void;
  onComparePrices?: (food: FoodItem) => void;
  onEditPet?: (pet: Pet) => void;
  onSavePlan?: (plan: FeedingPlan) => void;
  onUpdatePetProfile?: (pet: Pet) => void;
  onAddWeightRecord?: (record: WeightRecord) => boolean;
  onAddHealthLog?: (log: HealthLog) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  pet,
  plan,
  mealLogs,
  onToggleMeal,
  userAccount,
  onNavigateTab,
  onComparePrices,
  onEditPet,
  onSavePlan,
  onUpdatePetProfile,
  onAddWeightRecord,
  onAddHealthLog,
}) => {
  const isEs = userAccount.language === 'es';
  const units = userAccount.units;
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pet.id]);

  const [hydrationState, setHydrationState] = useState<HydrationDailyState>(() =>
    StorageService.getHydrationStateToday(pet.id)
  );
  const [treatLogsToday, setTreatLogsToday] = useState<TreatLog[]>(() =>
    StorageService.getTreatLogsToday(pet.id)
  );
  const [trainingGramsToday, setTrainingGramsToday] = useState<number>(() =>
    StorageService.getTrainingRationGramsToday(pet.id)
  );
  const [selectedFeeder, setSelectedFeeder] = useState<string>(
    () => userAccount.familyMembers[0]?.name || 'Yo'
  );

  // Sync pet-scoped daily states when switching active pet
  useEffect(() => {
    setHydrationState(StorageService.getHydrationStateToday(pet.id));
    setTreatLogsToday(StorageService.getTreatLogsToday(pet.id));
    setTrainingGramsToday(StorageService.getTrainingRationGramsToday(pet.id));
  }, [pet.id]);

  // Modals & UI panels
  const [planAdjustment, setPlanAdjustment] = useState<{ food?: FoodItem }>();
  const [foodSearch, setFoodSearch] = useState<string>();
  const [showCostTracker, setShowCostTracker] = useState(false);
  const [showLabelReview, setShowLabelReview] = useState(false);
  const [showWhyModal, setShowWhyModal] = useState(false);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [showTreatModal, setShowTreatModal] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showMealModal, setShowMealModal] = useState(false);
  const [selectedMealIndex, setSelectedMealIndex] = useState<number>();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [purchaseRefreshKey, setPurchaseRefreshKey] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Merge today's puppy training allocation into plan view
  const effectivePlan = useMemo(() => {
    if (!plan) return undefined;
    const safePlan = requiresVetGuidance(pet, plan) ? recalculatePlanForPet(pet, plan) : plan;
    return { ...safePlan, trainingRationGramsToday: trainingGramsToday };
  }, [pet, plan, trainingGramsToday]);

  const purchases = useMemo(() => StorageService.getFoodPurchases(pet.id), [pet.id, purchaseRefreshKey]);
  const costSummary = useMemo(() => getPlanCostSummary(effectivePlan, purchases), [effectivePlan, purchases]);

  // Core personalized feeding guide evaluations
  const foodReview = useMemo(
    () => evaluateCurrentFood(pet, effectivePlan),
    [pet, effectivePlan]
  );
  const hydrationGuidance = useMemo(
    () => evaluateHydration(pet, effectivePlan, hydrationState),
    [pet, effectivePlan, hydrationState]
  );
  const treatsGuidance = useMemo(
    () => evaluateTreatsBudget(pet, effectivePlan, treatLogsToday),
    [pet, effectivePlan, treatLogsToday]
  );
  const barfGuidance = useMemo(
    () => getBarfAndSpecialDietGuidance(pet, effectivePlan),
    [pet, effectivePlan]
  );
  const nextStep = useMemo(
    () => getNextBestStepForToday(pet, effectivePlan, foodReview),
    [pet, effectivePlan, foodReview]
  );
  const nextMeal = useMemo(
    () => getNextMealStatus(effectivePlan, mealLogs, treatLogsToday),
    [effectivePlan, mealLogs, treatLogsToday]
  );
  const dailyNutrition = useMemo(
    () =>
      calculateDailyMealNutritionSummary({
        plan: effectivePlan,
        mealLogs,
        dryFood: effectivePlan?.dryFood,
        wetFood: effectivePlan?.wetFood,
        treatLogs: treatLogsToday,
      }),
    [effectivePlan, mealLogs, treatLogsToday]
  );

  const mealHistory = useMemo(() => StorageService.getMealHistory(pet.id), [pet.id, mealLogs]);

  const persistPlanUpdate = (updated: FeedingPlan) => {
    if (onSavePlan) {
      onSavePlan(updated);
    } else {
      StorageService.savePlan(updated);
    }
  };

  const handleSaveLabel = (updatedFood: FoodItem) => {
    if (effectivePlan?.isVetLocked || pet.vetGuideline?.locked) {
      showToast(isEs ? 'Ficha guardada en Mis alimentos.' : 'Label saved in My foods.');
      return;
    }
    setPlanAdjustment({ food: updatedFood });
  };

  const handleSaveRefinement = (updatedPet: Pet) => {
    onUpdatePetProfile?.(updatedPet);
    if (effectivePlan && !effectivePlan.isVetLocked) {
      const recalculated = recalculatePlanForPet(updatedPet, effectivePlan);
      persistPlanUpdate(recalculated);
    }
    showToast(`Perfil de ${pet.name} afinado.`);
  };

  const handleWaterBowlsChange = (delta: number) => {
    const next: HydrationDailyState = {
      ...hydrationState,
      bowlsLogged: Math.max(0, hydrationState.bowlsLogged + delta),
    };
    setHydrationState(next);
    StorageService.setHydrationStateToday(pet.id, next);
  };

  const handleWaterIntakeShift = (flag: HydrationDailyState['intakeChangeFlag']) => {
    const next: HydrationDailyState = {
      ...hydrationState,
      intakeChangeFlag: flag,
    };
    setHydrationState(next);
    StorageService.setHydrationStateToday(pet.id, next);

    if (flag === 'much_more' || flag === 'much_less') {
      onAddHealthLog?.({
        id: 'hl_water_' + Date.now(),
        petId: pet.id,
        date: localDateKey(),
        type: 'symptom',
        title:
          flag === 'much_more'
            ? 'Aumento marcado en consumo de agua'
            : 'Disminución marcada en consumo de agua',
        notes: 'Registrado desde la tarjeta de hidratación. Se recomienda valoración veterinaria.',
        severity: 'attention',
      });
      showToast('Cambio de hidratación registrado. Recomendamos consultar al veterinario.');
    }
  };

  const handleAddTreat = (log: TreatLog) => {
    StorageService.addTreatLog(log);
    setTreatLogsToday(StorageService.getTreatLogsToday(pet.id));
    showToast(`Premio registrado (+${log.kcal} kcal).`);
  };

  const handleDeleteTreat = (id: string) => {
    StorageService.deleteTreatLog(id);
    setTreatLogsToday(StorageService.getTreatLogsToday(pet.id));
  };

  const handleSaveTrainingGrams = (grams: number) => {
    setTrainingGramsToday(grams);
    StorageService.setTrainingRationGramsToday(pet.id, grams);
    showToast(
      grams > 0
        ? `${grams} g apartados para entrenamiento dentro de su ración diaria.`
        : 'Gramos de entrenamiento restablecidos.'
    );
  };

  const handleSaveWeight = (weightKg: number, notes?: string) => {
    const record: WeightRecord = {
      id: 'w_' + Date.now(),
      petId: pet.id,
      date: localDateKey(),
      weightKg,
      notes,
    };
    const changedWeight = onAddWeightRecord
      ? onAddWeightRecord(record)
      : StorageService.addWeightRecord(record);
    if (changedWeight && effectivePlan && !effectivePlan.isVetLocked) {
      const updatedPet: Pet = { ...pet, currentWeightKg: weightKg };
      const recalculated = recalculatePlanForPet(updatedPet, effectivePlan);
      persistPlanUpdate(recalculated);
    }
    showToast(`Peso registrado: ${weightKg} kg.`);
  };

  // Empty state if no feeding plan exists
  if (!effectivePlan) {
    return (
      <div className="p-4 space-y-4">
        <DailyKcalRingChart name={pet.name} status={nextMeal} hasEnergyForPlan={false} lang={userAccount.language}>

          <div className="space-y-1">
            <h2 className="font-heading font-extrabold text-2xl text-[#0B5D2E]">
              {isEs ? `Aún no calculamos la ración de ${pet.name}` : `No feeding plan yet for ${pet.name}`}
            </h2>
            <p className="text-sm text-[#44544A]">
              {isEs
                ? 'Estima su ración diaria a partir de su perfil y las calorías del alimento.'
                : 'Estimate a daily portion from your pet’s profile and the food’s calories.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('calculate')}
            className="w-full min-h-[52px] bg-[#F57C1A] text-white rounded-2xl font-heading font-extrabold text-base flex items-center justify-center gap-2 hover:bg-[#e06d12] transition shadow-md"
          >
            <span>{isEs ? `Configurar guía de ${pet.name}` : `Configure ${pet.name}'s guide`}</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </DailyKcalRingChart>
        <HomeMealCost language={userAccount.language} />
      </div>
    );
  }

  const currentFoodItem = getEffectiveFoodItem(effectivePlan);
  const comparableFoods = (effectivePlan.foodType === 'mixed'
    ? [effectivePlan.dryFood, effectivePlan.wetFood]
    : [currentFoodItem]).filter((food): food is FoodItem =>
      Boolean(food?.brand.trim() && food?.name.trim() && food.type !== 'barf' &&
        (!(effectivePlan.isVetLocked || pet.vetGuideline?.locked) ||
          food.name.trim() === effectivePlan.foodName.trim())));
  const foodThumb =
    currentFoodItem?.labelPhotoUrl ||
    currentFoodItem?.imageUrl ||
    resolveFoodThumbnail(effectivePlan.foodBrand, effectivePlan.foodName, pet.species);

  const isBarf = effectivePlan.foodType === 'barf' || pet.dietType === 'barf';
  const needsVetGuidance = requiresVetGuidance(pet, effectivePlan);
  const hasDailyGramAmount = effectivePlan.rationConfirmed || effectivePlan.rationSource === 'manual';
  const hasEnergyForPlan = getPlanFoodKcalForGrams(effectivePlan, 100) > 0;
  const hasMismatch = getPlanSafetyNotices(pet, effectivePlan, userAccount.language).some((notice) => notice.level === 'mismatch');
  const needsFoodData = !isBarf && !needsVetGuidance && (!hasEnergyForPlan || nextStep?.id === 'complete_label');
  const plannedMeals = getPlannedMeals(effectivePlan, treatsGuidance.trainingGramsAllocatedToday);
  const displayPortions = effectivePlan.rationSource === 'manual' ? getPreviewMeals(effectivePlan) : plannedMeals;
  const totalMealsPlanned = plannedMeals.length;
  const nextMealPortion = nextMeal.nextMealIndex === null ? undefined : displayPortions[nextMeal.nextMealIndex];

  return (
    <div className="p-4 space-y-4 pb-28">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0B5D2E] text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 max-w-[90vw]">
          <Check className="w-4 h-4 text-[#86EFAC] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <DailyKcalRingChart name={pet.name} status={nextMeal}
        hasEnergyForPlan={hasEnergyForPlan} lang={userAccount.language}>
        {hasMismatch ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <strong>{isEs ? 'Revisa la compatibilidad del alimento antes de servir.' : 'Review this food’s compatibility before feeding.'}</strong>
          <a href="#today-food-safety" className="inline-flex min-h-11 items-center font-bold underline">{isEs ? 'Ver el motivo' : 'Review the reason'}</a>
        </div> : <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#0B5D2E20] pt-3">
          <div className="min-w-0 text-xs text-[#44544A]">
            <strong className="block text-sm text-[#1C2B21]">
              {nextMeal.allMealsCompleted ? (isEs ? 'Todas las tomas registradas' : 'All meals logged') :
                (isEs ? 'Próxima toma' : 'Next meal') + ' · ' + (nextMeal.nextMealTime ?? '—')}
              {nextMealPortion && hasDailyGramAmount && ' · ' + formatRation(nextMealPortion.grams, units, userAccount.language)}
            </strong>
            {hasDailyGramAmount && <span>{isEs ? 'Ración diaria: ' : 'Daily ration: '}{formatRation(effectivePlan.gramsPerDay, units, userAccount.language)}</span>}
            <RationSourceNote plan={effectivePlan} lang={userAccount.language} />
          </div>
          <button type="button" onClick={() => {
            setSelectedMealIndex(nextMeal.nextMealIndex ?? 0);
            setShowMealModal(true);
          }} className="min-h-11 rounded-xl bg-[#0B5D2E] px-4 py-2 text-xs font-extrabold text-white">
            {nextMeal.allMealsCompleted ? (isEs ? 'Editar una toma' : 'Edit a meal') : (isEs ? 'Registrar esta comida' : 'Log this meal')}
          </button>
        </div>}
      </DailyKcalRingChart>
      <HomeMealCost language={userAccount.language}
        meal={effectivePlan.rationConfirmed && effectivePlan.gramsPerDay > 0 ? costSummary.meals[nextMeal.nextMealIndex ?? 0] : undefined}
        estimated={costSummary.estimated} />

      {/* 1. VET LOCK BANNER */}
      {effectivePlan.isVetLocked && (
        <div className="bg-[#EAF4EC] border border-[#0B5D2E40] rounded-2xl p-3.5 flex items-start gap-3">
          <div className="p-2 bg-[#0B5D2E] text-white rounded-xl shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="text-xs space-y-0.5">
            <span className="font-extrabold text-[#0B5D2E] block">
              Plan sujeto a pauta veterinaria registrada
            </span>
            <span className="text-[#44544A] block leading-snug">
              Respetamos estrictamente las cantidades y fórmulas definidas por su médico veterinario.
            </span>
          </div>
        </div>
      )}

      {!hasMismatch && (needsFoodData || nextStep) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>{needsFoodData
            ? (hasEnergyForPlan ? 'Revisa la etiqueta de ' : 'Faltan las kcal/kg de ') + (currentFoodItem?.name || effectivePlan.foodName)
            : nextStep?.title}</strong>
          <button type="button" className="min-h-11 font-bold text-[#0B5D2E] underline" onClick={() => {
            if (needsFoodData) setFoodSearch(currentFoodItem?.name || effectivePlan.foodName);
            else if (nextStep?.id === 'configure_schedule') setPlanAdjustment({});
            else setShowRefineModal(true);
          }}>{needsFoodData ? 'Buscar ficha' : nextStep?.ctaLabel}</button>
        </div>
      )}

      <div className="space-y-4 rounded-3xl border border-[#0B5D2E20] bg-white p-4 shadow-sm">
        {needsVetGuidance && !effectivePlan.isVetLocked && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          {isEs ? 'Sigue la pauta de tu veterinario para las cantidades. Puedes registrar los gramos que sirves.' : 'Use veterinary guidance for amounts. You can record the grams you serve.'}
        </p>}
        <div className="grid grid-cols-3 gap-2">
          {!(effectivePlan.isVetLocked || pet.vetGuideline?.locked) && (
            <button type="button" onClick={() => setFoodSearch('')} className="min-h-11 rounded-xl bg-[#EAF4EC] p-2 text-xs font-bold text-[#0B5D2E]">
              {isEs ? 'Buscar alimento' : 'Find food'}
            </button>
          )}
          <button type="button" onClick={() => setShowTreatModal(true)} className="min-h-11 rounded-xl bg-[#EAF4EC] p-2 text-xs font-bold text-[#0B5D2E]">
            {isEs ? 'Registrar premio' : 'Log treat'}
          </button>
          <button type="button" onClick={() => setShowWeightModal(true)} className="min-h-11 rounded-xl bg-[#F8FAF8] p-2 text-xs font-bold text-[#0B5D2E]">
            {isEs ? 'Registrar peso' : 'Log weight'}
          </button>
        </div>
        {/* Profile summary + secondary adjust links */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 text-xs text-[#44544A]">
          <span className="truncate">
            {pet.breed?.split('/')[0].trim() || 'Mestizo'} ·{' '}
            {pet.sex === 'female' ? 'Hembra' : 'Macho'} ·{' '}
            <strong className="text-[#1C2B21]">{effectivePlan.foodBrand} {effectivePlan.foodName}</strong>
          </span>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setPlanAdjustment({})}
              className="text-[#0B5D2E] font-bold hover:underline"
            >
              Horarios
            </button>
            {onEditPet && (
              <button
                type="button"
                onClick={() => onEditPet(pet)}
                className="text-[#0B5D2E] font-bold hover:underline"
              >
                Perfil
              </button>
            )}
          </div>
        </div>

        {/* Today's scheduled meals checklist */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-[#1C2B21]">
              Tomas programadas hoy
            </span>
            <div className="flex items-center gap-1 text-xs font-semibold text-[#0B5D2E]">
              <span>¿Quién da?:</span>
              <select
                value={selectedFeeder}
                onChange={(e) => setSelectedFeeder(e.target.value)}
                className="bg-[#EAF4EC] px-2 py-1 rounded-lg font-bold text-[#0B5D2E] outline-none cursor-pointer"
              >
                {userAccount.familyMembers.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {plannedMeals.map((portion, idx) => {
            const scheduledTime =
              effectivePlan.mealTimes?.[idx] || defaultMealTimes(totalMealsPlanned)[idx];
            const log = mealLogs.find((l) => l.mealIndex === idx);
            const isFed = log?.completed;

            return (
              <div
                key={idx}
                className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                  isFed
                    ? 'bg-[#EAF4EC]/80 border-[#0B5D2E40]'
                    : 'bg-[#F8FAF8] border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 text-[#0B5D2E] flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-heading font-bold text-[#1C2B21]">
                        Comida {idx + 1} ({scheduledTime})
                      </span>
                      {hasDailyGramAmount && (
                        <span className="font-extrabold text-[#0B5D2E] tabular-nums">
                          {formatRation(isFed ? log.plannedGrams ?? portion.grams : displayPortions[idx].grams, units, userAccount.language)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#44544A] truncate">
                      {isFed
                        ? `Comió con ${log.fedBy || selectedFeeder} (${log.completedAt || scheduledTime})${
                            log.gramsFed > 0
                              ? ` · Servido: ${formatRation(log.gramsFed, units, userAccount.language)}${
                                  log.plannedGrams && log.plannedGrams !== log.gramsFed
                                    ? ` (plan: ${formatRation(log.plannedGrams, units, userAccount.language)})`
                                    : ''
                                }`
                              : ''
                          }`
                        : 'Pendiente'}
                    </p>
                    {isFed && log.gramsEaten !== undefined && log.gramsEaten < log.gramsFed && (
                      <p className="text-[11px] font-bold text-[#0B5D2E]">{isEs ? 'Comió ' : 'Ate '}{formatRation(log.gramsEaten, units, userAccount.language)}</p>
                    )}
                    {isFed && log.mealTime !== scheduledTime && (
                      <p className="text-[11px] text-[#44544A]">
                        {isEs ? 'Horario al registrar' : 'Scheduled when logged'} · {log.mealTime}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const components = getPlannedMealComponents(effectivePlan, portion);
                    const energy = getLoggedMealEnergy({ mealIndex: idx, gramsFed: portion.grams, mixedComponents: components }, effectivePlan);
                    const wouldExceed = effectivePlan.mer > 0 && nextMeal.consumedKcalUnrounded + energy.kcal - effectivePlan.mer > 0.000001;
                    if (!isFed && (!effectivePlan.rationConfirmed || wouldExceed || hasMismatch)) {
                      setSelectedMealIndex(idx);
                      setShowMealModal(true);
                      return;
                    }
                    onToggleMeal(
                      idx, selectedFeeder, isFed ? 0 : portion.grams, scheduledTime,
                      !isFed && effectivePlan.rationConfirmed ? portion.grams : undefined, undefined, components
                    );
                  }}
                  className={`min-h-[44px] px-3.5 rounded-xl font-heading font-bold text-xs flex items-center gap-1 transition shrink-0 ${
                    isFed
                      ? 'bg-[#1E8A49] text-white'
                      : 'bg-white text-[#0B5D2E] border border-[#0B5D2E30] hover:bg-[#0B5D2E] hover:text-white'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>{isFed ? 'Deshacer' : hasMismatch ? 'Registrar lo que comió' : 'Ya comió'}</span>
                </button>
              </div>
            );
          })}
        </div>

        <NutritionSummary summary={dailyNutrition} language={userAccount.language} />
        <MealDiaryHistory logs={mealHistory} language={userAccount.language} />
      </div>

      {/* 4. CARD: ¿ESTE ALIMENTO VA CON SU ETAPA? */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E] block">
              Revisión del alimento habitual
            </span>
            <h3 className="font-heading font-extrabold text-lg text-[#1C2B21]">
              ¿Este alimento va con su etapa?
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setPlanAdjustment({})}
            className="text-xs font-bold text-[#0B5D2E] hover:underline flex items-center gap-1 min-h-[36px] shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEs ? 'Ajustar ración' : 'Adjust feeding plan'}</span>
          </button>
        </div>

        <div id="today-food-safety" className="scroll-mt-48" tabIndex={-1}>
          <PlanSafetyAlerts pet={pet} plan={effectivePlan} lang={userAccount.language} />
        </div>

        {/* Registered Product Header */}
        <div className="flex items-center gap-3 bg-[#F8FAF8] p-3 rounded-2xl border border-gray-200">
          <div className="w-12 h-14 bg-white rounded-xl border border-gray-200 p-1 flex items-center justify-center shrink-0 overflow-hidden">
            {foodThumb ? (
              <img
                src={publicAssetUrl(foodThumb)}
                alt={foodReview.productTitle}
                className="w-full h-full object-contain"
              />
            ) : (
              <Package className="w-5 h-5 text-[#0B5D2E]" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <strong className="text-sm font-heading font-extrabold text-[#1C2B21] block truncate">
              {foodReview.productTitle}
            </strong>
            <span
              className={`text-xs font-bold block ${
                foodReview.status === 'compatible'
                  ? 'text-[#0B5D2E]'
                  : foodReview.status === 'needs_label' || foodReview.status === 'incompatible'
                  ? 'text-amber-700'
                  : 'text-[#44544A]'
              }`}
            >
              {foodReview.status === 'compatible'
                ? 'Etiqueta / ficha verificada para esta etapa'
                : foodReview.status === 'needs_label'
                ? 'Falta confirmar etiqueta o ficha del fabricante'
                : foodReview.status === 'incompatible'
                ? 'Revisa la compatibilidad con su perfil'
                : foodReview.status === 'barf_vet_referral'
                ? 'Dieta BARF — requiere validación veterinaria'
                : 'Dieta supervisada por veterinario'}
            </span>
            {currentFoodItem?.labelPhotoUrl && (
              <span className="text-[11px] text-[#0B5D2E] inline-flex items-center gap-1 font-semibold">
                <FileText className="w-3 h-3" />
                Foto de etiqueta adjuntada
              </span>
            )}
          </div>
        </div>

        {/* Single-sentence compatibility / missing-data reason */}
        <p className="text-xs font-semibold text-[#1C2B21] leading-relaxed">
          {foodReview.oneSentenceReason}
        </p>

        {/* Puppy-specific verification checks */}
        {foodReview.puppyGrowthChecks.applicable && (
          <div className="bg-[#F8FAF8] p-3 rounded-2xl border border-gray-200 space-y-1.5 text-xs">
            <span className="font-extrabold text-[#1C2B21] block">
              Verificación para cachorro en crecimiento:
            </span>
            <div className="flex items-center gap-2">
              {foodReview.puppyGrowthChecks.isCompleteConfirmed ? (
                <CheckCircle2 className="w-4 h-4 text-[#1E8A49] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span className="text-[#44544A]">
                Alimento completo:{' '}
                <strong className="text-[#1C2B21]">
                  {foodReview.puppyGrowthChecks.isCompleteConfirmed ? 'Confirmado' : 'Sin confirmar en etiqueta'}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {foodReview.puppyGrowthChecks.suitableForGrowthConfirmed ? (
                <CheckCircle2 className="w-4 h-4 text-[#1E8A49] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span className="text-[#44544A]">
                Adecuado para crecimiento:{' '}
                <strong className="text-[#1C2B21]">
                  {foodReview.puppyGrowthChecks.suitableForGrowthConfirmed ? 'Confirmado' : 'Sin confirmar en etiqueta'}
                </strong>
              </span>
            </div>
          </div>
        )}

        {/* Breed & size format guidance */}
        <p className="text-xs text-[#44544A] bg-[#EAF4EC]/50 p-3 rounded-2xl border border-[#0B5D2E15] leading-relaxed">
          {foodReview.breedFormatGuidance}
        </p>

        {/* Action buttons: Revisar etiqueta & Ver otras opciones */}
        <div className="flex flex-wrap gap-2">
          {onComparePrices && comparableFoods.map((food) => (
            <button
              key={food.type}
              type="button"
              onClick={() => onComparePrices(food)}
              className="flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0B5D2E] px-3 py-2 text-xs font-extrabold text-white hover:bg-[#094723]"
            >
              <DollarSign className="size-4" />
              <span>
                {isEs ? 'Comparar precios' : 'Compare prices'}
                {comparableFoods.length > 1 && (food.type === 'wet' ? (isEs ? ' · húmedo' : ' · wet') : (isEs ? ' · seco' : ' · dry'))}
              </span>
            </button>
          ))}
          {!isBarf && (
            <button
              type="button"
              onClick={() => setShowLabelReview(true)}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-heading font-extrabold flex items-center gap-1.5 transition ${
                foodReview.needsLabelReview
                  ? 'bg-[#0B5D2E] text-white hover:bg-[#094723] shadow-xs'
                  : 'bg-[#EAF4EC] text-[#0B5D2E] border border-[#0B5D2E25] hover:bg-[#dceee0]'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Revisar etiqueta</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowAlternatives((prev) => !prev)}
            className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-heading font-extrabold bg-white text-[#1C2B21] border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5 transition"
          >
            <span>Ver otras opciones</span>
            {showAlternatives ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowWhyModal(true)}
            className="min-h-[44px] px-3 py-2 text-xs font-bold text-[#0B5D2E] hover:underline flex items-center gap-1 ml-auto"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>¿Por qué me sale esto?</span>
          </button>
        </div>

        {/* Expandable Verified Alternatives (max 3) OR Vet Lock note */}
        {showAlternatives && (
          <div className="pt-2 border-t border-gray-100 space-y-2.5">
            {foodReview.alternativesBlockedByVetPlan ? (
              <div className="p-3 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E25] text-xs text-[#1C2B21] leading-relaxed">
                {foodReview.vetLockNote}
              </div>
            ) : foodReview.alternatives.length === 0 ? (
              <p className="text-xs text-[#44544A]">
                No encontramos otras fórmulas verificadas distintas con las restricciones registradas.
              </p>
            ) : (
              <>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#44544A] block">
                  Opciones verificadas para {pet.name} (máx. 3)
                </span>
                {foodReview.alternatives.map((alt) => (
                  <div
                    key={alt.food.id}
                    className="p-3 rounded-2xl border border-gray-200 bg-[#F8FAF8] flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <strong className="text-xs font-heading font-extrabold text-[#1C2B21] block">
                        {alt.food.brand} {alt.food.name}
                      </strong>
                      <p className="text-xs text-[#44544A] leading-snug">{alt.fitReason}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPlanAdjustment({ food: alt.food });
                        setShowAlternatives(false);
                      }}
                      className="min-h-[40px] px-3 py-1.5 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold shrink-0 hover:bg-[#094723]"
                    >
                      Usar
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 5. BARF & SPECIAL DIETS GUIDANCE CARD */}
      {barfGuidance.showCard && (
        <div className="bg-white rounded-3xl p-5 border border-amber-300 shadow-sm space-y-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 block">
                {barfGuidance.isBarf ? 'Orientación BARF / Dieta Cruda' : 'Dieta especial y restricciones'}
              </span>
              <h3 className="font-heading font-extrabold text-base text-[#1C2B21]">
                Cuidados y derivación veterinaria
              </h3>
            </div>
          </div>

          {barfGuidance.registeredVetPlanSummary && (
            <div className="p-3 bg-[#EAF4EC] rounded-2xl border border-[#0B5D2E25] text-xs text-[#1C2B21]">
              <strong className="text-[#0B5D2E] block mb-0.5">Plan veterinario registrado:</strong>
              <span>{barfGuidance.registeredVetPlanSummary}</span>
            </div>
          )}

          {barfGuidance.isBarf && (
            <div className="space-y-2">
              {barfGuidance.barfRisks.map((risk, idx) => (
                <div key={idx} className="p-3 bg-[#FFFBEB] rounded-2xl border border-amber-200 text-xs space-y-0.5">
                  <strong className="text-amber-950 block">{risk.title}</strong>
                  <p className="text-amber-900 leading-relaxed">{risk.detail}</p>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 text-xs text-[#1C2B21] font-semibold leading-relaxed">
            {barfGuidance.vetReferralBanner}
          </div>
        </div>
      )}

      {/* 6. COMPACT CARDS UNDERNEATH: AGUA, PREMIOS & ALIMENTO RESTANTE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Water / Hydration Card */}
        <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E20] shadow-sm flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#EAF4EC] rounded-lg text-[#0B5D2E]">
                  <Droplets className="w-4 h-4" />
                </div>
                <h4 className="font-heading font-extrabold text-sm text-[#1C2B21]">Agua</h4>
              </div>
              {hydrationGuidance.hasValidatedRule && hydrationGuidance.dailyReferenceMl ? (
                <span className="text-xs font-extrabold text-[#0B5D2E] tabular-nums">
                  Ref. {hydrationGuidance.dailyReferenceMl.min}–{hydrationGuidance.dailyReferenceMl.max} ml
                </span>
              ) : (
                <span className="text-[11px] font-bold text-amber-800">Pauta vet.</span>
              )}
            </div>

            <p className="text-xs font-bold text-[#1C2B21] leading-snug">
              {hydrationGuidance.alwaysAvailableText}
            </p>

            {hydrationGuidance.hasValidatedRule && hydrationGuidance.dailyReferenceMl ? (
              <div className="text-[11px] text-[#44544A] space-y-1 leading-relaxed">
                <p>{hydrationGuidance.moistureNote}</p>
                <p className="font-semibold text-[#0B5D2E]">{hydrationGuidance.notAQuotaNote}</p>
              </div>
            ) : (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-950 leading-snug flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                <span>{hydrationGuidance.vetReferralReason}</span>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-1 border-t border-gray-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#44544A] tabular-nums">
                {hydrationState.bowlsLogged} {hydrationState.bowlsLogged === 1 ? 'tazón hoy' : 'tazones hoy'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleWaterBowlsChange(-1)}
                  disabled={hydrationState.bowlsLogged <= 0}
                  className="w-9 h-9 rounded-xl bg-[#EAF4EC] text-[#0B5D2E] font-bold text-sm flex items-center justify-center disabled:opacity-40"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => handleWaterBowlsChange(1)}
                  className="min-h-[38px] px-3 rounded-xl bg-[#0B5D2E] text-white font-bold text-xs"
                >
                  +1 tazón
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[#44544A] font-semibold">¿Cambio en sed?</span>
              <select
                value={hydrationState.intakeChangeFlag}
                onChange={(e) =>
                  handleWaterIntakeShift(e.target.value as HydrationDailyState['intakeChangeFlag'])
                }
                className="bg-[#F8FAF8] border border-gray-200 rounded-lg px-2 py-1 text-[11px] font-bold text-[#1C2B21]"
              >
                <option value="none">Consumo habitual</option>
                <option value="much_more">Toma mucho más</option>
                <option value="much_less">Toma mucho menos</option>
              </select>
            </div>
          </div>
        </div>

        {/* Treats Card */}
        <div className="bg-white rounded-3xl p-4 border border-[#0B5D2E20] shadow-sm flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#FFF2E2] rounded-lg text-[#F57C1A]">
                  <Cookie className="w-4 h-4" />
                </div>
                <h4 className="font-heading font-extrabold text-sm text-[#1C2B21]">Premios hoy</h4>
              </div>
              {treatsGuidance.isEligibleFor10PctCap ? (
                <span className="text-xs font-extrabold text-[#F57C1A] tabular-nums">
                  {treatsGuidance.usedKcalToday} / {treatsGuidance.dailyBudgetKcal} kcal
                </span>
              ) : (
                <span className="text-[11px] font-bold text-amber-800">Pauta vet.</span>
              )}
            </div>

            {treatsGuidance.isEligibleFor10PctCap ? (
              <p className="text-[11px] text-[#44544A] leading-relaxed">
                Tope 10% del MER ({treatsGuidance.dailyBudgetKcal} kcal/día). Quedan{' '}
                <strong className="text-[#1C2B21] tabular-nums">{treatsGuidance.remainingKcalToday} kcal</strong>.{' '}
                Calculamos piezas solo si la etiqueta indica kcal por unidad.
              </p>
            ) : (
              <p className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded-xl border border-amber-200 leading-snug">
                {treatsGuidance.vetRestrictionNote}
              </p>
            )}

            {treatsGuidance.trainingGramsAllocatedToday > 0 && (
              <p className="text-[11px] font-bold text-[#0B5D2E] bg-[#EAF4EC] px-2.5 py-1.5 rounded-xl tabular-nums">
                Entrenamiento cachorro: {treatsGuidance.trainingGramsAllocatedToday} g de su propia ración apartados hoy.
              </p>
            )}

            {treatLogsToday.length > 0 && (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {treatLogsToday.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-[11px] bg-[#F8FAF8] px-2.5 py-1.5 rounded-xl border border-gray-100"
                  >
                    <span className="truncate pr-2 font-semibold text-[#1C2B21]">
                      {t.name}
                      {t.pieces ? ` (${t.pieces} pzas)` : ''} · {t.kcal} kcal
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTreat(t.id)}
                      className="text-gray-400 hover:text-red-600 p-0.5 shrink-0"
                      aria-label="Eliminar premio"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowTreatModal(true)}
            className="w-full min-h-[42px] px-3 py-2 bg-[#FFF7ED] hover:bg-[#ffedd5] text-[#9A3412] border border-[#F57C1A30] rounded-xl text-xs font-heading font-extrabold transition"
          >
            + Registrar premio {treatsGuidance.canAllocatePuppyTrainingFromRation ? '/ entrenamiento' : ''}
          </button>
        </div>
      </div>

      {effectivePlan.rationConfirmed && effectivePlan.gramsPerDay > 0 && (
        <section id="today-meal-costs" role="region" aria-label={isEs ? 'Costo de su ración' : 'Their feeding cost'} aria-hidden={showCostTracker} inert={showCostTracker} className="scroll-mt-32 space-y-3 rounded-3xl border border-[var(--border-color)] bg-[var(--surface-card)] p-5">
          <h3 className="font-heading text-base font-extrabold text-[var(--text-primary)]">{isEs ? 'Costo de su ración' : 'Their feeding cost'}</h3>
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[var(--surface-inner)] p-3">
            <div>
              <span className="text-xs text-[var(--text-secondary)]">{isEs ? 'Por día' : 'Per day'}</span>
              <strong className="mt-1 block text-lg tabular-nums text-[var(--text-primary)]">{costSummary.costPerDayCop === undefined ? (isEs ? 'Por definir' : 'To confirm') : formatCOP(costSummary.costPerDayCop, true)}</strong>
            </div>
            <div>
              <span className="text-xs text-[var(--text-secondary)]">{isEs ? 'Por mes estimado' : 'Estimated month'}</span>
              <strong className="mt-1 block text-lg tabular-nums text-[var(--text-primary)]">{costSummary.costPerMonthCop === undefined ? (isEs ? 'Por definir' : 'To confirm') : formatCOP(costSummary.costPerMonthCop, true)}</strong>
            </div>
          </div>
          {costSummary.partial && <p className="text-xs font-bold text-amber-800 dark:text-amber-200">{isEs ? 'Costo parcial. Falta precio de una parte de la ración.' : 'Partial cost. A food in this ration has no price yet.'}</p>}
          {costSummary.estimated && <p className="text-xs text-[var(--text-secondary)]">{isEs ? 'Incluye una referencia de precio consultada en internet.' : 'Includes an online price reference.'}</p>}
          <ul className="space-y-1.5">
            {costSummary.meals.map((meal) => (
              <li key={meal.index} className="flex justify-between gap-2 text-xs text-[var(--text-primary)]">
                <span>{isEs ? 'Toma' : 'Meal'} {meal.index + 1} · {meal.time}</span>
                <strong className="tabular-nums">{meal.costCop === undefined ? (isEs ? 'Por definir' : 'To confirm') : formatCOP(meal.costCop, true)}{meal.partial && meal.costCop !== undefined ? (isEs ? ' · parcial' : ' · partial') : ''}</strong>
              </li>
            ))}
          </ul>
          {costSummary.components.map((component) => component.packageKg && component.gramsPerDay > 0 ? (
            <p key={component.role} className="text-xs text-[var(--text-secondary)]">
              {component.food.brand} {component.food.name} · {isEs ? 'Un empaque rinde' : 'One package lasts'} ~{new Intl.NumberFormat(isEs ? 'es-CO' : 'en', { maximumFractionDigits: 1 }).format(component.packageKg * 1000 / component.gramsPerDay)} {isEs ? 'días' : 'days'}
            </p>
          ) : null)}
          <button type="button" onClick={() => setShowCostTracker(true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#EAF4EC] px-3 text-xs font-bold text-[#0B5D2E]">
            <Receipt className="size-4" />
            {isEs ? 'Registrar compra o factura' : 'Log purchase or receipt'}
          </button>
        </section>
      )}

      <UnifiedFoodSearchModal isOpen={foodSearch !== undefined} initialQuery={foodSearch} onClose={() => setFoodSearch(undefined)}
        activePet={pet} lang={userAccount.language} category="main" onSelectFood={({ sourceFoodItem }) => {
          if (sourceFoodItem) setPlanAdjustment({ food: sourceFoodItem });
        }} />

      {/* ================= MODALS ================= */}

      {planAdjustment && (
        <FeedingPlanEditor
          pet={pet}
          plan={effectivePlan}
          meals={mealLogs}
          initialFood={planAdjustment.food}
          language={userAccount.language}
          onClose={() => setPlanAdjustment(undefined)}
          onSave={(updated) => {
            persistPlanUpdate(updated);
            setPlanAdjustment(undefined);
            showToast(isEs ? 'Ración y horarios guardados.' : 'Feeding plan and times saved.');
          }}
        />
      )}

      <LabelReviewModal
        isOpen={showLabelReview}
        onClose={() => setShowLabelReview(false)}
        pet={pet}
        plan={effectivePlan}
        onSaveLabel={handleSaveLabel}
        lang={userAccount.language}
      />

      <WhyThisResultModal
        isOpen={showWhyModal}
        onClose={() => setShowWhyModal(false)}
        pet={pet}
        plan={effectivePlan}
        foodReview={foodReview}
        hydration={hydrationGuidance}
        treats={treatsGuidance}
        lang={userAccount.language}
      />

      <ProfileRefinementModal
        isOpen={showRefineModal}
        onClose={() => setShowRefineModal(false)}
        pet={pet}
        onSaveRefinement={handleSaveRefinement}
      />

      <RegisterTreatModal
        isOpen={showTreatModal}
        onClose={() => setShowTreatModal(false)}
        pet={pet}
        plan={effectivePlan}
        treatsToday={treatLogsToday}
        onAddTreat={handleAddTreat}
        onSaveTrainingGrams={handleSaveTrainingGrams}
      />

      <RegisterWeightModal
        isOpen={showWeightModal}
        onClose={() => setShowWeightModal(false)}
        pet={pet}
        onSaveWeight={handleSaveWeight}
      />

      <RegisterMealModal
        isOpen={showMealModal}
        onClose={() => setShowMealModal(false)}
        pet={pet}
        plan={effectivePlan}
        mealLogs={mealLogs}
        treats={treatLogsToday}
        manualIntake={hasMismatch}
        defaultFeeder={selectedFeeder}
        preferredMealIndex={selectedMealIndex}
        familyMembers={userAccount.familyMembers}
        onConfirmMeal={(idx, feeder, grams, time, plannedGrams, components, gramsEaten) => {
          onToggleMeal(idx, feeder, grams, time, plannedGrams, true, components, gramsEaten);
          showToast(`Comida ${idx + 1} registrada (${grams} g servidos).`);
        }}
      />

      {showCostTracker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="food-cost-dialog-title" className="flex max-h-[93dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[var(--bg-page)] shadow-xl sm:rounded-3xl">
            <header className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
              <h2 id="food-cost-dialog-title" className="font-heading text-lg font-extrabold text-[var(--text-primary)]">{isEs ? 'Gastos de alimentación' : 'Food expenses'}</h2>
              <button type="button" onClick={() => setShowCostTracker(false)} aria-label={isEs ? 'Cerrar gastos' : 'Close expenses'} className="flex size-11 items-center justify-center rounded-full text-[var(--text-primary)]">×</button>
            </header>
            <div className="overflow-y-auto p-4">
              <FoodCostTracker pet={pet} plan={effectivePlan} userAccount={userAccount} startWithForm
                onPlanUpdate={(patch) => persistPlanUpdate({ ...effectivePlan, ...patch })}
                onPurchasesChange={() => setPurchaseRefreshKey((key) => key + 1)} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
