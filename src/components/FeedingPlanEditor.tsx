import { useEffect, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import type { FeedingPlan, FoodItem, MealLog, Pet } from '../types';
import { defaultMealTimes } from '../utils/calculator';
import {
  canEditFormula,
  createFeedingPlanAdjustment,
  minimumMealCount,
  previewFeedingPlanAdjustment,
  retainManufacturerPortion,
  retainManualPortion,
  updateLabelEnergy,
  type FormulaType,
} from '../utils/feedingPlanAdjustment';
import { calculateDailyMealNutritionSummary } from '../utils/mealNutrition';
import { getFoodKcalPerKg, getPreviewMeals } from '../utils/mealPortions';
import { PlanChangePreview } from './PlanChangePreview';
import { StorageService } from '../utils/storage';
import { ManufacturerRationInput, RationSourceNote } from './ManufacturerRationInput';
import { getPlanSafetyNotices } from '../utils/foodSafety';
import { NutritionSummary } from './NutritionSummary';
import { UnifiedFoodSearchModal } from './UnifiedFoodSearchModal';

interface FeedingPlanEditorProps {
  pet: Pet;
  plan: FeedingPlan;
  meals: MealLog[];
  initialFood?: FoodItem;
  language: 'es' | 'en';
  onSave: (next: FeedingPlan) => void;
  onClose: () => void;
}

type FoodSlot = 'dry' | 'wet';
const formulaOptions: ReadonlyArray<{ type: FormulaType; es: string; en: string }> = [
  { type: 'dry', es: 'Seco', en: 'Dry' },
  { type: 'wet', es: 'Húmedo', en: 'Wet' },
  { type: 'mixed', es: 'Mixto', en: 'Mixed' },
];

export function FeedingPlanEditor({
  pet, plan, meals, initialFood, language, onSave, onClose,
}: FeedingPlanEditorProps) {
  const isEs = language === 'es';
  const editable = canEditFormula(pet, plan);
  const [draft, setDraft] = useState(() => createFeedingPlanAdjustment(plan, initialFood));
  const [picking, setPicking] = useState<FoodSlot>();
  const minimum = editable ? minimumMealCount(meals) : plan.mealsPerDay;
  const preview = previewFeedingPlanAdjustment(pet, plan, draft, meals);
  const nextPlan = 'plan' in preview ? preview.plan : undefined;
  const unsafeFormula = Boolean(editable && nextPlan && getPlanSafetyNotices(pet, nextPlan, language).some((notice) => notice.level === 'mismatch'));
  const portions = nextPlan ? getPreviewMeals(nextPlan) : [];
  const summary = nextPlan ? calculateDailyMealNutritionSummary({ plan: nextPlan, mealLogs: [] }) : undefined;
  const grams = new Intl.NumberFormat(isEs ? 'es-CO' : 'en-US', { maximumFractionDigits: 3 });
  const slots: FoodSlot[] = draft.foodType === 'mixed' ? ['dry', 'wet'] :
    draft.foodType === 'wet' ? ['wet'] : ['dry'];

  useEffect(() => {
    if (picking) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, picking]);

  function changeMealCount(count: number) {
    setDraft((previous) => {
      const times = previous.mealTimes.slice(0, count);
      const suggestions = [...defaultMealTimes(count), ...defaultMealTimes(6)];
      for (const time of suggestions) {
        if (times.length === count) break;
        if (!times.includes(time)) times.push(time);
      }
      return { ...previous, mealsPerDay: count, mealTimes: times };
    });
  }

  const errors = {
    schedule: isEs ? 'Completa la hora de cada toma.' : 'Choose a time for every serving.',
    mealCount: isEs ? 'Conserva los espacios de las tomas registradas hoy.' : 'Keep the slots for servings already logged today.',
    formula: isEs ? 'Elige cada fórmula que forma parte de la ración.' : 'Choose every formula in the ration.',
    guide: isEs ? 'Elige una cantidad dentro del rango de la tabla que corresponda al peso actual.' : 'Choose an amount inside the guide range for the current weight.',
    manual: isEs ? 'Ingresa una cantidad diaria válida mayor que cero.' : 'Enter a valid positive daily amount.',
    density: isEs ? 'Ingresa las kcal/kg de la etiqueta con un valor mayor que cero.' : 'Enter a positive kcal/kg value from the label.',
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4"
        aria-hidden={picking ? true : undefined}
        inert={Boolean(picking)}
      >
        <section aria-modal={!picking} aria-labelledby="feeding-adjustment-title" role="dialog" className="flex max-h-[93dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
          <header className="flex items-start justify-between gap-3 border-b border-[#0B5D2E20] px-5 py-4">
            <div>
              <h2 id="feeding-adjustment-title" className="font-heading text-xl font-extrabold text-[#1C2B21]">
                {isEs ? 'Ajustar ración' : 'Adjust feeding plan'}
              </h2>
              <p className="mt-0.5 text-xs text-[#44544A]">{pet.name}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={isEs ? 'Cerrar' : 'Close'} className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-[#44544A] hover:bg-[#EAF4EC]">
              <X size={20} />
            </button>
          </header>

          <form
            className="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (picking || unsafeFormula) return;
              const mealTimes = new FormData(event.currentTarget).getAll('mealTime').map(String);
              const saved = previewFeedingPlanAdjustment(pet, plan, { ...draft, mealTimes }, meals);
              if (!('plan' in saved) || (editable && getPlanSafetyNotices(pet, saved.plan, language).some((notice) => notice.level === 'mismatch'))) return;
              if (editable) {
                for (const slot of slots) {
                  const key = slot === 'dry' ? 'dryFood' : 'wetFood';
                  const updatedFood = saved.plan[key];
                  if (updatedFood && getFoodKcalPerKg(updatedFood) !== getFoodKcalPerKg(draft[key])) StorageService.addCustomFood(updatedFood);
                }
              }
              onSave(saved.plan);
            }}
          >
            <div className="space-y-5 overflow-y-auto overscroll-contain p-5">
              {editable ? (
                <fieldset className="space-y-3">
                  <legend className="mb-2 font-heading text-sm font-extrabold text-[#1C2B21]">{isEs ? 'Alimento' : 'Food'}</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {formulaOptions.map(({ type, es, en }) => (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={draft.foodType === type}
                        onClick={() => setDraft((previous) => type === previous.foodType ? previous : { ...previous, foodType: type, manufacturerGramsPerDay: undefined, manualGramsPerDay: undefined })}
                        className={`min-h-11 rounded-xl border px-2 text-sm font-bold transition ${draft.foodType === type
                          ? 'border-[#0B5D2E] bg-[#0B5D2E] text-white'
                          : 'border-[#0B5D2E30] bg-white text-[#0B5D2E] hover:bg-[#EAF4EC]'}`}
                      >
                        {isEs ? es : en}
                      </button>
                    ))}
                  </div>

                  {slots.map((slot) => {
                    const dry = slot === 'dry';
                    const food = dry ? draft.dryFood : draft.wetFood;
                    const energy = dry ? draft.dryEnergy : draft.wetEnergy;
                    const label = dry ? (isEs ? 'Alimento seco' : 'Dry food') : (isEs ? 'Alimento húmedo' : 'Wet food');
                    const energyLabel = draft.foodType === 'mixed'
                      ? (dry ? (isEs ? 'Energía del seco (kcal/kg)' : 'Dry food energy (kcal/kg)') : (isEs ? 'Energía del húmedo (kcal/kg)' : 'Wet food energy (kcal/kg)'))
                      : (isEs ? 'Energía de la etiqueta (kcal/kg)' : 'Label energy (kcal/kg)');
                    return (
                      <div key={slot} className="space-y-2 rounded-2xl border border-[#0B5D2E20] bg-[#F8FAF8] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#44544A]">{label}</p>
                            {food && <p className="mt-0.5 break-words text-sm font-extrabold text-[#1C2B21]">{food.brand} {food.name}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => setPicking(slot)}
                            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[#0B5D2E30] bg-white px-2.5 text-xs font-bold text-[#0B5D2E] hover:bg-[#EAF4EC]"
                          >
                            <Search size={14} />
                            {food ? (isEs ? 'Cambiar fórmula' : 'Change formula') : (isEs ? 'Elegir fórmula' : 'Choose formula')}
                          </button>
                        </div>
                        {food && (
                          <label className="block text-xs font-semibold text-[#44544A]">
                            {energyLabel}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={energy}
                              onChange={(event) => setDraft((previous) => ({
                                ...previous,
                                [dry ? 'dryEnergy' : 'wetEnergy']: event.target.value,
                                manufacturerGramsPerDay: undefined,
                                manualGramsPerDay: undefined,
                              }))}
                              className="mt-1 min-h-11 w-full rounded-xl border border-[#0B5D2E30] bg-white px-3 text-sm font-bold text-[#1C2B21]"
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}

                  {draft.foodType !== 'mixed' && !(draft.foodType === 'dry' ? draft.dryEnergy : draft.wetEnergy).trim() && (
                    <ManufacturerRationInput food={updateLabelEnergy(draft.foodType === 'dry' ? draft.dryFood : draft.wetFood, undefined)} pet={pet} goal={plan.goal ?? 'maintain'} value={draft.manufacturerGramsPerDay}
                      onChange={(grams) => setDraft((previous) => ({ ...previous, manufacturerGramsPerDay: grams }))}
                      manualValue={draft.manualGramsPerDay} onManualChange={(grams) => setDraft((previous) => ({ ...previous, manualGramsPerDay: grams }))} lang={language} />
                  )}

                  {draft.foodType === 'mixed' && (
                    <label className="block rounded-xl bg-[#EAF4EC] p-3 text-xs font-bold text-[#0B5D2E]">
                      {isEs ? 'Calorías del alimento seco' : 'Calories from dry food'} · {draft.mixedDryPct}%
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={draft.mixedDryPct}
                        onChange={(event) => setDraft((previous) => ({ ...previous, mixedDryPct: Number(event.target.value) }))}
                        className="mt-2 block w-full accent-[#0B5D2E]"
                      />
                    </label>
                  )}
                </fieldset>
              ) : (
                <p className="rounded-xl bg-[#EAF4EC] p-3 text-xs leading-snug text-[#44544A]">
                  {isEs
                    ? 'La fórmula y las porciones siguen la pauta veterinaria. Aquí puedes organizar los horarios.'
                    : 'The formula and portions follow veterinary guidance. You can organize the times here.'}
                </p>
              )}

              <fieldset className="space-y-3">
                <legend className="mb-2 font-heading text-sm font-extrabold text-[#1C2B21]">{isEs ? 'Tomas y horarios' : 'Servings and times'}</legend>
                {editable && (
                  <label className="block text-xs font-semibold text-[#44544A]">
                    {isEs ? 'Tomas al día' : 'Servings per day'}
                    <select
                      value={draft.mealsPerDay}
                      onChange={(event) => changeMealCount(Number(event.target.value))}
                      className="mt-1 min-h-11 w-full rounded-xl border border-[#0B5D2E30] bg-white px-3 text-sm font-bold text-[#1C2B21]"
                    >
                      {[1, 2, 3, 4, 5, 6].map((count) => (
                        <option key={count} value={count} disabled={count < minimum}>{count}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {draft.mealTimes.map((time, index) => (
                    <label key={index} className="min-w-0 text-xs font-semibold text-[#44544A]">
                      {isEs ? `Hora de la toma ${index + 1}` : `Time for serving ${index + 1}`}
                      <input
                        type="time"
                        name="mealTime"
                        required
                        value={time}
                        onInput={(event) => {
                          const timeInput = event.currentTarget.value;
                          setDraft((previous) => ({
                            ...previous,
                            mealTimes: previous.mealTimes.map((value, position) => position === index ? timeInput : value),
                          }));
                        }}
                        className="mt-1 min-h-11 w-full rounded-xl border border-[#0B5D2E30] bg-white px-2 text-sm font-bold text-[#1C2B21]"
                      />
                    </label>
                  ))}
                </div>
                {meals.some((meal) => meal.completed) && (
                  <p className="text-xs text-[#44544A]">
                    {isEs ? 'Las tomas ya registradas conservan sus cantidades y su etiqueta originales.' : 'Logged servings keep their original amounts and label.'}
                  </p>
                )}
              </fieldset>

              <section aria-labelledby="feeding-adjustment-preview" className="rounded-2xl border border-[#0B5D2E30] bg-[#EAF4EC] p-3.5">
                <h3 id="feeding-adjustment-preview" className="font-heading text-sm font-extrabold text-[#0B5D2E]">
                  {isEs ? 'Vista previa de la ración' : 'Feeding plan preview'}
                </h3>
                {'error' in preview && <p className="mt-2 text-xs text-[#44544A]">{errors[preview.error === 'guide' && draft.manualGramsPerDay !== undefined ? 'manual' : preview.error]}</p>}
                {nextPlan && (!nextPlan.rationConfirmed && nextPlan.rationSource !== 'manual' ? (
                  <p className="mt-2 text-xs text-[#44544A]">
                    {editable
                      ? (isEs ? 'Elige el alimento e ingresa sus kcal/kg para ver las porciones.' : 'Choose the food and enter its kcal/kg to see the portions.')
                      : (isEs ? 'Los gramos dependen de la pauta veterinaria.' : 'Amounts depend on veterinary guidance.')}
                  </p>
                ) : (
                  <>
                    <p className="my-2 text-xl font-extrabold text-[#1C2B21]">
                      {grams.format(nextPlan.gramsPerDay)} {isEs ? 'g al día' : 'g per day'}
                    </p>
                    <RationSourceNote plan={nextPlan} lang={language} />
                    {nextPlan.foodType === 'mixed' && !nextPlan.isVetLocked && (
                      <p className="mb-2 text-xs font-semibold text-[#44544A]">
                        {grams.format(nextPlan.dryGramsPerDay ?? 0)} g {isEs ? 'seco' : 'dry'} · {grams.format(nextPlan.wetGramsPerDay ?? 0)} g {isEs ? 'húmedo' : 'wet'}
                      </p>
                    )}
                    <ul className="space-y-1">
                      {portions.map((portion, index) => (
                        <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                          <span className="text-[#44544A]">{isEs ? 'Toma' : 'Serving'} {index + 1} · {nextPlan.mealTimes[index]}</span>
                          <span className="font-extrabold text-[#1C2B21]">{grams.format(portion.grams)} g</span>
                          {portion.dryGrams !== undefined && (
                            <span className="w-full text-right text-[#44544A]">
                              {grams.format(portion.dryGrams)} g {isEs ? 'seco' : 'dry'} · {grams.format(portion.wetGrams ?? 0)} g {isEs ? 'húmedo' : 'wet'}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ))}
              </section>

              {nextPlan && <PlanChangePreview pet={pet} current={plan} proposed={nextPlan} lang={language} />}
              {summary && nextPlan?.rationConfirmed && (
                <NutritionSummary summary={summary} language={language} planOnly />
              )}
            </div>

            <footer className="flex gap-2 border-t border-[#0B5D2E20] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[#0B5D2E30] px-3 text-sm font-bold text-[#0B5D2E]">
                {isEs ? 'Cancelar' : 'Cancel'}
              </button>
              <button type="submit" disabled={!nextPlan || unsafeFormula} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0B5D2E] px-3 text-sm font-extrabold text-white hover:bg-[#094723] disabled:opacity-45">
                <Check size={17} />
                {isEs ? `Guardar cambios para ${pet.name}` : `Save changes for ${pet.name}`}
              </button>
            </footer>
          </form>
        </section>
      </div>

      {picking && (
        <UnifiedFoodSearchModal
          isOpen
          onClose={() => setPicking(undefined)}
          onSelectFood={({ sourceFoodItem, weightKg }) => {
            if (!sourceFoodItem || sourceFoodItem.species !== pet.species || sourceFoodItem.type !== picking) return;
            const food = weightKg && weightKg !== sourceFoodItem.bagSizeKg
              ? { ...sourceFoodItem, bagSizeKg: weightKg, barcode: undefined }
              : sourceFoodItem;
            const energy = String(getFoodKcalPerKg(food) ?? '');
            setDraft((previous) => {
              const currentFood = picking === 'dry' ? previous.dryFood : previous.wetFood;
              return {
                ...previous,
                [picking === 'dry' ? 'dryFood' : 'wetFood']: food,
                [picking === 'dry' ? 'dryEnergy' : 'wetEnergy']: energy,
                manufacturerGramsPerDay: retainManufacturerPortion(currentFood, food, previous.manufacturerGramsPerDay),
                manualGramsPerDay: retainManualPortion(currentFood, food, previous.manualGramsPerDay),
              };
            });
          }}
          activePet={pet}
          formulaType={picking}
          lang={language}
          category="main"
          includeArchived={false}
          titleOverride={isEs ? 'Elegir fórmula' : 'Choose formula'}
        />
      )}
    </>
  );
}
