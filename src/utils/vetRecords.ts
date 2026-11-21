import type { FeedingPlan, Pet, VetGuideline } from '../types';
import { recalculatePlanForPet } from './calculator';
import { localDateKey } from './localDate';

export function vetPhoneNumber(input: string): string | undefined {
  const normalized = input.trim().replace(/[\s().-]/g, '');
  return /^\+?[0-9]{7,15}$/.test(normalized) && normalized.replace(/^\+/, '') !== '5491145678900' ? normalized : undefined;
}

function readText(data: FormData, key: string) {
  return String(data.get(key) ?? '').trim();
}

function readPositive(data: FormData, key: string) {
  const value = Number(readText(data, key));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function readVetOrder(data: FormData, date = localDateKey()): VetGuideline | undefined {
  const prescribedKcal = readPositive(data,'kcal');
  const prescribedGramsPerMeal = readPositive(data,'grams');
  const mealsPerDay = readPositive(data,'meals');
  const vetName = readText(data,'vet');
  const clinicName = readText(data,'clinic');
  const prescribedFoodName = readText(data,'food');
  if (!data.has('confirmed') || !vetName || !clinicName || !prescribedFoodName || !prescribedKcal ||
      !prescribedGramsPerMeal || !mealsPerDay || !Number.isInteger(mealsPerDay) || mealsPerDay > 6 ||
      !Number.isFinite(mealsPerDay * prescribedGramsPerMeal)) return;
  return {vetName, clinicName, prescribedFoodName, prescribedKcal, prescribedGramsPerMeal, mealsPerDay,
    date, notes:readText(data,'notes'), locked:true, confirmedByGuardian:true};
}

// Early versions could save the initial form unchanged. The old phone was never editable.
// Keep identifiable user entries and preserve the clinical hold until the order is reviewed.
export function repairVetExamples(pets: Pet[], plans: Record<string, FeedingPlan>) {
  let changed = false;
  for (const pet of pets) {
    const guide = pet.vetGuideline;
    if (!guide || guide.confirmedByGuardian || guide.needsReview) continue;
    const demoVet = guide.vetName === 'Dra. Sofía Valenzuela';
    const demoClinic = guide.clinicName === 'Clínica Veterinaria San Francisco';
    const demoNotes = guide.notes === 'Control de glucosa y peso cada 15 días.';
    const demoFood = guide.prescribedFoodName === 'Alimento Terapéutico Prescrito';
    const demoPhone = guide.phone?.replace(/\D/g, '') === '5491145678900';
    if (!(demoVet || demoClinic || demoNotes || demoFood || demoPhone)) continue;
    changed = true;
    if (demoPhone) delete guide.phone;
    if (demoNotes) guide.notes = '';
    if (demoVet || demoClinic || demoFood) {
      if (demoVet) guide.vetName = '';
      if (demoClinic) guide.clinicName = '';
      if (demoFood) guide.prescribedFoodName = '';
      // Even numerical entries matching defaults might be genuine. Retain them in the draft,
      // but do not suggest them again unless the caregiver explicitly reconfirms the real order.
      guide.locked = false;
      guide.needsReview = true;
      pet.hasVetGuideline = true;
      if (plans[pet.id]?.isVetLocked) {
        const old = plans[pet.id];
        const fresh = recalculatePlanForPet(pet,old);
        if (demoFood && fresh.foodName === 'Alimento Terapéutico Prescrito') fresh.foodName = fresh.dryFood?.name || fresh.wetFood?.name || '';
        plans[pet.id] = fresh;
      }
    }
  }
  return changed;
}
