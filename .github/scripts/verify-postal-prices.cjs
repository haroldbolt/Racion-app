const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const { museReviewOrigin, museBrowserOptions, verifyReviewPage } = require('./muse-review.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');
const { searchQuery, installMerchantFixtures } = require('./laia-food-fixture.cjs');

const destination = '110111';
const otherDestination = '110851';
const searchText = searchQuery + ' de 2 kg';
const agroHandle = 'alimento-para-gato-royal-canin-feline-health-nutrition-sterilised';
const agroUrl = 'https://cultivacenter.com/products/' + agroHandle;
const laiaStore = 'https://storefront-api.tiendanube.com/2026-11/stores/5624899';
const laiaVariant = 1600409990;
const agroVariant = 52674296414488;
const fixturePrices = 'https://prices.example.invalid/api/live-prices';
const historical = { laiaBag:137000, shipping:15650, agroBag:132400, agroStock:'out_of_stock' };

function priceAmount(text) {
  const match = text.match(/\$\s*([\d.,\s]+?)\s*COP\b/);
  assert.ok(match, 'El campo debe contener un importe en COP: ' + text);
  return Number(match[1].replace(/[.,\s]/g, ''));
}

async function installFixtures(page) {
  await installMerchantFixtures(page);
  const headers = {'access-control-allow-origin':'*', 'access-control-allow-methods':'POST, OPTIONS', 'access-control-allow-headers':'content-type'};
  await page.route('https://prices.example.invalid/api/colombia-foods?**', route =>
    route.fulfill({headers, json:{foods:[], unavailableSources:[]}}));
  await page.route(fixturePrices, async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204, headers});
    const { city, postalCode, product } = route.request().postDataJSON();
    const laia = {id:'laia-2kg', title:'Royal Canin Sterilised 37 · 2 kg', grams:2000,
      retailer:'Laia Pets', productPriceCop:historical.laiaBag, pricePerKgCop:historical.laiaBag/2,
      shippingCop:historical.shipping, totalCop:historical.laiaBag + historical.shipping,
      shippingPostalCode:destination, productUrl:'https://www.laiapets.com.co/productos/royal-canin-sterilised-37-x-400-g/', stock:'available'};
    const agro = {id:'agro-2kg', title:laia.title, grams:2000, retailer:'Agrocentro Pets',
      productUrl:agroUrl + '?variant=' + agroVariant, stock:historical.agroStock,
      productPriceCop:historical.agroBag, pricePerKgCop:historical.agroBag/2, shippingCop:null, totalCop:null};
    assert.equal(city, 'Bogotá');
    assert.ok([destination, otherDestination].includes(postalCode));
    assert.equal(product.grams, 2000);
    assert.match(product.brand, /royal canin/i);
    assert.match(product.name, /sterilised/i);
    // Deliberately return a quote marked 110111 for the other CP. The UI must reject it.
    await route.fulfill({headers, json:{status:'current', city, queriedAt:new Date().toISOString(),
      offers:[agro, laia], cheapestOfferId:laia.id}});
  });
}

async function merchantJson(url, options = {}) {
  const res = await fetch(url, {...options, signal:AbortSignal.timeout(20000)});
  assert.ok(res.ok, new URL(url).hostname + ' devolvió HTTP ' + res.status);
  return res.json();
}

// Read the same individual two-kilogram SKUs from the public stores independently
// of the app's ranking, normalizers and cached price response. These only request quotes.
async function readLiveSources() {
  const laia = async () => {
    const [detail, quote] = await Promise.all([
      merchantJson(laiaStore + '/products/354674514?fields=id,name,variants.id,variants.values,variants.price,variants.promotional_price,variants.visible,variants.stock,variants.stock_management'),
      merchantJson(laiaStore + '/shipping-options', {method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({zip_code:destination, variant_id:laiaVariant, quantity:1})}),
    ]);
    const sku = detail.variants.find(variant => variant.id === laiaVariant);
    assert.ok(sku?.visible && sku.values.some(name => /^2\s*kg$/i.test(name)));
    assert.ok((sku.stock_management === false && sku.stock === null) || Number(sku.stock) > 0);
    const bag = Number(sku.promotional_price ?? sku.price);
    assert.ok(Number.isSafeInteger(bag) && bag > 0);
    const options = quote.shipping_options.filter(item => item.name && item.code &&
      !/retir|recog|pickup|pick.up|recib.{0,8}en tienda/i.test([item.name,item.code,item.detail].join(' ')) &&
      /^\d+(?:\.00)?$/.test(String(item.price)));
    assert.ok(options.length, 'La tienda debe devolver envío a domicilio para la variante y CP');
    return {bag, shipping:Math.min(...options.map(option => Number(option.price)))};
  };
  const agro = async () => {
    const query = 'query($handle:String!) @inContext(country: CO) { product(handle:$handle) { handle variants(first:12) { nodes { id title availableForSale price { amount currencyCode } } } } }';
    const detail = await merchantJson('https://cultivacenter.com/api/2026-10/graphql.json', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({query, variables:{handle:agroHandle}}),
    });
    assert.equal(detail.data?.product?.handle, agroHandle);
    const sku = detail.data.product.variants.nodes.find(variant => variant.id === 'gid://shopify/ProductVariant/' + agroVariant);
    assert.ok(sku && typeof sku.availableForSale === 'boolean' && /\b2\s*kg\b/i.test(sku.title));
    assert.equal(sku.price.currencyCode, 'COP');
    const bag = Number(sku.price.amount);
    assert.ok(Number.isSafeInteger(bag) && bag > 0);
    return {bag, stock:sku.availableForSale ? 'available' : 'out_of_stock'};
  };
  return Promise.allSettled([laia(), agro()]);
}

const field = (card, label) => card.getByText(label, {exact:true}).and(card.locator('dt'))
  .locator('xpath=following-sibling::dd[1]').innerText();

async function saveEvidence(page, group, name) {
  const directory = process.env.POSTAL_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, {recursive:true});
  const viewport = page.viewportSize();
  // Keep the mobile width. Extend the viewport only to capture both complete offer cards.
  const box = await group.boundingBox();
  try {
    await page.setViewportSize({width:viewport.width, height:Math.max(viewport.height, Math.ceil((box.height + 160) / 0.92))});
    await group.screenshot({path:path.join(directory, name + '.png'), animations:'disabled'});
  } finally {
    await page.setViewportSize(viewport);
  }
}

async function checkComparison(page, dialog, postalCode, live, flow) {
  const [res] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/live-prices' &&
      response.request().method() === 'POST' && response.request().postDataJSON().postalCode === postalCode,
    {timeout:45000}),
    dialog.getByRole('button', {name:'Consultar precios', exact:true}).click(),
  ]);
  const body = res.request().postDataJSON();
  assert.ok(res.ok(), `El comparador devolvió HTTP ${res.status()}`);
  assert.equal(body.city, 'Bogotá');
  assert.equal(body.product.grams, 2000);
  assert.match(body.product.brand, /royal canin/i);
  assert.match(body.product.name, /sterilised/i);
  const data = await res.json();
  assert.equal(data.status, 'current', 'Se necesita una consulta vigente');
  const results = dialog.getByRole('region', {name:'Resultado de precios', exact:true});
  const group = results.getByRole('heading', {name:/^Misma presentación\s*·\s*2 kg$/}).locator('..');
  const card = retailer => group.getByRole('article').filter({has:page.getByRole('heading', {name:retailer, exact:true})});
  const laia = card('Laia Pets');
  const agro = card('Agrocentro Pets');
  await Promise.all([laia.waitFor(), agro.waitFor()]);
  await results.getByText('CP ' + postalCode, {exact:false}).first().waitFor();
  const badge = /^(?:Más barato hoy|Menor total confirmado)$/;
  if (postalCode === otherDestination) {
    assert.equal(await field(laia,'Envío'), 'Envío desconocido');
    assert.equal(await field(laia,'Total con envío'), 'No calculable');
    assert.equal(await group.getByText(badge).count(), 0, 'Una cotización de otro CP carece de ganador');
    return;
  }

  const laiaOffer = data.offers.find(o => o.retailer === 'Laia Pets' && o.grams === 2000);
  const agroOffer = data.offers.find(o => o.retailer === 'Agrocentro Pets' && o.grams === 2000);
  assert.ok(laiaOffer && agroOffer, 'La respuesta debe identificar ambas ofertas de la presentación');
  assert.equal(laiaOffer.shippingPostalCode, destination);
  assert.equal(laiaOffer.stock,'available');
  assert.ok(Number.isSafeInteger(laiaOffer.shippingCop) && laiaOffer.shippingCop >= 0);
  assert.equal(laiaOffer.totalCop, laiaOffer.productPriceCop + laiaOffer.shippingCop);
  await laia.getByText('En stock', {exact:true}).waitFor();
  assert.equal(priceAmount(await field(laia,'Precio de la bolsa')), laiaOffer.productPriceCop);
  const shippingText = await field(laia,'Envío');
  assert.match(shippingText, /110111/);
  if (laiaOffer.shippingCop === 0) assert.match(shippingText, /incluido|gratis/i);
  else assert.equal(priceAmount(shippingText), laiaOffer.shippingCop);
  assert.equal(priceAmount(await field(laia,'Total con envío')), laiaOffer.totalCop);
  assert.equal(priceAmount(await field(agro,'Precio de la bolsa')), agroOffer.productPriceCop);
  const statusLabels = {out_of_stock:'Agotada', available:'En stock', unknown:'Disponibilidad por confirmar'};
  assert.ok(Object.hasOwn(statusLabels, agroOffer.stock));
  await agro.getByText(statusLabels[agroOffer.stock], {exact:true}).waitFor();
  if (agroOffer.shippingCop === null || agroOffer.shippingPostalCode !== destination) {
    assert.equal(await field(agro,'Envío'), 'Envío desconocido');
    assert.equal(await field(agro,'Total con envío'), 'No calculable');
  } else {
    const shipping = await field(agro, 'Envío');
    if (agroOffer.shippingCop === 0) assert.match(shipping, /incluido|gratis/i);
    else assert.equal(priceAmount(shipping), agroOffer.shippingCop);
    assert.equal(priceAmount(await field(agro, 'Total con envío')), agroOffer.productPriceCop + agroOffer.shippingCop);
  }

  const purchasable = data.offers.filter(o => o.stock === 'available' && o.grams === 2000 &&
    o.shippingPostalCode === destination && Number.isFinite(o.totalCop));
  const winner = purchasable.find(offer => offer.id === data.cheapestOfferId);
  assert.ok(winner, 'La ganadora debe estar disponible y tener entrega cotizada al CP');
  assert.equal(winner.totalCop, Math.min(...purchasable.map(o => o.totalCop)));
  assert.equal(await group.getByText(badge).count(), 1);
  await card(winner.retailer).getByText(live ? badge : 'Más barato hoy', {exact:true}).waitFor();
  if (!live) {
    assert.equal(winner.id, laiaOffer.id);
    assert.equal(agroOffer.shippingCop, null);
    assert.equal(agroOffer.totalCop, null);
    assert.equal(await agro.getByText(badge).count(), 0);
  }
  await saveEvidence(page, group, (live ? 'vivo-' : 'historico-') + flow);
  return {laiaBag:laiaOffer.productPriceCop, shipping:laiaOffer.shippingCop,
    agroBag:agroOffer.productPriceCop, agroStock:agroOffer.stock, winner:winner.retailer, winningTotal:winner.totalCop};
}

async function verify() {
  const base = new URL(process.argv[2]);
  const live = process.argv.includes('--live');
  assert.ok(['127.0.0.1','localhost'].includes(base.hostname) || (live && base.protocol === 'https:'),
    'Las respuestas históricas deben usarse en la compilación local de pruebas');
  assert.ok(!base.username && !base.password, 'Usa una URL sin credenciales');
  const review = base.origin === museReviewOrigin;
  const reviewOptions = museBrowserOptions(base);
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({...reviewOptions, locale:'es-CO', timezoneId:'America/Bogota', viewport:{width:390,height:844},
    isMobile:true, hasTouch:true, serviceWorkers:'block'});
  page.setDefaultTimeout(22000);
  const button = name => page.getByRole('button',{name,exact:typeof name === 'string'});
  const dialog = page.getByRole('dialog',{name:'Comparar precios',exact:true});
  const postal = dialog.getByLabel('Código postal de Bogotá',{exact:true});
  const input = page.getByRole('textbox',{name:'Buscar alimentos en internet',exact:true});
  const openWizardComparison = async () => {
    await button('♀ Hembra').click();
    await button(/continuar a condición/i).click();
    await button(/continuar a objetivo/i).click();
    await button(/continuar a alimento/i).click();
    await input.fill(searchText);
    await input.press('Enter');
    const laiaProduct = page.getByRole('region',{name:'Resultados de internet',exact:true})
      .getByRole('article').filter({has:page.getByText('Fuente: Laia Pets',{exact:true})})
      .filter({has:page.getByRole('heading',{name:/Royal Canin Sterilised 37/i})});
    await laiaProduct.getByRole('button',{name:'Comparar 2 kg con envío',exact:true}).click({timeout:45000});
  };
  let stage = 'Abrir el asistente';
  try {
    if (!live) await installFixtures(page);
    const landing = await page.goto(base.href,{waitUntil:'domcontentloaded'});
    await verifyReviewPage(page, base);
    assert.ok(landing?.ok(), `El sitio devolvió HTTP ${landing?.status()}`);
    await button('Agregar mascota').click();
    await button('🐱 Gato').click();
    await page.getByRole('textbox',{name:'Ej. Milo'}).fill('Luna');
    await page.getByRole('spinbutton',{name:'Peso Actual (kg)'}).fill('4.3');
    await button('Guardar mascota').click();
    stage = 'Comparar desde el paso 4';
    await openWizardComparison();
    assert.equal(await dialog.getByLabel('Presentación (kg)',{exact:true}).inputValue(), '2');
    assert.equal(await dialog.getByRole('combobox').inputValue(), 'Bogotá');
    await postal.fill(destination);
    const wizard = await checkComparison(page, dialog, destination, live, 'asistente');
    if (!live) assert.deepEqual(wizard, {...historical, winner:'Laia Pets', winningTotal:152650});
    await dialog.getByRole('button',{name:'Volver a la búsqueda',exact:true}).click();
    assert.equal(await input.inputValue(), searchText, 'Volver conserva la búsqueda del asistente');

    stage = 'Recargar y comparar desde Alimentos';
    await page.reload({waitUntil:'domcontentloaded'});
    await button('Alimentos').click();
    await button('Buscar en internet').first().click();
    await input.fill(searchText);
    if (live) {
      const [catalog] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/colombia-foods' &&
          response.request().method() === 'GET', {timeout:45000}),
        input.press('Enter'),
      ]);
      assert.ok(catalog.ok(), `El catálogo colombiano devolvió HTTP ${catalog.status()}`);
      const result = await catalog.json();
      assert.ok(Array.isArray(result.foods) && Array.isArray(result.unavailableSources), 'La consulta debe devolver el catálogo colombiano');
    } else {
      await input.press('Enter');
    }
    const agroProduct = page.getByRole('region',{name:'Alimentos de Agrocentro Pets',exact:true})
      .getByRole('article').filter({has:page.locator('a[href="' + agroUrl + '"]')});
    await agroProduct.getByRole('button',{name:'Comparar 2 kg con envío',exact:true}).click({timeout:45000});
    assert.equal(await dialog.getByLabel('Presentación (kg)',{exact:true}).inputValue(), '2');
    assert.equal(await postal.inputValue(), destination, 'El CP se recupera tras recargar y cambiar de pantalla');
    const foods = await checkComparison(page, dialog, destination, live, 'alimentos');
    assert.deepEqual(foods,wizard,'Ambos nombres de tienda de la misma fórmula deben coincidir en precio, envío y stock');

    if (live) {
      stage = 'Contrastar las dos pantallas con las dos tiendas';
      const [laia,agro] = await readLiveSources();
      console.log('Resultado visible en ambos recorridos:',JSON.stringify({...foods, totalCop:foods.laiaBag + foods.shipping}));
      const unavailable = [laia,agro].filter(result => result.status === 'rejected');
      if (unavailable.length) throw new Error('No se pudieron corroborar todas las fuentes de venta: ' +
        unavailable.map(result => result.reason.message).join(', '));
      assert.equal(foods.laiaBag,laia.value.bag);
      assert.equal(foods.shipping,laia.value.shipping);
      assert.equal(foods.agroBag,agro.value.bag);
      assert.equal(foods.agroStock,agro.value.stock);
      if (review) {
        stage = 'Recargar y repetir el asistente con el destino guardado';
        await page.reload({waitUntil:'domcontentloaded'});
        await button('+ Calcular').click();
        await openWizardComparison();
        assert.equal(await postal.inputValue(), destination, 'El asistente debe conservar el CP tras recargar');
        assert.deepEqual(await checkComparison(page, dialog, destination, live, 'asistente-recargado'), foods);
        assert.equal(foods.winner, 'Laia Pets', 'La ganadora cambió respecto al caso de Muse');
        assert.equal(foods.winningTotal, 152650, 'El total vigente cambió respecto al caso de Muse');
        assert.equal(foods.agroStock, 'out_of_stock', 'La disponibilidad vigente cambió respecto al caso de Muse');
      }
    } else {
      stage = 'Cotización anterior al cambiar de destino';
      await postal.fill(otherDestination);
      assert.equal(await dialog.getByRole('region',{name:'Resultado de precios'}).count(), 0);
      await checkComparison(page, dialog, otherDestination, false);
      await dialog.getByRole('button',{name:'Volver a la búsqueda',exact:true}).click();
      await button('Más').click();
      await button(/Ajustes y Privacidad/).click();
      await page.getByRole('heading',{name:'Destino de entrega',exact:true}).waitFor();
      assert.equal(await page.getByLabel('Código postal de Bogotá',{exact:true}).inputValue(), otherDestination,
        'Ajustes y el comparador comparten el último CP consultado');
    }
    console.log(JSON.stringify({source:live?'Tiendas en vivo':'Ofertas de la prueba de Muse',flows:['Asistente, paso 4','Alimentos, Buscar en internet'],
      product:searchText,postalCode:destination,...foods,laiaTotalCop:foods.laiaBag + foods.shipping,postalCodeSurvivesReload:true}));
  } catch (error) {
    console.error('Etapa:',stage,'Pantalla:',(await page.locator('body').innerText()).slice(-2300));
    throw error;
  } finally {await browser.close();}
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
