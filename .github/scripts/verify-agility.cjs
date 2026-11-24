const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { museBrowserOptions, verifyReviewPage } = require('./muse-review.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

const formula = 'Agility Gold Grandes Adultos';
const pet = 'Milo';
const times = ['08:00', '20:00'];
const guideAmount = 'Gramos diarios elegidos de la tabla';
const projected = /estimad[oa] según (?:la )?tabla del fabricante/i;
const qualifiers = [
  ['Proteína', '23', 'minimo'], ['Grasa', '15', 'minimo'], ['Fibra cruda', '4', 'maximo'],
  ['Cenizas', '8', 'maximo'], ['Humedad', '11', 'maximo'],
];

function asCop(amount) {
  const formatted = new Intl.NumberFormat('es-CO').format(amount).replaceAll('.', '[.\\s]');
  return new RegExp('^\\$\\s*' + formatted + '\\s+COP$');
}

async function proof(page, name) {
  if (!process.env.AGILITY_SCREENSHOT_DIR) return;
  await fs.mkdir(process.env.AGILITY_SCREENSHOT_DIR, {recursive:true});
  await page.screenshot({path:path.join(process.env.AGILITY_SCREENSHOT_DIR, name)});
}

async function verify() {
  const url = new URL(process.argv[2]);
  assert.ok(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'));
  const reviewOptions = museBrowserOptions(url);
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const context = await browser.newContext({
    ...reviewOptions, locale:'es-CO', timezoneId:'America/Bogota', viewport:{width:390,height:844},
    isMobile:true, hasTouch:true, serviceWorkers:'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const button = value => page.getByRole('button', {name:value, exact:typeof value === 'string'});
  const sources = new Set();
  page.on('response', response => {
    const resource = new URL(response.url());
    if (response.ok() && resource.hostname === 'storefront-api.tiendanube.com' && /\/products\/\d+$/.test(resource.pathname)) sources.add('Laia Pets');
    if (response.ok() && resource.hostname === 'www.italcolmascotas.com' && /\/posts\/\d+$/.test(resource.pathname)) sources.add('Italcol');
  });

  // Fresh browser only. All writes use the application's normal controls.
  try {
    await page.goto(url.href, {waitUntil:'domcontentloaded'});
    await verifyReviewPage(page, url);
    await button('Agregar mascota').click();
    await button('🐶 Perro').click();
    await page.getByRole('textbox', {name:'Ej. Milo'}).fill(pet);
    await page.getByRole('spinbutton', {name:'Peso Actual (kg)'}).fill('30');
    await button('Guardar mascota').click();
    await button('♂ Macho').click();
    await button(/continuar a condición/i).click();
    await button(/continuar a objetivo/i).click();
    await button(/continuar a alimento/i).click();

    await page.getByRole('textbox',{name:'Buscar alimentos en internet',exact:true}).fill(formula);
    await button('Buscar en internet').click();
    const result = page.getByRole('region',{name:'Resultados de internet'}).getByRole('article',{name:formula,exact:true}).filter({hasText:'Fuente: Laia Pets'});
    await result.waitFor({timeout:45000});
    for (const size of ['1.5 kg','3 kg','15 kg']) await result.getByRole('button',{name:'Elegir ' + size,exact:true}).waitFor();
    const chosen = result.getByRole('button',{name:'Elegir 3 kg',exact:true});
    const offerText = await chosen.locator('..').innerText();
    const money = offerText.match(/\$\s*([0-9.\s]+)\s*COP/);
    assert.ok(money,'3 kg must have a real offer in COP');
    const price = Number(money[1].replace(/\D/g,''));
    assert.ok(price > 0);
    assert.ok(sources.has('Laia Pets'), 'Expected a live package price from Laia Pets');
    const expectedSheet = 'https://www.italcolmascotas.com/agility-gold-grandes-adultos-2/';
    for (const [field] of qualifiers) {
      const declaration = result.getByText(field, {exact:true}).locator('..');
      assert.equal(await declaration.locator('details a').first().getAttribute('href'), expectedSheet);
    }
    await chosen.click();
    await button('Contrastar con mi etiqueta').click();

    const label = page.getByRole('dialog',{name:'Revisar etiqueta',exact:true});
    for (const [field,value,qualifier] of qualifiers) {
      assert.equal(await label.getByLabel(field + ' (%)',{exact:true}).inputValue(),value);
      assert.equal(await label.getByLabel('Declaración de ' + field.toLowerCase(),{exact:true}).inputValue(),qualifier);
    }
    assert.equal(await label.getByLabel('Carbohidratos (%)',{exact:true}).inputValue(),'');
    assert.equal(await label.getByLabel('Energía metabolizable (kcal/kg)',{exact:true}).inputValue(),'');
    assert.equal(await label.getByLabel('Tamaño del empaque (kg)',{exact:true}).inputValue(),'3');
    await proof(page,'agility-etiqueta.png');
    await label.getByRole('button',{name:'Cerrar',exact:true}).click();

    const dailyGrams = page.getByRole('spinbutton',{name:guideAmount,exact:true});
    assert.equal(await dailyGrams.getAttribute('min'),'261');
    assert.equal(await dailyGrams.getAttribute('max'),'336');
    assert.equal(await dailyGrams.inputValue(),'298.5', 'El punto medio debe aparecer sin ingresar gramos');
    const guideSection = dailyGrams.locator('xpath=ancestor::section[1]');
    assert.equal(await guideSection.getByRole('link').getAttribute('href'), expectedSheet);
    await guideSection.getByText(/punto medio, 298,5 g al día/i).waitFor();
    assert.ok(await dailyGrams.evaluate(field => field.validity.valid), 'El valor decimal propuesto debe ser válido');
    await button(/continuar a comidas/i).click();
    await page.getByLabel('Hora de la toma 1',{exact:true}).fill('08:00');
    await page.getByLabel('Hora de la toma 2',{exact:true}).fill('20:00');
    await button(/ver su plan nutricional/i).click();
    await page.getByText('298,5 g',{exact:true}).waitFor();
    await page.getByText(projected).first().waitFor();
    for (const time of times) {
      const meal = page.getByRole('listitem').filter({hasText:' · ' + time});
      await meal.getByText('149,25 g',{exact:true}).waitFor();
    }
    await proof(page,'milo-propuesta.png');
    await button('Guardar este plan').click();
    await page.reload({waitUntil:'domcontentloaded'});
    const ring = page.getByRole('region',{name:'Progreso diario de ' + pet,exact:true});
    await ring.waitFor();
    assert.equal(await page.locator('main section').first().getAttribute('aria-labelledby'),'today-progress-title');
    const arcBox = await ring.locator('svg').first().boundingBox();
    assert.ok(arcBox && arcBox.y >= 0 && arcBox.y + arcBox.height < 844,'the entire dual ring must be visible without scrolling');
    await ring.getByText('Calorías pendientes',{exact:true}).waitFor();
    await ring.getByText('Ración diaria: 298,5 g',{exact:true}).waitFor();
    await page.getByText(projected).first().waitFor();
    async function scheduledPortions(amount) {
      for (const [index,time] of times.entries()) {
        const row = page.getByText('Comida ' + (index + 1) + ' (' + time + ')',{exact:true}).locator('..');
        await row.getByText(amount).waitFor();
      }
    }
    await scheduledPortions(/^149,25 g$/);
    await proof(page,'agility-hoy.png');

    await button('Ajustar ración').click();
    const editor = page.getByRole('dialog',{name:'Ajustar ración',exact:true});
    const adjustGrams = editor.getByRole('spinbutton',{name:guideAmount,exact:true});
    const labelEnergy = editor.getByLabel('Energía de la etiqueta (kcal/kg)',{exact:true});
    assert.equal(await labelEnergy.inputValue(), '');
    assert.equal(await adjustGrams.inputValue(), '298.5');
    await adjustGrams.fill('310');
    const preview = editor.getByRole('region',{name:'Vista previa de la ración',exact:true});
    await preview.getByText('310 g al día',{exact:true}).waitFor();
    for (const time of times) {
      const serving = preview.getByRole('listitem').filter({hasText:time});
      await serving.getByText('155 g',{exact:true}).waitFor();
    }
    await proof(page,'milo-ajuste.png');
    await editor.getByRole('button',{name:'Guardar cambios para ' + pet,exact:true}).click();
    await editor.waitFor({state:'hidden'});
    await page.reload({waitUntil:'domcontentloaded'});
    await ring.getByText('Ración diaria: 310 g',{exact:true}).waitFor();
    await ring.getByText('Calorías pendientes',{exact:true}).waitFor();
    await scheduledPortions(/^155 g$/);
    await button('Ajustar ración').click();
    assert.equal(await adjustGrams.inputValue(), '310', 'El ajuste confirmado debe sobrevivir la recarga y reapertura');
    assert.equal(await labelEnergy.inputValue(), '');
    await editor.getByRole('button',{name:'Cerrar',exact:true}).click();

    const costs = page.getByRole('region',{name:'Costo de su ración',exact:true});
    const dailyCost = Math.round(price * 310 / 3000);
    const portionCost = Math.round(price * 155 / 3000);
    await costs.getByText(asCop(dailyCost)).waitFor();
    for (const time of ['08:00','20:00']) {
      await costs.getByRole('listitem').filter({hasText:' · ' + time}).getByText(asCop(portionCost)).waitFor();
    }
    await ring.getByRole('button',{name:'Registrar esta comida'}).click();
    await button('Confirmar toma').click();
    await ring.getByText('1 de 2 comidas',{exact:true}).waitFor();
    await ring.getByText('Calorías pendientes',{exact:true}).waitFor();
    const nutrients = page.getByRole('table',{name:'Nutrientes de hoy',exact:true});
    assert.match(await nutrients.getByRole('row').filter({hasText:'Proteína'}).innerText(),/≥\s*35[.,]6\s*g/);

    await button('Perfil').click();
    const restrictions = page.getByText('Ingredientes a evitar y límites veterinarios',{exact:true});
    await restrictions.click();
    await page.getByLabel('Ingredientes a evitar, separados por coma',{exact:true}).fill('pollo');
    const maximum = page.getByRole('textbox',{name:'Máximo',exact:true});
    await maximum.fill('10');
    await button('Añadir límite').click();
    await button('Guardar mascota').click();
    await page.reload({waitUntil:'domcontentloaded'});
    const alerts = page.getByRole('region',{name:'Revisión para ' + pet,exact:true}).first();
    await alerts.getByText(/indicó evitar pollo.*«[^»]*\bpollo\b[^»]*»/i).waitFor();
    await alerts.getByText(/grasa.*10 %.*al menos 15 %.*Supera el límite/i).waitFor();
    await ring.getByText('1 de 2 comidas',{exact:true}).waitFor();
    await alerts.scrollIntoViewIfNeeded();
    await proof(page,'agility-alertas.png');

    await button('Alimentos').click();
    await button('Buscar en internet').first().click();
    const search = page.getByRole('region', {name:'Buscar en internet', exact:true});
    await search.getByRole('textbox', {name:'Buscar alimentos en internet'}).fill(formula);
    await search.getByRole('button', {name:'Buscar en internet', exact:true}).click();
    const storeFood = search.getByRole('region', {name:'Alimentos de Agrocentro Pets'})
      .getByRole('article', {name:'Agility Gold Adulto Raza Grande', exact:true});
    for (const size of ['1.5', '3', '15', '8']) {
      const row = storeFood.getByRole('button', {name:'Elegir ' + size + ' kg', exact:true}).locator('..');
      await row.getByText(size === '8' ? /no confirmada por el fabricante/i : /^confirmada por el fabricante/i).waitFor();
    }
    await storeFood.getByRole('button', {name:'Elegir 8 kg', exact:true}).click();
    const library = page.getByRole('region', {name:'Mis alimentos', exact:true});
    const saved = library.getByRole('article').filter({has:page.locator('select option:checked[value="8"]')});
    async function verifyLibrarySelection() {
      const selector = saved.getByRole('combobox');
      await selector.waitFor();
      assert.equal(await selector.inputValue(), '8');
      await saved.getByText('No confirmada por el fabricante', {exact:true}).waitFor();
    }
    await verifyLibrarySelection();
    await page.reload({waitUntil:'domcontentloaded'});
    await button('Alimentos').click();
    await button('Mis alimentos').click();
    await verifyLibrarySelection();
    assert.match(await saved.getByRole('heading').innerText(), /Agility|Grandes Adultos/i);
    await saved.scrollIntoViewIfNeeded();
    await proof(page, 'agility-8kg-tras-recarga.png');
    await saved.getByRole('button', {name:'Ver precios', exact:true}).click();
    for (const [size, status] of [['8', 'No confirmada por el fabricante'], ['3', 'Confirmada por el fabricante']]) {
      await button(size + ' kg').locator('..').getByText(status, {exact:true}).waitFor();
    }
    console.log('R5 presentaciones: Italcol confirma 1,5, 3 y 15 kg. La selección de 8 kg siguió sin confirmar tras la recarga.');
    console.log(JSON.stringify({
      site:url.origin, sources:[...sources], food:formula, sizesKg:[1.5,3,15], price3kgCop:price,
      guaranteed:{proteinMin:23,fatMin:15,fiberMax:4,ashMax:8,moistureMax:11},
      metabolizableEnergy:'undeclared', carbs:'undeclared', pet, petKg:30, guideGrams:[261,336], guideSource:expectedSheet,
      suggestedAndSaved:{dailyGrams:298.5, perMealGrams:[149.25,149.25]},
      adjustedAndSaved:{dailyGrams:310, perMealGrams:[155,155]}, dailyCop:dailyCost, portionCop:portionCost,
      notices:['declared chicken','test vet fat maximum 10% exceeded by declared minimum 15%'],
      persisted:true, mobileFirst:'dual progress ring',
    }));
  } catch (error) {
    console.error('Agility verification stopped on',page.url(), 'sources:',[...sources]);
    console.error((await page.locator('body').innerText()).slice(-4800));
    await proof(page,'agility-fallo.png');
    throw error;
  } finally {await browser.close();}
}
verify().catch(error => {console.error(error); process.exitCode=1;});
