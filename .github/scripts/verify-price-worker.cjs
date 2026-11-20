const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { build } = require('esbuild');
const { createFetchMock, Miniflare } = require(process.env.MINIFLARE_PATH || 'miniflare');

const publicOrigin = 'https://haroldbolt.github.io';
const brandedOrigin = 'https://racion-app.pages.dev';
const endpoint = 'http://localhost/api/live-prices';
const fixtureKey = 'racion-test-key';
const request = {
  city: 'Bogotá',
  product: { brand: 'Royal Canin', name: 'Sterilised 37 Neutered Cat Dry', grams: 2000 },
};

const rows = [
  { source: 'Tienda A', price: '$90.000', delivery: 'Envío $18.000', link: 'https://a.example/2kg' },
  { source: 'Tienda B', price: '$99.000', delivery: 'Envío incluido', link: 'https://b.example/2kg' },
  { source: 'Tienda C', price: '$80.000', delivery: 'Entrega en 2 días', link: 'https://c.example/2kg' },
].map((offer) => ({ ...offer, title: 'Royal Canin Sterilised 37 Gatos Adultos 2 kg' }));

function post(worker, body = request, origin = publicOrigin) {
  return worker.dispatchFetch(endpoint, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function verifyWorkerRuntime() {
  const directory = await mkdtemp(path.join(tmpdir(), 'racion-worker-'));
  let worker;
  try {
    const config = await readFile('workers/live-prices/wrangler.toml', 'utf8');
    const date = config.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
    assert.ok(date, 'Missing Worker compatibility date');
    assert.match(config, /new_sqlite_classes\s*=\s*\["PriceSearchBudget"\]/);
    assert.match(config, /name\s*=\s*"LIVE_PRICE_BUDGET"\s*\nclass_name\s*=\s*"PriceSearchBudget"/);
    const allowedOrigins = config.match(/^ALLOWED_ORIGINS\s*=\s*"([^"]+)"/m)?.[1];
    assert.ok(allowedOrigins, 'Missing Worker allowed origins');
    const configuredOrigins = allowedOrigins.split(',').map((origin) => origin.trim());
    for (const origin of [publicOrigin, brandedOrigin]) {
      assert.ok(configuredOrigins.includes(origin), `Missing production origin: ${origin}`);
    }
    const bundle = await build({
      entryPoints: ['workers/live-prices/index.ts'],
      write: false,
      bundle: true,
      platform: 'browser',
      format: 'esm',
      external: ['cloudflare:workers'],
    });

    const start = (fetchMock, apiKey) => {
      fetchMock.disableNetConnect();
      return new Miniflare({
        name: 'racion-live-prices',
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: date,
        cf: false,
        bindings: { ALLOWED_ORIGINS: allowedOrigins, ...(apiKey ? { SERPAPI_API_KEY: apiKey } : {}) },
        durableObjects: { LIVE_PRICE_BUDGET: { className: 'PriceSearchBudget', useSQLite: true } },
        durableObjectsPersist: path.join(directory, 'data'),
        fetchMock,
      });
    };

    worker = start(createFetchMock());
    for (const origin of [publicOrigin, brandedOrigin]) {
      const preflight = await worker.dispatchFetch(endpoint, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
    }
    const unconfigured = await post(worker);
    assert.equal(unconfigured.status, 200);
    assert.equal(unconfigured.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await unconfigured.json(), {
      status: 'unavailable', city: 'Bogotá', queriedAt: null, offers: [],
      cheapestOfferId: null, reason: 'not_configured',
    });
    assert.equal((await post(worker, request, 'https://other.example')).status, 403);
    assert.equal((await post(worker, { ...request, city: 'Paris' })).status, 400);
    await worker.dispose();
    worker = undefined;

    const mock = createFetchMock();
    const serpApi = mock.get('https://serpapi.com');
    serpApi.intercept({ method: 'GET', path: `/account.json?api_key=${fixtureKey}` }).reply(200, {
      plan_searches_left: 1,
      plan_renewal_date: '2026-12-16',
      this_hour_searches: 0,
      account_rate_limit_per_hour: 50,
    }).times(2);
    serpApi.intercept({
      method: 'GET',
      path: (value) => {
        const url = new URL(value, 'https://serpapi.com');
        return url.pathname === '/search.json' && url.searchParams.get('engine') === 'google_shopping' &&
          url.searchParams.get('gl') === 'co' && url.searchParams.get('api_key') === fixtureKey;
      },
    }).reply(200, { shopping_results: rows });
    worker = start(mock, fixtureKey);

    const inputs = [request, { ...request, city: 'Medellín' }];
    const results = await Promise.all(inputs.map(async (query) => {
      const response = await post(worker, query);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), publicOrigin);
      const body = await response.text();
      assert.ok(!body.includes(fixtureKey), 'Worker response exposed the provider key');
      return JSON.parse(body);
    }));
    const current = results.find((result) => result.status === 'current');
    const limited = results.find((result) => result.reason === 'quota_exhausted');
    assert.ok(current && limited, 'Only one request may reserve the last search');
    assert.equal(current.offers.find((offer) => offer.id === current.cheapestOfferId)?.totalCop, 99000);
    assert.equal(current.offers.find((offer) => offer.retailer === 'Tienda A')?.totalCop, 108000);
    assert.equal(current.offers.find((offer) => offer.retailer === 'Tienda C')?.totalCop, null);
    mock.assertNoPendingInterceptors();
    await worker.dispose();
    worker = undefined;

    worker = start(createFetchMock(), fixtureKey);
    const cachedRequest = inputs.find((query) => query.city === current.city);
    assert.ok(cachedRequest);
    assert.deepEqual(await (await post(worker, cachedRequest)).json(), current);
    const brandedResponse = await post(worker, cachedRequest, brandedOrigin);
    assert.equal(brandedResponse.status, 200);
    assert.equal(brandedResponse.headers.get('access-control-allow-origin'), brandedOrigin);
    assert.deepEqual(await brandedResponse.json(), current);
    console.log('Worker local: ambos orígenes de producción autorizados, secreto ausente, última consulta reservada atómicamente y caché SQLite tras reiniciar.');
  } finally {
    try {
      await worker?.dispose();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

verifyWorkerRuntime().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
