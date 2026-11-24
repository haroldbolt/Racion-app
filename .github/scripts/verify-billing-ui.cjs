/* Chrome upgrades the original anonymous PWA at the same address. All accounts, notifications and payments are local fixtures. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { resolve } = require('node:path');
const express = require('express');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');
const { seedLegacyDiary, recordMealInPreviousBeta, verifyLinkedDiary } = require('./verify-billing-diary.cjs');
const { billing, checkout, emulator, key, project, startBillingFixture, notify, verifyEmail, resetPassword } = require('./hotmart-worker-fixture.cjs');
const { checkOffer } = require('./verify-public-access.cjs');

async function updateInstalledApp(page) {
  // Ask the browser to check for the newly served service worker, as it would on a later visit.
  // Wait for the new one to activate, retaining browser caches, IndexedDB and localStorage.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const previous = navigator.serviceWorker.controller;
    if (!previous) throw new Error('The previous PWA must control this page before the update');
    const change = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The updated PWA did not take over')), 35000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, {once:true});
    });
    await Promise.all([change, registration.update()]);
  });
  await page.reload({waitUntil:'domcontentloaded'});
}

async function main() {
  const [previousDist, commercialDist] = process.argv.slice(2);
  assert.ok(previousDist && commercialDist, 'Provide the previous public beta and commercial build directories');
  assert.equal(process.env.VITE_BILLING_API_URL, billing);
  assert.equal(process.env.VITE_BILLING_AUTH_EMULATOR_URL, emulator);
  assert.equal(process.env.VITE_BILLING_FIREBASE_PROJECT_ID, project);
  assert.equal(process.env.VITE_BILLING_FIREBASE_API_KEY, key);
  const appOrigin = 'http://127.0.0.1:4198';
  const app = express();
  let serve = express.static(resolve(previousDist), {etag:false,lastModified:false,maxAge:0});
  app.use((req, res, next) => serve(req,res,next));
  const server = app.listen(4198, '127.0.0.1');
  let worker, browser, page;
  let stage = 'abrir la beta anterior';
  try {
    await once(server, 'listening');
    worker = await startBillingFixture(appOrigin);
    browser = await chromium.launch({channel:'chrome',headless:true});
    const context = await browser.newContext({locale:'es-CO',timezoneId:'America/Bogota',viewport:{width:425,height:840}});
    page = await context.newPage();
    page.setDefaultTimeout(18000);
    const button = name => page.getByRole('button',{name,exact:true});
    const heading = name => page.getByRole('heading',{name,exact:true});
    await page.goto(appOrigin, {waitUntil:'domcontentloaded'});
    await button('Agregar mascota').waitFor();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, {timeout:30000});
    await seedLegacyDiary(page);
    const originalMeal = await recordMealInPreviousBeta(page);
    assert.ok(originalMeal, 'The previous beta must save the meal with an ID');

    stage = 'actualizar la PWA instalada conservando el perfil del navegador';
    serve = express.static(resolve(commercialDist), {etag:false,lastModified:false,maxAge:0});
    await updateInstalledApp(page);
    assert.equal(await checkOffer(page), checkout);
    const legacyMeal = () => page.evaluate(id => JSON.parse(localStorage.getItem('racion_meal_logs_v1')).some(meal => meal.id === id), originalMeal);
    assert.ok(await legacyMeal(), 'The payment gate must preserve pre-existing meals');
    // A click is intercepted only at the test checkout. The signed event is delivered separately.
    stage = 'abrir la página de pago controlada de Hotmart';
    let visits = 0;
    await context.route('https://pay.hotmart.com/**', async route => {
      assert.equal(route.request().url(), checkout);
      visits++;
      await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><h1>Checkout de prueba Hotmart</h1><p>25 USD</p>'});
    });
    const purchase = page.getByRole('link',{name:'Comprar',exact:true});
    let checkoutPage = page;
    try {
      if (await purchase.getAttribute('target') === '_blank') {
        [checkoutPage] = await Promise.all([page.waitForEvent('popup'),purchase.click()]);
      } else {
        await purchase.click();
      }
      await checkoutPage.waitForURL(checkout);
      await checkoutPage.getByRole('heading', {name:'Checkout de prueba Hotmart',exact:true}).waitFor();
      assert.equal(visits, 1, 'Only the intercepted test checkout should receive the browser navigation');
    } catch (error) {
      console.error('Checkout de prueba:', {origin:new URL(checkoutPage.url()).origin, visits});
      throw error;
    } finally { if (checkoutPage !== page) await checkoutPage.close(); }
    await page.goto(appOrigin + '/?purchase=approved',{waitUntil:'domcontentloaded'});
    await checkOffer(page);

    const run = randomUUID().replaceAll('-', '');
    const buyer = 'luna-' + run + '@example.invalid';
    const other = 'rocky-' + run + '@example.invalid';
    const password = 'Casa-fixture-2026';
    const transaction = 'HP' + Date.now() + '1';
    async function createAndVerify(email) {
      await button('Ya compré').click();
      await button('Crear mi acceso').click();
      await page.getByLabel('Correo electrónico',{exact:true}).fill(email);
      await page.getByLabel('Contraseña',{exact:true}).fill(password);
      await button('Crear cuenta').click();
      await heading('Verifica tu correo').waitFor();
      assert.equal(await button('Hoy').count(), 0);
      await verifyEmail(email);
      await button('Ya verifiqué mi correo').click();
    }
    stage = 'verificar que una compra pendiente conserva cerrado el diario';
    await notify(buyer,transaction,'PURCHASE_DELAYED','DELAYED');
    await createAndVerify(buyer);
    await heading('Pago pendiente').waitFor();
    assert.equal(await button('Hoy').count(), 0);
    assert.ok(await legacyMeal());

    stage = 'confirmar el pago único y vincular el diario anterior';
    await notify(buyer,transaction,'PURCHASE_APPROVED','APPROVED');
    await button('Actualizar estado').click();
    await button('Vincular mis datos anteriores').click();
    await verifyLinkedDiary(page);

    stage = 'comprobar aislamiento entre compradores que comparten navegador';
    await button('Mi cuenta').click();
    await button('Cerrar sesión').click();
    await notify(other,transaction + '2','PURCHASE_APPROVED','APPROVED');
    await createAndVerify(other);
    await button('Agregar mascota').waitFor();
    assert.equal(await page.getByText('Luna de la beta',{exact:true}).count(), 0);
    assert.equal(await page.getByText('Rocky',{exact:true}).count(), 0);
    await button('Mi cuenta').click();
    await button('Cerrar sesión').click();
    stage = 'recuperar el acceso del comprador y volver a encontrar su historial';
    await button('Ya compré').click();
    await button('Olvidé mi contraseña').click();
    await page.getByLabel('Correo electrónico',{exact:true}).fill(buyer);
    await button('Enviar enlace').click();
    await page.getByText(/recibirás un enlace para recuperar tu contraseña/).waitFor();
    const recoveredPassword = password + '-recuperada';
    await resetPassword(buyer, recoveredPassword);
    await button('Volver a ingresar').click();
    await page.getByLabel('Correo electrónico',{exact:true}).fill(buyer);
    await page.getByLabel('Contraseña',{exact:true}).fill(recoveredPassword);
    await button('Ingresar').click();
    await page.locator('header').getByText('Luna de la beta',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Progreso',exact:true}).click();
    await page.getByText('Control previo a R0',{exact:true}).waitFor();
    stage = 'aplicar reembolso y conservar los datos locales';
    await notify(buyer,transaction,'PURCHASE_REFUNDED','REFUNDED');
    await page.reload({waitUntil:'domcontentloaded'});
    await heading('Acceso retirado').waitFor();
    assert.equal(await button('Hoy').count(), 0);
    assert.ok(await legacyMeal());
    console.log(JSON.stringify({origin:appOrigin, previousRelease:'c4a1beed', upgradedInstalledPwa:true,
      identity:'Firebase Auth Emulator', providerEvents:'Hotmart v2 synthetic', oneTimeUsd:25, moneyMoved:false,
      pets:['Rocky','Luna de la beta'], weightsPerPet:2, legacyMealPersisted:true, receiptPhotoPersisted:true,
      receiptCostPerMealCop:4500, sharedStockGrams:[10000,9900,10000], isolatedBuyers:true, purchaseRecovered:true, refundRevokedAccess:true}));
  } catch (error) {
    const alerts = await page?.getByRole('alert').allTextContents().catch(() => []);
    console.error('Etapa:',stage, 'Avisos:',alerts);
    throw error;
  } finally {
    await browser?.close();
    await worker?.dispose();
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
