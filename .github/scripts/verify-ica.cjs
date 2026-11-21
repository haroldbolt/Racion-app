const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

async function verifyRegistry() {
  const site = new URL(process.argv[2]);
  assert.ok(site.protocol === 'https:' || (site.protocol === 'http:' && site.hostname === '127.0.0.1'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    timezoneId: 'America/Bogota', locale: 'es-CO', viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const button = name => page.getByRole('button', { name, exact: typeof name === 'string' });
  const registryPath = '/api/colombia-food-registry';
  const registryRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === registryPath) registryRequests.push(request);
  });

  try {
    await page.goto(site.href, { waitUntil: 'domcontentloaded' });
    await button('Agregar mascota').click();
    await button('🐱 Gato').click();
    await page.getByRole('textbox', { name: 'Ej. Milo' }).fill('Madrigal');
    await page.getByRole('spinbutton', { name: 'Peso Actual (kg)' }).fill('4.5');
    await button('Guardar mascota').click();
    await button('♀ Hembra').click();
    await button(/continuar a condición/i).click();
    await button(/continuar a objetivo/i).click();
    await button(/continuar a alimento/i).click();
    await page.getByRole('textbox', { name: 'Buscar alimentos en internet' }).fill('Mirringo gaticos');
    await button('Buscar en internet').click();

    const registry = page.getByRole('region', { name: 'Registro colombiano de alimentos', exact: true });
    const lookup = registry.getByRole('button', { name: 'Buscar también en el registro del ICA' });
    await lookup.waitFor();
    assert.equal(registryRequests.length, 0);
    const [response] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === registryPath),
      lookup.click(),
    ]);
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-type'] || '', /application\/pdf/i);
    assert.equal((await response.body()).subarray(0, 5).toString(), '%PDF-');
    const documentUrl = new URL(response.headers()['x-ica-source']);
    assert.equal(documentUrl.origin, 'https://www.ica.gov.co');
    assert.match(documentUrl.pathname, /\.pdf(\.aspx)?$/i);

    const formula = 'MIRRINGO GATICOS';
    const entry = registry.getByText(formula, { exact: true }).locator('..');
    await entry.getByText(/ICA\s+11705AL\s*·/i).waitFor();
    const sourceLink = registry.getByRole('link', { name: 'Ver el listado oficial del ICA' });
    assert.equal(await sourceLink.getAttribute('href'), documentUrl.href);
    assert.doesNotMatch(await entry.innerText(), /\$|\bCOP\b|\bkcal\b|g\/día|más barata/i);
    await entry.getByRole('button', { name: 'Completar etiqueta' }).click();
    const label = page.getByRole('dialog', { name: 'Agregar alimento', exact: true });
    assert.equal(await label.getByLabel('Nombre de la fórmula', { exact: true }).inputValue(), formula);
    for (const field of ['Energía metabolizable (kcal/kg)', 'Proteína (%)', 'Tamaño del empaque (kg)']) {
      assert.equal(await label.getByLabel(field, { exact: true }).inputValue(), '');
    }
    console.log(JSON.stringify({
      site:site.origin, food:formula, species:'cat', registration:'11705AL',
      source:documentUrl.href, worker:new URL(response.url()).origin,
      labelPrefilled:true, priceOrNutritionInferred:false,
    }));
  } catch (error) {
    if (!page.isClosed()) console.error((await page.locator('main').innerText({ timeout:3000 }).catch(() => '')).slice(-4000));
    throw error;
  } finally {
    await browser.close();
  }
}

verifyRegistry().catch(error => { console.error(error); process.exitCode = 1; });
