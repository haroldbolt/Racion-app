const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

const formula = 'Agility Gold Grandes Adultos';
const pet = 'Luna Agility';
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
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const context = await browser.newContext({
    locale:'es-CO', timezoneId:'America/Bogota', viewport:{width:390,height:844},
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
    await button('Agregar mascota').click();
    await button('🐶 Perro').click();
    await page.getByRole('textbox', {name:'Ej. Milo'}).fill(pet);
    await page.getByRole('spinbutton', {name:'Peso Actual (kg)'}).fill('29');
    await button('Guardar mascota').click();
    await button('♀ Hembra').click();
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
    assert.deepEqual([...sources].sort(),['Italcol','Laia Pets']);
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

    const dailyGrams = page.getByRole('spinbutton',{name:'Gramos diarios elegidos de la tabla',exact:true});
    assert.equal(await dailyGrams.getAttribute('min'),'261');
    assert.equal(await dailyGrams.getAttribute('max'),'336');
    await dailyGrams.fill('300');
    await button(/continuar a comidas/i).click();
    await page.getByLabel('Hora de la toma 1',{exact:true}).fill('08:00');
    await page.getByLabel('Hora de la toma 2',{exact:true}).fill('20:00');
    await button(/ver su plan nutricional/i).click();
    await page.getByText('300 g',{exact:true}).waitFor();
    for (const time of ['08:00','20:00']) {
      const meal = page.getByRole('listitem').filter({hasText:' · ' + time});
      await meal.getByText('150 g',{exact:true}).waitFor();
    }
    await button('Guardar este plan').click();
    await page.reload({waitUntil:'domcontentloaded'});
    const ring = page.getByRole('region',{name:'Progreso diario de ' + pet,exact:true});
    await ring.waitFor();
    assert.equal(await page.locator('main section').first().getAttribute('aria-labelledby'),'today-progress-title');
    const arcBox = await ring.locator('svg').first().boundingBox();
    assert.ok(arcBox && arcBox.y >= 0 && arcBox.y + arcBox.height < 844,'the entire dual ring must be visible without scrolling');
    await ring.getByText('Calorías pendientes',{exact:true}).waitFor();
    await ring.getByText('Ración diaria: 300 g',{exact:true}).waitFor();
    await proof(page,'agility-hoy.png');

    const costs = page.getByRole('region',{name:'Costo de su ración',exact:true});
    const dailyCost = Math.round(price * 300 / 3000);
    const portionCost = Math.round(price * 150 / 3000);
    await costs.getByText(asCop(dailyCost)).waitFor();
    for (const time of ['08:00','20:00']) {
      await costs.getByRole('listitem').filter({hasText:' · ' + time}).getByText(asCop(portionCost)).waitFor();
    }
    await ring.getByRole('button',{name:'Registrar esta comida'}).click();
    await button('Confirmar toma').click();
    await ring.getByText('1 de 2 comidas',{exact:true}).waitFor();
    await ring.getByText('Calorías pendientes',{exact:true}).waitFor();
    const nutrients = page.getByRole('table',{name:'Nutrientes de hoy',exact:true});
    assert.match(await nutrients.getByRole('row').filter({hasText:'Proteína'}).innerText(),/≥\s*34[.,]5\s*g/);

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
    console.log(JSON.stringify({
      site:url.origin, sources:[...sources], food:formula, sizesKg:[1.5,3,15], price3kgCop:price,
      guaranteed:{proteinMin:23,fatMin:15,fiberMax:4,ashMax:8,moistureMax:11},
      metabolizableEnergy:'undeclared', carbs:'undeclared', petKg:29, guideGrams:[261,336],
      confirmedGrams:300, portionGrams:150, dailyCop:dailyCost, portionCop:portionCost,
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
