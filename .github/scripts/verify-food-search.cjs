const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

const { merchantOrigin, searchQuery, formulaName, formula, installMerchantFixtures } = require('./laia-food-fixture.cjs');

async function waitForSite(url) {
  let failure;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok && (await response.text()).includes('<title>Ración App</title>')) return;
      failure = new Error(`Unexpected site response: HTTP ${response.status}`);
    } catch (error) {
      failure = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw failure;
}

const cop = (amount) => new RegExp(`^\\$\\s*${new Intl.NumberFormat('es-CO').format(amount).replaceAll('.', '[.\\s]')}\\s+COP$`);

async function expectMealCosts(region, dailyCost, mealCost) {
  await region.getByText(cop(dailyCost)).waitFor();
  for (const [index, time] of [[1, '08:30'], [2, '19:30']]) {
    const meal = region.getByRole('listitem').filter({ hasText: `Toma ${index} · ${time}` });
    await meal.getByText(cop(mealCost)).waitFor();
  }
  assert.match(await region.innerText(), /Un empaque rinde ~37(?:[.,]0)? días/);
}

// Keep catalog and comparator responses separate: choosing a food never spends a price
// lookup, and selecting a quote must use the formula and presentation in the saved plan.
async function verifyFoodPriceCoherence(page, button) {
  let priceCalls = 0;
  await page.route('https://prices.example.invalid/api/live-prices', async (route) => {
    const headers = {
      'access-control-allow-origin': new URL(page.url()).origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    assert.equal(route.request().method(), 'POST');
    const body = route.request().postDataJSON();
    assert.deepEqual(body, {
      city: 'Bogotá',
      product: { brand: 'Royal Canin', name: formulaName, grams: 2000 },
    });
    priceCalls++;
    await route.fulfill({
      status: 200,
      headers,
      json: {
        status: 'current', city: 'Bogotá', queriedAt: new Date().toISOString(), cheapestOfferId: 'royal-2kg',
        offers: [{
          id: 'royal-2kg', retailer: 'Tienda de prueba', title: `${formula} 2 kg`, grams: 2000,
          productPriceCop: 120000, shippingCop: 10000, totalCop: 130000, pricePerKgCop: 60000,
          productUrl: 'https://tienda.example/royal-canin-2kg', stock: 'available',
        }],
      },
    });
  });

  await button('+ Mascota').click();
  await button('🐱 Gato').click();
  await page.getByRole('textbox', { name: 'Ej. Milo' }).fill('Nube');
  await page.getByRole('spinbutton', { name: 'Peso Actual (kg)' }).fill('4.3');
  await button('Guardar mascota').click();
  await button('♀ Hembra').click();
  await button(/continuar a condición/i).click();
  await button(/continuar a objetivo/i).click();
  await button(/continuar a alimento/i).click();
  assert.equal(await button('Internet').getAttribute('aria-pressed'), 'true');
  await page.getByRole('textbox', { name: 'Buscar alimentos en internet', exact: true }).fill(searchQuery);
  await button('Buscar en internet').click();
  const product = page.getByRole('region', { name: 'Resultados de internet' })
    .getByRole('article', { name: formula, exact: true });
  await product.getByRole('button', { name: 'Elegir 2 kg', exact: true }).click();
  const label = page.getByRole('dialog', { name: 'Revisar etiqueta', exact: true });
  assert.equal(await label.getByLabel('Tamaño del empaque (kg)', { exact: true }).inputValue(), '2');
  const energy = label.getByLabel('Energía metabolizable (kcal/kg)', { exact: true });
  assert.equal(await energy.inputValue(), '', 'Merchant marketing must never supply inferred nutrition');
  await energy.fill('4000');
  await label.getByRole('checkbox', { name: /declara alimento completo y balanceado/i }).check();
  await label.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
  await page.getByRole('spinbutton').nth(0).fill('2');
  await page.getByRole('spinbutton').nth(1).fill('15');
  await button(/continuar a comidas/i).click();
  await page.getByLabel('Hora de la toma 1', { exact: true }).fill('08:30');
  await page.getByLabel('Hora de la toma 2', { exact: true }).fill('19:30');
  await button(/ver su plan nutricional/i).click();
  await page.getByText('54 g', { exact: true }).waitFor();
  assert.equal(await page.getByText('27 g', { exact: true }).count(), 2);
  await button('Guardar este plan').click();
  const todayCost = page.getByRole('region', { name: 'Costo de su ración', exact: true });
  await expectMealCosts(todayCost, 3699, 1850);
  assert.equal(priceCalls, 0, 'Saving the merchant price must not run a comparator search');

  await button('Alimentos').click();
  await button('Gastos ($ COP)').click();
  const expenseCost = page.getByRole('region', { name: 'Costo de la ración', exact: true });
  await expectMealCosts(expenseCost, 3699, 1850);
  assert.match(await expenseCost.innerText(), /68[.\s]500\s+COP\s*\/ kg/);
  await button('Hoy').click();

  for (const [choice, dailyCost, mealCost] of [
    ['Usar precio del producto', 3240, 1620],
    ['Usar total con envío', 3510, 1755],
  ]) {
    const before = priceCalls;
    await button(/comparar precios|ver precios/i).first().click();
    await page.getByRole('heading', { name: 'Comparar precios', exact: true }).waitFor();
    await page.getByText(formulaName, { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Presentación (kg)', { exact: true }).inputValue(), '2');
    assert.equal(priceCalls, before, 'Opening the comparison must not spend a lookup');
    await button('Consultar precios').click();
    const offer = page.getByRole('region', { name: 'Resultado de precios' }).getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Tienda de prueba', exact: true }) });
    await offer.getByRole('button', { name: choice, exact: true }).click();
    await button('Aplicar a Nube').click();
    await expectMealCosts(todayCost, dailyCost, mealCost);
    assert.equal(priceCalls, before + 1);
    await page.getByText('Ración diaria: 54 g', { exact: true }).waitFor();
  }

  await todayCost.getByRole('button', { name: 'Registrar compra o factura', exact: true }).click();
  const expensesDialog = page.getByRole('dialog', { name: 'Gastos de alimentación', exact: true });
  const purchasedFood = expensesDialog.getByLabel('Alimento de la compra', { exact: true });
  assert.equal(await purchasedFood.locator('option:checked').innerText(), formula);
  assert.equal(await expensesDialog.getByLabel('Peso de cada empaque', { exact: true }).inputValue(), '2');
  await expensesDialog.getByLabel('Leer factura (foto o PDF)', { exact: true }).setInputFiles({
    name: 'recibo-de-prueba.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'),
  });
  await expensesDialog.getByRole('img', { name: 'Factura adjunta', exact: true }).waitFor();
  const cancelReading = expensesDialog.getByRole('button', { name: 'Cancelar lectura', exact: true });
  if (await cancelReading.isVisible()) await cancelReading.click();
  await expensesDialog.getByLabel('Peso de cada empaque', { exact: true }).fill('2');
  await expensesDialog.getByLabel('Unidad del peso', { exact: true }).selectOption('kg');
  await expensesDialog.getByLabel('Cantidad de empaques', { exact: true }).fill('1');
  await expensesDialog.getByLabel('Importe total de este alimento (COP)', { exact: true }).fill('140.000');
  await expensesDialog.getByLabel('Fecha de compra', { exact: true }).fill(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  );
  await expensesDialog.getByLabel('Tienda (opcional)', { exact: true }).fill('Factura de Nube');
  await expensesDialog.getByRole('checkbox', { name: 'Confirmo el importe y el peso de este alimento', exact: true }).check();
  await expensesDialog.getByRole('button', { name: 'Guardar compra', exact: true }).click();
  await expectMealCosts(expensesDialog.getByRole('region', { name: 'Costo de la ración', exact: true }), 3780, 1890);
  await expensesDialog.getByRole('link', { name: /Ver recibo/ }).waitFor();
  await expensesDialog.getByRole('button', { name: 'Cerrar gastos', exact: true }).click();
  await expectMealCosts(todayCost, 3780, 1890);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Ración diaria: 54 g', { exact: true }).waitFor();
  await expectMealCosts(todayCost, 3780, 1890);
  await button('Alimentos').click();
  await button('Gastos ($ COP)').click();
  await expectMealCosts(expenseCost, 3780, 1890);
  assert.match(await expenseCost.innerText(), /70[.\s]000\s+COP\s*\/ kg/);
  const receipt = page.getByRole('region', { name: 'Gastos de alimentación', exact: true }).getByRole('article')
    .filter({ hasText: 'Factura de Nube' });
  await receipt.getByRole('heading', { name: formula, exact: true }).waitFor();
  assert.match(await receipt.innerText(), /2 kg/);
  assert.match(await receipt.innerText(), /140[.\s]000\s+COP/);
  assert.match(await receipt.getByRole('link', { name: /Ver recibo/ }).getAttribute('href'), /^data:image\/jpeg;base64,/);
  await receipt.getByRole('img', { name: 'Factura de esta compra', exact: true }).waitFor();

  await button(/🐱\s*Bruma/).click();
  await button('Hoy').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText(/^Faltan las kcal\/kg de /).waitFor();
  await page.getByRole('button', { name: 'Buscar ficha', exact: true }).waitFor();
  await page.getByRole('region', { name: 'Progreso diario de Bruma' }).getByText('Calorías pendientes').waitFor();
  assert.equal(await todayCost.count(), 0, 'Another pet must not inherit Nube’s ration or cost');
  await button('Revisar etiqueta').first().click();
  const brumaLabel = page.getByRole('dialog', { name: 'Revisar etiqueta', exact: true });
  assert.equal(await brumaLabel.getByLabel('Tamaño del empaque (kg)', { exact: true }).inputValue(), '0.4');
  assert.equal(await brumaLabel.getByLabel('Energía metabolizable (kcal/kg)', { exact: true }).inputValue(), '');
  await brumaLabel.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await button('Alimentos').click();
  await button('Gastos ($ COP)').click();
  await page.getByText('Aún no hay compras registradas para esta mascota.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: /Ver recibo/ }).count(), 0);
  await button(/🐱\s*Nube/).click();
  await button('Hoy').click();
  await expectMealCosts(todayCost, 3780, 1890);
  assert.equal(priceCalls, 2, 'Reloads and pet switches must not spend additional price lookups');
  console.log('Coherencia de alimentos: RC37 de 2 kg, energía manual, costos por toma, precio con y sin envío, factura adjunta persistente y otra mascota aislada verificados.');
}

async function verifyFoodSearch() {
  const url = new URL(process.argv[2]);
  const usingFixtures = process.argv.includes('--fixtures');
  assert.equal(url.protocol, usingFixtures ? 'http:' : 'https:');
  if (usingFixtures) assert.equal(url.hostname, '127.0.0.1');
  if (process.env.GITHUB_SHA) url.searchParams.set('food-check', process.env.GITHUB_SHA);
  await waitForSite(url);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({
      locale: 'es-CO',
      timezoneId: 'America/Bogota',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    });
    page.setDefaultTimeout(15000);
    const fixture = usingFixtures ? await installMerchantFixtures(page) : null;
    const merchantRequests = [];
    const unexpectedProviderRequests = [];
    page.on('request', (request) => {
      const destination = new URL(request.url());
      if (destination.origin === merchantOrigin) merchantRequests.push(request);
      if (destination.hostname === 'serpapi.com' || destination.pathname === '/api/live-prices') {
        unexpectedProviderRequests.push(request.url());
      }
    });
    const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });

    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await button('Agregar mascota').click();
    await button('🐱 Gato').click();
    await page.getByRole('textbox', { name: 'Ej. Milo' }).fill('Bruma');
    await page.getByRole('spinbutton', { name: 'Peso Actual (kg)' }).fill('4.3');
    await button('Guardar mascota').click();
    await button('♀ Hembra').click();
    await button(/continuar a condición/i).click();
    await button(/continuar a objetivo/i).click();
    await button(/continuar a alimento/i).click();

    assert.equal(await button('Catálogo guardado').count(), 0);
    assert.equal(await button('Internet').getAttribute('aria-pressed'), 'true');
    assert.equal(merchantRequests.length, 0, 'Opening Internet must not submit a search');
    const queryInput = page.getByRole('textbox', { name: 'Buscar alimentos en internet', exact: true });
    await queryInput.fill(searchQuery);
    assert.equal(merchantRequests.length, 0, 'Typing alone must not submit an online search');
    await button('Buscar en internet').click();

    const results = page.getByRole('region', { name: 'Resultados de internet' });
    const product = results.getByRole('article').filter({
      has: page.getByRole('heading', { name: /Royal Canin Sterilised 37 Concentrado para Gatos Adultos/i }),
    });
    await product.waitFor({ timeout: 45000 });
    await product.getByText('Fuente: Laia Pets', { exact: true }).waitFor();
    for (const size of ['400 g', '2 kg', '4 kg', '10 kg']) {
      await product.getByRole('button', { name: `Elegir ${size}`, exact: true }).waitFor();
    }
    assert.ok(merchantRequests.length > 0, 'The explicit search must retrieve the external catalog');
    const searches = merchantRequests.filter((request) => new URL(request.url()).pathname.endsWith('/search/products'));
    assert.equal(searches.length, 1);
    assert.equal(new URL(searches[0].url()).searchParams.get('q'), searchQuery);

    if (usingFixtures) {
      const callsBeforeTyping = merchantRequests.length;
      await queryInput.fill('Purina Pro Plan');
      assert.equal(await page.getByRole('button', { name: 'Elegir 400 g', exact: true }).count(), 0,
        'Results for the previous query must be invalidated');
      assert.equal(merchantRequests.length, callsBeforeTyping);
      fixture.unavailable = true;
      await button('Buscar en internet').click();
      await page.getByRole('alert').waitFor();
      assert.ok(merchantRequests.length > callsBeforeTyping);
      await button('Mis alimentos').click();
      await button(/agregar alimento/i).click();
      const offlineLabel = page.getByRole('dialog', { name: 'Agregar alimento', exact: true });
      await offlineLabel.getByLabel('Marca', { exact: true }).waitFor();
      await offlineLabel.getByRole('button', { name: 'Cerrar', exact: true }).click();
      fixture.unavailable = false;
      await button('Internet').click();
      await queryInput.fill(searchQuery);
      await button('Buscar en internet').click();
    }
    await product.getByRole('button', { name: 'Elegir 400 g', exact: true }).click();

    const label = page.getByRole('dialog', { name: /Agregar alimento|Revisar etiqueta/ });
    const packageInput = label.getByLabel('Tamaño del empaque (kg)', { exact: true });
    await packageInput.waitFor();
    assert.equal(await packageInput.inputValue(), '0.4');
    for (const field of ['Energía metabolizable (kcal/kg)', 'Proteína (%)', 'Grasa (%)', 'Fibra cruda (%)']) {
      assert.equal(await label.getByLabel(field, { exact: true }).inputValue(), '', `${field} must stay undeclared`);
    }
    await label.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    await button(/continuar a comidas/i).click();
    await button(/ver su plan nutricional/i).click();
    await page.getByRole('heading', { name: 'Hace falta la energía de la etiqueta', exact: true }).waitFor();
    assert.equal(await button('Guardar este plan').count(), 0, 'An undeclared energy value must not produce a gram ration');
    await button('Guardar horario para el diario').click();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await button('Alimentos').click();
    await button('Mis alimentos').click();
    const pendingFood = page.getByRole('article', { name: formula, exact: true });
    await pendingFood.getByRole('heading', { name: formulaName, exact: true }).waitFor();
    await pendingFood.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const savedLabel = page.getByRole('dialog', { name: 'Revisar etiqueta', exact: true });
    assert.equal(await savedLabel.getByLabel('Tamaño del empaque (kg)', { exact: true }).inputValue(), '0.4');
    assert.equal(await savedLabel.getByLabel('Energía metabolizable (kcal/kg)', { exact: true }).inputValue(), '');
    await savedLabel.getByRole('button', { name: 'Cerrar', exact: true }).click();

    assert.deepEqual(unexpectedProviderRequests, [], 'Food catalog lookup must not request price searches');
    if (usingFixtures) await verifyFoodPriceCoherence(page, button);
    console.log(`Chrome ${usingFixtures ? 'con respuestas controladas' : 'público con catálogo de Laia Pets'}: búsqueda explícita, cuatro presentaciones, 400 g guardados y energía pendiente conservados al recargar.`);
  } finally {
    await browser.close();
  }
}

verifyFoodSearch().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
