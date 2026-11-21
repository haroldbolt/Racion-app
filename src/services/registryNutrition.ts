import type { FoodItem, Species } from '../types';
import type { RegistryFood } from '../utils/colombiaRegistryRows';
import { labelDiscrepancies } from '../utils/nutritionLabel';
import { getColombiaCatalogUrl } from './onlineFoodCatalog';

export async function enhanceRegistryFoods(
  foods: FoodItem[], row: RegistryFood, species: Species, signal: AbortSignal, catalogUrl = getColombiaCatalogUrl(),
): Promise<FoodItem[]> {
  if (!catalogUrl || !row[species]) return foods;
  const url = new URL('/api/registry-nutrition',catalogUrl);
  url.search = new URLSearchParams({q:row.name,registration:row.registration,species}).toString();
  try {
    const response = await fetch(url, {signal, credentials:'omit'});
    if (!response.ok) return foods;
    const {food: official}: {food?: FoodItem} = await response.json();
    const sheet = official?.fichaNutricional;
    if (!official || !sheet || official.species !== species || sheet.coincidenciaEstado !== 'verificado' ||
        official.declaredIcaRegistration !== row.registration.replace(/[\s-]/g,'').toUpperCase()) return foods;
    const offers = foods.filter(offer => offer.type === official.type &&
      (!offer.declaredIcaRegistration || offer.declaredIcaRegistration === official.declaredIcaRegistration));
    if (!offers.length) return [official];
    return offers.map(offer => {
      // Preserve the seller's identity and package data exactly as observed. Only the
      // matched manufacturer's nutritional declarations apply to every size of this formula.
      const differences = offer.fichaNutricional && offer.storeProductUrl
        ? labelDiscrepancies(sheet,offer.fichaNutricional,offer.storeProductUrl) : undefined;
      return {
        ...offer, brand:official.brand, lifeStage:official.lifeStage, lifeStageKnown:official.lifeStageKnown,
        suitableForGrowth:official.suitableForGrowth, nutritionalUse:official.nutritionalUse,
        isCompleteAndBalanced:official.isCompleteAndBalanced, dataSource:official.dataSource,
        labelStatus:official.labelStatus, kcalPerKg:official.kcalPerKg, proteinPct:official.proteinPct,
        fatPct:official.fatPct, fiberPct:official.fiberPct, ashPct:official.ashPct, moisturePct:official.moisturePct,
        carbsPct:official.carbsPct, feedingGuide:official.feedingGuide ?? offer.feedingGuide,
        fichaNutricional:{...sheet,discrepancies:differences},
      };
    });
  } catch {
    if (signal.aborted) throw signal.reason;
    return foods;
  }
}
