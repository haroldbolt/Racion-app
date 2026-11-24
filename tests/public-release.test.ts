import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPublicRelease } from '../scripts/public-release-preflight.mjs';

const config = {
  VITE_BILLING_FIREBASE_PROJECT_ID: 'racion-muse',
  VITE_BILLING_FIREBASE_API_KEY: 'AIza' + 'x'.repeat(35),
  VITE_BILLING_API_URL: 'https://cuentas.racion.app',
};
const sites = ['https://racion-app.pages.dev', 'https://haroldbolt.github.io/Racion-app/'];

test('working registration and CORS on both public origins cannot release the Stripe sandbox as Hotmart', async () => {
  const calls: string[] = [];
  const responder = (async (input, init) => {
    const origin = new Headers(init?.headers).get('Origin')!;
    assert.equal(String(input), 'https://cuentas.racion.app/api/billing/status');
    calls.push(init?.method + ' ' + origin);
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };
    if (init?.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    return Response.json({error: 'sign_in_required'}, {status: 401, headers});
  }) as typeof fetch;
  await assert.rejects(verifyPublicRelease(config, sites, responder), /Publicación comercial bloqueada.*Hotmart.*único cobro de 18 USD/);
  assert.deepEqual(calls, sites.flatMap(url => ['OPTIONS', 'GET'].map(method => method + ' ' + new URL(url).origin)));
  for (const failure of [new Response(null, {status: 204}), Response.json({error:'billing_not_configured'}, {status:503})]) {
    await assert.rejects(verifyPublicRelease(config, [sites[0]], async (url, init) => {
      if (init?.method === 'OPTIONS' && failure.status !== 204) return responder(url, init);
      return failure;
    }), /El Worker (no permite solicitudes|de cuentas no está listo)/);
  }
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
