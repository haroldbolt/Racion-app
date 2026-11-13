import React, { useState, useMemo, useEffect } from 'react';
import {
  Pet,
  FeedingPlan,
  MealLog,
  UserAccount,
  FoodItem,
  WeightRecord,
  HealthLog,
  HydrationDailyState,
  TreatLog,
} from '../types';
import { formatRation, formatCOP } from '../utils/i18n';
import { StorageService } from '../utils/storage';
import { useCity } from '../contexts/CityContext';
import { UnifiedFoodSearchModal, resolveFoodThumbnail } from '../components/UnifiedFoodSearchModal';
import { InventoryFoodSearchModal } from '../components/InventoryFoodSearchModal';
import { DailyKcalRingChart } from '../components/DailyKcalRingChart';
import { LabelReviewModal } from '../components/LabelReviewModal';
import { WhyThisResultModal } from '../components/WhyThisResultModal';
import {
  ScheduleConfigModal,
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
import { recalculatePlanForPet } from '../utils/calculator';
import {
  Check,
  CheckCircle2,
  Clock,
  Droplets,
  Cookie,
  ShoppingBag,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Lock,
  Scale,
  Receipt,
  DollarSign,
  X,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Utensils,
  Edit3,
  Package,
  Trash2,
  FileText,
  ShieldAlert,
  ArrowRight,
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
    forceComplete?: boolean
  ) => void;
  userAccount: UserAccount;
  onNavigateTab: (
    tab: 'calculate' | 'progress' | 'more' | 'pets' | 'compare',
    subTab?: 'prices' | 'compare'
  ) => void;
  onOpenStoreModal?: () => void;
  allPets?: Pet[];
  plans?: Record<string, FeedingPlan>;
  onSelectFoodForPet?: (food: FoodItem) => void;
  onEditPet?: (pet: Pet) => void;
  onSavePlan?: (plan: FeedingPlan) => void;
  onUpdatePetProfile?: (pet: Pet) => void;
  onAddWeightRecord?: (record: WeightRecord) => void;
  onAddHealthLog?: (log: HealthLog) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  pet,
  plan,
  mealLogs,
  onToggleMeal,
  userAccount,
  onNavigateTab,
  allPets = [],
  plans = {},
  onSelectFoodForPet,
  onEditPet,
  onSavePlan,
  onUpdatePetProfile,
  onAddWeightRecord,
  onAddHealthLog,
}) => {
  const isEs = userAccount.language === 'es';
  const units = userAccount.units;
  const { selectedCity } = useCity();

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
  const [showAdjustChoiceModal, setShowAdjustChoiceModal] = useState(false);
  const [showFoodSearchModal, setShowFoodSearchModal] = useState(false);
  const [showInventorySearchModal, setShowInventorySearchModal] = useState(false);
  const [showLabelReview, setShowLabelReview] = useState(false);
  const [showWhyModal, setShowWhyModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [showTreatModal, setShowTreatModal] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showMealModal, setShowMealModal] = useState(false);
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
    return {
      ...plan,
      trainingRationGramsToday:
        trainingGramsToday > 0 ? trainingGramsToday : plan.trainingRationGramsToday || 0,
    };
  }, [plan, trainingGramsToday]);

  const latestFoodPurchase = useMemo(
    () => StorageService.getFoodPurchases(pet.id)[0] || null,
    [pet.id, purchaseRefreshKey]
  );

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
      }),
    [effectivePlan, mealLogs]
  );

  const persistPlanUpdate = (updated: FeedingPlan) => {
    if (onSavePlan) {
      onSavePlan(updated);
    } else {
      StorageService.savePlan(updated);
    }
  };

  const handleSaveLabel = (updatedFood: FoodItem) => {
    if (!effectivePlan) {
      onSelectFoodForPet?.(updatedFood);
      showToast('Etiqueta confirmada y ración calculada.');
      return;
    }

    const basePlan: FeedingPlan = {
      ...effectivePlan,
      foodId: updatedFood.id,
      foodBrand: updatedFood.brand,
      foodName: updatedFood.name,
      foodType: updatedFood.type === 'wet' ? 'wet' : 'dry',
      dryFood: updatedFood.type === 'wet' ? effectivePlan.dryFood : updatedFood,
      wetFood: updatedFood.type === 'wet' ? updatedFood : effectivePlan.wetFood,
      bagWeightKg: updatedFood.bagSizeKg || effectivePlan.bagWeightKg,
    };

    const recalculated = effectivePlan.isVetLocked
      ? basePlan
      : recalculatePlanForPet(pet, basePlan);

    persistPlanUpdate(recalculated);
    showToast(`Etiqueta de ${updatedFood.name} confirmada y ración calculada.`);
  };

  const handleSaveSchedule = (mealsPerDay: number, mealTimes: string[]) => {
    if (!effectivePlan) return;
    const mealCountChanged = mealsPerDay !== effectivePlan.mealsPerDay;
    persistPlanUpdate({
      ...effectivePlan,
      mealsPerDay,
      mealTimes,
      scheduleConfigured: true,
      gramsPerMeal: mealCountChanged
        ? Math.round(effectivePlan.gramsPerDay / mealsPerDay)
        : effectivePlan.gramsPerMeal,
      kcalPerMeal: mealCountChanged
        ? Math.round(effectivePlan.kcalPerMeal * effectivePlan.mealsPerDay / mealsPerDay)
        : effectivePlan.kcalPerMeal,
    });
    showToast(`Horarios actualizados (${mealsPerDay} comidas al día).`);
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
        date: new Date().toISOString().split('T')[0],
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
    if (effectivePlan) {
      persistPlanUpdate({ ...effectivePlan, trainingRationGramsToday: grams });
    }
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
      date: new Date().toISOString().split('T')[0],
      weightKg,
      notes,
    };
    if (onAddWeightRecord) {
      onAddWeightRecord(record);
    } else {
      StorageService.addWeightRecord(record);
    }
    const updatedPet: Pet = { ...pet, currentWeightKg: weightKg };
    if (effectivePlan && !effectivePlan.isVetLocked) {
      const recalculated = recalculatePlanForPet(updatedPet, effectivePlan);
      persistPlanUpdate(recalculated);
    }
    showToast(`Peso registrado: ${weightKg} kg.`);
  };

  const handleFoodSelectedFromSearch = (selection: {
    brand: string;
    productName: string;
    weightKg: number;
    imageUrl?: string;
    sourceFoodItem?: FoodItem;
    confirmedSizesKg?: number[];
  }) => {
    setShowFoodSearchModal(false);

    const foodToSet: FoodItem = selection.sourceFoodItem
      ? {
          ...selection.sourceFoodItem,
          bagSizeKg: selection.weightKg || selection.sourceFoodItem.bagSizeKg,
        }
      : {
          id: 'catalog_' + Date.now(),
          brand: selection.brand,
          name: selection.productName,
          species: pet.species,
          lifeStage: foodReview.isPuppy ? 'puppy' : 'adult',
          type: 'dry',
          kcalPerKg: 0,
          proteinPct: 0,
          fatPct: 0,
          fiberPct: 0,
          moisturePct: 10,
          country: 'Colombia',
          imageUrl: selection.imageUrl,
          bagSizeKg: selection.weightKg,
          availableSizesKg: selection.confirmedSizesKg,
          labelStatus: 'unconfirmed',
          dataSource: 'Catálogo (etiqueta pendiente)',
        };

    onSelectFoodForPet?.(foodToSet);
    showToast(
      foodToSet.labelStatus === 'unconfirmed'
        ? `${foodToSet.brand} ${foodToSet.name} guardado. Revisa la etiqueta para calcular gramos.`
        : `Alimento actualizado a ${foodToSet.brand} ${foodToSet.name}.`
    );
  };

  // Empty state if no feeding plan exists
  if (!effectivePlan) {
    return (
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-3xl p-6 text-center border border-[#0B5D2E20] shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#EAF4EC] flex items-center justify-center text-3xl mx-auto">
            🥣
          </div>
          <div className="space-y-1">
            <h2 className="font-heading font-extrabold text-2xl text-[#0B5D2E]">
              {isEs ? `Aún no calculamos la ración de ${pet.name}` : `No feeding plan yet for ${pet.name}`}
            </h2>
            <p className="text-sm text-[#44544A]">
              {isEs
                ? 'Conoce los gramos exactos y evalúa su alimento habitual en menos de 60 segundos.'
                : 'Calculate exact grams and review habitual food in under 60 seconds.'}
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
        </div>
      </div>
    );
  }

  const currentFoodItem = getEffectiveFoodItem(effectivePlan);
  const foodThumb =
    currentFoodItem?.labelPhotoUrl ||
    currentFoodItem?.imageUrl ||
    resolveFoodThumbnail(effectivePlan.foodBrand, effectivePlan.foodName, pet.species);

  const isBarf = effectivePlan.foodType === 'barf' || pet.dietType === 'barf';
  const totalMealsPlanned = Math.max(1, effectivePlan.mealsPerDay || 2);
  const perMealBowlGrams = effectivePlan.rationConfirmed
    ? Math.round(treatsGuidance.bowlGramsTotalToday / totalMealsPlanned)
    : 0;

  return (
    <div className="p-4 space-y-4 pb-28">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0B5D2E] text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 max-w-[90vw]">
          <Check className="w-4 h-4 text-[#86EFAC] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

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

      {/* 2. SINGLE NEXT STEP ON FIRST ENTRY (One clear action depending on what is missing) */}
      {nextStep && (
        <div className="bg-[#FFFBEB] border border-amber-300 rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 block">
              Siguiente paso sugerido
            </span>
            <p className="font-heading font-extrabold text-sm text-[#1C2B21]">
              {nextStep.title}
            </p>
            <p className="text-xs text-[#44544A] leading-snug">
              {nextStep.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (nextStep.id === 'complete_label') setShowLabelReview(true);
              else if (nextStep.id === 'configure_schedule') setShowScheduleModal(true);
              else setShowRefineModal(true);
            }}
            className="min-h-[44px] px-3.5 py-2 bg-[#0B5D2E] text-white rounded-xl text-xs font-heading font-extrabold shrink-0 flex items-center gap-1 hover:bg-[#094723] transition"
          >
            <span>{nextStep.ctaLabel}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. PRIMARY HERO CARD: PRÓXIMA COMIDA Y PROGRESO REAL DEL DÍA */}
      <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E] block">
              {isEs ? 'Próxima comida · Hoy' : 'Next meal · Today'}
            </span>
            <h2 className="font-heading font-extrabold text-lg text-[#1C2B21] leading-tight mt-0.5">
              {nextMeal.allMealsCompleted
                ? `¡${pet.name} completó sus ${nextMeal.totalMealsCount} comidas de hoy!`
                : nextMeal.nextMealTime
                ? `Comida ${(nextMeal.nextMealIndex ?? 0) + 1} a las ${nextMeal.nextMealTime}`
                : `Plan diario de ${pet.name}`}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowWhyModal(true)}
            className="text-xs font-bold text-[#0B5D2E] hover:underline flex items-center gap-1 shrink-0 min-h-[36px] px-2"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>¿Por qué me sale esto?</span>
          </button>
        </div>

        {/* Ration amount OR explicit label/BARF status */}
        {effectivePlan.rationConfirmed && effectivePlan.gramsPerDay > 0 ? (
          <div className="space-y-1.5">
            <div className="font-heading font-black text-4xl sm:text-5xl text-[#1C2B21] tracking-tight leading-none tabular-nums">
              {formatRation(perMealBowlGrams, units)}
              <span className="text-lg sm:text-xl font-bold text-[#44544A] ml-2 font-['Nunito',sans-serif]">
                por toma ({totalMealsPlanned}/día)
              </span>
            </div>
            <p className="text-xs font-bold text-[#0B5D2E] tabular-nums">
              {isEs ? 'Ración diaria' : 'Daily ration'}: {formatRation(effectivePlan.gramsPerDay, units)}
              {treatsGuidance.trainingGramsAllocatedToday > 0 &&
                ` · ${treatsGuidance.trainingGramsAllocatedToday} g apartados para entrenamiento`}
            </p>
            <p className="text-xs text-[#44544A] tabular-nums">
              {isEs ? 'Meta energética diaria (MER)' : 'Daily energy target (MER)'}: {effectivePlan.mer} kcal
            </p>
          </div>
        ) : isBarf ? (
          <div className="bg-[#FFFBEB] p-3.5 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-1">
            <strong className="block font-extrabold">Dieta BARF / Natural Cruda registrada</strong>
            <p className="leading-relaxed">
              No calculamos gramos automáticos para dietas crudas. Sigue las porciones y fórmulas definidas por tu veterinario o nutricionista veterinario.
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 flex items-center justify-between gap-3">
            <div className="text-xs text-amber-950 space-y-0.5">
              <strong className="block font-extrabold">Etiqueta pendiente para calcular gramos</strong>
              <p className="leading-snug">
                Confirma la fórmula y las kcal/kg del empaque para mostrar la porción exacta.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowLabelReview(true)}
              className="min-h-[44px] px-3 py-2 bg-[#0B5D2E] text-white rounded-xl text-xs font-bold shrink-0"
            >
              Revisar etiqueta
            </button>
          </div>
        )}

        {/* Real daily progress strip */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="bg-[#F8FAF8] p-2.5 rounded-2xl border border-gray-100">
            <span className="text-[10px] font-bold uppercase text-[#44544A] block">Comidas</span>
            <strong className="text-sm font-extrabold text-[#1C2B21] tabular-nums">
              {nextMeal.completedMealsCount} / {nextMeal.totalMealsCount}
            </strong>
          </div>
          <div className="bg-[#F8FAF8] p-2.5 rounded-2xl border border-gray-100">
            <span className="text-[10px] font-bold uppercase text-[#44544A] block">Energía hoy</span>
            <strong className="text-sm font-extrabold text-[#0B5D2E] tabular-nums">
              {nextMeal.consumedKcalTotal} / {nextMeal.targetKcalTotal} kcal
            </strong>
          </div>
          <div className="bg-[#F8FAF8] p-2.5 rounded-2xl border border-gray-100">
            <span className="text-[10px] font-bold uppercase text-[#44544A] block">Peso actual</span>
            <strong className="text-sm font-extrabold text-[#1C2B21] tabular-nums">
              {pet.currentWeightKg} kg
            </strong>
          </div>
        </div>

        {/* 3 Required Quick Actions: Registrar comida, Registrar premio, Registrar peso */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setShowMealModal(true)}
            className="min-h-[46px] px-2 py-2 bg-[#0B5D2E] hover:bg-[#094723] text-white rounded-2xl text-xs font-heading font-extrabold flex flex-col items-center justify-center gap-1 transition active:scale-98"
          >
            <Utensils className="w-4 h-4" />
            <span>Registrar comida</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTreatModal(true)}
            className="min-h-[46px] px-2 py-2 bg-[#EAF4EC] hover:bg-[#d8eedb] text-[#0B5D2E] rounded-2xl text-xs font-heading font-extrabold flex flex-col items-center justify-center gap-1 border border-[#0B5D2E25] transition active:scale-98"
          >
            <Cookie className="w-4 h-4 text-[#F57C1A]" />
            <span>Registrar premio</span>
          </button>
          <button
            type="button"
            onClick={() => setShowWeightModal(true)}
            className="min-h-[46px] px-2 py-2 bg-[#F8FAF8] hover:bg-gray-100 text-[#1C2B21] rounded-2xl text-xs font-heading font-extrabold flex flex-col items-center justify-center gap-1 border border-gray-200 transition active:scale-98"
          >
            <Scale className="w-4 h-4 text-[#0B5D2E]" />
            <span>Registrar peso</span>
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
              onClick={() => setShowScheduleModal(true)}
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

          {Array.from({ length: totalMealsPlanned }).map((_, idx) => {
            const scheduledTime =
              effectivePlan.mealTimes?.[idx] || (idx === 0 ? '08:00' : '20:00');
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
                      {effectivePlan.rationConfirmed && (
                        <span className="font-extrabold text-[#0B5D2E] tabular-nums">
                          {formatRation(perMealBowlGrams, units)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#44544A] truncate">
                      {isFed
                        ? `Comió con ${log.fedBy || selectedFeeder} (${log.completedAt || scheduledTime})${
                            log.gramsFed > 0
                              ? ` · Servido: ${formatRation(log.gramsFed, units)}${
                                  log.plannedGrams && log.plannedGrams !== log.gramsFed
                                    ? ` (plan: ${formatRation(log.plannedGrams, units)})`
                                    : ''
                                }`
                              : ''
                          }`
                        : 'Pendiente'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onToggleMeal(idx, selectedFeeder, perMealBowlGrams, scheduledTime, perMealBowlGrams)
                  }
                  className={`min-h-[44px] px-3.5 rounded-xl font-heading font-bold text-xs flex items-center gap-1 transition shrink-0 ${
                    isFed
                      ? 'bg-[#1E8A49] text-white'
                      : 'bg-white text-[#0B5D2E] border border-[#0B5D2E30] hover:bg-[#0B5D2E] hover:text-white'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>{isFed ? 'Comió' : 'Ya comió'}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Daily served nutrient intake summary (tal como se vende) */}
        <div className="bg-[#F8FAF8] rounded-2xl p-3.5 border border-gray-200 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E]">
              Aporte nutricional servido hoy (tal como se vende)
            </span>
            {dailyNutrition.isPartialTotal && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                Total parcial
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white px-2.5 py-2 rounded-xl border border-gray-100">
              <span className="text-[10px] text-[#44544A] block">Planificado vs. servido</span>
              <strong className="text-[#1C2B21] tabular-nums">
                {dailyNutrition.totalPlannedGrams > 0 ? `${dailyNutrition.totalPlannedGrams} g` : 'Sin plan'} /{' '}
                <span className="text-[#0B5D2E]">{dailyNutrition.totalServedGrams} g</span>
              </strong>
            </div>
            <div className="bg-white px-2.5 py-2 rounded-xl border border-gray-100">
              <span className="text-[10px] text-[#44544A] block">Energía servida</span>
              <strong className="text-[#1C2B21] tabular-nums">
                {dailyNutrition.completedMealsCount === 0
                  ? '0 kcal'
                  : dailyNutrition.kcalServedTotal !== null
                  ? `${dailyNutrition.kcalServedTotal} kcal`
                  : 'Sin dato verificado'}
              </strong>
            </div>
          </div>

          {dailyNutrition.completedMealsCount > 0 && (
            <div className="text-[11px] text-[#44544A] space-y-0.5 leading-snug">
              <p>• {dailyNutrition.proteinaPhrase}</p>
              <p>• {dailyNutrition.grasaPhrase}</p>
              <p>• {dailyNutrition.fibraPhrase}</p>
            </div>
          )}

          {dailyNutrition.partialWarning && (
            <p className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded-xl border border-amber-200 leading-snug">
              {dailyNutrition.partialWarning}
            </p>
          )}
        </div>
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
            onClick={() => setShowAdjustChoiceModal(true)}
            className="text-xs font-bold text-[#0B5D2E] hover:underline flex items-center gap-1 min-h-[36px] shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Cambiar</span>
          </button>
        </div>

        {/* Registered Product Header */}
        <div className="flex items-center gap-3 bg-[#F8FAF8] p-3 rounded-2xl border border-gray-200">
          <div className="w-12 h-14 bg-white rounded-xl border border-gray-200 p-1 flex items-center justify-center shrink-0 overflow-hidden">
            {foodThumb ? (
              <img
                src={foodThumb}
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
                ? 'No coincide con su etapa actual'
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
                        onSelectFoodForPet?.(alt.food);
                        setShowAlternatives(false);
                        showToast(`Cambiado a ${alt.food.brand} ${alt.food.name}.`);
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

      {/* Compact Card: Alimento restante (ONLY when ration confirmed and > 0) */}
      {effectivePlan.rationConfirmed && effectivePlan.gramsPerDay > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading font-extrabold text-base text-[#1C2B21]">
                Alimento restante
              </h3>
              <p className="text-xs text-[#44544A]">
                Estimado con su ración diaria confirmada ({formatRation(effectivePlan.gramsPerDay, units)}/día)
              </p>
            </div>
            <div className="text-right">
              <span className="font-heading font-black text-2xl text-[#0B5D2E] tabular-nums">
                {effectivePlan.bagDaysRemaining ? `~${effectivePlan.bagDaysRemaining} días` : 'Por definir'}
              </span>
            </div>
          </div>

          <div className="bg-[#F8FAF8] p-3 rounded-2xl border border-gray-100 flex items-center justify-between gap-2 text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-gray-500 block">
                Gasto registrado ($ COP)
              </span>
              <div className="flex items-center gap-1 font-bold text-[#0B5D2E]">
                <DollarSign className="w-3.5 h-3.5" />
                <span>
                  {latestFoodPurchase
                    ? `${formatCOP(latestFoodPurchase.pricePaidCop, true)} (${latestFoodPurchase.bagSizeKg} kg)`
                    : effectivePlan.bagPriceCop
                    ? `${formatCOP(effectivePlan.bagPriceCop, true)} (${effectivePlan.bagWeightKg || 10} kg)`
                    : 'Sin costo registrado'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowInventorySearchModal(true)}
              className="px-3 py-2 bg-[#EAF4EC] hover:bg-[#d5ebd7] text-[#0B5D2E] rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-[#0B5D2E20] min-h-[42px] shrink-0"
            >
              <Receipt className="w-4 h-4" />
              <span>Subir recibo</span>
            </button>
          </div>
        </div>
      )}

      {/* Daily Ring Chart */}
      <DailyKcalRingChart
        pet={pet}
        plan={effectivePlan}
        mealLogs={mealLogs}
        treatLogs={treatLogsToday}
        trainingGramsToday={treatsGuidance.trainingGramsAllocatedToday}
        lang={userAccount.language}
      />

      {/* Price Comparator Shortcut (for commercial diets) */}
      {!isBarf && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#0B5D2E20] shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E] block">
                Comparador de precios · {selectedCity || 'Bogotá'}
              </span>
              <h3 className="font-heading font-extrabold text-base text-[#1C2B21]">
                {effectivePlan.foodBrand} {effectivePlan.foodName}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('compare', 'prices')}
              className="min-h-[44px] px-4 py-2 bg-[#0B5D2E] text-white rounded-xl font-heading font-extrabold text-xs hover:bg-[#094723] flex items-center gap-1.5 shrink-0"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Ver precios</span>
            </button>
          </div>
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* Adjust Choice Modal */}
      {showAdjustChoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl border border-[#0B5D2E20] space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="font-heading font-extrabold text-base text-[#1C2B21]">
                Alimento de {pet.name}
              </h3>
              <button
                type="button"
                onClick={() => setShowAdjustChoiceModal(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowAdjustChoiceModal(false);
                setShowFoodSearchModal(true);
              }}
              className="w-full p-3.5 bg-[#EAF4EC] rounded-2xl text-left text-xs font-bold text-[#0B5D2E] flex items-center justify-between"
            >
              <span>Buscar o cambiar alimento habitual</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isBarf && (
              <button
                type="button"
                onClick={() => {
                  setShowAdjustChoiceModal(false);
                  setShowLabelReview(true);
                }}
                className="w-full p-3.5 bg-[#F8FAF8] rounded-2xl text-left text-xs font-bold text-[#1C2B21] border border-gray-200 flex items-center justify-between"
              >
                <span>Revisar o adjuntar foto de etiqueta</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <UnifiedFoodSearchModal
        isOpen={showFoodSearchModal}
        onClose={() => setShowFoodSearchModal(false)}
        activePet={pet}
        allPets={allPets}
        plans={plans}
        onSelectFood={handleFoodSelectedFromSearch}
        lang={userAccount.language}
      />

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

      {showScheduleModal && (
        <ScheduleConfigModal
          key={effectivePlan.petId}
          onClose={() => setShowScheduleModal(false)}
          plan={effectivePlan}
          onSaveSchedule={handleSaveSchedule}
        />
      )}

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
        defaultFeeder={selectedFeeder}
        familyMembers={userAccount.familyMembers}
        onConfirmMeal={(idx, feeder, grams, time, plannedGrams) => {
          onToggleMeal(idx, feeder, grams, time, plannedGrams, true);
          showToast(`Comida ${idx + 1} registrada (${grams} g servidos).`);
        }}
      />

      <InventoryFoodSearchModal
        isOpen={showInventorySearchModal}
        onClose={() => setShowInventorySearchModal(false)}
        pet={pet}
        plan={effectivePlan}
        lang={userAccount.language}
        onPurchaseLogged={(entry) => {
          setPurchaseRefreshKey((k) => k + 1);
          showToast(`Compra de ${entry.foodBrand} guardada en el inventario de ${pet.name}.`);
        }}
      />
    </div>
  );
};
