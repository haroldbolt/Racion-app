import { useEffect, useState } from 'react';
import type { FoodItem } from '../types';
import { enrichMarketFoods } from '../services/onlineFoodResults';
import { getManufacturerPackageGuide } from '../services/storeManufacturerCatalog';

const empty: FoodItem[] = [];

/** Saved plans from before package provenance was stored can still use the matched product sheet. */
export function useManufacturerPackageSizes(food: FoodItem) {
  const [guide, setGuide] = useState<{ food: FoodItem; sizes: number[] }>();
  useEffect(() => {
    if (food.manufacturerSizesKg) return;
    let active = true;
    void getManufacturerPackageGuide(food).then(found => {
      if (active && found) setGuide({ food, sizes: found.sizes });
    }).catch(() => {});
    return () => { active = false; };
  }, [food]);
  return food.manufacturerSizesKg ?? (guide?.food === food ? guide.sizes : undefined);
}

/** Resolve the saved labels before they can be selected, preserving manual labels
 * and preventing a previous library or pet from winning a later lookup. */
export function useManufacturerFoods(foods: FoodItem[], enabled: boolean) {
  const [resolved, setResolved] = useState<{ input: FoodItem[]; foods: FoodItem[] }>();
  useEffect(() => {
    if (!enabled || !foods.length) return;
    let current = true;
    enrichMarketFoods(foods).then(updated => {
      if (current) setResolved({ input: foods, foods: updated });
    });
    return () => { current = false; };
  }, [foods, enabled]);

  const loading = enabled && foods.length > 0 && resolved?.input !== foods;
  return { foods: resolved?.input === foods ? resolved.foods : empty, loading };
}
