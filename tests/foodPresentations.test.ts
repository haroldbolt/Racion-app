import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoodItem } from '../src/types';
import { PET_FOODS_DATABASE } from '../src/data/foods';
import { getConfirmedPresentations, mergeFoodCatalog } from '../src/data/foodPresentations';

test('uses declared package sizes without assigning other formulas sizes from a similar name', () => {
  assert.deepEqual(getConfirmedPresentations({
    id: 'online_laia_354674514', availableSizesKg: [0.4, 2, 4, 10], bagSizeKg: 0.4,
  }), [0.4, 2, 4, 10]);
  assert.deepEqual(getConfirmedPresentations({ availableSizesKg: [1, 3, 7], bagSizeKg: 5 }), [1, 3, 5, 7]);
  assert.deepEqual(getConfirmedPresentations({ availableSizesKg: [NaN, -1, Infinity, 0, 1, 1, 51] }), [1, 51]);
  assert.equal(getConfirmedPresentations({ id: 'unlisted-food' }), null);
  assert.deepEqual(getConfirmedPresentations({ availableSizesKg: [22.679619, 22.6796], bagSizeKg: 22.6796 }), [22.6796]);
});

test('merges exact duplicate formulas packages while preserving the first nutritional label', () => {
  const food = PET_FOODS_DATABASE.find((item) => item.id === 'rc-sterilised-37-cat')!;
  assert.ok(food);
  const original = structuredClone(food);
  const duplicate: FoodItem = {
    ...food, id: 'retailer-food', brand: food.brand.toUpperCase(), kcalPerKg: 0,
    labelStatus: 'unconfirmed', bagSizeKg: 0.4, availableSizesKg: [0.4, 2, 4, 10],
  };
  const otherFormula = { ...duplicate, name: food.name + ' Light' };
  const merged = mergeFoodCatalog([food, duplicate, otherFormula]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, food.id);
  assert.equal(merged[0].kcalPerKg, food.kcalPerKg);
  assert.equal(merged[0].labelStatus, food.labelStatus);
  assert.deepEqual(getConfirmedPresentations(merged[0]), [0.4, 2, 4, 10]);
  assert.deepEqual(food, original);
});
