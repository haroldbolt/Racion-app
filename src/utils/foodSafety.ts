import type { FeedingPlan, FoodItem, Pet, VetNutrient, VetNutrientLimit } from '../types';
import { getEffectiveNutrientField } from './mealNutrition';
import { getPlannedMeals, getPrimaryPlanFood } from './mealPortions';
import { isPetPuppy } from './petLifeStage';

export const nutrientNames: Record<VetNutrient, [string, string]> = {
  proteina: ['Proteína', 'Protein'], grasa: ['Grasa', 'Fat'], fibra: ['Fibra cruda', 'Crude fibre'],
  carbohidratos: ['Carbohidratos', 'Carbohydrate'], cenizas: ['Cenizas', 'Ash'], humedad: ['Humedad', 'Moisture'],
};
export const limitUnits: Record<VetNutrientLimit['unit'], [string, string]> = {
  pct_as_fed: ['% tal como se vende', '% as fed'], pct_dry_matter: ['% en materia seca', '% dry matter'],
  grams_per_day: ['g al día', 'g per day'],
};

export interface FoodSafetyNotice {
  key: string;
  level: 'mismatch' | 'review' | 'within';
  message: string;
}

interface IngredientPortion { food?: FoodItem; grams?: number }

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const aliases = [
  ['pollo', 'chicken'], ['salmon', 'salmón'], ['res', 'vacuno', 'beef'], ['pavo', 'turkey'],
  ['maiz', 'corn', 'maize'], ['cerdo', 'pork'], ['cordero', 'lamb'], ['soja', 'soya', 'soy'],
  ['trigo', 'wheat'], ['arroz', 'rice'], ['leche', 'milk'], ['huevo', 'huevos', 'egg', 'eggs'],
];

export function isValidLimit(value: VetNutrientLimit): boolean {
  return Boolean(value && Object.hasOwn(nutrientNames, value.nutrient) && Object.hasOwn(limitUnits, value.unit) &&
    Number.isFinite(value.maximum) && value.maximum >= 0 && (value.unit === 'grams_per_day' || value.maximum <= 100));
}

function restrictedIngredients(pet: Pet): string[] {
  // Existing notes are free text and may include unrelated clinical history.
  // Only explicit avoidance phrases are considered evidence in legacy notes.
  const directed = (pet.restrictionNotes ?? '').split(/[;,\n.]/)
    .map((note) => note.trim().match(/^(?:sin|evitar|avoid|without)\s+(.+)$/i)?.[1] ?? '').filter(Boolean);
  return [...new Set([...(pet.avoidedIngredients ?? []), ...directed].map((item) => normalize(item)).filter(Boolean))];
}

export function assessFoodForPet(pet: Pet, food: FoodItem, soleFood = true, lang: 'es' | 'en' = 'es'): FoodSafetyNotice[] {
  const es = lang === 'es';
  const notices: FoodSafetyNotice[] = [];
  const title = food.name;
  const growing = isPetPuppy(pet);
  const growthFood = food.lifeStage === 'puppy' || food.lifeStage === 'kitten';
  const adultFood = food.lifeStage === 'adult' || food.lifeStage === 'senior';
  if (food.species !== pet.species) {
    const species = food.species === 'cat' ? (es ? 'gatos' : 'cats') : (es ? 'perros' : 'dogs');
    notices.push({ key: 'species', level: 'mismatch', message: es ? `${title} es para ${species}. Revisa la especie en el perfil de ${pet.name} o elige otra fórmula.` : `${title} is for ${species}. Check ${pet.name}’s species or choose another food.` });
  } else if (food.lifeStageKnown !== false && ((growing && adultFood && food.suitableForGrowth !== true) || (!growing && growthFood))) {
    notices.push({ key: 'stage', level: 'mismatch', message: es
      ? `${title} indica ${adultFood ? 'mantenimiento adulto' : 'crecimiento'} y ${pet.name} figura ${growing ? 'en crecimiento' : 'como adulto'}. Revisa la etapa o elige otra fórmula.`
      : `${title} is labelled for ${adultFood ? 'adult maintenance' : 'growth'} and ${pet.name} is recorded as ${growing ? 'growing' : 'an adult'}. Review their life stage or choose another food.` });
  }
  const use = food.nutritionalUse ?? (food.kcalPerPiece && food.kcalPerPiece > 0 ? 'treat' : undefined);
  if (soleFood && (use === 'complementary' || use === 'treat')) {
    notices.push({ key: 'usage', level: 'mismatch', message: es
      ? `${title} figura como ${use === 'treat' ? 'premio' : 'complemento'} y está seleccionado como única comida diaria. Revisa la etiqueta y elige un alimento completo como base.`
      : `${title} is labelled as a ${use === 'treat' ? 'treat' : 'complementary food'} and is the only daily food. Review the label and choose a complete food as the base.` });
  }
  const avoid = restrictedIngredients(pet);
  const parts = (food.ingredientsSummary ?? '').split(/[,;\n.]/).map((part) => part.trim()).filter(Boolean);
  if (avoid.length && !parts.length) notices.push({ key: 'missing-ingredients', level: 'review', message: es
    ? `Falta la lista de ingredientes de ${title} para comprobar las restricciones de ${pet.name}.`
    : `The ingredient list for ${title} is needed to check ${pet.name}’s restrictions.` });
  for (const restriction of avoid) {
    const terms = aliases.find((group) => group.includes(restriction)) ?? [restriction];
    const found = parts.find((part) => {
      const words = ' ' + normalize(part) + ' ';
      return terms.some((term) => {
        const name = normalize(term);
        const position = words.indexOf(' ' + name + ' ');
        if (position < 0) return false;
        const before = words.slice(0, position);
        const after = words.slice(position + name.length + 1);
        return !/\b(?:sin|libre de|without|free from|no contiene)(?: [a-z0-9]+){0,3}$/.test(before) &&
          !/^ free\b/.test(after);
      });
    });
    if (found) notices.push({ key: 'ingredient-' + restriction, level: 'mismatch', message: es
      ? `En el perfil de ${pet.name} se indicó evitar ${restriction}. Ingrediente de ${title}: «${found}».`
      : `${pet.name}’s profile says to avoid ${restriction}. Listed ingredient in ${title}: “${found}”.` });
  }
  return notices;
}

export function planFoodPortions(plan: FeedingPlan): IngredientPortion[] {
  if (plan.isVetLocked) return []; // The saved commercial formula may not be the prescribed one.
  if (plan.foodType !== 'mixed') return [{ food: getPrimaryPlanFood(plan), grams: plan.rationConfirmed ? plan.gramsPerDay : undefined }];
  const meals = getPlannedMeals(plan);
  const portions: IngredientPortion[] = [];
  if (plan.mixedDryPct > 0) portions.push({ food: plan.dryFood, grams: plan.rationConfirmed && meals.every((p) => p.dryGrams !== undefined) ? meals.reduce((a, p) => a + p.dryGrams!, 0) : undefined });
  if (plan.mixedDryPct < 100) portions.push({ food: plan.wetFood, grams: plan.rationConfirmed && meals.every((p) => p.wetGrams !== undefined) ? meals.reduce((a, p) => a + p.wetGrams!, 0) : undefined });
  return portions;
}

export function assessVetLimits(pet: Pet, portions: IngredientPortion[], lang: 'es' | 'en' = 'es'): FoodSafetyNotice[] {
  const es = lang === 'es';
  const fmt = new Intl.NumberFormat(es ? 'es-CO' : 'en-US', { maximumSignificantDigits: 7 });
  return (pet.vetNutrientLimits ?? []).filter(isValidLimit).map((limit, index) => {
    const base = limit.unit === 'pct_dry_matter' ? 'materia_seca' : 'tal_como_se_vende';
    const measured = portions.map((part) => {
      const { food } = part;
      if (!food || food.labelStatus === 'unconfirmed' ||
          food.fichaNutricional?.discrepancies?.some((item) => item.field === limit.nutrient)) return undefined;
      const field = getEffectiveNutrientField(food, limit.nutrient);
      return field?.baseMedicion === base ? field : undefined;
    });
    // Qualifiers bound an interval. A typical value is not a strict lower/upper bound.
    const range = (i: number): [number, number] => [
      measured[i]?.calificador === 'minimo' ? measured[i]!.valor : 0,
      measured[i]?.calificador === 'maximo' ? measured[i]!.valor : 100,
    ];
    let lower = 0;
    let upper = Infinity;
    if (portions.length && limit.unit !== 'grams_per_day') {
      // A mixture is a weighted average on the same basis. If dry mass weights
      // are not known, the extrema of its components still provide safe bounds.
      lower = Math.min(...portions.map((_, i) => range(i)[0]));
      upper = Math.max(...portions.map((_, i) => range(i)[1]));
    }
    const weightsKnown = portions.length > 0 && portions.every((p) => Number.isFinite(p.grams) && p.grams! >= 0);
    const total = weightsKnown ? portions.reduce((sum, p) => sum + p.grams!, 0) : 0;
    if (weightsKnown && total > 0 && limit.unit !== 'pct_dry_matter') {
      const denominator = limit.unit === 'grams_per_day' ? 100 : total;
      lower = portions.reduce((sum, p, i) => sum + p.grams! * range(i)[0], 0) / denominator;
      upper = portions.reduce((sum, p, i) => sum + p.grams! * range(i)[1], 0) / denominator;
    }
    const unit = limitUnits[limit.unit][es ? 0 : 1];
    const term = nutrientNames[limit.nutrient][es ? 0 : 1];
    const ceiling = fmt.format(limit.maximum) + ' ' + unit;
    const subject = limit.unit === 'grams_per_day' ? (es ? 'En las comidas del plan' : 'In planned meals') : (es ? 'En el alimento' : 'In the food');
    const level = lower > limit.maximum + 1e-9 ? 'mismatch' : upper <= limit.maximum && measured.some(Boolean) ? 'within' : 'review';
    let message = es ? `${term} · límite veterinario de ${pet.name}: ${ceiling}. ` : `${term} · ${pet.name}’s veterinary limit: ${ceiling}. `;
    if (level === 'mismatch') message += es ? `${subject} hay al menos ${fmt.format(lower)} ${unit}. Supera el límite indicado.` : `${subject} there is at least ${fmt.format(lower)} ${unit}. This exceeds the specified limit.`;
    else if (level === 'within') message += es ? `${subject}, el máximo es ${fmt.format(upper)} ${unit} según la etiqueta.` : `${subject}, the label gives an upper bound of ${fmt.format(upper)} ${unit}.`;
    else message += es ? 'Falta información para evaluar este límite. Revisa la base, el mínimo o máximo declarado y la cantidad de la ración.' : 'More information is needed to assess this limit. Check the basis, declared minimum or maximum, and portion.';
    if (limit.unit === 'grams_per_day' && level === 'within') message += es ? ' Los premios y extras se revisan aparte.' : ' Review treats and extras separately.';
    return { key: 'vet-limit-' + index, level, message };
  });
}

export function getPlanSafetyNotices(pet: Pet, plan: FeedingPlan, lang: 'es' | 'en' = 'es'): FoodSafetyNotice[] {
  const portions = planFoodPortions(plan);
  const onlySupplemental = portions.length > 0 && portions.every(({food}) => food && (food.nutritionalUse === 'treat' || food.nutritionalUse === 'complementary' || Boolean(food.kcalPerPiece)));
  const notices = portions.flatMap((part, index) => part.food ? assessFoodForPet(pet, part.food, portions.length === 1, lang)
    .map((notice) => ({ ...notice, key: index + '-' + notice.key })) : []);
  if (onlySupplemental && portions.length > 1) notices.push({ key: 'only-supplements', level: 'mismatch', message: lang === 'es'
    ? 'Todos los componentes del plan figuran como premios o complementos. Revisa la base de su dieta diaria.'
    : 'All components of the plan are treats or complementary foods. Review the base of the daily diet.' });
  return [...notices, ...assessVetLimits(pet, portions, lang)];
}
