import React, { useState, useMemo, useEffect } from 'react';
import {
  ActivityLevel,
  FeedingPlan,
  FoodItem,
  MealLog,
  MealMixedComponent,
  Pet,
  TreatCatalogItem,
  TreatLog,
} from '../types';
import { formatRation } from '../utils/i18n';
import { localDateKey } from '../utils/localDate';
import { defaultMealTimes } from '../utils/calculator';
import { getFoodKcalPerKg, getLoggedMealEnergy, getPlannedMeals, getPlannedMealComponents, snapshotMealFood } from '../utils/mealPortions';
import { UnifiedFoodSearchModal } from './UnifiedFoodSearchModal';
import { calculateDailyMealNutritionSummary } from '../utils/mealNutrition';
import { getPricePerGram, resolveFoodPrice, sameFoodIdentity } from '../utils/foodCosts';
import { StorageService } from '../utils/storage';
import { PET_TREATS_DATABASE } from '../data/foods';
import { evaluateTreatsBudget, getNextMealStatus, TreatsGuidance } from '../utils/feedingGuide';
import { X, Check, Clock, Cookie, Scale, Utensils, AlertCircle } from 'lucide-react';

/* 1. CONFIGURAR HORARIOS */
interface ScheduleConfigModalProps {
  onClose: () => void;
  plan: FeedingPlan;
  onSaveSchedule: (mealsPerDay: number, mealTimes: string[]) => void;
}

export const ScheduleConfigModal: React.FC<ScheduleConfigModalProps> = ({
  onClose,
  plan,
  onSaveSchedule,
}) => {
  const [mealsCount, setMealsCount] = useState(plan.mealsPerDay || 2);
  const [times, setTimes] = useState<string[]>(
    plan.mealTimes?.length ? plan.mealTimes : defaultMealTimes(plan.mealsPerDay)
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const mealTimes = new FormData(event.currentTarget).getAll('mealTime') as string[];
    onSaveSchedule(mealsCount, mealTimes);
    onClose();
  };

  const handleCountChange = (count: number) => {
    if (count === mealsCount) return;
    setMealsCount(count);
    setTimes(defaultMealTimes(count));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-[#0B5D2E20]">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#0B5D2E]" />
            <h3 className="font-heading font-extrabold text-lg text-[#1C2B21]">
              Configurar horarios
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold text-[#1C2B21] block">
            ¿Cuántas comidas al día?
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(plan.isVetLocked ? [plan.mealsPerDay] : [1, 2, 3, 4]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleCountChange(c)}
                className={`min-h-[48px] rounded-xl border font-heading font-extrabold text-sm transition ${
                  mealsCount === c
                    ? 'bg-[#0B5D2E] text-white border-[#0B5D2E]'
                    : 'bg-white text-[#1C2B21] border-gray-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: mealsCount }).map((_, idx) => (
            <div key={`${mealsCount}-${idx}`} className="bg-[#F8FAF8] p-2.5 rounded-xl border border-gray-200 flex items-center gap-2">
              <span className="text-xs font-bold text-[#0B5D2E]">#{idx + 1}</span>
              <input
                type="time"
                name="mealTime"
                aria-label={`Hora de la toma ${idx + 1}`}
                defaultValue={times[idx] || '08:00'}
                required
                className="w-full bg-white px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-[#1C2B21]"
              />
            </div>
          ))}
        </div>

        <button
          type="submit"
          className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition"
        >
          <Check className="w-4 h-4" />
          <span>Guardar horarios</span>
        </button>
      </form>
    </div>
  );
};

/* 2. AFINAR PERFIL OPCIONAL (Peso adulto esperado, actividad, BCS) */
interface ProfileRefinementModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: Pet;
  onSaveRefinement: (updatedPet: Pet) => void;
}

export const ProfileRefinementModal: React.FC<ProfileRefinementModalProps> = ({
  isOpen,
  onClose,
  pet,
  onSaveRefinement,
}) => {
  const [expectedAdult, setExpectedAdult] = useState(
    pet.expectedAdultWeightKg ? String(pet.expectedAdultWeightKg) : ''
  );
  const [activity, setActivity] = useState<ActivityLevel>(pet.activityLevel || 'moderate');
  const [bcs, setBcs] = useState<number>(pet.bcs || 5);

  useEffect(() => {
    if (!isOpen) return;
    setExpectedAdult(pet.expectedAdultWeightKg ? String(pet.expectedAdultWeightKg) : '');
    setActivity(pet.activityLevel || 'moderate');
    setBcs(pet.bcs || 5);
  }, [isOpen, pet]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAdult = parseFloat(expectedAdult);
    onSaveRefinement({
      ...pet,
      expectedAdultWeightKg:
        Number.isFinite(parsedAdult) && parsedAdult > 0 ? parsedAdult : pet.expectedAdultWeightKg,
      activityLevel: activity,
      bcs,
      profileRefinementPending: {
        adultWeight: false,
        activity: false,
        bcs: false,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <form
        onSubmit={handleSave}
        className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-[#0B5D2E20]"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-heading font-extrabold text-lg text-[#1C2B21]">
            Afinar guía de {pet.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-[#1C2B21]">
            Peso adulto esperado (kg, opcional)
          </label>
          <input
            type="number"
            step="0.5"
            min="0.5"
            max="100"
            value={expectedAdult}
            onChange={(e) => setExpectedAdult(e.target.value)}
            placeholder="Ej. 15 kg (ayuda a orientar tamaño de croqueta)"
            className="w-full px-3 py-2.5 bg-[#F8FAF8] border border-gray-200 rounded-xl text-sm font-bold text-[#1C2B21] min-h-[46px]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[#1C2B21]">Nivel de actividad</label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'low', label: 'Bajo' },
                { id: 'moderate', label: 'Moderado' },
                { id: 'high', label: 'Alto' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setActivity(opt.id)}
                className={`min-h-[44px] rounded-xl border text-xs font-bold ${
                  activity === opt.id
                    ? 'bg-[#0B5D2E] text-white border-[#0B5D2E]'
                    : 'bg-white text-[#44544A] border-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-bold text-[#1C2B21]">
            <span>Condición corporal (BCS 1 a 9)</span>
            <span className="text-[#0B5D2E] tabular-nums">{bcs} / 9</span>
          </div>
          <input
            type="range"
            min="1"
            max="9"
            step="1"
            value={bcs}
            onChange={(e) => setBcs(Number(e.target.value))}
            className="w-full accent-[#0B5D2E]"
          />
          <div className="flex justify-between text-[11px] text-[#44544A]">
            <span>1 Muy delgado</span>
            <span>4-5 Ideal</span>
            <span>9 Obesidad</span>
          </div>
        </div>

        <button
          type="submit"
          className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition"
        >
          <Check className="w-4 h-4" />
          <span>Actualizar guía</span>
        </button>
      </form>
    </div>
  );
};

/* 3. REGISTRAR PREMIO (y apartado de ración para entrenamiento de cachorro) */
interface RegisterTreatModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: Pet;
  plan?: FeedingPlan;
  treatsToday: TreatLog[];
  onAddTreat: (log: TreatLog) => void;
  onSaveTrainingGrams: (grams: number) => void;
}

export const RegisterTreatModal: React.FC<RegisterTreatModalProps> = ({
  isOpen,
  onClose,
  pet,
  plan,
  treatsToday,
  onAddTreat,
  onSaveTrainingGrams,
}) => {
  const speciesTreats = useMemo(
    () => PET_TREATS_DATABASE.filter((t) => t.species === pet.species),
    [pet.species]
  );

  const [mode, setMode] = useState<'treat' | 'training_ration'>('treat');
  const [selectedTreatId, setSelectedTreatId] = useState<string>(
    speciesTreats[0]?.id || 'custom_no_unit'
  );
  const [piecesCount, setPiecesCount] = useState<number>(1);
  const [customName, setCustomName] = useState<string>('');
  const [manualKcal, setManualKcal] = useState<string>('');
  const [findingTreat, setFindingTreat] = useState(false);
  const [weighedFood, setWeighedFood] = useState<FoodItem>();
  const [treatGrams, setTreatGrams] = useState('');
  const [fromAllowance, setFromAllowance] = useState(false);
  const [trainingGramsInput, setTrainingGramsInput] = useState<string>(
    String(plan?.trainingRationGramsToday || 0)
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedTreatId(speciesTreats[0]?.id || 'custom_no_unit');
    setPiecesCount(1);
    setCustomName('');
    setManualKcal('');
    setFindingTreat(false);
    setWeighedFood(undefined);
    setTreatGrams('');
    setFromAllowance(false);
    setTrainingGramsInput(String(plan?.trainingRationGramsToday || 0));
    setMode('treat');
    setErrorMsg(null);
  }, [isOpen, speciesTreats, plan?.trainingRationGramsToday]);

  const selectedTreat: TreatCatalogItem | null =
    speciesTreats.find((t) => t.id === selectedTreatId) || null;
  const sameRation = Boolean(weighedFood && [plan?.dryFood, plan?.wetFood].some((food) => food && sameFoodIdentity(food, weighedFood)));
  const reserved = (plan?.trainingRationGramsToday ?? 0) - treatsToday.reduce((sum, entry) => sum + (entry.gramsFromRation ?? 0), 0);

  const treatsGuidance: TreatsGuidance = useMemo(
    () => evaluateTreatsBudget(pet, plan, treatsToday, selectedTreat),
    [pet, plan, treatsToday, selectedTreat]
  );

  if (!isOpen) return null;

  const handleSaveTreat = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (weighedFood) {
      const grams = Number(treatGrams);
      const density = getFoodKcalPerKg(weighedFood);
      const kcal = density ? density * grams / 1000 : Number(manualKcal);
      if (!(Number.isFinite(grams) && grams > 0 && Number.isFinite(kcal) && kcal > 0)) {
        setErrorMsg('Confirma los gramos consumidos y las kcal de esa porción.');
        return;
      }
      const price = resolveFoodPrice(weighedFood, weighedFood.bagSizeKg, StorageService.getFoodPurchases(pet.id));
      if (sameRation && fromAllowance && grams > reserved) {
        setErrorMsg('Los gramos superan la cantidad disponible de la ración reservada.');
        return;
      }
      onAddTreat({
        id: 'tr_' + Date.now(), petId: pet.id, date: localDateKey(), name: weighedFood.name, brand: weighedFood.brand,
        kcal, nutritionComponent: {
          ...snapshotMealFood(weighedFood, 'main', grams, grams),
          priceSnapshot: { copPerGram: getPricePerGram(price), packageKg: weighedFood.bagSizeKg, source: price?.source },
        },
        isTrainingFromRation: sameRation && fromAllowance,
        gramsFromRation: sameRation && fromAllowance ? grams : undefined,
        hasKcalPerUnitOnLabel: false, loggedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      onClose();
      return;
    }
    if (selectedTreat && selectedTreat.hasKcalPerUnitOnLabel && selectedTreat.kcalPerUnit) {
      const pcs = Math.max(1, Math.floor(piecesCount));
      const kcal = pcs * selectedTreat.kcalPerUnit;
      onAddTreat({
        id: 'tr_' + Date.now(),
        petId: pet.id,
        date: localDateKey(),
        name: selectedTreat.name,
        brand: selectedTreat.brand,
        kcal,
        pieces: pcs,
        kcalPerUnit: selectedTreat.kcalPerUnit,
        hasKcalPerUnitOnLabel: true,
        loggedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      onClose();
      return;
    }

    // Treat WITHOUT kcal per unit on label -> record total kcal explicitly, never fabricate pieces
    const parsedKcal = parseFloat(manualKcal);
    if (!Number.isFinite(parsedKcal) || parsedKcal <= 0) {
      setErrorMsg(
        'Este premio no indica kcal por unidad en etiqueta. Ingresa las kcal totales administradas para llevar la cuenta real del día.'
      );
      return;
    }

    onAddTreat({
      id: 'tr_' + Date.now(),
      petId: pet.id,
      date: localDateKey(),
      name: selectedTreat ? selectedTreat.name : customName.trim() || 'Premio / Snack',
      brand: selectedTreat?.brand,
      kcal: Math.round(parsedKcal),
      hasKcalPerUnitOnLabel: false,
      loggedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full max-h-[90dvh] flex flex-col shadow-2xl border border-[#0B5D2E20] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Cookie className="w-5 h-5 text-[#F57C1A]" />
            <h3 className="font-heading font-extrabold text-lg text-[#1C2B21]">
              Registrar premio
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Option toggle for puppies to set aside training grams from own ration */}
          {treatsGuidance.canAllocatePuppyTrainingFromRation && (
            <div className="grid grid-cols-2 gap-1.5 bg-[#EAF4EC] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('treat')}
                className={`py-2 px-2 rounded-lg text-xs font-bold min-h-[40px] ${
                  mode === 'treat' ? 'bg-[#0B5D2E] text-white' : 'text-[#44544A]'
                }`}
              >
                Premio / Snack
              </button>
              <button
                type="button"
                onClick={() => setMode('training_ration')}
                className={`py-2 px-2 rounded-lg text-xs font-bold min-h-[40px] ${
                  mode === 'training_ration' ? 'bg-[#0B5D2E] text-white' : 'text-[#44544A]'
                }`}
              >
                Entrenamiento con ración
              </button>
            </div>
          )}

          {mode === 'training_ration' && treatsGuidance.canAllocatePuppyTrainingFromRation ? (
            <div className="space-y-3">
              <div className="bg-[#EAF4EC] p-3.5 rounded-2xl border border-[#0B5D2E20] text-xs text-[#1C2B21] space-y-1">
                <strong className="text-[#0B5D2E] block">
                  Apartar parte de su ración diaria para entrenamiento
                </strong>
                <p className="text-[#44544A]">
                  Los gramos reservados se descuentan de los {plan?.gramsPerDay} g planificados para el plato. Cuando los coma, registra la cantidad con «Buscar el alimento del premio».
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21]">
                  Gramos apartados para entrenamiento hoy (máx {plan?.gramsPerDay} g)
                </label>
                <input
                  type="number"
                  min="0"
                  max={plan?.gramsPerDay || 500}
                  value={trainingGramsInput}
                  onChange={(e) => setTrainingGramsInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#0B5D2E30] rounded-xl text-base font-extrabold text-[#0B5D2E] tabular-nums min-h-[46px]"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const g = Math.min(
                    plan?.gramsPerDay || 0,
                    Math.max(0, Math.round(parseFloat(trainingGramsInput) || 0))
                  );
                  onSaveTrainingGrams(g);
                  onClose();
                }}
                className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Guardar gramos de entrenamiento</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveTreat} className="space-y-3.5">
              {/* Budget Summary */}
              <div className="bg-[#FFF7ED] p-3 rounded-2xl border border-[#F57C1A]/25 text-xs space-y-1">
                {treatsGuidance.isEligibleFor10PctCap ? (
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#9A3412]">Presupuesto disponible hoy (tope 10%):</span>
                    <strong className="font-extrabold text-[#F57C1A] tabular-nums">
                      {treatsGuidance.remainingKcalToday} / {treatsGuidance.dailyBudgetKcal} kcal
                    </strong>
                  </div>
                ) : (
                  <p className="font-bold text-[#9A3412]">
                    {treatsGuidance.vetRestrictionNote}
                  </p>
                )}
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button type="button" className="min-h-11 w-full rounded-xl border border-[#0B5D2E30] px-3 text-xs font-bold text-[#0B5D2E]" onClick={() => setFindingTreat(true)}>
                {weighedFood ? 'Cambiar alimento del premio' : 'Buscar el alimento del premio'}
              </button>
              {weighedFood ? <div className="space-y-2 rounded-xl bg-[#F3F7F3] p-3 text-xs">
                <strong>{weighedFood.brand} {weighedFood.name}</strong>
                <label className="block">Gramos consumidos como premio
                  <input type="number" step="any" min="0.001" required value={treatGrams} onChange={(e) => setTreatGrams(e.target.value)}
                    className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 px-3" />
                </label>
                {getFoodKcalPerKg(weighedFood) ? <p>{Math.round((Number(treatGrams) || 0) * getFoodKcalPerKg(weighedFood)! / 1000)} kcal</p> :
                  <label className="block">Kcal de la porción según la etiqueta
                    <input type="number" step="any" min="0.001" required value={manualKcal} onChange={(e) => setManualKcal(e.target.value)}
                      className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 px-3" />
                  </label>}
                {sameRation && reserved > 0 && <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={fromAllowance} onChange={(e) => setFromAllowance(e.target.checked)} />
                  Viene de la ración reservada para entrenamiento ({reserved} g disponibles)
                </label>}
                <button type="button" onClick={() => setWeighedFood(undefined)} className="min-h-11 font-bold text-[#0B5D2E] underline">Volver al registro manual</button>
              </div> : <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1C2B21]">Seleccionar premio o ingresar otro</label>
                <select
                  value={selectedTreatId}
                  onChange={(e) => setSelectedTreatId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#1C2B21] min-h-[46px]"
                >
                  {speciesTreats.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.brand} — {t.name} (
                      {t.hasKcalPerUnitOnLabel && t.kcalPerUnit
                        ? `${t.kcalPerUnit} kcal/pieza`
                        : 'Sin kcal por unidad en etiqueta'}
                      )
                    </option>
                  ))}
                  <option value="custom_no_unit">Otro premio manual (sin kcal/pieza)</option>
                </select>
              </div>

              {/* Piece calculation ONLY when label declares kcal per unit */}
              {selectedTreat && selectedTreat.hasKcalPerUnitOnLabel && selectedTreat.kcalPerUnit ? (
                <div className="space-y-2">
                  <div className="p-3 bg-[#EAF4EC] rounded-xl text-xs text-[#0B5D2E] font-semibold">
                    {treatsGuidance.pieceCalculationNote}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1C2B21]">
                      Cantidad de piezas ({selectedTreat.unitLabel || 'unidades'})
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={piecesCount}
                      onChange={(e) => setPiecesCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-extrabold text-[#1C2B21] tabular-nums min-h-[46px]"
                    />
                    <p className="text-[11px] text-[#44544A] tabular-nums">
                      Total a registrar: {piecesCount * selectedTreat.kcalPerUnit} kcal
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                    Este premio no especifica calorías por unidad en su etiqueta. No calculamos piezas estimadas: registra las kcal totales de la porción dada.
                  </div>
                  {selectedTreatId === 'custom_no_unit' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#1C2B21]">Nombre del premio</label>
                      <input
                        type="text"
                        required
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Ej. Hígado deshidratado, snack dental"
                        className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs min-h-[44px]"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1C2B21]">
                      Kcal totales de este premio *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="1000"
                      value={manualKcal}
                      onChange={(e) => setManualKcal(e.target.value)}
                      placeholder="Ej. 25"
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold tabular-nums min-h-[46px]"
                    />
                  </div>
                </div>
              )}

              </>}
              <button
                type="submit"
                className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition"
              >
                <Check className="w-4 h-4" />
                <span>Guardar premio de hoy</span>
              </button>
            </form>
          )}
          {findingTreat && <UnifiedFoodSearchModal isOpen onClose={() => setFindingTreat(false)} activePet={pet}
            titleOverride="Elegir alimento del premio" onSelectFood={({ sourceFoodItem }) => {
              setWeighedFood(sourceFoodItem); setManualKcal(''); setTreatGrams(''); setFromAllowance(false);
            }} />}
        </div>
      </div>
    </div>
  );
};

/* 4. REGISTRAR PESO */
interface RegisterWeightModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: Pet;
  onSaveWeight: (weightKg: number, notes?: string) => void;
}

export const RegisterWeightModal: React.FC<RegisterWeightModalProps> = ({
  isOpen,
  onClose,
  pet,
  onSaveWeight,
}) => {
  const [weight, setWeight] = useState(String(pet.currentWeightKg));
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setWeight(String(pet.currentWeightKg));
    setNotes('');
  }, [isOpen, pet.currentWeightKg]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(weight);
    if (!Number.isFinite(val) || val <= 0) return;
    onSaveWeight(val, notes.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-[#0B5D2E20]"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-[#0B5D2E]" />
            <h3 className="font-heading font-extrabold text-lg text-[#1C2B21]">
              Registrar peso de {pet.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-[#1C2B21]">Peso actual (kg) *</label>
          <input
            type="number"
            step="0.1"
            min="0.3"
            max="120"
            required
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full px-3 py-3 bg-[#EAF4EC]/60 border border-[#0B5D2E30] rounded-xl text-center text-2xl font-extrabold text-[#0B5D2E] tabular-nums min-h-[52px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-[#1C2B21]">Nota (opcional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. Control mensual en báscula"
            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs min-h-[44px]"
          />
        </div>

        <button
          type="submit"
          className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          <span>Guardar peso</span>
        </button>
      </form>
    </div>
  );
};

/* 5. REGISTRAR COMIDA */
interface RegisterMealModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: Pet;
  plan: FeedingPlan;
  mealLogs: MealLog[];
  treats: TreatLog[];
  manualIntake?: boolean;
  defaultFeeder: string;
  preferredMealIndex?: number;
  familyMembers: Array<{ id: string; name: string }>;
  onConfirmMeal: (
    mealIndex: number,
    fedBy: string,
    grams: number,
    time: string,
    plannedGrams?: number,
    mixedComponents?: MealMixedComponent[],
    gramsEaten?: number
  ) => void;
}

export const RegisterMealModal: React.FC<RegisterMealModalProps> = ({
  isOpen,
  onClose,
  pet,
  plan,
  mealLogs,
  treats,
  manualIntake = false,
  defaultFeeder,
  preferredMealIndex,
  familyMembers,
  onConfirmMeal,
}) => {
  const portions = useMemo(() => getPlannedMeals(plan, plan.trainingRationGramsToday), [plan]);
  const times = defaultMealTimes(portions.length);
  const completedMeals = useMemo(() => mealLogs.filter((log) => log.completed), [mealLogs]);
  const startingMealIndex = preferredMealIndex ?? portions.findIndex(
    (_, index) => !completedMeals.some((log) => log.mealIndex === index)
  );
  const initialIndex = Math.max(0, startingMealIndex);
  const initialPortion = completedMeals.find((log) => log.mealIndex === initialIndex)?.gramsFed ??
    (plan.rationConfirmed && !manualIntake ? portions[initialIndex]?.grams : undefined);

  const [mealIndex, setMealIndex] = useState(initialIndex);
  const [fedBy, setFedBy] = useState(defaultFeeder);
  const [grams, setGrams] = useState('');
  const [hasLeftovers, setHasLeftovers] = useState(false);
  const [leftovers, setLeftovers] = useState<string[]>([]);
  const [componentInputs, setComponentInputs] = useState<string[]>([]);
  const previousLeftovers = (entry?: MealLog) => {
    if (!entry || entry.gramsEaten === undefined || entry.gramsEaten >= entry.gramsFed) return [];
    return entry.mixedComponents?.length ? entry.mixedComponents.map((item) => String(item.gramsFed - (item.gramsEaten ?? item.gramsFed)))
      : [String(entry.gramsFed - entry.gramsEaten)];
  };

  useEffect(() => {
    if (!isOpen) return;
    setMealIndex(initialIndex);
    setFedBy(completedMeals.find((log) => log.mealIndex === initialIndex)?.fedBy || defaultFeeder);
    setGrams(initialPortion === undefined ? '' : String(initialPortion));
    const remaining = previousLeftovers(completedMeals.find((log) => log.mealIndex === initialIndex));
    setHasLeftovers(remaining.length > 0);
    setLeftovers(remaining);
    setComponentInputs([]);
  }, [isOpen, initialIndex, initialPortion, completedMeals, defaultFeeder]);

  if (!isOpen) return null;

  const existing = completedMeals.find((log) => log.mealIndex === mealIndex);
  const scheduledTime = existing?.mealTime || plan.mealTimes?.[mealIndex] || times[mealIndex];
  const plannedPortion = portions[mealIndex];
  const plannedGrams = existing?.plannedGrams ?? (plan.rationConfirmed && !manualIntake ? plannedPortion?.grams : undefined);
  const original = existing?.mixedComponents;
  const base = original?.length ? original : !plan.isVetLocked && plan.foodType === 'mixed' && plan.dryFood && plan.wetFood ? [
    snapshotMealFood(plan.dryFood, 'dry', plannedPortion?.dryGrams ?? 0, plannedPortion?.dryGrams ?? 0),
    snapshotMealFood(plan.wetFood, 'wet', plannedPortion?.wetGrams ?? 0, plannedPortion?.wetGrams ?? 0),
  ] : getPlannedMealComponents(plan, plannedPortion);
  const perComponent = Boolean(base && base.length > 1);
  const fields = perComponent ? base!.map((item, i) => componentInputs[i] ?? (existing || (plan.rationConfirmed && !manualIntake) ? String(item.gramsFed) : '')) : [grams];
  const validServed = fields.every((value) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0);
  const servedGrams = fields.reduce((sum, value) => sum + Number(value || 0), 0);
  const serving = validServed ? servedGrams : 0;
  const available = base?.map((item, i) => ({ ...item, gramsFed: Number(fields[i] || 0) }));
  const weights = available?.map((item) => item.gramsFed) ?? [serving];
  const validRemaining = !hasLeftovers || weights.every((qty, i) => (qty === 0 && !Number(leftovers[i])) ||
    (leftovers[i]?.trim() && Number.isFinite(Number(leftovers[i])) && Number(leftovers[i]) >= 0 && Number(leftovers[i]) <= qty));
  const canSubmit = validServed && validRemaining;
  const eatenByItem = weights.map((qty, i) => qty - (hasLeftovers ? Number(leftovers[i] || 0) : 0));
  const gramsEaten = eatenByItem.reduce((sum, qty) => sum + qty, 0);
  const components = available?.map((item, i) => ({ ...item, gramsEaten: eatenByItem[i] }));
  const pending = { mealIndex, plannedGrams, gramsFed: serving, gramsEaten, mixedComponents: components };
  const energy = getLoggedMealEnergy(pending, plan);
  const otherMeals = getNextMealStatus(plan, mealLogs.filter((entry) => entry.mealIndex !== mealIndex), treats);
  const excess = otherMeals.consumedKcalUnrounded + energy.kcal - otherMeals.targetKcalTotal;
  const includesPartialEnergy = otherMeals.energyIncomplete || energy.partial;
  const portionNutrition = canSubmit ? calculateDailyMealNutritionSummary({ plan, mealLogs: [{
    ...pending, id: 'preview', petId: pet.id, date: localDateKey(), mealTime: scheduledTime, fedBy, completed: true,
  }] }) : undefined;

  const selectMeal = (index: number) => {
    const existing = completedMeals.find((log) => log.mealIndex === index);
    const amount = existing?.gramsFed ?? (plan.rationConfirmed && !manualIntake ? portions[index]?.grams : undefined);
    setMealIndex(index);
    setFedBy(existing?.fedBy || defaultFeeder);
    setGrams(amount === undefined ? '' : String(amount));
    const remaining = previousLeftovers(existing);
    setHasLeftovers(remaining.length > 0);
    setLeftovers(remaining);
    setComponentInputs([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={`Registrar comida de ${pet.name}`} className="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm max-h-[92dvh] overflow-y-auto w-full p-5 space-y-4 shadow-2xl border border-[#0B5D2E20]">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5 text-[#0B5D2E]" />
            <h3 className="font-heading font-extrabold text-lg text-[#1C2B21]">
              Registrar comida de {pet.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-[#1C2B21] block">Toma del día</label>
          <div className="grid grid-cols-2 gap-2">
            {portions.map((_, idx) => {
              const t = plan.mealTimes?.[idx] || times[idx];
              const isDone = completedMeals.some((log) => log.mealIndex === idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectMeal(idx)}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold text-left ${
                    mealIndex === idx
                      ? 'bg-[#0B5D2E] text-white border-[#0B5D2E]'
                      : 'bg-white text-[#1C2B21] border-gray-200'
                  }`}
                >
                  Comida {idx + 1} · {t} {isDone ? '✓' : ''}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1C2B21]">¿Quién dio la comida?</label>
            <select
              value={fedBy}
              onChange={(e) => setFedBy(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold min-h-[44px]"
            >
              {!familyMembers.length && <option value={defaultFeeder}>{defaultFeeder}</option>}
              {familyMembers.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1C2B21]">
              Gramos servidos
              {plannedGrams !== undefined && (
                <span className="font-normal text-[#44544A] block text-[10px]">
                  Planificado: {formatRation(plannedGrams)}
                </span>
              )}
            </label>
            {perComponent ? <strong className="block">{serving} g</strong> : <input
              type="number"
              min="0"
              step="any"
              placeholder={plannedGrams !== undefined ? String(plannedGrams) : 'Ej: 50'}
              aria-label="Gramos servidos"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-extrabold text-[#0B5D2E] tabular-nums min-h-[44px]"
            />}
          </div>
        </div>

        {perComponent && base?.map((item, i) => <label key={item.role} className="block text-xs">
          Gramos servidos · {item.foodName}
          <input type="number" min="0" step="any" value={fields[i]} onChange={(e) => {
            const next = [...fields]; next[i] = e.target.value; setComponentInputs(next);
          }} className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3" />
        </label>)}
        <fieldset className="space-y-2 text-xs">
          <legend className="font-bold">¿Cuánto comió?</legend>
          <div className="grid grid-cols-2 gap-2">
            {['Comió todo', 'Dejó parte'].map((label, i) => <button type="button" key={label} aria-pressed={hasLeftovers === Boolean(i)}
              className={`min-h-11 rounded-xl border font-bold ${hasLeftovers === Boolean(i) ? 'border-[#0B5D2E] bg-[#EAF4EC] text-[#0B5D2E]' : 'border-gray-200'}`}
              onClick={() => setHasLeftovers(Boolean(i))}>{label}</button>)}
          </div>
          {hasLeftovers && weights.map((qty, i) => <label key={i} className="block">
            Gramos que dejó{available && available.length > 1 ? ' · ' + available[i].foodName : ''} (de {Number(qty.toFixed(2))} g)
            <input type="number" min="0" step="any" max={qty} value={leftovers[i] ?? ''} onChange={(event) => {
              const next = [...leftovers]; next[i] = event.target.value; setLeftovers(next);
            }} className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3" />
          </label>)}
        </fieldset>
        {canSubmit && <div className="space-y-1 rounded-xl bg-[#F4F8F4] p-3 text-xs">
          <p className="font-bold">{Number(gramsEaten.toFixed(2))} g consumidos · {energy.partial ? (energy.kcal ? Math.round(energy.kcal) + ' kcal (parcial)' : 'kcal pendientes') : Math.round(energy.kcal) + ' kcal'}</p>
          {portionNutrition?.consumedBreakdown.map((item, i) => <p key={i}>
            {available && available.length > 1 && item.foodName + ' · '}
            {[item.proteina, item.grasa, item.fibra, item.carbohidratos].filter((n) => n?.available).map((n) => n!.displayText).join(' · ')}
          </p>)}
        </div>}
        {canSubmit && otherMeals.targetKcalTotal > 0 && excess > 0.000001 && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-950">
          Con esta toma superarías la meta diaria{excess >= 1 ? ' en ' + (includesPartialEnergy ? 'al menos ' : '') + Math.floor(excess) + ' kcal' : ''}, incluidos los premios de hoy. Revisa los gramos antes de confirmar.
        </p>}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            onConfirmMeal(mealIndex, fedBy, servedGrams, scheduledTime, plannedGrams, components, gramsEaten);
            onClose();
          }}
          className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          <span>Confirmar toma</span>
        </button>
      </div>
    </div>
  );
};
