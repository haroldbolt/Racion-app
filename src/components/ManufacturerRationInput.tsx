import type { FeedingPlan, FoodItem, Goal, Pet } from '../types';
import { canUseManualRation, getApplicableFeedingRange, getSuggestedManufacturerGrams, getSavedRationInputs, isValidDailyGrams } from '../utils/manufacturerRation';
import { getPrimaryPlanFood } from '../utils/mealPortions';

export function RationSourceNote({ plan, lang }: { plan: FeedingPlan; lang: 'es' | 'en' }) {
  const es = lang === 'es';
  if (plan.rationSource === 'manual') {
    return <p className="text-xs text-amber-900">{es
      ? 'Gramos ingresados por ti · pendiente de confirmar con la etiqueta.'
      : 'Daily amount entered by you · pending label confirmation.'}</p>;
  }
  if (plan.manufacturerGramsPerDay) {
    const food = getPrimaryPlanFood(plan);
    const guide = food?.feedingGuide;
    if (!plan.rationSource && getSavedRationInputs(plan).manualGramsPerDay) {
      return <p className="text-xs text-[#44544A]">{es ? 'Cantidad elegida de la tabla de la tienda. Confírmala con la etiqueta.' : 'Amount chosen from the store’s guide. Check it against the package.'}</p>;
    }
    return <p className="text-xs text-[#44544A]">
      {es ? 'Estimado según tabla del fabricante' : 'Estimated from the manufacturer’s feeding guide'}
      {guide && <> · <a href={guide.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#0B5D2E] underline">{guide.sourceName}</a></>}
      {plan.rationSource !== 'manufacturer_midpoint' && (es ? ' · cantidad ajustada por ti' : ' · amount adjusted by you')}.
      {' '}{es ? 'Calorías por toma pendientes de las kcal/kg.' : 'Calories per serving require kcal/kg.'}
    </p>;
  }
  if (plan.rationSource === 'label') {
    return <p className="text-xs text-[#44544A]">{es ? 'Calculado con las kcal/kg de la etiqueta.' : 'Calculated using the kcal/kg on the label.'}</p>;
  }
  return null;
}

interface Props {
  food?: FoodItem;
  pet: Pet;
  goal: Goal;
  value?: number;
  onChange: (grams?: number) => void;
  manualValue?: number;
  onManualChange: (grams?: number) => void;
  lang: 'es' | 'en';
}

export function ManufacturerRationInput({ food, pet, goal, value, onChange, manualValue, onManualChange, lang }: Props) {
  const es = lang === 'es';
  const range = getApplicableFeedingRange(food, pet, goal);
  const midpoint = getSuggestedManufacturerGrams(food, pet, goal);
  const guide = food?.feedingGuide;
  const useGuide = range && guide && midpoint !== undefined;
  if (!food || (!useGuide && !canUseManualRation(food, pet, goal))) return null;

  const number = new Intl.NumberFormat(es ? 'es-CO' : 'en-US', { maximumFractionDigits: 3 });
  const amount = useGuide ? value ?? midpoint : manualValue;
  const invalid = amount !== undefined && (!isValidDailyGrams(amount) || (useGuide && (amount < range.minGrams || amount > range.maxGrams)));
  return <section className="space-y-2 rounded-xl border border-[#cadfce] bg-[#f5faf6] p-3 text-xs text-[#37483c]">
    {useGuide ? <>
      <strong className="block text-sm text-[#1C2B21]">{es ? 'Guía de alimentación de ' : 'Feeding guide from '}<a href={guide.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#0B5D2E] underline">{guide.sourceName}</a></strong>
      <p>{es
        ? `Para ${pet.name} (${number.format(pet.currentWeightKg)} kg), la tabla indica ${number.format(range.minGrams)}–${number.format(range.maxGrams)} g al día. Proponemos el punto medio, ${number.format(midpoint)} g al día. Puedes ajustarlo dentro del rango.`
        : `For ${pet.name} (${number.format(pet.currentWeightKg)} kg), the guide lists ${number.format(range.minGrams)}–${number.format(range.maxGrams)} g per day. The suggested midpoint is ${number.format(midpoint)} g per day. You can adjust it within the range.`}</p>
    </> : <p>{es
      ? 'Faltan las kcal/kg y una tabla aplicable. Si conoces los gramos que sirves al día, guárdalos como pendientes de confirmar.'
      : 'The label energy and an applicable guide are missing. If you know the grams you serve each day, save them pending confirmation.'}</p>}
    <label className="block font-bold">
      {useGuide
        ? (es ? 'Gramos diarios elegidos de la tabla' : 'Daily grams chosen from the guide')
        : (es ? 'Gramos diarios que sirves' : 'Daily grams you serve')}
      <input type="number" inputMode="decimal" min={useGuide ? range.minGrams : 0} max={useGuide ? range.maxGrams : undefined}
        step="any" value={amount !== undefined && Number.isFinite(amount) ? amount : ''} aria-invalid={Boolean(invalid)}
        onChange={({ currentTarget }) => {
          if (useGuide) onChange(currentTarget.valueAsNumber);
          else onManualChange(currentTarget.value === '' && !currentTarget.validity.badInput ? undefined : currentTarget.valueAsNumber);
        }}
        className="mt-1 block min-h-11 w-full rounded-xl border border-[#0B5D2E30] bg-white px-3" />
    </label>
    {invalid && <p role="alert">{useGuide
      ? (es ? 'Ingresa una cantidad del rango con hasta dos decimales.' : 'Enter an amount in the range with up to two decimal places.')
      : (es ? 'Ingresa una cantidad mayor que cero con hasta dos decimales.' : 'Enter a positive amount with up to two decimal places.')}</p>}
    {useGuide && value !== undefined && <button type="button" onClick={() => onChange(undefined)} className="min-h-9 font-bold text-[#0B5D2E] underline">
      {es ? 'Volver al punto medio' : 'Restore suggested midpoint'}
    </button>}
  </section>;
}
