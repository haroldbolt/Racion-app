import assert from 'node:assert/strict';
import test from 'node:test';
import { colombiaPriceDay, type LivePriceRequest } from '../src/types/livePrices';
import { collectShoppingOffers, quotedShippingCop, rankShoppingOffers } from '../workers/live-prices/offers';
import { LivePriceService, parseLivePriceRequest, type PriceStorage, type PriceStorageTransactions } from '../workers/live-prices/service';

const royalCanin = { brand: 'Royal Canin', name: 'Sterilised 37 Neutered Cat Dry', grams: 2000 };
const request = parseLivePriceRequest({ product: royalCanin, city: 'Bogotá' });
assert.ok(request);
const regionalTitle = 'Royal Canin Sterilised 37 Gatos Adultos 2 kg';

const listings = [
  { title: regionalTitle, source: 'Tienda A', price: '$90.000', delivery: 'Envío $18.000', link: 'https://tienda-a.example/producto' },
  { title: regionalTitle, source: 'Tienda B', price: '$99.000', delivery: 'Envío incluido', product_link: 'https://www.google.com/shopping/product/123' },
  { title: regionalTitle, source: 'Envío sin cotizar', price: '$80.000', delivery: 'Entrega en 2 días', link: 'https://tienda-c.example/producto' },
  { title: regionalTitle.replace('2 kg', '4 kg'), source: 'Otra presentación', price: '$149.000', delivery: 'Gratis', link: 'https://tienda-d.example/producto' },
];

class MemoryTransactions implements PriceStorageTransactions {
  private readonly values = new Map<string, unknown>();
  private queue = Promise.resolve();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.values.get(key)) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  transaction<T>(callback: (transaction: PriceStorage) => Promise<T>): Promise<T> {
    const result = this.queue.then(() => callback(this));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function fakeSerpApi() {
  const urls: URL[] = [];
  const account = {
    plan_searches_left: 1000, plan_renewal_date: '2026-12-16',
    this_hour_searches: 0, account_rate_limit_per_hour: 50,
  };
  const shopping = { calls: 0, fail: false, records: listings };
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, 'https://serpapi.com');
    urls.push(url);
    if (url.pathname === '/account.json') return Response.json(account);
    assert.equal(url.pathname, '/search.json');
    shopping.calls += 1;
    if (shopping.fail) throw new Error('Simulated connection closed');
    return Response.json({ shopping_results: shopping.records });
  };
  return { account, urls, shopping, fetcher };
}

test('ranks comparable listings by total and calculates the unit price for another package', () => {
  const collected = collectShoppingOffers(listings, royalCanin);
  const { offers, cheapestOfferId } = rankShoppingOffers(collected, royalCanin.grams);
  assert.equal(offers[0].retailer, 'Tienda B');
  assert.equal(offers[0].totalCop, 99000);
  assert.equal(offers[0].shippingCop, 0);
  assert.equal(offers[0].linkSource, 'google_shopping');
  assert.equal(cheapestOfferId, offers[0].id);
  assert.equal(offers[1].totalCop, 108000);
  assert.equal(offers[2].totalCop, null);
  assert.equal(offers[3].pricePerKgCop, 37250);
  assert.equal(rankShoppingOffers([offers[2], offers[3]], royalCanin.grams).cheapestOfferId, null);
});

test('skips mismatched formulas, multipacks, missing package, unusable links and unclear foreign price', () => {
  const base = listings[0];
  const rejected = [
    { ...base, title: regionalTitle.replace('37', '38') },
    { ...base, title: regionalTitle.replace('Gatos Adultos', 'Perros Adultos') },
    { ...base, title: regionalTitle.replace('Gatos Adultos', 'Gatos Light') },
    { ...base, title: regionalTitle.replace('2 kg', '2 x 1 kg') },
    { ...base, title: regionalTitle.replace('2 kg', '1 kg x 2') },
    { ...base, title: regionalTitle.replace('2 kg', '2 kg + 500 g') },
    { ...base, title: regionalTitle.replace('2 kg', '') },
    { ...base, link: 'javascript:alert(1)' },
    { ...base, price: 'USD 92.00' },
    { ...base, price: '$92.00' },
    { ...base, availability: 'out_of_stock' },
    { ...base, ean: '1234567890123' },
  ];
  assert.equal(collectShoppingOffers(rejected, { ...royalCanin, barcode: '6012345678901' }).length, 0);
  const [grouped] = collectShoppingOffers([{ ...base, title: regionalTitle.replace('2 kg', '2.000 g') }], royalCanin);
  assert.equal(grouped.grams, 2000);
  assert.equal(grouped.productPriceCop, 90000);
});

test('does not turn delivery estimates, dates, ranges, conditions or foreign amounts into a quoted total', () => {
  for (const text of ['Entrega en 2 días', 'Envío de $15.000 a $30.000', 'Envío gratis en compras superiores a $200.000',
    'Envío desde $15.000', 'Free delivery on $35', 'Shipping $5.99', 'Envío aplica solamente en tienda',
    'Retiro en tienda (Gratis)', 'Free store pickup']) {
    assert.equal(quotedShippingCop(text, []), null, text);
  }
  assert.equal(quotedShippingCop('Entrega el 18 nov.', ['Envío COP 18.000']), 18000);
  for (const text of ['Envío sin costo', 'Get it by Wed (Free)', 'Recíbelo el miércoles (Gratis)']) {
    assert.equal(quotedShippingCop(text, []), 0, text);
  }
});

test('deduplicates concurrent and restarted lookups over one Colombia day and sends a single localized search', async () => {
  const mock = fakeSerpApi();
  const storage = new MemoryTransactions();
  let now = new Date('2026-11-17T04:59:59Z');
  const worker = new LivePriceService(storage, 'fixture-key', mock.fetcher, () => now);
  const [first, shared] = await Promise.all([worker.search(request, 'one'), worker.search(request, 'two')]);
  assert.deepEqual(first, shared);
  assert.equal(first.status, 'current');
  assert.equal(colombiaPriceDay(now), '2026-11-16');
  assert.equal(mock.shopping.calls, 1);
  assert.equal(mock.urls.length, 2);
  const search = mock.urls[1].searchParams;
  assert.equal(search.get('engine'), 'google_shopping');
  assert.equal(search.get('location'), 'Bogota, Bogota, Colombia');
  assert.equal(search.get('no_cache'), 'true');
  assert.equal(search.get('gl'), 'co');
  assert.equal(search.get('q'), 'Royal Canin Sterilised 37 Neutered Cat Dry 2 kg');
  assert.doesNotMatch(JSON.stringify(first), /fixture-key/);

  const restarted = new LivePriceService(storage, 'fixture-key', mock.fetcher, () => now);
  assert.deepEqual(await restarted.search(request, 'another'), first);
  assert.equal(mock.shopping.calls, 1);
  now = new Date('2026-11-17T05:00:00Z');
  mock.account.plan_searches_left = 0;
  const yesterday = await restarted.search(request, 'another');
  assert.equal(yesterday.status, 'stale');
  assert.equal(yesterday.reason, 'quota_exhausted');
  assert.equal(yesterday.cheapestOfferId, null);
  assert.equal(yesterday.queriedAt, first.queriedAt);
  assert.equal(mock.shopping.calls, 1);
});

test('reserves at most 250 billed searches per provider renewal period and starts a new budget on renewal', async () => {
  const storage = new MemoryTransactions();
  const mock = fakeSerpApi();
  let now = new Date('2026-11-17T12:00:00Z');
  const worker = new LivePriceService(storage, 'fixture-key', mock.fetcher, () => now);
  for (let index = 0; index < 251; index += 1) {
    const variant = { ...request, product: { ...request.product, grams: 2000 + index } };
    const result = await worker.search(variant, `visitor-${index}`);
    assert.equal(result.status, index < 250 ? 'current' : 'unavailable');
    if (index === 250) assert.equal(result.reason, 'quota_exhausted');
    now = new Date(now.getTime() + 75000);
  }
  assert.equal(mock.shopping.calls, 250);
  mock.account.plan_renewal_date = '2027-01-16';
  now = new Date('2026-12-16T12:00:00Z');
  const afterRenewal = await worker.search(request, 'renewed');
  assert.equal(afterRenewal.status, 'current');
  assert.equal(mock.shopping.calls, 251);
});

test('concurrent different searches cannot reserve the same last included search and timeouts are not retried that day', async () => {
  const storage = new MemoryTransactions();
  const mock = fakeSerpApi();
  mock.account.plan_searches_left = 1;
  mock.shopping.fail = true;
  const worker = new LivePriceService(storage, 'fixture-key', mock.fetcher, () => new Date('2026-11-17T12:00:00Z'));
  const other = { ...request, product: { ...request.product, grams: 3000 } };
  const initial = await Promise.all([worker.search(request, 'one'), worker.search(other, 'two')]);
  assert.deepEqual(initial.map(({ reason }) => reason).sort(), ['quota_exhausted', 'upstream_unavailable']);
  await worker.search(request, 'three');
  await worker.search(other, 'four');
  assert.equal(mock.shopping.calls, 1);
});

test('reports configuration and validates the public lookup without calling upstream', async () => {
  const mock = fakeSerpApi();
  const worker = new LivePriceService(new MemoryTransactions(), undefined, mock.fetcher);
  assert.equal((await worker.search(request, 'one')).reason, 'not_configured');
  assert.equal(mock.urls.length, 0);
  for (const invalid of [null, { proud: true }, { ...request, city: 'Paris' },
    { ...request, product: { ...request.product, brand: 'https://offsite.example/?x=1' } },
    { ...request, product: { ...request.product, barcode: '999' } },
    { ...request, product: { ...request.product, grams: 0 } }]) {
    assert.equal(parseLivePriceRequest(invalid), null);
  }
  const input: LivePriceRequest = { ...request, product: { ...royalCanin, brand: ' Royal  Canin ' } };
  assert.deepEqual(parseLivePriceRequest(input), request);
});
