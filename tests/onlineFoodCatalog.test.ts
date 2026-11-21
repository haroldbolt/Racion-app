import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { searchOnlineFoods } from '../src/services/onlineFoodCatalog';

const storePath = '/2026-11/stores/5624899';
const detail = {
  id: 354674514,
  name: 'Royal Canin Sterilised 37 Concentrado para Gatos Adultos',
  handle: 'royal-canin-sterilised-37-x-400-g',
  brand: 'Royal Canin',
  description: '<p>Proteína 37%, grasas 12%. Datos del comercio.</p>',
  categories: [{ name: 'Concentrado para Gatos', google_shopping_category: 'Productos para gatos > Comida para gatos' }],
  tags: 'gatos, feline health nutrition dry',
  images: [{ src: 'https://acdn-us.mitiendanube.com/stores/example.webp' }],
  variants: [
    { id: 1, visible: true, values: ['400 g'], weight: '0.001', barcode: '3182550737555' },
    { id: 2, visible: true, values: ['2 kg'], weight: '0.002', barcode: '3182550737555' },
    { id: 3, visible: true, values: ['4 kg'], weight: '0.004', barcode: '3182550737555' },
    { id: 4, visible: true, values: ['10 kg'], weight: '0.010', barcode: '3182550737555' },
    { id: 5, visible: false, values: ['20 kg'] },
    { id: 6, visible: true, values: ['3 x 85 g'] },
    { id: 7, visible: true, values: ['Default Title'], weight: '7.000' },
    { id: 8, visible: true, values: ['2 kg + 1 kg'] },
  ],
};

function mockStore(context: TestContext, products: unknown[], store = { id: 5624899, country: 'CO', currency: 'COP' }) {
  const calls: URL[] = [];
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push(url);
    assert.equal(url.origin, 'https://storefront-api.tiendanube.com');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.method, undefined);
    if (url.pathname === storePath) return Response.json(store);
    if (url.pathname === `${storePath}/search/products`) {
      assert.equal(url.searchParams.get('per_page'), '8');
      return Response.json({ data: products.map((product) => ({ id: (product as { id: number }).id, name: '', variants: [] })) });
    }
    const product = products.find((product) => url.pathname === `${storePath}/products/${(product as { id: number }).id}`);
    return product ? Response.json(product) : new Response(null, { status: 404 });
  });
  return calls;
}

test('online food metadata preserves real package labels while nutrition awaits confirmation', async (context) => {
  const calls = mockStore(context, [
    detail,
    { ...detail, id: 354674515, name: 'Royal Canin Sterilised 7+ Concentrado para Gatos Adultos' },
  ]);
  const results = await searchOnlineFoods('Royal Canin Sterilised 37', 'cat', 'dry');
  assert.equal(results.length, 1);
  const food = results[0];
  assert.equal(food.name, 'Sterilised 37 Concentrado para Gatos Adultos');
  assert.equal(food.brand, 'Royal Canin');
  assert.equal(food.type, 'dry');
  assert.equal(food.species, 'cat');
  assert.deepEqual(food.availableSizesKg, [0.4, 2, 4, 10]);
  assert.equal(food.bagSizeKg, 0.4);
  assert.equal(food.kcalPerKg, 0);
  assert.equal(food.proteinPct, 0);
  assert.equal(food.fatPct, 0);
  assert.equal(food.fiberPct, 0);
  assert.equal(food.labelStatus, 'unconfirmed');
  assert.equal(food.barcode, undefined);
  assert.equal(food.fichaNutricional?.fuenteUrl, 'https://www.laiapets.com.co/productos/royal-canin-sterilised-37-x-400-g/');
  assert.equal(food.fichaNutricional?.coincidenciaEstado, 'pendiente');

  food.availableSizesKg?.push(99);
  const cached = await searchOnlineFoods('Royal Canin Sterilised 37', 'cat', 'dry');
  assert.deepEqual(cached[0].availableSizesKg, [0.4, 2, 4, 10]);
  assert.equal(calls.length, 4, 'Cached metadata must not start another search');
});

test('only the requested explicit species and food type are eligible', async (context) => {
  mockStore(context, [
    { ...detail, id: 11, name: 'Juguete para Gatos', tags: '', categories: [{ name: 'Juguetes para Gatos' }] },
    { ...detail, id: 12, name: 'Alimento para Gatos', tags: '', categories: [{ name: 'Gatos' }] },
    { ...detail, id: 13, name: 'Concentrado para Perros', tags: 'dogs dry', categories: [{ name: 'Concentrado para Perros' }] },
    { ...detail, id: 14, name: 'Suplemento para Gatos', tags: 'gatos dry', categories: [{ name: 'Suplementos para Gatos' }] },
    { ...detail, id: 15, name: 'Alimento Húmedo para Gatos', tags: 'gatos wet', categories: [{ name: 'Comida Húmeda para Gatos' }] },
    { ...detail, id: 16, name: 'Concentrado para Perros y Gatos', tags: '', categories: [{ name: 'Alimentos para Perros y Gatos' }] },
  ]);
  assert.deepEqual(await searchOnlineFoods('Food classification test', 'cat', 'dry'), []);
});

test('eight product details are the limit and use at most three concurrent requests', async (context) => {
  let active = 0;
  let peak = 0;
  let details = 0;
  context.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === storePath) return Response.json({ id: 5624899, country: 'CO', currency: 'COP' });
    if (url.pathname === `${storePath}/search/products`) {
      return Response.json({ data: Array.from({ length: 12 }, (_, index) => ({ id: 100 + index })) });
    }
    const id = Number(url.pathname.split('/').at(-1));
    details++;
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return Response.json({ ...detail, id });
  });
  const foods = await searchOnlineFoods('Bounded query test', 'cat');
  assert.equal(foods.length, 8);
  assert.equal(details, 8);
  assert.equal(peak, 3);
});

test('invalid store metadata, oversized requests and cancellation do not yield foods', async (context) => {
  const calls = mockStore(context, [detail], { id: 5624899, country: 'US', currency: 'USD' });
  await assert.rejects(searchOnlineFoods('Wrong currency test', 'cat'), /validar el catálogo/);
  assert.equal(calls.length, 2);
  await assert.rejects(searchOnlineFoods('x'.repeat(101), 'cat'), /100 caracteres/);
  assert.equal(calls.length, 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(searchOnlineFoods('Aborted request test', 'cat', 'dry', controller.signal), { name: 'AbortError' });
  assert.equal(calls.length, 2);
});
