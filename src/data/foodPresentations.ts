import { FoodItem } from '../types';

export const CONFIRMED_FOOD_PRESENTATIONS: Record<string, number[]> = {
  // Royal Canin Cat
  'rc-fit-32-cat': [2, 4, 10],
  'rc-sterilised-37-cat': [2, 4, 10],
  'rc-kitten-dry': [2, 4, 10],
  'rc-satiety-cat': [1.5, 3.5],
  // Royal Canin Dog
  'rc-medium-adult': [1.5, 3, 7.5, 15],
  'rc-maxi-adult': [3, 15],
  'rc-mini-adult': [1, 3, 7.5],
  'rc-medium-puppy': [1.5, 4, 15],
  'rc-satiety-dog': [1.5, 6, 12],
  // Purina Pro Plan Dog
  'ppp-optiderma-dog': [3, 7.5, 14],
  'ppp-puppy-medium': [3, 7.5, 12],
  'ppp-weight-mgmt-dog': [3, 15],
  // Purina Pro Plan Cat
  'ppp-cat-sterilised-salmon': [1, 3, 7.5],
  'ppp-kitten-optistart': [1, 3, 7.5],
  // Hill's Science Diet Dog
  'hills-sd-adult-chicken': [2, 7, 15],
  'hills-sd-puppy-chicken': [2, 5.7, 12.5],
  // Hill's Science Diet Cat
  'hills-sd-cat-indoor': [1.5, 3.17, 7],
  'hills-sd-perfect-weight-cat': [1.36, 3.17],
  // Taste of the Wild
  'taste-of-wild-high-prairie': [2, 5.6, 12.2],
  // Orijen & Acana
  'orijen-original-dog': [2, 6, 11.4],
  'orijen-cat-kitten': [1.8, 5.4],
  'acana-bountiful-catch': [1.8, 4.5],
  // Monello
  'monello-dog-tradicional': [1, 7, 15],
  'monello-cat': [1, 7, 15],
  // Commercial retail
  'cat-chow-adulto-delimix': [1.5, 3, 8],
  'dog-chow-adulto-carne': [2, 4, 8, 17, 22],
  'chunky-adultos-pollo': [1.5, 4, 10, 22],
  'whiskas-adulto-pescado': [1.5, 3, 8],
  // Agility Gold (Italcol Colombia - Presentaciones Oficiales)
  'agility-gold-grandes-adultos': [3, 7, 15],
  'agility-gold-pequenos-adultos': [1.5, 3, 7],
  'agility-gold-cachorros': [1.5, 3, 7, 15],
  'agility-gold-gatos-adultos': [1.5, 3, 7],
};

/** Returns sizes declared in the catalog or saved by the user. */
export function getConfirmedPresentations(food?: Partial<FoodItem> | null): number[] | null {
  if (!food) return null;
  const sizes = [
    ...(food.id ? CONFIRMED_FOOD_PRESENTATIONS[food.id] ?? [] : []),
    ...(food.availableSizesKg ?? []),
    food.bagSizeKg,
  ].filter((size): size is number => typeof size === 'number' && Number.isFinite(size) && size > 0);
  const unique = [...new Set(sizes)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : null;
}

/** Keeps the first nutritional label and combines declared packages of the same formula. */
export function mergeFoodCatalog(items: FoodItem[]): FoodItem[] {
  const merged = new Map<string, FoodItem>();
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  for (const item of items) {
    const key = [item.brand, item.name, item.species, item.type].map(normalize).join('__');
    const previous = merged.get(key);
    const availableSizesKg = [...new Set([
      ...(getConfirmedPresentations(previous) ?? []),
      ...(getConfirmedPresentations(item) ?? []),
    ])].sort((a, b) => a - b);
    merged.set(key, { ...(previous ?? item), availableSizesKg });
  }
  return [...merged.values()];
}
