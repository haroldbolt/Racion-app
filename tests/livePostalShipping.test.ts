import assert from 'node:assert/strict';
import test from 'node:test';
import { LivePriceService, parseLivePriceRequest, type PriceStorageTransactions } from '../workers/live-prices/service';

const product = { brand: 'Royal Canin', name: 'Sterilised 37 Neutered Cat Dry', grams: 2000 };
const city = 'Bogotá';
const title = 'Royal Canin Sterilised 37 Concentrado para Gatos Adultos';
const normal = parseLivePriceRequest({ product, city });
const postal = parseLivePriceRequest({ product, city, postalCode: '110111' });
assert.ok(normal);
assert.ok(postal);

function fixture() {
  const map = new Map<string, unknown>();
  const storage: PriceStorageTransactions = {
    async get<T>(key: string) { return structuredClone(map.get(key)) as T | undefined; },
    async put<T>(key: string, value: T) { map.set(key, structuredClone(value)); },
    async transaction(callback) { return callback(storage); },
  };
  const variant = {
    id: 1600409990, values: ['2 kg'], visible: true, stock: null, stock_management: false,
    barcode: null, price: '137000.00', promotional_price: null, weight: '0.002',
  };
  const wrongSize = { ...variant, id: 1600410000, values: ['4 kg'], weight: '2.000' };
  const stock = { currency: 'COP', detailName: title, searchVariant: { ...variant, values: [] }, detailVariant: variant };
  const account = { plan_searches_left: 250, plan_renewal_date: '2026-12-16', this_hour_searches: 0, account_rate_limit_per_hour: 50 };
  const merchant = `${title} (2 kg)`;
  let now = new Date('2026-11-17T12:00:00Z');
  const replies = {
    searchListings: [
      { title: merchant, price: '$137.000', source: 'Laia Pets', product_link: 'https://www.google.com/shopping/product/123' },
      { title: merchant, price: '$100.000', delivery: 'Envío gratis', source: 'Otra tienda', link: 'https://pet.example/food' },
    ],
    quote: (zip: string) => [
      { code: 'pickup', name: 'Recoge en tienda', price: '0.00' },
      { code: 'api_3557701_ServiEntrega - premier', name: 'ServiEntrega Premier', price: zip === '110111' ? '15650.00' : '23450.00' },
      { code: 'courier', name: 'Otra entrega', price: '49900.00' },
    ],
  };
  const serpCalls: URL[] = [];
  const merchantCalls: URL[] = [];
  const quoteBodies: unknown[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === 'https://serpapi.com') {
      serpCalls.push(url);
      if (url.pathname === '/account.json') return Response.json(account);
      assert.equal(url.pathname, '/search.json');
      return Response.json({ shopping_results: replies.searchListings });
    }
    merchantCalls.push(url);
    assert.equal(url.origin, 'https://storefront-api.tiendanube.com');
    assert.equal(url.searchParams.has('zip_code'), false);
    const path = '/2026-11/stores/5624899';
    if (url.pathname === path) return Response.json({ id: 5624899, country: 'CO', currency: stock.currency });
    if (url.pathname === `${path}/search/products`) {
      assert.equal(url.searchParams.get('q'), 'royal canin sterilised 37');
      assert.equal(url.searchParams.get('per_page'), '8');
      return Response.json({ data: [
        { id: 354674514, name: '', variants: [stock.searchVariant] },
        { id: 354674520, name: '', variants: [wrongSize] },
      ] });
    }
    if (url.pathname === `${path}/products/354674514`) {
      return Response.json({ id: 354674514, name: stock.detailName, variants: [stock.detailVariant] });
    }
    assert.equal(url.pathname, `${path}/shipping-options`);
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init.body)) as { zip_code: string; variant_id: number; quantity: number };
    quoteBodies.push(body);
    assert.equal(body.variant_id, variant.id);
    assert.equal(body.quantity, 1);
    return Response.json({ shipping_options: replies.quote(body.zip_code) });
  };
  const worker = new LivePriceService(storage, 'fixture-key', fetcher, () => now);
  return { worker, storage: map, serpCalls, merchantCalls, quoteBodies, variant, stock, replies, account, setDate: (date: Date) => { now = date; } };
}

test('validates postal input only for Bogotá and exactly six digits starting with 11', () => {
  assert.equal(postal.postalCode, '110111');
  assert.equal(normal.postalCode, undefined);
  for (const invalid of ['500021', '11011', '1101110', '110 111', '11A111', 110111, null, '', []]) {
    assert.equal(parseLivePriceRequest({ product, city, postalCode: invalid }), null);
  }
  assert.equal(parseLivePriceRequest({ product, city: 'Medellín', postalCode: '110111' }), null);
});

test('quotes the exact Bogotá variant per postcode, reranks and leaves the shared shopping cache unchanged', async () => {
  const mock = fixture();
  const secondPostal = parseLivePriceRequest({ product, city, postalCode: '110112' });
  assert.ok(secondPostal);
  const [first, other, cityOnly] = await Promise.all([
    mock.worker.search(postal, 'one'), mock.worker.search(secondPostal, 'two'), mock.worker.search(normal, 'three'),
  ]);
  assert.equal(first.status, 'current');
  assert.equal(first.queriedAt, cityOnly.queriedAt);
  const quote = first.offers[0];
  assert.equal(quote.retailer, 'Laia Pets');
  assert.equal(quote.totalCop, 152650);
  assert.equal(quote.shippingCop, 15650);
  assert.equal(quote.shippingPostalCode, '110111');
  assert.equal(quote.stock, 'available');
  assert.equal(first.cheapestOfferId, quote.id);
  assert.equal(first.offers[1].shippingCop, null);
  assert.equal(first.offers[1].totalCop, null);
  assert.equal(other.offers[0].shippingPostalCode, '110112');
  assert.equal(other.offers[0].totalCop, 160450);
  assert.equal(cityOnly.offers[0].retailer, 'Otra tienda');
  assert.equal(cityOnly.offers[0].shippingCop, 0);
  assert.equal(cityOnly.offers[1].shippingPostalCode, undefined);
  assert.deepEqual(await mock.worker.search(normal, 'one'), cityOnly);
  assert.equal(mock.serpCalls.length, 2);
  assert.equal(mock.serpCalls.filter((url) => url.pathname === '/search.json').length, 1);
  assert.ok(mock.serpCalls.every((url) => !/11011[12]/.test(url.href)));
  assert.doesNotMatch(JSON.stringify([...mock.storage.values()]), /11011[12]|shippingPostalCode/);
  assert.equal(mock.quoteBodies.length, 2);
  assert.equal(mock.merchantCalls.length, 8);
});

test('leaves shipments unknown when the merchant is unsupported, the quote is pickup-only or the exact product cannot be verified', async () => {
  const unsupported = fixture();
  unsupported.replies.searchListings.shift();
  const unavailable = await unsupported.worker.search(postal, 'guest');
  assert.equal(unavailable.cheapestOfferId, null);
  assert.equal(unavailable.offers[0].shippingCop, null);
  assert.equal(unsupported.merchantCalls.length, 0);

  const pickup = fixture();
  pickup.replies.quote = () => [{ code: 'retiro', name: 'Retiro en tienda', price: '0.00' }];
  const blank = await pickup.worker.search(postal, 'guest');
  assert.equal(blank.cheapestOfferId, null);
  assert.ok(blank.offers.every(({ shippingCop, totalCop }) => shippingCop === null && totalCop === null));
  assert.equal(pickup.quoteBodies.length, 1);

  const fractional = fixture();
  fractional.replies.quote = () => [{ code: 'courier', name: 'Entrega', price: '15650.25' }];
  assert.equal((await fractional.worker.search(postal, 'guest')).cheapestOfferId, null);

  const priceChanged = fixture();
  priceChanged.stock.detailVariant = { ...priceChanged.variant, price: '135000.00' };
  assert.equal((await priceChanged.worker.search(postal, 'guest')).cheapestOfferId, null);
  assert.equal(priceChanged.quoteBodies.length, 0);

  const packageUnconfirmed = fixture();
  packageUnconfirmed.stock.detailVariant = { ...packageUnconfirmed.variant, values: [], weight: '2.000' };
  assert.equal((await packageUnconfirmed.worker.search(postal, 'guest')).cheapestOfferId, null);
  assert.equal(packageUnconfirmed.quoteBodies.length, 0);

  const differentFormula = fixture();
  differentFormula.stock.detailName = title.replace('37', '38');
  assert.equal((await differentFormula.worker.search(postal, 'guest')).cheapestOfferId, null);
  assert.equal(differentFormula.quoteBodies.length, 0);
});

test('does not request postal shipping from an old shopping result after quota expiration', async () => {
  const mock = fixture();
  const first = await mock.worker.search(normal, 'guest');
  mock.setDate(new Date('2026-11-18T12:00:00Z'));
  mock.account.plan_searches_left = 0;
  const stale = await mock.worker.search(postal, 'guest');
  assert.equal(stale.status, 'stale');
  assert.equal(stale.queriedAt, first.queriedAt);
  assert.equal(stale.cheapestOfferId, null);
  assert.ok(stale.offers.every(({ shippingCop, totalCop }) => shippingCop === null && totalCop === null));
  assert.equal(mock.merchantCalls.length, 0);
});
