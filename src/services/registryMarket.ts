import type { FoodItem, Species } from '../types';
import type { RegistryFood } from '../utils/colombiaRegistryRows';
import { searchFoodCatalog, type FoodCatalogResult } from './onlineFoodCatalog';
import { enhanceRegistryFoods } from './registryNutrition';

// Only ignore terms describing the listing or physical package. Flavours, life
// stages, formulation numbers, "+" and clinical variants are part of the identity.
const packagingWords = new Set([
  'alimento','alimentos','comida','concentrado','concentrados','croquetas','croqueta','balanceado',
  'para','de','del','el','la','los','las','en','bolsa','bulto','empaque',
  'perro','perros','gato','gatos','felino','felinos','canino','caninos',
]);
const aliases: Record<string,string> = {
  gatito:'gatito',gatitos:'gatito',gatico:'gatito',gaticos:'gatito',kitten:'gatito',kittens:'gatito',
  cachorros:'cachorro',puppy:'cachorro',adultos:'adulto',adultas:'adulto',adulta:'adulto',adult:'adulto',
};

function fold(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

export function registryFormulaKey(title: string) {
  const pieces = fold(title)
    .replace(/\b(?:x|por)?\s*\d+(?:[.,]\d+)?\s*(?:kilogramos?|kilos?|kgs?|gramos?|grs?|g)\b/gi,' ')
    .replace(/\+/g,' plus ').split(/[^a-z0-9]+/).filter(term => term && !packagingWords.has(term))
    .map(term => aliases[term] || term);
  return [...new Set(pieces)].sort().join(' ');
}

function explicitStage(title: string) {
  const key = registryFormulaKey(title);
  if (/\b(?:gatito|cachorro)\b/.test(key)) return 'growth';
  if (/\b(?:adulto|senior)\b/.test(key)) return 'adult';
}

export function matchRegistryFood(row: RegistryFood, food: FoodItem, species: Species, requireRegistration = false) {
  if (!row[species] || food.species !== species) return false;
  const title = [food.brand,food.name].filter(Boolean).join(' ');
  const officialStage = explicitStage(row.name), storeStage = explicitStage(title);
  if (officialStage && storeStage && officialStage !== storeStage) return false;
  if (food.declaredIcaRegistration) return food.declaredIcaRegistration === row.registration;
  if (requireRegistration) return false;
  const key = registryFormulaKey(row.name);
  // Keep the brand in the identity even when two manufacturers use the same formula name.
  return !!key && key === registryFormulaKey(title);
}

function searchName(row: RegistryFood) {
  const name = row.name.trim().replace(/\s+/g,' ');
  // Merchant search has a 100-character limit; retain the complete name when matching.
  return name.length <= 100 ? name : name.slice(0,100).replace(/\s+\S*$/,'').trim() || name.slice(0,100);
}

export async function searchRegistryMarket(row: RegistryFood, species: Species, foodType: FoodItem['type'] | undefined,
  registryUrl: string, signal: AbortSignal, requireRegistration: boolean): Promise<FoodCatalogResult> {
  let matches: FoodItem[] = [];
  let unavailableSources: string[] = [];
  try {
    const results = await searchFoodCatalog(searchName(row), species, foodType, signal);
    matches = results.foods.filter(food => matchRegistryFood(row, food, species, requireRegistration));
    unavailableSources = results.unavailableSources;
  } catch (error) {
    if (signal.aborted) throw error;
    unavailableSources = ['tiendas colombianas'];
  }
  signal.throwIfAborted();
  let enriched: FoodItem[];
  try {
    enriched = await enhanceRegistryFoods(matches, row, species, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    unavailableSources.push('ficha del fabricante');
    enriched = matches;
  }
  signal.throwIfAborted();
  const foods = enriched.filter(food => food.species === species && (!foodType || food.type === foodType))
    .map(food => ({...food,icaRegistry:{registration:row.registration,name:row.name,sourceUrl:registryUrl}}))
    .sort((a,b) => Number(!!b.packagePrices?.length) - Number(!!a.packagePrices?.length));
  return {foods,unavailableSources};
}
