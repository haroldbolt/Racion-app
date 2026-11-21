import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { searchFoodCatalog, selectFoodPackage } from '../src/services/onlineFoodCatalog';

const endpoint = 'https://racion.example/api/colombia-foods';
const first = {
  id: 'retailer-one:174', retailer: 'Tienda Uno', brand: 'Campo Sur', name: 'Campo Sur Adultos',
  species: 'dog', type: 'dry', productUrl: 'https://uno.example/campo', observedAt: '2026-11-20T17:00:00Z',
  description: '<p>Análisis garantizado: proteína cruda mínimo 28%, grasa cruda mínimo 12%.</p>',
  presentations: [
    {packageKg: 2, priceCop: 40000, sourceUrl: 'https://uno.example/campo?sku=1'},
    {packageKg: 5, priceCop: 90000, sourceUrl: 'https://uno.example/campo?sku=2'},
  ],
};
const second = {
  ...first, id:'retailer-two:174', retailer:'Tienda Dos', productUrl:'https://dos.example/campo',
  presentations:[{packageKg:2, priceCop:35800, sourceUrl:'https://dos.example/campo?sku=A'}],
};

function fixtures(t: TestContext, foods: unknown[], unavailableSources: string[], laiaUnavailable = false) {
  return t.mock.method(globalThis, 'fetch', async (input: URL | string | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === 'https://racion.example') {
      assert.equal(url.pathname, '/api/colombia-foods');
      assert.equal(url.searchParams.get('species'), 'dog');
      assert.equal(url.searchParams.get('type'), 'dry');
      return Response.json({foods, unavailableSources});
    }
    assert.equal(url.hostname, 'storefront-api.tiendanube.com');
    if (laiaUnavailable) return new Response(null, {status: 502});
    return Response.json(url.pathname.endsWith('/search/products') ? {data:[]} : {id:5624899, country:'CO', currency:'COP'});
  });
}

test('any Colombian brand keeps the selected SKU, store, price and source even when other catalogs fail', async t => {
  fixtures(t, [first, {...first}, second], ['Tienda Tres'], true);
  const result = await searchFoodCatalog('Campo Sur Adultos', 'dog', 'dry', undefined, endpoint);
  assert.deepEqual(result.unavailableSources, ['Laia Pets', 'Tienda Tres']);
  assert.equal(result.foods.length, 2);
  const [one, two] = result.foods;
  assert.notEqual(one.sourceFoodId, two.sourceFoodId);
  assert.equal(one.name, 'Adultos');
  assert.equal(one.lifeStage, 'adult');
  assert.equal(one.storeName, 'Tienda Uno');
  assert.equal(two.storeName, 'Tienda Dos');
  assert.deepEqual(one.availableSizesKg, [2, 5]);
  assert.equal(selectFoodPackage(one, 5).priceBasis?.priceCop, 90000);
  assert.equal(selectFoodPackage(two, 2).priceBasis?.priceCop, 35800);
  assert.equal(selectFoodPackage(two, 5).priceBasis, undefined);
  assert.equal(selectFoodPackage(one, 5).buyUrl, 'https://uno.example/campo?sku=2');
  assert.equal(one.fichaNutricional?.fuenteNombre, 'Tienda Uno');
});

test('wrong species, mismatched variant numbers, unrelated shopping URLs and duplicate prices do not become usable offers', async t => {
  fixtures(t, [
    {...first, id:'shop:cat', species:'cat'},
    {...first, id:'shop:wet', type:'wet'},
    {...first, name:'Campo 13'},
    {...first, id:'shop:secure', name:'Campo 31', presentations:[
      ...first.presentations, {packageKg: 2, priceCop:44000, sourceUrl:'https://uno.example/campo?sku=3'},
      {packageKg:20, priceCop:50000, sourceUrl:'https://dos.example/campo?other=1'},
      {packageKg:10, priceCop:30000, sourceUrl:'http://uno.example/campo?sku=4'},
    ]},
  ], []);
  const result = await searchFoodCatalog('Campo 31', 'dog', 'dry', undefined, endpoint);
  assert.deepEqual(result.unavailableSources, []);
  assert.equal(result.foods.length, 1);
  const [food] = result.foods;
  assert.deepEqual(food.availableSizesKg, [2, 5]);
  assert.equal(selectFoodPackage(food, 2).priceBasis, undefined);
  assert.equal(selectFoodPackage(food, 5).priceBasis?.priceCop, 90000);
});

test('an empty response from an unavailable retailer is retried', async t => {
  const mock = fixtures(t, [], ['Tienda Tres']);
  const args = ['Marca de mi barrio', 'dog', 'dry', undefined, endpoint] as const;
  await searchFoodCatalog(...args);
  const calls = mock.mock.callCount();
  const again = await searchFoodCatalog(...args);
  assert.deepEqual(again, {foods:[], unavailableSources:['Tienda Tres']});
  assert.ok(mock.mock.callCount() > calls);
});
