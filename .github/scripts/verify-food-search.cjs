const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

const merchantOrigin = 'https://storefront-api.tiendanube.com';
const storePath = '/2026-11/stores/5624899';
const searchQuery = 'Royal Canin Sterilised 37';
const formulaName = 'Sterilised 37 Concentrado para Gatos Adultos';
const formula = `Royal Canin ${formulaName}`;

// Public merchant sample. The weight field is deliberately unreliable, while the named
// variant values declare the package size. Nutrition in prose stays unconfirmed.
const merchantProduct = {
  id: 354674514,
  name: formula,
  handle: 'royal-canin-sterilised-37-x-400-g',
  brand: 'Royal Canin',
  description: '<p>Alimento completo para gatos adultos. Grasas (12%) y proteínas (37%).</p>',
  tags: 'feline health nutrition dry, Gato sterilised 37, gatos, royal canin',
  categories: [
    { id: 29873171, name: 'Gatos', handle: 'gatos', parent: null },
    { id: 29873185, name: 'Concentrado para Gatos', handle: 'concentrado-para-gato', parent: 29873171 },
  ],
  images: [],
  variants: [
    { id: 1600409989, values: ['400 g'], weight: '0.001', price: '30200.00' },
    { id: 1600409990, values: ['2 kg'], weight: '0.002', price: '137000.00' },
    { id: 1600409991, values: ['4 kg'], weight: '0.004', price: '253000.00' },
    { id: 1600409992, values: ['10 kg'], weight: '0.010', price: '499000.00' },
  ].map((variant) => ({
    ...variant,
    product_id: 354674514,
    visible: true,
    stock_management: false,
    stock: null,
    promotional_price: null,
    barcode: '3182550737555',
  })),
};

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

async function installMerchantFixtures(page) {
  const fixture = { unavailable: false };
  await page.route(`${merchantOrigin}/**`, async (route) => {
    if (fixture.unavailable) {
      await route.abort('internetdisconnected');
      return;
    }
    const request = route.request();
    const url = new URL(request.url());
    assert.equal(request.method(), 'GET');
    let json;
    if (url.pathname === storePath) {
      json = { id: 5624899, country: 'CO', currency: 'COP' };
    } else if (url.pathname === `${storePath}/search/products`) {
      assert.equal(url.searchParams.get('q'), searchQuery);
      json = {
        data: [{ id: merchantProduct.id }],
        pagination: { page: 1, per_page: 8, total: 1, total_pages: 1 },
      };
    } else {
      assert.equal(url.pathname, `${storePath}/products/${merchantProduct.id}`);
      json = merchantProduct;
    }
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      json,
    });
  });
  return fixture;
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

    await button('Catálogo guardado').click();
    await button(/sterilised 37 neutered cat dry/i).waitFor();
    assert.equal(merchantRequests.length, 0, 'The saved catalog must work without a merchant request');

    await button('Internet').click();
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
      await button('Catálogo guardado').click();
      await button(/sterilised 37 neutered cat dry/i).waitFor();
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
    await page.getByRole('heading', { name: formulaName, exact: true }).waitFor();
    await button('Editar ficha').click();
    const savedLabel = page.getByRole('dialog', { name: 'Revisar etiqueta', exact: true });
    assert.equal(await savedLabel.getByLabel('Tamaño del empaque (kg)', { exact: true }).inputValue(), '0.4');
    assert.equal(await savedLabel.getByLabel('Energía metabolizable (kcal/kg)', { exact: true }).inputValue(), '');
    await savedLabel.getByRole('button', { name: 'Cerrar', exact: true }).click();

    assert.deepEqual(unexpectedProviderRequests, [], 'Food catalog lookup must not request price searches');
    console.log(`Chrome ${usingFixtures ? 'con respuestas controladas' : 'público con catálogo de Laia Pets'}: búsqueda explícita, cuatro presentaciones, 400 g guardados y energía pendiente conservados al recargar.`);
  } finally {
    await browser.close();
  }
}

verifyFoodSearch().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
