import assert from 'node:assert/strict';
import test from 'node:test';
import { publicRelease, verifyPublicRelease } from '../scripts/public-release-preflight.mjs';

const config = {
  VITE_BILLING_FIREBASE_PROJECT_ID: 'racion-muse',
  VITE_BILLING_FIREBASE_API_KEY: 'AIza' + 'x'.repeat(35),
  VITE_BILLING_API_URL: 'https://cuentas.racion.app',
};
const sites = ['https://racion-app.pages.dev', 'https://haroldbolt.github.io/Racion-app/'];

test('a feature preview can show the gated entry before sales open; public builds require configuration', async () => {
  const env = ['CF_PAGES', 'CF_PAGES_BRANCH', 'RACION_PUBLIC_BUILD'];
  const original = env.map(name => process.env[name]);
  try {
    process.env.CF_PAGES = '1';
    process.env.CF_PAGES_BRANCH = 'feature/check';
    delete process.env.RACION_PUBLIC_BUILD;
    const plugin = publicRelease() as { configResolved(config: {mode: string; env: Record<string, string>}): Promise<void> };
    const configure = (mode: string) => plugin.configResolved({mode, env: {}});
    await configure('production');
    await assert.rejects(configure('anonymous-beta'), /acceso de comprador/);
    process.env.RACION_PUBLIC_BUILD = '1';
    await assert.rejects(configure('production'), /Falta configurar/);
    delete process.env.RACION_PUBLIC_BUILD;
    process.env.CF_PAGES_BRANCH = 'main';
    await assert.rejects(configure('production'), /Falta configurar/);
  } finally {
    env.forEach((name, i) => {
      if (original[i] === undefined) delete process.env[name];
      else process.env[name] = original[i];
    });
  }
});

const terms = {provider: 'hotmart', amountCents: 2500, currency: 'USD', renewal: false, checkoutUrl: 'https://pay.hotmart.com/A12345B?off=one'};

function servePublicConfiguration(offer = terms, calls: string[] = []) {
  return (async (input, init) => {
    const origin = new Headers(init?.headers).get('Origin')!;
    const path = new URL(String(input)).pathname;
    calls.push(origin + ' ' + init?.method + ' ' + path);
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    if (init?.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    if (path === '/api/billing/status') return Response.json({error: 'sign_in_required'}, {status: 401, headers});
    assert.equal(path, '/api/billing/offer');
    return Response.json(offer, {headers});
  }) as typeof fetch;
}

test('the public build requires Hotmart checkout and an authenticated diary for each site', async () => {
  const calls: string[] = [];
  await verifyPublicRelease(config, sites, servePublicConfiguration(terms, calls));
  assert.deepEqual(calls, sites.flatMap(url =>
    ['OPTIONS /api/billing/status', 'GET /api/billing/status', 'GET /api/billing/offer'].map(step => new URL(url).origin + ' ' + step)));
});

test('the public build rejects incorrect sale terms, missing offers and unprotected status', async () => {
  for (const overrides of [
    {amountCents: 1800}, {currency: 'COP'}, {renewal: true}, {provider: 'other'}, {checkoutUrl: ''},
    {checkoutUrl: 'https://pay.hotmart.com.example.org/off'}, {checkoutUrl: 'https://pay.hotmart.com/'},
  ]) {
    await assert.rejects(verifyPublicRelease(config, [sites[0]], servePublicConfiguration({...terms, ...overrides})), /oferta de Hotmart/);
  }
  const configured = servePublicConfiguration();
  for (const status of [200, 503]) {
    await assert.rejects(verifyPublicRelease(config, [sites[0]], async (url, init) => {
      if (init?.method === 'OPTIONS') return configured(url, init);
      return Response.json({}, {status});
    }), /El Worker de cuentas no está listo/);
  }
  await assert.rejects(verifyPublicRelease(config, [sites[0]], async () => new Response(null, {status: 204})), /CORS/);
});

test('public release rejects incomplete, local and fixture configuration before contacting any service', async () => {
  for (const overrides of [
    {VITE_BILLING_FIREBASE_API_KEY: ''},
    {VITE_BILLING_FIREBASE_API_KEY: 'fixture-only'},
    {VITE_BILLING_FIREBASE_PROJECT_ID: 'demo-racion'},
    {VITE_BILLING_AUTH_EMULATOR_URL: 'http://localhost:9099'},
    {VITE_BILLING_API_URL: 'http://127.0.0.1:4209'},
    {VITE_BILLING_API_URL: 'https://billing.example.invalid'},
    {VITE_BILLING_API_URL: 'https://mock.cuentas.app'},
  ]) {
    let contacted = false;
    await assert.rejects(verifyPublicRelease({...config, ...overrides}, sites, async () => {
      contacted = true;
      return new Response();
    }), /Falta configurar|Configura la aplicación web|requiere una URL HTTPS pública/);
    assert.equal(contacted, false);
  }
});
