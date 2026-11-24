const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { museReviewOrigin } = require('./muse-review.cjs');

const scenarios = {
  postal: ['verify-postal-prices.cjs', '--live'],
  agility: ['verify-agility.cjs'],
  receipt: ['verify-receipt.cjs'],
  'shared-bag': ['verify-shared-bag.cjs'],
};

async function sessionPassword() {
  const oidcUrl = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  assert.ok(oidcUrl.protocol === 'https:' && oidcUrl.hostname.endsWith('.actions.githubusercontent.com'),
    'The identity token must come from GitHub Actions');
  oidcUrl.searchParams.set('audience', museReviewOrigin);
  const identity = await fetch(oidcUrl, {
    redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN },
  });
  assert.equal(identity.status, 200, 'GitHub could not issue the identity token');
  const token = (await identity.json()).value;
  assert.ok(typeof token === 'string' && token.length > 0 && !/\s/.test(token), 'Invalid GitHub identity token');
  console.log('::add-mask::' + token);
  const grant = await fetch(new URL('/__review/session', museReviewOrigin), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + token },
  });
  if (grant.status !== 200) throw new Error('Review session endpoint returned HTTP ' + grant.status);
  const { password } = await grant.json();
  assert.ok(typeof password === 'string' && password.length > 0 && !/[\r\n\0]/.test(password), 'Invalid review password');
  console.log('::add-mask::' + password);
  return password;
}

async function publishedSession(sha) {
  const url = new URL(museReviewOrigin);
  url.searchParams.set('release', sha);
  const deadline = Date.now() + 8 * 60_000;
  let password;
  let state = 'esperando la revisión';
  do {
    try {
      if (!password) password = await sessionPassword();
      const basic = Buffer.from('muse:' + password).toString('base64');
      const response = await fetch(url, {
        headers: { Authorization: 'Basic ' + basic, 'Cache-Control': 'no-cache' },
        redirect: 'error', signal: AbortSignal.timeout(12000),
      });
      if (response.status === 401) password = undefined;
      if (response.ok) {
        const html = await response.text();
        const tags = html.match(/<meta\b[^>]*>/gi) || [];
        const release = tags.find(tag => /\bname=["']racion-release["']/i.test(tag));
        if (release && release.match(/\bcontent=["']([a-f\d]{40})["']/i)?.[1] === sha) {
          const publicResponse = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
          assert.equal(publicResponse.status, 401, 'The review must require HTTP authentication');
          console.log('Revisión protegida publicada en ' + url.origin + ' · ' + sha);
          return password;
        }
        state = 'la versión publicada todavía no corresponde al commit';
      } else state = 'la revisión respondió HTTP ' + response.status;
    } catch (error) {
      state = error.message;
    }
    await delay(12000);
  } while (Date.now() < deadline);
  throw new Error('No se pudo iniciar la prueba de la versión esperada: ' + state);
}

async function run() {
  const scenario = process.argv[2];
  assert.ok(Object.hasOwn(scenarios, scenario), 'Unknown Muse review scenario');
  const sha = process.env.GITHUB_SHA;
  assert.match(sha || '', /^[a-f0-9]{40}$/i, 'Expected the full GitHub commit SHA');
  const password = await publishedSession(sha);
  const basic = Buffer.from('muse:' + password).toString('base64');
  console.log('::add-mask::' + basic);
  const env = { ...process.env, MUSE_REVIEW_USERNAME: 'muse', MUSE_REVIEW_PASSWORD: password, MUSE_REVIEW_SHA: sha };
  delete env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  delete env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const [script, ...args] = scenarios[scenario];
  const result = spawnSync(process.execPath, [require.resolve('./' + script), museReviewOrigin + '/', ...args], {
    stdio: 'inherit', env,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Falló el recorrido ' + scenario);
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
