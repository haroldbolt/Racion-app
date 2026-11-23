/* Chrome + Firebase Auth Emulator + local HTTP billing Worker. Only Stripe Checkout is intercepted. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');
const { seedLegacyDiary, verifyLinkedDiary } = require('./verify-billing-diary.cjs');

async function main() {
  const base = new URL(process.argv[2]);
  assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Use the local billing build');
  const { BillingEngine, TRIAL_DURATION_MS } = await import('../../workers/billing/engine.ts');
  const { handleBilling } = await import('../../workers/billing/http.ts');
  const billingOrigin = 'http://127.0.0.1:4209', emulatorOrigin = 'http://127.0.0.1:9099';
  assert.equal(process.env.VITE_BILLING_API_URL, billingOrigin, 'Build and run the smoke with the loopback billing service');
  assert.equal(process.env.VITE_BILLING_AUTH_EMULATOR_URL, emulatorOrigin, 'Build and run with the official Firebase Auth emulator');
  assert.equal(process.env.VITE_BILLING_FIREBASE_PROJECT_ID, 'demo-racion');
  assert.equal(process.env.VITE_BILLING_FIREBASE_API_KEY, 'fixture-only');
  let now = Date.now(), stage = 'iniciar los servicios locales';
  const accounts = new Map(), sessions = new Map(), payments = new Map();
  const ledger = new Map(), engines = new Map();
  const trace = [];
  function observe(value) { trace.push(value); if (trace.length > 20) trace.shift(); }
  async function identify(token) {
    const response = await fetch(emulatorOrigin + '/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fixture-only', {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({idToken:token}),
      signal:AbortSignal.timeout(10000), redirect:'error',
    });
    observe('Firebase lookup ' + response.status);
    if (!response.ok) throw new Error('Firebase Auth Emulator rejected the session');
    const {users} = await response.json();
    const user = users?.[0];
    if (users?.length !== 1 || typeof user.localId !== 'string' || !user.email?.endsWith('@example.invalid')) {
      throw new Error('Expected exactly one synthetic account in the emulator');
    }
    accounts.set(user.email, user.localId);
    return user.localId;
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
  const server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(new URL(req.url, billingOrigin), {method:req.method, headers:req.headers, body});
      const response = await handleBilling(request, worker, identify);
      observe('Worker ' + request.method + ' ' + new URL(request.url).pathname + ' ' + response.status);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      observe('Error del servidor HTTP: ' + (error?.name || 'Error'));
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  let browser, page;
  try {
    await fetch(emulatorOrigin + '/', {signal:AbortSignal.timeout(5000)});
    server.listen(4209, '127.0.0.1');
    await once(server, 'listening');
    browser = await chromium.launch({channel:'chrome', headless:true});
    const context = await browser.newContext({serviceWorkers:'block', viewport:{width:425, height:840}});
    context.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === emulatorOrigin) observe('Navegador ' + url.pathname + ' ' + response.status());
    });
    context.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin === billingOrigin || url.origin === emulatorOrigin) {
        observe('Falló la red ' + url.origin + url.pathname + ' ' + request.failure()?.errorText);
      }
    });
    // Every request to Firebase and to the billing API travels over real loopback HTTP.
    await context.route('https://checkout.stripe.com/c/pay/cs_test_**', async route => {
      const url = new URL(route.request().url());
      const id = url.pathname.split('/').at(-1);
      assert.ok(sessions.has(id), 'Only the generated test checkout can be opened');
      if (url.searchParams.has('complete')) {
        sessions.get(id).complete = true;
        return route.fulfill({status:302, headers:{Location:base.href + '?billing_session=' + id}});
      }
      return route.fulfill({contentType:'text/html', body:'<a href="?complete=1">Confirmar tarjeta de prueba</a>'});
    });
    page = await context.newPage();
    const button = name => page.getByRole('button', {name, exact:true});
    const heading = name => page.getByRole('heading', {name, exact:true});
    await page.goto(base.href, {waitUntil:'domcontentloaded'});
    await heading('Crea tu cuenta').waitFor();
    assert.equal(await button('Agregar mascota').count(), 0);
    await seedLegacyDiary(page);
    async function register(email) {
      stage = 'registrar la cuenta en Firebase y consultar su estado';
      await page.getByLabel('Correo electrónico').fill(email);
      await page.getByLabel('Contraseña').fill('Solo-prueba-2026');
      await button('Crear cuenta').click();
      await heading('Activa tu prueba').waitFor();
      assert.ok(await button('Registrar tarjeta de prueba').isDisabled());
      await page.getByRole('checkbox').check();
      stage = 'crear Checkout y confirmar la prueba';
      await button('Registrar tarjeta de prueba').click();
      await page.getByRole('link', {name:'Confirmar tarjeta de prueba'}).click();
      await page.getByRole('dialog', {name:'Mi cuenta'}).getByRole('heading', {name:'Prueba activa'}).waitFor();
    }
    const run = randomUUID();
    const first = 'cancel-' + run + '@example.invalid', second = 'pago-' + run + '@example.invalid';
    await register(first);
    await button('Volver a la app').click();
    await button('Vincular mis datos anteriores').click();
    stage = 'verificar factura, inventario, pesajes y recarga';
    await verifyLinkedDiary(page);
    stage = 'cancelar durante la prueba y verificar el saldo';
    await button('Mi cuenta').click();
    await button('Cancelar prueba').click();
    now += TRIAL_DURATION_MS - 1000;
    await button('Confirmar cancelación').click();
    await heading('Prueba cancelada').waitFor();
    now += 2000;
    await engine(accounts.get(first)).run('alarm');
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
    stage = 'verificar un solo cobro el cuarto día y reabrir';
    now += TRIAL_DURATION_MS;
    const uid = accounts.get(second);
    await engine(uid).run('alarm');
    await engine(uid).run('alarm');
    assert.deepEqual([...payments.values()].map(p => [p.uid,p.amountCents,p.currency,p.status]), [[uid,1800,'USD','succeeded']]);
    page = await context.newPage();
    await page.goto(base.href, {waitUntil:'domcontentloaded'});
    await button('Mi cuenta').click();
    await heading('Acceso activo').waitFor();
    assert.equal(await button('Cancelar prueba').count(), 0);
    console.log('Chrome con Firebase Auth Emulator y Worker HTTP local, pagos controlados: registro, vinculación e historial tras recarga, cancelación antes de 72 horas sin cargo, segunda cuenta aislada, un solo pago de 18 USD con la página cerrada y acceso tras reabrir.');
  } catch (error) {
    // Endpoint names, HTTP codes and user-facing alerts help locate a failure without printing tokens or payment URLs.
    const alerts = page && !page.isClosed() ? await page.getByRole('alert').allTextContents().catch(() => []) : [];
    console.error('Etapa:', stage, '\nHTTP:', trace.join(' | '), '\nAvisos:', alerts.slice(0, 2).map(x => x.slice(0, 180)));
    throw error;
  } finally {
    await browser?.close();
    if (server.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
