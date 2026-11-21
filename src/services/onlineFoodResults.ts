import type { FoodItem } from '../types';
import { enrichFoodFromStoreManufacturer } from './storeManufacturerCatalog';

export function enrichMarketFoods(foods: FoodItem[]): Promise<FoodItem[]> {
  // An unavailable manufacturer index must not hide an offer returned by a store.
  return Promise.all(foods.map(food => enrichFoodFromStoreManufacturer(food).catch(() => food)));
}
