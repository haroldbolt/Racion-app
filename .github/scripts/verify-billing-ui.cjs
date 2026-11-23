/* Local browser integration. The account and Stripe transports below never reach an external service. */
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');
const { seedLegacyDiary, verifyLinkedDiary } = require('./verify-billing-diary.cjs');

async function main() {
  const base = new URL(process.argv[2]);
  assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Use the local billing build');
  const { BillingEngine, TRIAL_DURATION_MS } = await import('../../workers/billing/engine.ts');
  const { handleBilling } = await import('../../workers/billing/http.ts');
  let now = Date.now();
  const accounts = new Map(), identities = new Map(), sessions = new Map(), payments = new Map();
  const ledger = new Map(), engines = new Map();
  const signingKey = randomBytes(32);
  function fixtureToken(uid) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const iat = Math.floor(Date.now() / 1000);
    const message = encode({alg:'HS256'}) + '.' + encode({sub:uid, iat, exp:iat+3600, auth_time:iat, firebase:{sign_in_provider:'password'}});
    return message + '.' + createHmac('sha256', signingKey).update(message).digest('base64url');
  }
  const gateway = {
    async createCheckout({ uid, attemptId }) {
      const id = 'cs_test_' + attemptId.replaceAll('-', '');
      sessions.set(id, {uid, complete:false});
      return {id, url:'https://checkout.stripe.com/c/pay/' + id};
    },
    async getCheckout(id) {
      const session = sessions.get(id);
      return session.complete ? {status:'complete', uid:session.uid, customerId:'cus_' + session.uid, paymentMethodId:'pm_ui'} : {status:'open'};
    },
    async createCharge({uid, customerId, attemptId}) {
      const id = 'pi_' + attemptId;
      if (!payments.has(id)) payments.set(id, {id, uid, customerId, amountCents:1800, currency:'USD', status:'needs_confirmation'});
      return payments.get(id);
    },
    async confirmCharge(id) {
      const payment = payments.get(id);
      assert.equal(payment.status, 'needs_confirmation', 'One capture per purchase');
      payment.status = 'succeeded';
      return payment;
    },
    async getCharge(id) { return payments.get(id); },
  };
  function engine(uid) {
    if (!engines.has(uid)) engines.set(uid, new BillingEngine({
      read:async () => ledger.get(uid),
      save:async record => { ledger.set(uid, structuredClone(record)); },
    }, gateway, () => now));
    return engines.get(uid);
  }
  const worker = {FIREBASE_PROJECT_ID:'demo-racion', STRIPE_SECRET_KEY:'sk_test_browserFixture', ALLOWED_ORIGINS:base.href,
    BILLING_ACCOUNTS:{getByName:uid => ({fetch:async request => {
      const action = new URL(request.url).pathname.slice(1);
      return Response.json(await engine(uid).run(action, await request.json()));
    }})}};
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const context = await browser.newContext({serviceWorkers:'block', viewport:{width:425, height:840}});
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === base.origin) return route.continue();
      const headers = {'access-control-allow-origin':base.origin, 'access-control-allow-methods':'POST, GET, OPTIONS',
        'access-control-allow-headers':req.headers()['access-control-request-headers'] || '*'};
      if (req.method() === 'OPTIONS') return route.fulfill({status:204, headers});
      if (url.hostname === 'identitytoolkit.googleapis.com') {
        const input = req.postDataJSON() || {};
        const name = url.pathname.split(':').at(-1);
        if (name === 'signUp' || name === 'signInWithPassword') {
          assert.ok(input.email.endsWith('@example.invalid'), 'Only synthetic accounts can register');
          if (name === 'signUp') {
            assert.ok(!accounts.has(input.email));
            const uid = randomUUID(), token = fixtureToken(uid);
            accounts.set(input.email, {localId:uid, email:input.email, idToken:token, refreshToken:randomUUID(), expiresIn:'3600'});
            identities.set(token, uid);
          }
          return route.fulfill({headers, json:accounts.get(input.email)});
        }
        if (name === 'lookup') {
          const user = [...accounts.values()].find(item => item.idToken === input.idToken);
          assert.ok(user);
          return route.fulfill({headers, json:{users:[{localId:user.localId, email:user.email, emailVerified:false,
            providerUserInfo:[{providerId:'password', rawId:user.email, email:user.email}]}]}});
        }
        return route.fulfill({headers, status:404, json:{error:{message:'UNSUPPORTED_FIXTURE_AUTH_ROUTE'}}});
      }
      if (url.pathname.startsWith('/api/billing/') && url.hostname.endsWith('.invalid')) {
        const response = await handleBilling(new Request(url, {method:req.method(), headers:{...req.headers(), Origin:base.origin},
          body:req.method() === 'POST' ? req.postData() : undefined}), worker, async token => {
          const uid = identities.get(token);
          assert.ok(uid, 'Each test request must carry the SDK-issued session');
          return uid;
        });
        return route.fulfill({status:response.status, headers:Object.fromEntries(response.headers), body:await response.text()});
      }
      if (url.hostname === 'checkout.stripe.com') {
        const id = url.pathname.split('/').at(-1);
        assert.ok(sessions.has(id), 'Only the intercepted test checkout can be opened');
        if (url.searchParams.has('complete')) {
          sessions.get(id).complete = true;
          return route.fulfill({status:302, headers:{Location:base.href + '?billing_session=' + id}});
        }
        return route.fulfill({contentType:'text/html', body:'<a href="?complete=1">Confirmar tarjeta de prueba</a>'});
      }
      return route.abort();
    });
    let page = await context.newPage();
    const button = name => page.getByRole('button', {name, exact:true});
    const heading = name => page.getByRole('heading', {name, exact:true});
    await page.goto(base.href, {waitUntil:'domcontentloaded'});
    await heading('Crea tu cuenta').waitFor();
    assert.equal(await button('Agregar mascota').count(), 0);
    await seedLegacyDiary(page);
    async function register(email) {
      await page.getByLabel('Correo electrónico').fill(email);
      await page.getByLabel('Contraseña').fill('Solo-prueba-2026');
      await button('Crear cuenta').click();
      await heading('Activa tu prueba').waitFor();
      assert.ok(await button('Registrar tarjeta de prueba').isDisabled());
      await page.getByRole('checkbox').check();
      await button('Registrar tarjeta de prueba').click();
      await page.getByRole('link', {name:'Confirmar tarjeta de prueba'}).click();
      await page.getByRole('dialog', {name:'Mi cuenta'}).getByRole('heading', {name:'Prueba activa'}).waitFor();
    }
    const first = 'cancel@example.invalid', second = 'pago@example.invalid';
    await register(first);
    await button('Volver a la app').click();
    await button('Vincular mis datos anteriores').click();
    await verifyLinkedDiary(page);
    await button('Mi cuenta').click();
    await button('Cancelar prueba').click();
    now += TRIAL_DURATION_MS - 1000;
    await button('Confirmar cancelación').click();
    await heading('Prueba cancelada').waitFor();
    now += 2000;
    await engine(accounts.get(first).localId).run('alarm');
    assert.equal(payments.size, 0);
    await page.reload({waitUntil:'domcontentloaded'});
    await heading('Prueba cancelada').waitFor();
    assert.equal(await button('Progreso').count(), 0);
    await button('Cerrar sesión').click();
    await register(second);
    await button('Volver a la app').click();
    await heading('La rutina de tu mascota').waitFor();
    assert.equal(await page.getByText('Luna de la beta',{exact:true}).count(), 0);
    await page.close();
    now += TRIAL_DURATION_MS;
    const uid = accounts.get(second).localId;
    await engine(uid).run('alarm');
    await engine(uid).run('alarm');
    assert.deepEqual([...payments.values()].map(p => [p.uid,p.amountCents,p.currency,p.status]), [[uid,1800,'USD','succeeded']]);
    page = await context.newPage();
    await page.goto(base.href, {waitUntil:'domcontentloaded'});
    await button('Mi cuenta').click();
    await heading('Acceso activo').waitFor();
    assert.equal(await button('Cancelar prueba').count(), 0);
    console.log('Chrome con transportes controlados: registro, vinculación e historial tras recarga, cancelación antes de 72 horas sin cargo, segunda cuenta aislada, un solo pago de 18 USD con la página cerrada y acceso tras reabrir.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
