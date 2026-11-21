import { useEffect, useState } from 'react';
import type { FoodItem } from '../types';
import { enrichMarketFoods } from '../services/onlineFoodResults';

const empty: FoodItem[] = [];

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
