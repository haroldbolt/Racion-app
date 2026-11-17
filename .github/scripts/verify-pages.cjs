const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

async function waitForPages(url) {
  let failure;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok && (await response.text()).includes('<title>Ración App</title>')) return;
      failure = new Error(`Unexpected Pages response: HTTP ${response.status}`);
    } catch (error) {
      failure = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw failure;
}

async function verifyAdjustmentAndPrices(page, button, text) {
  let calls = 0;
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
    const { city, product, postalCode } = route.request().postDataJSON();
    assert.deepEqual(product, { brand: 'Marca de prueba', name: 'Seco de prueba', grams: 2000 });
    calls++;
    if (city !== 'Bogotá') assert.equal(postalCode, undefined);

    const offer = (id, retailer, grams, productPriceCop, shippingCop) => ({
      id, title: `Marca de prueba Seco de prueba ${grams / 1000} kg`,
      retailer, grams, productPriceCop, shippingCop,
      totalCop: shippingCop === null ? null : productPriceCop + shippingCop,
      pricePerKgCop: productPriceCop * 1000 / grams,
      productUrl: `https://tienda-${id}.example/producto`,
      stock: 'available',
    });
    const offers = [
      offer('a', 'Tienda A', 2000, 90000, 18000),
      offer('b', 'Tienda B', 2000, 99000, 0),
      offer('c', 'Tienda C', 2000, 82000, null),
      offer('d', 'Tienda D', 4000, 160000, 0),
    ];
    if (postalCode) {
      assert.equal(city, 'Bogotá');
      assert.equal(postalCode, '110111');
      offers[1] = { ...offer('b', 'Tienda B', 2000, 99000, 15650), shippingPostalCode: postalCode };
    }
    const response = city === 'Bogotá'
      ? { status: 'current', city, queriedAt: new Date().toISOString(), offers, cheapestOfferId: 'b' }
      : city === 'Medellín'
        ? { status: 'stale', city, queriedAt: new Date(Date.now() - 86400000).toISOString(), offers, cheapestOfferId: null, reason: 'upstream_unavailable' }
        : { status: 'unavailable', city, queriedAt: null, offers: [], cheapestOfferId: null, reason: 'quota_exhausted' };
    await route.fulfill({ status: 200, headers, json: response });
  });

  await button('Cerrar').click();
  await button('Hoy').click();
  await button(/ajustar (la )?ración/i).first().click();
  const editor = page.getByRole('dialog', { name: /ajustar (la )?ración/i });
  await editor.getByLabel(/kcal\/kg/i).fill('4000');
  await editor.getByLabel('Hora de la toma 1').fill('09:00');
  await editor.getByLabel('Hora de la toma 2').fill('20:45');
  const rationPreview = editor.getByRole('region', { name: 'Vista previa de la ración' });
  await rationPreview.getByText('54 g al día', { exact: true }).waitFor();
  assert.equal(await rationPreview.getByText('27 g', { exact: true }).count(), 2);
  const nutrientsPreview = editor.getByRole('table', { name: 'Nutrientes del plan' });
  await nutrientsPreview.getByRole('rowheader', { name: 'Fibra cruda' }).waitFor();
  await editor.getByRole('button', { name: /guardar (cambios|ajustes|plan|ración)/i }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await text('Ración diaria: 54 g').waitFor();
  await text('Comida 1 (09:00)').waitFor();
  await page.getByText(/Servido: 29 g/).waitFor();
  assert.equal(await button('Deshacer').count(), 1);
  assert.equal(await button('Ya comió').count(), 1);

  await button(/comparar precios|ver precios/i).first().click();
  await page.getByRole('heading', { name: 'Comparar precios' }).waitFor();
  assert.equal(await page.getByLabel('Presentación (kg)').inputValue(), '2');
  const city = page.getByLabel('Ciudad');
  assert.equal(await city.inputValue(), 'Bogotá');
  assert.equal(calls, 0, 'Opening the comparison must not spend a lookup');

  await button('Consultar precios').click();
  const result = page.getByRole('region', { name: 'Resultado de precios' });
  const winner = result.getByRole('article').filter({ hasText: 'Más barato hoy' });
  await winner.getByRole('heading', { name: 'Tienda B' }).waitFor();
  assert.match(await winner.innerText(), /99[.\s]000/);
  assert.equal(await winner.getByRole('link').getAttribute('href'), 'https://tienda-b.example/producto');
  const unknownDelivery = result.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Tienda C' }) });
  assert.match(await unknownDelivery.innerText(), /Por confirmar/i);
  assert.doesNotMatch(await unknownDelivery.innerText(), /Más barato hoy/);
  await result.getByRole('heading', { name: 'Tienda D' }).waitFor();

  const postalCode = page.getByLabel('Código postal de Bogotá');
  await postalCode.fill('120000');
  await button('Consultar precios').click();
  assert.equal(await result.count(), 0);
  assert.equal(calls, 1, 'An invalid Bogotá postal code must not submit a lookup');

  await postalCode.fill('110111');
  await button('Consultar precios').click();
  const quoted = result.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Tienda B' }) });
  await quoted.getByText('Menor total confirmado').waitFor();
  assert.match(await quoted.innerText(), /114[.\s]650/);
  assert.match(await quoted.innerText(), /15[.\s]650/);
  assert.match(await quoted.innerText(), /110111/);
  await postalCode.fill('110851');
  assert.equal(await result.count(), 0, 'An old quote must not display for a different postal code');

  await city.selectOption('Medellín');
  assert.equal(await postalCode.count(), 0);
  assert.equal(calls, 2, 'Changing city alone must not spend a lookup');
  await button('Consultar precios').click();
  await result.getByText(/última consulta/i).first().waitFor();
  assert.equal(await result.getByText('Más barato hoy', { exact: true }).count(), 0);

  await city.selectOption('Cali');
  await button('Consultar precios').click();
  await result.getByText(/agotaron las consultas/i).waitFor();
  assert.equal(calls, 4);
  assert.equal(await result.getByText('Más barato hoy', { exact: true }).count(), 0);
  await button('Volver al plan').click();
  await text('Ración diaria: 54 g').waitFor();
  console.log('Chrome móvil con datos controlados: etiqueta y horarios guardados, toma histórica intacta, precio con envío, envío desconocido, consulta anterior y cuota agotada verificados.');
}

async function verifyDiary() {
  const url = new URL(process.argv[2]);
  const usingPriceFixtures = process.argv.includes('--price-fixtures');
  if (usingPriceFixtures) assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.protocol, usingPriceFixtures ? 'http:' : 'https:');
  if (process.env.GITHUB_SHA) url.searchParams.set('release-check', process.env.GITHUB_SHA);
  await waitForPages(url);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({
      locale: 'es-CO',
      timezoneId: 'America/Bogota',
      ...(usingPriceFixtures ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' } : {}),
    });
    const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
    const text = (value) => page.getByText(value, { exact: true });
    const openCatFoodStep = async (trigger, name) => {
      await button(trigger).click();
      await button('🐱 Gato').click();
      await page.getByRole('textbox', { name: 'Ej. Milo' }).fill(name);
      await page.getByRole('spinbutton', { name: 'Peso Actual (kg)' }).fill('4.3');
      await button('Guardar mascota').click();
      await button('♀ Hembra').click();
      await button(/continuar a condición/i).click();
      await button(/continuar a objetivo/i).click();
      await button(/continuar a alimento/i).click();
    };
    page.setDefaultTimeout(10000);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await openCatFoodStep('Agregar mascota', 'Luna');
    await button(/sterilised 37 neutered cat dry/i).click();
    await page.getByRole('spinbutton').nth(0).fill('2');
    await page.getByRole('spinbutton').nth(1).fill('15');
    await button(/continuar a comidas/i).click();
    await page.getByLabel('Hora de la toma 1').fill('08:30');
    await page.getByLabel('Hora de la toma 2').fill('19:30');
    await button(/ver su plan nutricional/i).click();
    for (const value of ['59 g', '30 g', '29 g']) await text(value).waitFor();
    await button('Guardar este plan').click();

    await button('Ya comió').last().click();
    await button('Progreso').click();
    await button(/pesar hoy/i).click();
    await page.getByRole('textbox', { name: 'Ej. Ayunas por la mañana' }).fill('Pesaje de prueba de publicación');
    await button('Guardar pesaje').click();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await text('Ración diaria: 59 g').waitFor();
    for (const value of ['Comida 1 (08:30)', 'Comida 2 (19:30)']) await text(value).waitFor();
    await page.getByText(/Servido: 29 g/).waitFor();
    await button('Deshacer').waitFor();
    assert.equal(await button('Ya comió').count(), 1, 'The other meal should still be pending');

    await button('Progreso').click();
    const history = page.getByRole('region', { name: 'Historial de pesajes de Luna' });
    await history.getByText('4.3 kg', { exact: true }).waitFor();
    await history.getByText('Pesaje de prueba de publicación', { exact: true }).waitFor();

    await button('Más').click();
    assert.doesNotMatch(await page.locator('main').innerText(), /iniciar sesión|activar licencia|activar pro|checkout/i);
    assert.equal(new URL(page.url()).origin, url.origin);
    console.log(`Chrome ${usingPriceFixtures ? 'móvil en entorno de prueba' : 'público anónimo'}: Luna conservó 59 g, horarios 08:30 y 19:30, toma servida de 29 g y pesaje de 4.3 kg tras recargar.`);

    await openCatFoodStep('+ Mascota', 'Nube');
    await button(/agregar alimento/i).click();
    const label = page.getByRole('dialog', { name: 'Agregar alimento' });
    await label.getByLabel('Marca', { exact: true }).fill('Marca de prueba');
    await label.getByLabel('Nombre de la fórmula', { exact: true }).fill('Seco de prueba');
    await label.getByLabel('Energía metabolizable (kcal/kg)', { exact: true }).fill('3641');
    if (usingPriceFixtures) await label.getByLabel('Tamaño del empaque (kg)').fill('2');
    const declarations = [
      ['Proteína', '30', 'minimo'],
      ['Grasa', '20', 'minimo'],
      ['Fibra cruda', '10', 'maximo'],
    ];
    for (const [name, amount, qualifier] of declarations) {
      await label.getByLabel(`${name} (%)`, { exact: true }).fill(amount);
      await label.getByLabel(`Declaración de ${name.toLowerCase()}`, { exact: true }).selectOption(qualifier);
    }
    assert.equal(await label.getByLabel('Carbohidratos (%)', { exact: true }).inputValue(), '');
    await label.getByRole('checkbox', { name: /declara alimento completo y balanceado/i }).check();
    await label.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    await page.getByRole('spinbutton').nth(0).fill('2');
    await page.getByRole('spinbutton').nth(1).fill('15');
    await button(/continuar a comidas/i).click();
    await button(/ver su plan nutricional/i).click();
    await text('59 g').waitFor();
    await button('Guardar este plan').click();
    await button('Ya comió').last().click();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await text('Ración diaria: 59 g').waitFor();
    const nutrients = page.getByRole('table', { name: 'Nutrientes de hoy' });
    await nutrients.getByRole('columnheader', { name: 'Plan del día' }).waitFor();
    await nutrients.getByRole('columnheader', { name: 'Servido' }).waitFor();
    for (const [name, planned, served] of [
      ['Proteína', /≥\s*17[.,]7\s*g/, /≥\s*8[.,]7\s*g/],
      ['Grasa', /≥\s*11[.,]8\s*g/, /≥\s*5[.,]8\s*g/],
      ['Fibra cruda', /≤\s*5[.,]9\s*g/, /≤\s*2[.,]9\s*g/],
      ['Carbohidratos', /Sin dato/i, /Sin dato/i],
    ]) {
      const heading = page.getByRole('rowheader', { name, exact: true });
      const row = nutrients.getByRole('row').filter({ has: heading });
      const cells = row.getByRole('cell');
      assert.equal(await cells.count(), 2, `${name}: expected planned and served cells`);
      assert.match(await cells.nth(0).innerText(), planned, `${name}: planned`);
      assert.match(await cells.nth(1).innerText(), served, `${name}: served`);
    }
    await button('Alimentos').click();
    await button('Mis alimentos').click();
    await page.getByRole('heading', { name: 'Seco de prueba', exact: true }).waitFor();
    await button('Editar ficha').click();
    const savedLabel = page.getByRole('dialog', { name: 'Revisar etiqueta' });
    for (const [name, amount, qualifier] of declarations) {
      assert.equal(await savedLabel.getByLabel(`${name} (%)`, { exact: true }).inputValue(), amount);
      assert.equal(await savedLabel.getByLabel(`Declaración de ${name.toLowerCase()}`, { exact: true }).inputValue(), qualifier);
    }
    assert.equal(await savedLabel.getByLabel('Carbohidratos (%)', { exact: true }).inputValue(), '');
    console.log('Alimento local: ficha, grasa, fibra y proteína planificadas y servidas persistieron. Carbohidratos sin declarar siguen sin dato.');
    if (usingPriceFixtures) await verifyAdjustmentAndPrices(page, button, text);
  } finally {
    await browser.close();
  }
}

verifyDiary().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
