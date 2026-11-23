import assert from 'node:assert/strict';
import test from 'node:test';
import { LivePriceService, parseLivePriceRequest, type PriceStorageTransactions } from '../workers/live-prices/service';

const product = { brand:'Royal Canin', name:'Sterilised 37', grams:2000 };
const city = 'Bogotá';
const normal = {product, city} as const;
const postal = {...normal, postalCode:'110111'};
const title = 'Royal Canin Sterilised 37 Concentrado para Gatos Adultos';
const handle = 'alimento-para-gato-royal-canin-feline-health-nutrition-sterilised';
const otherProduct = {...product, name:'Sterilised 37 Neutered Cat Dry'};

function fixture(key = 'fixture-key') {
  const map = new Map<string, unknown>();
  const storage: PriceStorageTransactions = {
    async get<T>(k: string) { return structuredClone(map.get(k)) as T | undefined; },
    async put<T>(k: string, value: T) { map.set(k, structuredClone(value)); },
    async transaction(callback) { return callback(storage); },
  };
  const variant = {
    id:1600409990, values:['2 kg'], visible:true, stock:null as number | null, stock_management:false,
    barcode:null, price:'137000.00', promotional_price:null as string | null,
  };
  const shopifyVariant = {
    id:'gid://shopify/ProductVariant/52674296414488', title:'2 kg', selectedOptions:[{name:'Peso', value:'2 kg'}],
    price:{currencyCode:'COP', amount:'132400.0'}, availableForSale:false, barcode:null,
  };
  const source = {
    currency:'COP', title, laiaFound:true, agroFound:true, method:'Envía a domicilio', fee:'15650.00', failQuote:false,
    google:[{title:title + ' 2 kg', price:'$100.000', delivery:'Envío gratis', availability:'En stock',
      source:'Otra tienda', link:'https://otra.example/food'}],
  };
  const account = {plan_searches_left:250, plan_renewal_date:'2026-12-16', this_hour_searches:0, account_rate_limit_per_hour:50};
  const serpCalls: URL[] = [];
  const quoteBodies: Array<{zip_code:string; variant_id:number; quantity:number}> = [];
  let now = new Date('2026-11-17T12:00:00Z');
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === 'https://serpapi.com') {
      serpCalls.push(url);
      if (url.pathname === '/account.json') return Response.json(account);
      assert.equal(url.pathname, '/search.json');
      return Response.json({shopping_results:source.google});
    }
    if (url.origin === 'https://cultivacenter.com') {
      assert.equal(init?.method, 'POST');
      assert.equal(JSON.parse(String(init.body)).variables.handle, handle);
      return Response.json({data:{product:source.agroFound ? {
        handle, title:'Alimento Para Gato Royal Canin Feline Health Nutrition Sterilised', vendor:'Royal Canin',
        onlineStoreUrl:'https://cultivacenter.com/products/' + handle, variants:{nodes:[shopifyVariant], pageInfo:{hasNextPage:false}},
      } : null}});
    }
    assert.equal(url.origin, 'https://storefront-api.tiendanube.com');
    assert.equal(init?.redirect, 'manual');
    const path = '/2026-11/stores/5624899';
    if (url.pathname === path) return Response.json({id:5624899, country:'CO', currency:source.currency});
    if (url.pathname === path + '/search/products') {
      assert.equal(url.searchParams.get('q'), 'royal canin sterilised 37');
      return Response.json({data:source.laiaFound ? [{id:354674514}, {id:354674520}] : []});
    }
    if (url.pathname === path + '/products/354674514') {
      return Response.json({id:354674514, name:source.title, handle:'royal-canin-sterilised-37', variants:[variant]});
    }
    if (url.pathname === path + '/products/354674520') {
      return Response.json({id:354674520, name:title.replace('37','7+'), handle:'sterilised-7', variants:[{...variant, id:1010}]});
    }
    assert.equal(url.pathname, path + '/shipping-options');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init.body));
    assert.equal(body.variant_id, variant.id);
    assert.equal(body.quantity, 1);
    quoteBodies.push(body);
    if (source.failQuote) throw new Error('Merchant timed out');
    return Response.json({shipping_options:[
      {code:'local_pickup', name:'Recoge en tienda', price:'0.00'},
      {code:'courier', name:source.method, price:body.zip_code === '110111' ? source.fee : '23450.00'},
    ]});
  };
  const worker = new LivePriceService(storage, key, fetcher, () => now);
  return {worker, map, source, variant, shopifyVariant, serpCalls, quoteBodies, account, setDate:(date: Date) => {now = date;}};
}

test('validates postal codes for Bogotá', () => {
  assert.deepEqual(parseLivePriceRequest(postal)?.postalCode, '110111');
  for (const invalid of ['500021','11011','1101110','110 111','11A111',110111,null,'',[]]) {
    assert.equal(parseLivePriceRequest({...normal, postalCode:invalid}), null);
  }
  assert.equal(parseLivePriceRequest({...postal, city:'Medellín'}), null);
});

test('the exact two stores can be compared directly when neither is indexed by Google', async () => {
  const mock = fixture();
  const [first, other, cityOnly] = await Promise.all([
    mock.worker.search(postal, 'one'), mock.worker.search({...postal, postalCode:'110112'}, 'two'), mock.worker.search(normal, 'three'),
  ]);
  const [laia, otherStore, agro] = first.offers;
  assert.equal(first.status, 'current');
  assert.deepEqual([laia.retailer, laia.stock, laia.productPriceCop, laia.shippingCop, laia.totalCop, laia.shippingPostalCode],
    ['Laia Pets', 'available', 137000, 15650, 152650, '110111']);
  assert.equal(first.cheapestOfferId, laia.id);
  assert.deepEqual([agro.retailer, agro.stock, agro.productPriceCop, agro.shippingCop, agro.totalCop],
    ['Agrocentro Pets', 'out_of_stock', 132400, null, null]);
  assert.equal(otherStore.shippingCop, null);
  assert.equal(otherStore.totalCop, null);
  assert.equal(other.offers[0].totalCop, 160450);
  assert.equal(cityOnly.offers[0].shippingCop, 0);
  assert.equal(mock.serpCalls.filter(url => url.pathname === '/search.json').length, 1);
  assert.ok(mock.serpCalls.every(url => !/11011[12]/.test(url.href)));
  assert.doesNotMatch(JSON.stringify([...mock.map.values()]), /11011[12]|shippingPostalCode/);
  assert.equal(mock.quoteBodies.length, 2);
});

test('reflects a new merchant price, delivery and stock without changing the identity or inventing shipping', async () => {
  const mock = fixture('');
  mock.source.fee = '17600.00';
  mock.shopifyVariant.availableForSale = true;
  const result = await mock.worker.search({...postal, product:otherProduct}, 'guest');
  const [laia, agro] = result.offers;
  assert.equal(result.cheapestOfferId, laia.id);
  assert.equal(laia.totalCop, 154600);
  assert.equal(agro.stock, 'available');
  assert.equal(agro.totalCop, null);
  mock.variant.promotional_price = '135000.00';
  assert.equal((await mock.worker.search(postal, 'guest')).offers[0].totalCop, 152600);
  mock.variant.promotional_price = '0.00';
  assert.equal((await mock.worker.search(postal, 'guest')).offers[0].productPriceCop, 137000);
  assert.equal(mock.serpCalls.length, 0);
});

test('rejects unconfirmed sizes, different formulas, ambiguous rates, currency and store pickup', async () => {
  for (const change of ['size','listedSize','formula','currency','pickup','fractional','timeout','stock']) {
    const mock = fixture('');
    if (change === 'size') mock.variant.values = ['4 kg'];
    if (change === 'listedSize') mock.source.title += ' 4 kg';
    if (change === 'formula') mock.source.title = title.replace('37','38');
    if (change === 'currency') mock.source.currency = 'USD';
    if (change === 'pickup') mock.source.method = 'Retiro en tienda';
    if (change === 'fractional') mock.source.fee = '15650.25';
    if (change === 'timeout') mock.source.failQuote = true;
    if (change === 'stock') { mock.variant.stock = 0; mock.variant.stock_management = true; }
    const result = await mock.worker.search(postal, 'guest');
    assert.equal(result.cheapestOfferId, null, change);
    assert.ok(result.offers.every(o => o.totalCop === null && o.shippingCop === null), change);
    assert.equal(mock.quoteBodies.length, ['pickup','fractional','timeout'].includes(change) ? 1 : 0, change);
  }
});

test('never promotes a stale shopping price to a fresh merchant result after quota expiration', async () => {
  const mock = fixture();
  const previous = await mock.worker.search(normal, 'guest');
  mock.setDate(new Date('2026-11-18T12:00:00Z'));
  mock.account.plan_searches_left = 0;
  const fresh = await mock.worker.search(postal, 'guest');
  assert.equal(fresh.status, 'current');
  assert.deepEqual(fresh.offers.map(o => o.retailer), ['Laia Pets','Agrocentro Pets']);
  mock.source.laiaFound = false;
  mock.source.agroFound = false;
  const stale = await mock.worker.search(postal, 'guest');
  assert.equal(stale.status, 'stale');
  assert.equal(stale.queriedAt, previous.queriedAt);
  assert.equal(stale.cheapestOfferId, null);
  assert.ok(stale.offers.every(o => o.shippingCop === null && o.totalCop === null));
});
