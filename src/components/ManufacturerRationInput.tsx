import type { FoodItem, Pet } from '../types';
import { getApplicableFeedingRange } from '../utils/manufacturerRation';
import { assessFoodForPet } from '../utils/foodSafety';

export function ManufacturerRationInput({food, pet, value, onChange, lang}: {
  food?: FoodItem; pet: Pet; value?: number; onChange: (grams?: number) => void; lang: 'es' | 'en';
}) {
  const range = getApplicableFeedingRange(food, pet);
  const guide = food?.feedingGuide;
  if (!range || !food || !guide || assessFoodForPet(pet, food).some((notice) => notice.level === 'mismatch')) return null;
  const es = lang === 'es';
  return <section className="space-y-2 rounded-xl border border-[#cadfce] bg-[#f5faf6] p-3 text-xs text-[#37483c]">
    <strong className="block text-sm text-[#1C2B21]">{es ? 'Guía de alimentación de ' + guide.sourceName : 'Feeding guide from ' + guide.sourceName}</strong>
    <p>{es
      ? `Para ${pet.name} (${pet.currentWeightKg} kg), la tabla indica ${range.minGrams}–${range.maxGrams} g al día. Elige una cantidad del rango para calcular las tomas y su costo. Las calorías quedan pendientes de las kcal/kg.`
      : `For ${pet.name} (${pet.currentWeightKg} kg), the guide lists ${range.minGrams}–${range.maxGrams} g per day. Choose an amount in the range to calculate servings and costs. Calories require kcal/kg.`}</p>
    <a href={guide.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-[#0B5D2E] underline">{guide.sourceName}</a>
    <label className="block font-bold">{es ? 'Gramos diarios elegidos de la tabla' : 'Daily grams chosen from the guide'}
      <input type="number" inputMode="numeric" min={range.minGrams} max={range.maxGrams} step="1" value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        className="mt-1 block min-h-11 w-full rounded-xl border border-[#0B5D2E30] bg-white px-3" />
    </label>
    {value !== undefined && (!Number.isInteger(value) || value < range.minGrams || value > range.maxGrams) &&
      <p role="alert">{es ? 'Elige un número entero dentro del rango publicado.' : 'Choose a whole number within the published range.'}</p>}
  </section>;
}
