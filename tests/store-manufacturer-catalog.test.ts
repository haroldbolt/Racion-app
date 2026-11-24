import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoreManufacturerCatalog, searchStoreManufacturerFoods, selectStoreManufacturerFood,
  enrichFoodFromStoreManufacturer, getStoreSheetCoverage, storeSheetStatus } from '../src/services/storeManufacturerCatalog';
import { getEffectiveNutrientField } from '../src/utils/mealNutrition';
import { getFoodKcalPerKg } from '../src/utils/mealPortions';
import domestic from '../src/data/manufacturers/colombia.json';
import international from '../src/data/manufacturers/internacional.json';
import other from '../src/data/manufacturers/otras.json';
import specialty from '../src/data/manufacturers/especialidades.json';
import { getConfirmedPresentations, packageConfirmation } from '../src/data/foodPresentations';
import { selectFoodPackage } from '../src/services/onlineFoodCatalog';

test('every official sheet belongs to identifiable, published products of the stated brand and species', async () => {
  const rows = await getStoreManufacturerCatalog();
  const byHandle = new Map(rows.map(row => [row.handle, row]));
  assert.equal(byHandle.size, rows.length);
  for (const formula of [...domestic, ...international, ...other, ...specialty]) {
    assert.match(formula.url, /^https:\/\/.+\/.+/);
    assert.ok(formula.handles.length > 0);
    for (const handle of formula.handles) {
      const row = byHandle.get(handle);
      assert.ok(row?.formula, handle);
      assert.equal(row.species, formula.species, handle);
      assert.equal(row.brand.toLowerCase(), formula.brand.toLowerCase(), handle);
      assert.equal(row.officialUrl, formula.url);
      for (const link of Object.values(row.formula.packageSources ?? {})) assert.ok(new URL(link).protocol === 'https:');
      for (const discrepancy of row.formula.discrepancies ?? []) assert.ok(new URL(discrepancy.sourceUrl).protocol === 'https:');
      assert.deepEqual(row.packagesKg, [...new Set(row.packagesKg)].sort((a,b) => a-b));
      assert.ok(row.packagesKg.every(kg => kg > 0 && Number.isFinite(kg)));
      const food = selectStoreManufacturerFood(row);
      for (const key of ['proteina','grasa','fibra','humedad','cenizas','carbohidratos'] as const) {
        const field = food.fichaNutricional?.[key];
        if (field) assert.ok(Number.isFinite(field.valor) && field.valor >= 0 && field.valor <= 100, handle + ' ' + key);
      }
      const density = food.fichaNutricional?.kcalPerKg;
      if (density) assert.ok(density.valor > 0 && density.valor < 10000, handle);
    }
  }
});

test('keeps shop-only Agility packages selectable and separates them from manufacturer sizes after saving', async () => {
  const [row] = await searchStoreManufacturerFoods('Agility Gold Grandes Adultos', 'dog');
  const agro = selectStoreManufacturerFood(row, 8);
  assert.deepEqual(getConfirmedPresentations(agro), [1.5, 3, 8, 15]);
  assert.deepEqual(getConfirmedPresentations({ id: 'agility-gold-grandes-adultos', availableSizesKg: [8] }), [1.5, 3, 8, 15]);

  const puppis = await enrichFoodFromStoreManufacturer({
    ...agro, id: 'puppis-test', sourceFoodId: undefined, manufacturerSizesKg: undefined, brand: 'Agility',
    storeProductUrl: 'https://www.puppis.com.co/alimento-para-perro-agility-gold-grandes-adultos/p',
    name: 'Alimento Para Perro Agility Gold Grandes Adultos', availableSizesKg: [8],
  });
  assert.deepEqual(puppis.availableSizesKg, [8]);
  const legacy = await enrichFoodFromStoreManufacturer({...agro, manufacturerSizesKg: undefined, labelStatus: 'user_confirmed_label', kcalPerKg: 3601});
  assert.equal(legacy.kcalPerKg, 3601);
  for (const food of [agro, puppis, legacy]) {
    const saved = JSON.parse(JSON.stringify(selectFoodPackage(food, 8)));
    assert.equal(saved.bagSizeKg, 8);
    assert.deepEqual(saved.manufacturerSizesKg, [1.5, 3, 15]);
    assert.equal(packageConfirmation(saved.manufacturerSizesKg, 8, true), 'No confirmada por el fabricante');
    assert.equal(packageConfirmation(saved.manufacturerSizesKg, 1.5, true), 'Confirmada por el fabricante');
  }
  assert.equal(packageConfirmation(undefined, 3, true), 'No confirmada por el fabricante');
  assert.equal(packageConfirmation([22.679619], 22.680, false), 'Confirmed by the manufacturer');
  assert.equal(packageConfirmation([22.679619], 22.681, false), 'Not confirmed by the manufacturer');
  const unrelated = await enrichFoodFromStoreManufacturer({...puppis, manufacturerSizesKg: undefined, name: 'Agility Gold Grandes Adultos Otra Receta'});
  assert.equal(unrelated.manufacturerSizesKg, undefined);
});

test('choosing a Monello pack fills all declared values and retains the source after serialization', async () => {
  const [row] = await searchStoreManufacturerFoods('monello select castrados', 'cat');
  assert.equal(row.handle,'monello-select-castrados-gatos-adultos');
  const food = JSON.parse(JSON.stringify(selectStoreManufacturerFood(row, 1.5)));
  assert.equal(food.bagSizeKg, 1.5);
  assert.equal(food.availableSizesKg.includes(7), true);
  assert.equal(getFoodKcalPerKg(food), 3650);
  assert.equal(getEffectiveNutrientField(food, 'proteina')?.valor, 36);
  assert.equal(getEffectiveNutrientField(food, 'grasa')?.valor, 8.5);
  assert.equal(getEffectiveNutrientField(food, 'fibra')?.calificador, 'maximo');
  assert.equal(getEffectiveNutrientField(food, 'carbohidratos'), undefined);
  assert.equal(food.fichaNutricional.kcalPerKg.source.url, row.officialUrl);
  assert.deepEqual(await searchStoreManufacturerFoods('monello select castrados', 'dog'), []);
});

test('pending items remain discoverable by brand without assigning their nutrients or calories', async () => {
  const catalog = await getStoreManufacturerCatalog();
  const pending = catalog.find(row => !row.formula);
  assert.ok(pending);
  const results = await searchStoreManufacturerFoods(pending.brand, pending.species);
  assert.ok(results.some(row => row.handle === pending.handle));
  const food = selectStoreManufacturerFood(pending);
  assert.equal(getFoodKcalPerKg(food), undefined);
  assert.equal(getEffectiveNutrientField(food,'proteina'), undefined);
});

test('enrichment preserves a purchase, avoids similar formulas, and respects a confirmed label', async () => {
  const [row] = await searchStoreManufacturerFoods('monello select castrados', 'cat');
  const chosen = selectStoreManufacturerFood(row, 1.5);
  const external = {...chosen, id:'market-offer', storeName:'Otra tienda', storeProductUrl:'https://example.org/monello',
    packagePrices:[{packageKg:1.5, priceCop:54000, source:'online' as const, observedAt:'2026-11-21'}], labelStatus:'unconfirmed' as const, fichaNutricional:undefined, kcalPerKg:0};
  const enriched = await enrichFoodFromStoreManufacturer(external);
  assert.equal(getFoodKcalPerKg(enriched), 3650);
  assert.equal(enriched.storeProductUrl, external.storeProductUrl);
  assert.equal(enriched.packagePrices?.[0].priceCop, 54000);
  assert.equal(enriched.bagSizeKg, 1.5);
  const otherFormula = {...external, name:external.name + ' renal'};
  assert.equal(await enrichFoodFromStoreManufacturer(otherFormula), otherFormula);
  const confirmed = {...external, labelStatus:'user_confirmed_label' as const};
  assert.equal(await enrichFoodFromStoreManufacturer(confirmed), confirmed);
});

test('dry-matter percentages stay on their original basis while ration uses published metabolizable energy', async () => {
  const row = (await getStoreManufacturerCatalog()).find(item => item.handle === 'hills-science-diet-adult-7-cat');
  assert.ok(row);
  const food = selectStoreManufacturerFood(row);
  const protein = getEffectiveNutrientField(food,'proteina');
  assert.equal(protein?.baseMedicion, 'materia_seca');
  assert.equal(protein?.valor, 31.4);
  assert.equal(food.proteinPct, 0);
  assert.equal(getEffectiveNutrientField(food,'kcalPerKg')?.baseMedicion,'tal_como_se_vende');
  assert.equal(getFoodKcalPerKg(food), 3926);
});

test('Mirringo Gaticos retains its portion guide, missing calories and the packaging discrepancy', async () => {
  const row = (await getStoreManufacturerCatalog()).find(item => item.handle === 'mirringo-gaticos');
  assert.ok(row);
  const food = selectStoreManufacturerFood(row,1);
  assert.equal(food.declaredIcaRegistration,'11705AL');
  assert.equal(food.feedingGuide?.ranges[1].maxGrams,55);
  assert.equal(getFoodKcalPerKg(food),undefined);
  assert.equal(getEffectiveNutrientField(food,'cenizas')?.valor,8);
  assert.equal(food.fichaNutricional?.discrepancies?.find(item => item.field === 'cenizas')?.other.valor,9);
});

test('store coverage counts each listing with a documented package and the four analysis values', async () => {
  const rows = await getStoreManufacturerCatalog();
  const counts = await getStoreSheetCoverage();
  assert.equal(counts.complete + counts.partial + counts.pending, rows.length);
  assert.equal(counts.total, rows.length);
  const puppy = rows.find(row => row.handle === 'birbo-premium-cachorros');
  assert.ok(puppy?.formula);
  assert.equal(storeSheetStatus(puppy), 'complete');
  assert.equal(getEffectiveNutrientField(selectStoreManufacturerFood(puppy), 'grasa')?.valor, 11);
  assert.equal(storeSheetStatus({...puppy, formula:undefined}), 'pending');
  assert.equal(storeSheetStatus({...puppy, packagesKg:[]}), 'partial');
  assert.equal(storeSheetStatus({...puppy, formula:{...puppy.formula, kcalKg:undefined}}), 'partial');
  assert.equal(storeSheetStatus({...puppy, formula:{...puppy.formula, fiberMax:0}}), 'complete');
});

test('NUPEC 1st Care uses the manufacturer guarantee on the product sheet', async () => {
  const [row] = await searchStoreManufacturerFoods('nupec 1st care', 'dog');
  const food = selectStoreManufacturerFood(row, 2);
  assert.equal(getFoodKcalPerKg(food), 4000);
  const protein = getEffectiveNutrientField(food, 'proteina');
  assert.equal(protein?.valor, 29);
  assert.equal(protein?.calificador, 'minimo');
  assert.equal(protein?.baseMedicion, 'tal_como_se_vende');
  assert.equal(protein?.source?.url, row.officialUrl);
  assert.equal(food.fichaNutricional?.discrepancies?.[0].other.calificador, 'maximo');
});

test('Bonnat percentages link to the original nutrition panel', async () => {
  const rows = await getStoreManufacturerCatalog();
  const row = rows.find(item => item.handle === 'bonnat-dieta-veterinaria-soporte-hepatico-gatos');
  assert.ok(row?.formula?.nutrientSourceUrl);
  const food = selectStoreManufacturerFood(row, 2);
  const source = getEffectiveNutrientField(food, 'proteina')?.source;
  assert.equal(source?.url, row.formula.nutrientSourceUrl);
  assert.equal(getEffectiveNutrientField(food, 'proteina')?.valor, 26);
  assert.equal(food.labelStatus, 'verified_manufacturer');
});
