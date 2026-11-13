import React, { useMemo } from 'react';
import { Pet, FeedingPlan, MealLog, TreatLog } from '../types';
import { Flame, Utensils, CheckCircle2, AlertCircle } from 'lucide-react';

interface DailyKcalRingChartProps {
  pet: Pet;
  plan: FeedingPlan;
  mealLogs: MealLog[];
  treatLogs?: TreatLog[];
  trainingGramsToday?: number;
  lang?: string;
}

export const DailyKcalRingChart: React.FC<DailyKcalRingChartProps> = ({
  pet,
  plan,
  mealLogs,
  treatLogs = [],
  trainingGramsToday = 0,
  lang = 'es',
}) => {
  const isEs = lang === 'es';

  const rationConfirmed = Boolean(plan.rationConfirmed && plan.gramsPerDay > 0);
  const merTarget = plan.mer || 0;
  const mealsPlanned = Math.max(1, plan.mealsPerDay || 2);
  const kcalPerMeal = rationConfirmed
    ? plan.kcalPerMeal || Math.round(merTarget / mealsPlanned)
    : 0;

  const completedMealLogs = useMemo(() => {
    return mealLogs.filter((l) => l.completed);
  }, [mealLogs]);

  const mealsCompletedCount = completedMealLogs.length;

  const treatsKcalToday = useMemo(
    () => treatLogs.reduce((sum, t) => sum + (Number(t.kcal) || 0), 0),
    [treatLogs]
  );

  const kcalConsumed = useMemo(() => {
    if (!rationConfirmed || merTarget <= 0 || plan.gramsPerDay <= 0) {
      return treatsKcalToday;
    }

    const kcalPerGram = merTarget / plan.gramsPerDay;
    const mealsKcal = completedMealLogs.reduce((sum, log) => {
      if (log.gramsFed && log.gramsFed > 0) {
        return sum + Math.round(log.gramsFed * kcalPerGram);
      }
      return sum + kcalPerMeal;
    }, 0);

    const boundedTraining = Math.min(trainingGramsToday, plan.gramsPerDay);
    const trainingKcal = boundedTraining > 0 ? Math.round(boundedTraining * kcalPerGram) : 0;

    return mealsKcal + treatsKcalToday + trainingKcal;
  }, [
    rationConfirmed,
    merTarget,
    plan.gramsPerDay,
    completedMealLogs,
    kcalPerMeal,
    treatsKcalToday,
    trainingGramsToday,
  ]);

  const percentKcal = merTarget > 0 ? Math.round((kcalConsumed / merTarget) * 100) : 0;
  const boundedKcalPercent = Math.min(100, Math.max(0, percentKcal));
  const kcalRemaining = Math.max(0, merTarget - kcalConsumed);
  const isExceeded = merTarget > 0 && kcalConsumed > merTarget;
  const excessKcal = isExceeded ? kcalConsumed - merTarget : 0;

  const mealsPercent = Math.min(100, Math.round((mealsCompletedCount / mealsPlanned) * 100));
  const snackBudgetKcal = plan.treatsBudgetKcal ?? Math.round(merTarget * 0.1);

  const size = 180;
  const strokeWidthOuter = 12;
  const strokeWidthInner = 8;
  const center = size / 2;

  const radiusOuter = center - strokeWidthOuter - 4;
  const circumferenceOuter = 2 * Math.PI * radiusOuter;
  const strokeDashoffsetOuter =
    circumferenceOuter - (boundedKcalPercent / 100) * circumferenceOuter;

  const radiusInner = radiusOuter - strokeWidthInner - 8;
  const circumferenceInner = 2 * Math.PI * radiusInner;
  const strokeDashoffsetInner =
    circumferenceInner - (mealsPercent / 100) * circumferenceInner;

  return (
    <div className="bg-white rounded-3xl p-5 border border-[#0B5D2E20] shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B5D2E] block">
            {isEs ? 'Balance energético (MER)' : 'Daily Energy Balance (MER)'}
          </span>
          <h3 className="font-heading font-extrabold text-base sm:text-lg text-[#1C2B21] mt-0.5">
            {isEs ? `Progreso diario de ${pet.name}` : `${pet.name}'s Daily Intake`}
          </h3>
          <p className="text-xs text-[#44544A] mt-0.5">
            {rationConfirmed
              ? isEs
                ? 'Incluye comidas registradas, premios del día y ración de entrenamiento.'
                : 'Includes meals, treats, and training ration.'
              : plan.foodType === 'barf' || pet.dietType === 'barf'
              ? isEs
                ? 'Dieta BARF activa: las cantidades y kcal exactas deben validarse con tu veterinario.'
                : 'BARF active: exact quantities require veterinary validation.'
              : isEs
              ? 'Etiqueta pendiente: confirma las kcal/kg del alimento para calcular las kcal por comida.'
              : 'Pending label: confirm food kcal/kg to compute meal calories.'}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {isExceeded ? (
            <span className="inline-flex items-center gap-1 text-xs font-extrabold text-red-700 tabular-nums">
              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
              <span>+{excessKcal} kcal</span>
            </span>
          ) : percentKcal >= 100 ? (
            <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#0B5D2E] tabular-nums">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1E8A49]" />
              <span>100% MER</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#44544A] tabular-nums">
              <Flame className="w-3.5 h-3.5 text-[#F57C1A]" />
              <span>{percentKcal}%</span>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-1">
        <div className="sm:col-span-5 flex flex-col items-center justify-center relative">
          <div className="relative w-[180px] h-[180px] flex items-center justify-center">
            <svg
              width={size}
              height={size}
              className="rotate-[-90deg] transition-all duration-700"
              viewBox={`0 0 ${size} ${size}`}
            >
              <defs>
                <linearGradient id="merKcalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0B5D2E" />
                  <stop offset="100%" stopColor="#1E8A49" />
                </linearGradient>
                <linearGradient id="merExceededGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F57C1A" />
                  <stop offset="100%" stopColor="#DC2626" />
                </linearGradient>
                <linearGradient id="mealsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0284C7" />
                  <stop offset="100%" stopColor="#0EA5E9" />
                </linearGradient>
              </defs>

              <circle
                cx={center}
                cy={center}
                r={radiusOuter}
                fill="none"
                stroke="#EAF4EC"
                strokeWidth={strokeWidthOuter}
              />
              <circle
                cx={center}
                cy={center}
                r={radiusOuter}
                fill="none"
                stroke={isExceeded ? 'url(#merExceededGradient)' : 'url(#merKcalGradient)'}
                strokeWidth={strokeWidthOuter}
                strokeLinecap="round"
                strokeDasharray={circumferenceOuter}
                strokeDashoffset={strokeDashoffsetOuter}
                style={{
                  transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />

              <circle
                cx={center}
                cy={center}
                r={radiusInner}
                fill="none"
                stroke="#F1F5F9"
                strokeWidth={strokeWidthInner}
              />
              <circle
                cx={center}
                cy={center}
                r={radiusInner}
                fill="none"
                stroke="url(#mealsGradient)"
                strokeWidth={strokeWidthInner}
                strokeLinecap="round"
                strokeDasharray={circumferenceInner}
                strokeDashoffset={strokeDashoffsetInner}
                style={{
                  transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 pointer-events-none select-none">
              <span className="text-[10px] uppercase font-black tracking-wider text-gray-400">
                {rationConfirmed ? (isEs ? 'Consumo' : 'Intake') : isEs ? 'Comidas' : 'Meals'}
              </span>
              <div className="font-heading font-black text-2xl sm:text-3xl text-[#1C2B21] leading-none my-0.5 tabular-nums">
                {rationConfirmed ? kcalConsumed : `${mealsCompletedCount}/${mealsPlanned}`}
              </div>
              <span className="text-[11px] font-bold text-[#0B5D2E]">
                {rationConfirmed ? 'kcal' : isEs ? 'registradas' : 'logged'}
              </span>
              {merTarget > 0 && (
                <span className="text-[10px] text-gray-500 font-semibold mt-0.5 tabular-nums">
                  {isEs ? `Meta ${merTarget} kcal` : `Goal ${merTarget} kcal`}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-bold text-[#44544A] mt-2">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0B5D2E]" />
              {isEs ? 'Kcal' : 'Kcal'}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0EA5E9]" />
              {isEs ? 'Tomas' : 'Meals'}
            </span>
          </div>
        </div>

        <div className="sm:col-span-7 space-y-2.5">
          <div className="p-3 bg-[#F8FAF8] rounded-2xl border border-gray-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#EAF4EC] text-[#0B5D2E] flex items-center justify-center shrink-0">
                <Flame className="w-4 h-4 text-[#0B5D2E]" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-500 block">
                  {isEs ? 'Calorías registradas hoy' : 'Calories logged today'}
                </span>
                <strong className="text-xs sm:text-sm font-heading font-extrabold text-[#1C2B21] tabular-nums">
                  {kcalConsumed} / {merTarget} kcal
                </strong>
              </div>
            </div>

            <span className="text-xs font-black text-[#0B5D2E] tabular-nums shrink-0">
              {percentKcal}%
            </span>
          </div>

          <div className="p-3 bg-[#F8FAF8] rounded-2xl border border-gray-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#E0F2FE] text-[#0284C7] flex items-center justify-center shrink-0">
                <Utensils className="w-4 h-4 text-[#0284C7]" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-500 block">
                  {isEs ? 'Comidas servidas' : 'Meals served'}
                </span>
                <strong className="text-xs sm:text-sm font-heading font-extrabold text-[#1C2B21] tabular-nums">
                  {mealsCompletedCount} de {mealsPlanned} {isEs ? 'comidas' : 'meals'}
                </strong>
              </div>
            </div>

            <span className="text-xs font-bold text-[#0284C7] tabular-nums shrink-0">
              {rationConfirmed ? `~${kcalPerMeal} kcal/toma` : 'Etiqueta pendiente'}
            </span>
          </div>

          <div className="p-3 bg-[#EAF4EC]/70 rounded-2xl border border-[#0B5D2E20] flex items-center justify-between text-xs gap-2">
            <div className="space-y-0.5 min-w-0">
              <span className="text-[10px] uppercase font-black text-[#0B5D2E] block">
                {isEs ? 'Balance de hoy' : 'Daily balance'}
              </span>
              <p className="font-semibold text-[#1C2B21] text-[11px] leading-snug">
                {!rationConfirmed
                  ? isEs
                    ? `Premios hoy: ${treatsKcalToday} kcal. Completa la etiqueta para sumar las tomas.`
                    : `Treats today: ${treatsKcalToday} kcal.`
                  : isExceeded
                  ? isEs
                    ? `Superó el MER por ${excessKcal} kcal.`
                    : `Exceeded MER by ${excessKcal} kcal.`
                  : kcalRemaining === 0
                  ? isEs
                    ? 'Requerimiento diario cubierto al 100%.'
                    : '100% daily energy goal reached.'
                  : isEs
                  ? `Faltan ${kcalRemaining} kcal para completar su MER.`
                  : `${kcalRemaining} kcal remaining to reach MER.`}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <span className="text-[10px] text-[#44544A] block font-semibold">
                {isEs ? 'Tope premios:' : 'Treat cap:'}
              </span>
              <strong className="text-xs font-extrabold text-[#F57C1A] tabular-nums">
                {snackBudgetKcal > 0 ? `≤ ${snackBudgetKcal} kcal` : 'Bajo pauta vet.'}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
