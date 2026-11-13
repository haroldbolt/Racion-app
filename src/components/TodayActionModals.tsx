import React, { useState, useMemo, useEffect } from 'react';
import {
  ActivityLevel,
  FeedingPlan,
  MealLog,
  Pet,
  TreatCatalogItem,
  TreatLog,
} from '../types';
import { PET_TREATS_DATABASE } from '../data/foods';
import { evaluateTreatsBudget, TreatsGuidance } from '../utils/feedingGuide';
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
    plan.mealTimes && plan.mealTimes.length > 0 ? plan.mealTimes : ['08:00', '20:00']
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
    if (count === 1) setTimes(['12:00']);
    if (count === 2) setTimes(['08:00', '20:00']);
    if (count === 3) setTimes(['08:00', '14:00', '20:00']);
    if (count === 4) setTimes(['07:30', '12:00', '16:30', '20:30']);
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
            {[1, 2, 3, 4].map((c) => (
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
    setTrainingGramsInput(String(plan?.trainingRationGramsToday || 0));
    setMode('treat');
    setErrorMsg(null);
  }, [isOpen, speciesTreats, plan?.trainingRationGramsToday]);

  const selectedTreat: TreatCatalogItem | null =
    speciesTreats.find((t) => t.id === selectedTreatId) || null;

  const treatsGuidance: TreatsGuidance = useMemo(
    () => evaluateTreatsBudget(pet, plan, treatsToday, selectedTreat),
    [pet, plan, treatsToday, selectedTreat]
  );

  if (!isOpen) return null;

  const handleSaveTreat = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (selectedTreat && selectedTreat.hasKcalPerUnitOnLabel && selectedTreat.kcalPerUnit) {
      const pcs = Math.max(1, Math.floor(piecesCount));
      const kcal = pcs * selectedTreat.kcalPerUnit;
      onAddTreat({
        id: 'tr_' + Date.now(),
        petId: pet.id,
        date: new Date().toISOString().split('T')[0],
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
      date: new Date().toISOString().split('T')[0],
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
                  En cachorros, puedes usar parte de sus {plan?.gramsPerDay} g diarios como premio de entrenamiento sin sumar calorías extra. Los gramos apartados se restan de su plato y se cuentan dentro del total diario.
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

              <button
                type="submit"
                className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-[#094723] transition"
              >
                <Check className="w-4 h-4" />
                <span>Guardar premio de hoy</span>
              </button>
            </form>
          )}
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
  defaultFeeder: string;
  familyMembers: Array<{ id: string; name: string }>;
  onConfirmMeal: (
    mealIndex: number,
    fedBy: string,
    grams: number,
    time: string,
    plannedGrams?: number
  ) => void;
}

export const RegisterMealModal: React.FC<RegisterMealModalProps> = ({
  isOpen,
  onClose,
  pet,
  plan,
  mealLogs,
  defaultFeeder,
  familyMembers,
  onConfirmMeal,
}) => {
  const totalMeals = Math.max(1, plan.mealsPerDay || 2);
  const completedSet = new Set(mealLogs.filter((l) => l.completed).map((l) => l.mealIndex));
  const firstPending = Array.from({ length: totalMeals }).findIndex((_, idx) => !completedSet.has(idx));

  const [mealIndex, setMealIndex] = useState(firstPending >= 0 ? firstPending : 0);
  const [fedBy, setFedBy] = useState(defaultFeeder);
  const trainingGrams = plan.rationConfirmed ? Math.min(plan.trainingRationGramsToday || 0, plan.gramsPerDay || 0) : 0;
  const defaultBowlPerMeal = plan.rationConfirmed
    ? Math.round(Math.max(0, (plan.gramsPerDay || 0) - trainingGrams) / totalMeals)
    : 0;
  const [grams, setGrams] = useState(defaultBowlPerMeal > 0 ? String(defaultBowlPerMeal) : '');

  useEffect(() => {
    if (!isOpen) return;
    const done = new Set(mealLogs.filter((l) => l.completed).map((l) => l.mealIndex));
    const nextIdx = Array.from({ length: totalMeals }).findIndex((_, idx) => !done.has(idx));
    setMealIndex(nextIdx >= 0 ? nextIdx : 0);
    setFedBy(defaultFeeder);
    setGrams(defaultBowlPerMeal > 0 ? String(defaultBowlPerMeal) : '');
  }, [isOpen, mealLogs, totalMeals, defaultFeeder, defaultBowlPerMeal]);

  if (!isOpen) return null;

  const scheduledTime = plan.mealTimes?.[mealIndex] || (mealIndex === 0 ? '08:00' : '20:00');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-[#0B5D2E20]">
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
            {Array.from({ length: totalMeals }).map((_, idx) => {
              const t = plan.mealTimes?.[idx] || '08:00';
              const isDone = completedSet.has(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setMealIndex(idx)}
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
              {defaultBowlPerMeal > 0 && (
                <span className="font-normal text-[#44544A] block text-[10px]">
                  Planificado: {defaultBowlPerMeal} g
                </span>
              )}
            </label>
            <input
              type="number"
              min="0"
              step="1"
              placeholder={defaultBowlPerMeal > 0 ? String(defaultBowlPerMeal) : 'Ej: 50'}
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-extrabold text-[#0B5D2E] tabular-nums min-h-[44px]"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onConfirmMeal(
              mealIndex,
              fedBy,
              Math.max(0, Math.round(parseFloat(grams) || 0)),
              scheduledTime,
              defaultBowlPerMeal
            );
            onClose();
          }}
          className="w-full min-h-[48px] bg-[#0B5D2E] text-white rounded-2xl font-heading font-extrabold text-sm flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          <span>Confirmar toma</span>
        </button>
      </div>
    </div>
  );
};
