import assert from 'node:assert/strict';
import test from 'node:test';
import review from '../workers/muse-review/index.js';

test('the review invitation only opens the Muse host and stays out of asset requests', async () => {
  const host = 'https://muse.racion-app.pages.dev/';
  const env = {
    MUSE_REVIEW_SIGNING_KEY: 'unit-test-signing-key',
    MUSE_REVIEW_PASSWORD: 'unit-test-invitation',
    ASSETS: { fetch: async (request: Request) => {
      assert.equal(request.headers.get('Authorization'), null);
      assert.equal(request.headers.get('Cookie'), null);
      return new Response('diario');
    } },
  };
  const headers = { Authorization: 'Basic ' + btoa('muse:unit-test-invitation'), Cookie: 'private=fixture' };
  assert.equal((await review.fetch(new Request(host), env)).status, 401);
  assert.equal((await review.fetch(new Request('https://racion-app.pages.dev/', { headers }), env)).status, 404);
  const page = await review.fetch(new Request(host, { headers }), env);
  assert.equal(page.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(await page.text(), 'diario');
  assert.equal((await review.fetch(new Request(host + '__review/session', { method: 'POST', headers }), env)).status, 401);
});
