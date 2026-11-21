const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

const registryPath = '/api/colombia-food-registry';
const catalogPath = '/api/colombia-foods';
const registration = '11705AL';
const formula = 'MIRRINGO GATICOS';
const dailyGrams = 45;
const times = ['08:00', '14:00', '20:00'];
const guarantees = [
  ['Proteína', '32', 'minimo'], ['Grasa', '12', 'minimo'], ['Fibra cruda', '3.5', 'maximo'],
  ['Humedad', '10', 'maximo'], ['Cenizas', '8', 'maximo'],
];

function cop(amount) {
  const value = new Intl.NumberFormat('es-CO').format(amount).replaceAll('.', '[.\\s]');
  return new RegExp('\\$\\s*' + value + '\\s+COP');
}

function packageName(kg) {
  return 'Elegir ' + (kg < 1 ? (kg * 1000) + ' g' : kg + ' kg');
}

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
  const registryRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === registryPath) registryRequests.push(request);
  });
  try {
    await page.goto(site.href, { waitUntil: 'domcontentloaded' });
    await button('Agregar mascota').click();
    await button('🐱 Gato').click();
    await page.getByRole('textbox', { name: 'Ej. Milo' }).fill('Madrigal');
    await page.getByRole('spinbutton', { name: 'Peso Actual (kg)' }).fill('2.5');
    await button('Guardar mascota').click();
    await button('♀ Hembra').click();
    await page.getByRole('spinbutton', { name: 'Edad aproximada (años)', exact: true }).fill('0.5');
    await button(/continuar a condición/i).click();
    await button(/continuar a objetivo/i).click();
    await button(/crecimiento \(cachorro o gatito\)/i).click();
    await button(/continuar a alimento/i).click();

    // Start with the ICA number. Only the registry can supply the commercial name.
    await page.getByRole('textbox', { name: 'Buscar alimentos en internet' }).fill(registration);
    await button('Buscar en internet').click();
    const registry = page.getByRole('region', { name: 'Registro colombiano de alimentos', exact: true });
    const lookup = registry.getByRole('button', { name: 'Buscar también en el registro del ICA' });
    await lookup.waitFor();
    assert.equal(registryRequests.length, 0);
    const [pdf, market, nutritionResponse] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === registryPath),
      page.waitForResponse(r => {
        const url = new URL(r.url());
        return url.pathname === catalogPath && url.searchParams.get('q')?.trim().toUpperCase() === formula &&
          url.searchParams.get('species') === 'cat';
      }, { timeout: 60000 }),
      page.waitForResponse(r => {
        const url = new URL(r.url());
        return url.pathname === '/api/registry-nutrition' && url.searchParams.get('registration') === registration &&
          url.searchParams.get('species') === 'cat';
      }, { timeout: 60000 }),
      lookup.click(),
    ]);
    assert.equal(pdf.status(), 200);
    assert.match(pdf.headers()['content-type'] || '', /application\/pdf/i);
    assert.equal((await pdf.body()).subarray(0, 5).toString(), '%PDF-');
    const officialPdf = new URL(pdf.headers()['x-ica-source']);
    assert.equal(officialPdf.origin, 'https://www.ica.gov.co');
    assert.match(officialPdf.pathname, /\.pdf(\.aspx)?$/i);
    await registry.getByText(formula, { exact: true }).first().waitFor();
    await registry.getByText(/ICA\s+11705AL\s*·/i).first().waitFor();
    const sourceLink = registry.getByRole('link', { name: 'Ver el listado oficial del ICA' });
    assert.equal(await sourceLink.getAttribute('href'), officialPdf.href);
    // The ICA record alone pre-fills identity and leaves unverified fields blank.
    await registry.getByRole('button', { name: 'Completar etiqueta', exact: true }).click();
    const manual = page.getByRole('dialog', { name: 'Agregar alimento', exact: true });
    assert.equal(await manual.getByLabel('Nombre de la fórmula', { exact: true }).inputValue(), formula);
    for (const field of ['Energía metabolizable (kcal/kg)', 'Proteína (%)', 'Tamaño del empaque (kg)']) {
      assert.equal(await manual.getByLabel(field, { exact: true }).inputValue(), '');
    }
    await manual.getByRole('button', { name: 'Cerrar', exact: true }).click();

    assert.equal(market.status(), 200);
    const payload = await market.json();
    assert.equal(nutritionResponse.status(), 200);
    const { food: manufacturer } = await nutritionResponse.json();
    const labelSource = new URL(manufacturer.fichaNutricional.fuenteUrl);
    assert.equal(labelSource.href, 'https://www.mirringo.com.co/nuestros-productos/mirringo-gaticos');
    const guideSource = new URL(manufacturer.feedingGuide.sourceUrl);
    assert.equal(guideSource.hostname, 'www.mizooco.com');
    assert.match(guideSource.pathname, /Tabla-de-suministros-mirringo-gaticos/i);
    const offers = page.getByRole('region', { name: 'Ofertas y nutrientes del registro ICA 11705AL', exact: true });
    await offers.getByRole('article').first().waitFor({ timeout: 60000 });
    const exactListings = payload.foods.filter(row => row.species === 'cat' &&
      /\bmirringo\b/i.test(row.brand + ' ' + row.name) && /\bgati[ct]os?\b/i.test(row.name) &&
      !/\b(?:adultos?|esterilizados?|arena|combo)\b/i.test(row.name));
    let chosen;
    // Use the price and size of a SKU the Worker really returned and the UI actually offered.
    for (const row of exactListings) {
      const article = offers.getByRole('article').filter({ has: page.getByRole('link', { name: 'Ver producto original', exact: true })
        .and(page.locator('a[href=' + JSON.stringify(row.productUrl) + ']')) });
      if (await article.count() !== 1) continue;
      for (const sku of row.presentations) {
        if (!(sku.priceCop > 0 && sku.packageKg > 0)) continue;
        const choose = article.getByRole('button', { name: packageName(sku.packageKg), exact: true });
        if (await choose.count() !== 1) continue;
        assert.match(await choose.locator('..').innerText(), cop(sku.priceCop));
        chosen = { article, choose, sku, row };
        break;
      }
      if (chosen) break;
    }
    assert.ok(chosen, 'The ICA lookup must offer an exact Mirringo Gaticos SKU with weight and a current COP price');
    const { article, choose, sku, row } = chosen;
    await article.getByText('Fuente: ' + row.retailer, { exact: true }).waitFor();
    for (const [field] of guarantees) {
      const declaration = article.getByText(field, { exact: true }).locator('..');
      assert.equal(await declaration.locator('details a').first().getAttribute('href'), labelSource.href);
    }
    await choose.click();
    const label = page.getByRole('dialog', { name: 'Revisar etiqueta', exact: true });
    const reviewButton = button('Contrastar con mi etiqueta');
    await label.or(reviewButton).first().waitFor();
    const needsConfirmation = await label.isVisible();
    if (!needsConfirmation) await reviewButton.click();
    for (const [field, value, qualifier] of guarantees) {
      assert.equal(await label.getByLabel(field + ' (%)', { exact: true }).inputValue(), value);
      assert.equal(await label.getByLabel('Declaración de ' + field.toLowerCase(), { exact: true }).inputValue(), qualifier);
    }
    assert.equal(await label.getByLabel('Energía metabolizable (kcal/kg)', { exact: true }).inputValue(), '');
    assert.equal(await label.getByLabel('Carbohidratos (%)', { exact: true }).inputValue(), '');
    assert.equal(await label.getByLabel('Tamaño del empaque (kg)', { exact: true }).inputValue(), String(sku.packageKg));
    await label.getByRole('button', { name: needsConfirmation ? 'Guardar ficha' : 'Cerrar', exact: true }).click();

    const gramsField = page.getByRole('spinbutton', { name: 'Gramos diarios elegidos de la tabla', exact: true });
    await gramsField.waitFor();
    assert.equal(await gramsField.locator('xpath=ancestor::section[1]').getByRole('link').getAttribute('href'), guideSource.href);
    assert.equal(await gramsField.getAttribute('min'), '25');
    assert.equal(await gramsField.getAttribute('max'), '55');
    await gramsField.fill(String(dailyGrams));
    await button(/continuar a comidas/i).click();
    await button(/^3\s*tomas$/i).click();
    for (const [index, time] of times.entries()) {
      await page.getByLabel('Hora de la toma ' + (index + 1), { exact: true }).fill(time);
    }
    await button(/ver su plan nutricional/i).click();
    await page.getByText(dailyGrams + ' g', { exact: true }).waitFor();
    const portionGrams = dailyGrams / times.length;
    for (const time of times) {
      const portion = page.getByRole('listitem').filter({ hasText: ' · ' + time });
      await portion.getByText(portionGrams + ' g', { exact: true }).waitFor();
    }
    await button('Guardar este plan').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const ring = page.getByRole('region', { name: 'Progreso diario de Madrigal', exact: true });
    await ring.getByText('Ración diaria: ' + dailyGrams + ' g', { exact: true }).waitFor();
    await ring.getByText('Calorías pendientes', { exact: true }).waitFor();
    const costs = page.getByRole('region', { name: 'Costo de su ración', exact: true });
    const dailyCop = Math.round(sku.priceCop * dailyGrams / (sku.packageKg * 1000));
    const mealCop = Math.round(sku.priceCop * portionGrams / (sku.packageKg * 1000));
    await costs.getByText(cop(dailyCop)).waitFor();
    for (const time of times) {
      await costs.getByRole('listitem').filter({ hasText: ' · ' + time }).getByText(cop(mealCop)).waitFor();
    }
    console.log(JSON.stringify({ site: site.origin, food: formula, species: 'cat', registration,
      registryPdf: officialPdf.href, nutritionSource: labelSource.href, feedingGuide: guideSource.href,
      store: row.retailer, storeUrl: row.productUrl, skuUrl: sku.sourceUrl, offerObservedAt: row.observedAt,
      packageKg: sku.packageKg, priceCop: sku.priceCop, ageMonths: 6, weightKg: 2.5,
      proteinMin: 32, fatMin: 12, fibreMax: 3.5, ashMax: 8, moistureMax: 10, kcalKg: null,
      publishedRange: [25, 55], confirmedDailyGrams: dailyGrams, servings: times.length, portionGrams,
      dailyCop, mealCop, persistedAfterReload: true }));
  } catch (error) {
    if (!page.isClosed()) console.error((await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')).slice(-4900));
    throw error;
  } finally {
    await browser.close();
  }
}

verifyRegistry().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
