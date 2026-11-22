const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

function expectedCoverage() {
  const inventory = require('../../src/data/manufacturers/store.json');
  const sheets = new Map();
  for (const name of ['colombia', 'internacional', 'otras', 'especialidades']) {
    for (const sheet of require('../../src/data/manufacturers/' + name + '.json')) {
      for (const handle of sheet.handles) sheets.set(handle, sheet);
    }
  }
  let complete = 0;
  let pending = 0;
  for (const item of inventory) {
    const sheet = sheets.get(item.handle);
    if (!sheet) { pending++; continue; }
    const values = [sheet.proteinMin ?? sheet.protein, sheet.fatMin ?? sheet.fat, sheet.fiberMax ?? sheet.fiber];
    const hasSize = [...item.storePackagesKg, ...(sheet.packagesKg ?? [])].some(kg => kg > 0);
    if (values.every(Number.isFinite) && sheet.kcalKg > 0 && hasSize) complete++;
  }
  return {total: inventory.length, complete, partial: inventory.length - pending - complete, pending};
}

async function verify() {
  const site = process.argv[2];
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const page = await browser.newPage({locale:'es-CO', timezoneId:'America/Bogota', viewport:{width:390,height:844}, serviceWorkers:'block'});
  const button = name => page.getByRole('button', {name,exact:typeof name === 'string'});
  try {
    await page.goto(site, {waitUntil:'domcontentloaded'});
    await button('Agregar mascota').click();
    await button('🐱 Gato').click();
    await page.getByRole('textbox', {name:'Ej. Milo'}).fill('Sol');
    await page.getByRole('spinbutton', {name:'Peso Actual (kg)'}).fill('4');
    await button('Guardar mascota').click();
    await button('♀ Hembra').click();
    await button(/continuar a condición/i).click();
    await button(/continuar a objetivo/i).click();
    await button(/continuar a alimento/i).click();
    const search = page.getByRole('textbox', {name:'Buscar alimentos en internet'});
    const store = page.getByRole('region', {name:'Alimentos de Agrocentro Pets'});
    await search.fill('Nupec felino weight care');
    await button('Buscar en internet').click();
    const nupec = store.getByRole('article').filter({hasText:/NUPEC.*Weight Care/i}).first();
    await nupec.getByText(/Mín\. 38 %/).waitFor();
    await nupec.getByText(/Mín\. 11 %/).waitFor();
    await store.getByText('Cobertura de las fichas de la tienda', {exact:true}).click();
    const {total, complete, partial, pending} = expectedCoverage();
    const coverageText = total + ' referencias de la tienda: ' + complete + ' completas, ' + partial + ' parciales y ' + pending + ' pendientes.';
    await store.getByText(coverageText, {exact:true}).waitFor();
    console.log(JSON.stringify({site, coverage:coverageText, label:'NUPEC Felino Weight Care', proteinMin:38, fatMin:11}));
    await search.fill('Agility Gold Gato Esterilizado');
    await button('Buscar en internet').click();
    const agility = store.getByRole('article', {name:'Agility Gold Gato Esterilizado',exact:true});
    await agility.getByText(/3[.\s]?750 kcal\/kg/).waitFor();
    await agility.getByRole('button',{name:'Elegir 1.5 kg',exact:true}).waitFor();
    const labelSource = agility.getByText(/3[.\s]?750 kcal\/kg/).locator('..');
    assert.match(await labelSource.locator('a').first().getAttribute('href'), /italcolmascotas.+Portafolio-Super-Premium/);
    console.log(JSON.stringify({site, label:'Agility Gold Gato Esterilizado', kcalKg:3750, packKg:1.5}));
    await search.fill('Monello select castrados');
    await button('Buscar en internet').click();
    const item = store.getByRole('article').filter({hasText:/Monello Select Castrados/i});
    const sourceUrl = 'https://www.nutrire.ind.br/produto/select-by-monello-castrados-gatos-adultos';
    assert.equal(await item.getByRole('link', {name:'Ficha oficial'}).getAttribute('href'), sourceUrl);
    for (const kg of [1.5,7,10.1,15]) {
      await item.getByRole('button', {name:'Elegir ' + kg + ' kg', exact:true}).waitFor();
    }
    await item.getByRole('button', {name:'Elegir 1.5 kg',exact:true}).click();
    await button('Contrastar con mi etiqueta').click();
    const label = page.getByRole('dialog', {name:'Revisar etiqueta',exact:true});
    const expected = {'Proteína (%)':'36','Grasa (%)':'8.5','Fibra cruda (%)':'4.5','Humedad (%)':'10',
      'Cenizas (%)':'8.5','Carbohidratos (%)':'','Energía metabolizable (kcal/kg)':'3650','Tamaño del empaque (kg)':'1.5'};
    for (const [field, value] of Object.entries(expected)) {
      assert.equal(await label.getByLabel(field, {exact:true}).inputValue(), value, field);
    }
    assert.equal(await label.getByLabel('Declaración de proteína',{exact:true}).inputValue(),'minimo');
    assert.equal(await label.getByLabel('Declaración de fibra cruda',{exact:true}).inputValue(),'maximo');
    await label.getByRole('button', {name:'Cerrar',exact:true}).click();
    await button(/continuar a comidas/i).click();
    await button(/ver su plan nutricional/i).click();
    await button('Guardar este plan').click();
    await page.reload({waitUntil:'domcontentloaded'});
    const ring = page.getByRole('region', {name:'Progreso diario de Sol',exact:true});
    await ring.getByText(/Ración diaria: [1-9][0-9]* g/).waitFor();
    console.log(JSON.stringify({site, formula:'Monello Select Castrados', sourceUrl, selectedKg:1.5,
      kcalKg:3650, proteinMin:36, fatMin:8.5, fiberMax:4.5, persistedDailyRation:await ring.getByText(/Ración diaria:/).innerText()}));
  } catch (error) {
    console.error((await page.locator('body').innerText({timeout:3000}).catch(() => '')).slice(-4500));
    throw error;
  } finally { await browser.close(); }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
