import assert from 'node:assert/strict';
import test from 'node:test';
import { getManufacturerPackageGuide, searchStoreManufacturerFoods, selectStoreManufacturerFood } from '../src/services/storeManufacturerCatalog';
import { reviewReceiptPackage } from '../src/utils/purchaseInput';

test('receipts compare package weight with the official formula even on previously saved food and owner-confirmed labels', async () => {
  const [row] = await searchStoreManufacturerFoods('Agility Gold Grandes Adultos', 'dog');
  const agility = selectStoreManufacturerFood(row, 1.5);
  assert.ok(agility.availableSizesKg?.includes(8));
  const guide = await getManufacturerPackageGuide(agility);
  assert.deepEqual(guide?.sizes, [1.5, 3, 15]);
  assert.equal(guide?.sourceUrl, 'https://www.italcolmascotas.com/agility-gold-grandes-adultos-2/');
  const manual = { ...agility, id: 'user-food', sourceFoodId: undefined, storeProductUrl: undefined, labelStatus: 'user_confirmed_label' as const };
  assert.deepEqual(await getManufacturerPackageGuide(manual), guide);
  assert.equal(await getManufacturerPackageGuide({ ...manual, name: 'Grandes Adultos con receta diferente' }), undefined);
  assert.deepEqual(reviewReceiptPackage(1.5, 1.5, guide!.sizes), { differsFromKnown: false, smallerSize: undefined });
  assert.deepEqual(reviewReceiptPackage(8, 1.5, guide!.sizes), { differsFromKnown: true, smallerSize: undefined });
  assert.deepEqual(reviewReceiptPackage(15, 1.5, guide!.sizes), { differsFromKnown: false, smallerSize: 1.5 });
});

test('a possible missing decimal requires review even if both sizes exist or the plan has no selected size', () => {
  assert.equal(reviewReceiptPackage(15, 15, [1.5, 3, 15]).smallerSize, 1.5);
  assert.equal(reviewReceiptPackage(15, undefined, [1.5, 3, 15]).smallerSize, 1.5);
  assert.deepEqual(reviewReceiptPackage(20, 1.5, [1.5, 15]), { differsFromKnown: true, smallerSize: 1.5 });
  assert.deepEqual(reviewReceiptPackage(3, undefined, []), { differsFromKnown: false, smallerSize: undefined });
  assert.equal(reviewReceiptPackage(NaN, 1.5, [1.5]).smallerSize, undefined);
});
