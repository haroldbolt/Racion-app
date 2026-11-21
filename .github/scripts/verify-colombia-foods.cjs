const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

const query = 'Monello Castrados';
const productUrl = 'https://www.puppis.com.co/alimento-para-gato-monello-castrados/p';
const syntheticFormula = 'Fórmula local de prueba QXZ 70591';
const declared = [
  ['Proteína','36','minimo'], ['Grasa','9','minimo'],
  ['Humedad','10','maximo'], ['Cenizas','4.5','maximo'],
];

async function verify() {
  const url = new URL(process.argv[2]);
  assert.ok(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'));
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({
    locale:'es-CO', timezoneId:'America/Bogota', viewport:{width:390,height:844},
    isMobile:true, hasTouch:true, serviceWorkers:'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const button = name => page.getByRole('button',{name,exact:typeof name === 'string'});
  const input = (dialog,label) => dialog.getByLabel(label,{exact:true});
  const search = async term => {
    await page.getByRole('textbox',{name:'Buscar alimentos en internet',exact:true}).fill(term);
    await button('Buscar en internet').click();
  };
  const byPrice = amount => {
    const digits = new Intl.NumberFormat('es-CO').format(amount).replaceAll('.', '[.\\s]');
    return new RegExp('\\$\\s*' + digits + '\\s+COP');
  };
  const remoteSourceLink = page.locator('a[href="' + productUrl + '"]');
  const results = page.getByRole('region',{name:'Resultados de internet',exact:true});
  const review = page.getByRole('dialog',{name:'Revisar etiqueta',exact:true});

  try {
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    await button('Agregar mascota').click();
    await button('🐱 Gato').click();
    await page.getByRole('textbox',{name:'Ej. Milo'}).fill('Nube Colombia');
    await page.getByRole('spinbutton',{name:'Peso Actual (kg)'}).fill('4.3');
    await button('Guardar mascota').click();
    await button('♀ Hembra').click();
    await button(/continuar a condición/i).click();
    await button(/continuar a objetivo/i).click();
    await button(/continuar a alimento/i).click();

    // Inspect the real offer returned by the same endpoint used by this browser.
    const responsePromise = page.waitForResponse(response => {
      const target = new URL(response.url());
      return target.pathname === '/api/colombia-foods' && target.searchParams.get('q') === query;
    },{timeout:45000});
    await search(query);
    const response = await responsePromise;
    assert.ok(response.ok(),'the country-wide catalogue must be reachable');
    const payload = await response.json();
    const listing = payload.foods.find(item => item.productUrl === productUrl && item.species === 'cat');
    assert.ok(listing,'expected the live Puppis product in the Colombia catalogue');
    assert.match(listing.retailer,/Puppis/i);
    const priced = listing.presentations.filter(item => item.priceCop > 0).sort((a,b) => a.packageKg-b.packageKg);
    assert.ok(priced.length > 0,'the test requires a currently priced offer');
    const {packageKg,priceCop} = priced[0];
    const caption = packageKg < 1 ? (packageKg * 1000) + ' g' : packageKg + ' kg';
    const match = results.getByRole('article').filter({has:remoteSourceLink});
    await match.getByText('Fuente: ' + listing.retailer,{exact:true}).waitFor({timeout:45000});
    await match.getByText(/Datos de la tienda.*Confírmalos/).waitFor();
    const choose = match.getByRole('button',{name:'Elegir ' + caption,exact:true});
    assert.match(await choose.locator('..').innerText(),byPrice(priceCop));
    await choose.click();
    for (const [name,value,qualifier] of declared) {
      assert.equal(await input(review,name + ' (%)').inputValue(),value);
      assert.equal(await input(review,'Declaración de ' + name.toLowerCase()).inputValue(),qualifier);
    }
    assert.equal(await input(review,'Tamaño del empaque (kg)').inputValue(),String(packageKg));
    assert.equal(await input(review,'Carbohidratos (%)').inputValue(),'');
    // Dismissing the review cannot save a retail label.
    await review.getByRole('button',{name:'Cerrar',exact:true}).click();
    await button('Mis alimentos').click();
    await page.getByText('Aún no hay fichas guardadas para esta especie.',{exact:true}).waitFor();
    await button('Internet').click();
    await search(query);
    await choose.click({timeout:45000});
    await review.getByRole('button',{name:'Guardar ficha',exact:true}).click();

    // A food unavailable online follows the same confirmation and persistent diary flow.
    await button('Internet').click();
    await search(syntheticFormula);
    await results.getByRole('button',{name:'Usar la etiqueta de mi alimento',exact:true}).click({timeout:45000});
    const manual = page.getByRole('dialog',{name:'Agregar alimento',exact:true});
    assert.equal(await input(manual,'Nombre de la fórmula').inputValue(),syntheticFormula);
    await input(manual,'Marca').fill('Marca de prueba');
    assert.equal(await input(manual,'Especie indicada en el empaque').inputValue(),'cat');
    await input(manual,'Etapa indicada en el empaque').selectOption('adult');
    await manual.getByText('Pegar una ficha o etiqueta',{exact:true}).click();
    await input(manual,'Texto de la etiqueta de esta fórmula').fill(
      'Ingredientes: arroz, pollo. Análisis garantizado: Proteína cruda mínimo 30%, Grasa mínimo 14%, Fibra máximo 4%. Energía metabolizable: 4000 kcal/kg.',
    );
    await manual.getByRole('button',{name:'Extraer datos de la ficha'}).click();
    await manual.getByText('Comprueba los datos de esta fórmula antes de copiarlos.',{exact:true}).waitFor();
    const protein = input(manual,'Proteína (%)');
    assert.equal(await protein.inputValue(),'');
    await manual.getByRole('button',{name:'Copiar estos valores a la ficha'}).click();
    assert.equal(await protein.inputValue(),'30');
    assert.equal(await input(manual,'Energía metabolizable (kcal/kg)').inputValue(),'4000');
    assert.equal(await input(manual,'Carbohidratos (%)').inputValue(),'');
    await manual.getByRole('checkbox',{name:/declara alimento completo y balanceado/i}).check();
    await manual.getByRole('button',{name:'Guardar ficha',exact:true}).click();
    await button(/continuar a comidas/i).click();
    await button(/ver su plan nutricional/i).click();
    await button('Guardar este plan').click();
    await page.reload({waitUntil:'domcontentloaded'});
    const ring = page.getByRole('region',{name:'Progreso diario de Nube Colombia',exact:true});
    await ring.getByText(/Ración diaria:\s*\d+\s*g/).waitFor();
    await button('Alimentos').click();
    await button('Mis alimentos').click();
    const saved = page.getByRole('article',{name:/monello.*castrados/i});
    await saved.waitFor();
    assert.match(await saved.innerText(),byPrice(priceCop));
    assert.match(await saved.innerText(),/Puppis/i);
    assert.equal(await saved.getByRole('combobox').inputValue(),String(packageKg));
    await saved.getByRole('button',{name:'Editar ficha',exact:true}).click();
    for (const [name,value,qualifier] of declared) {
      assert.equal(await input(review,name + ' (%)').inputValue(),value);
      assert.equal(await input(review,'Declaración de ' + name.toLowerCase()).inputValue(),qualifier);
    }
    await review.getByRole('button',{name:'Cerrar',exact:true}).click();
    await page.getByRole('article',{name:'Marca de prueba ' + syntheticFormula,exact:true}).waitFor();
    console.log(JSON.stringify({site:url.origin,product:listing.name,retailer:listing.retailer,
      sizesKg:listing.presentations.map(item => item.packageKg),selectedPackageKg:packageKg,priceCop,
      prefilled:['proteinMin:36','fatMin:9','ashMax:4.5','moistureMax:10'],retailerConfirmation:true,
      pastedLabelWithReview:true,persistedAfterReload:true}));
  } catch (error) {
    console.error('Colombia foods verification stopped on',page.url());
    console.error((await page.locator('main').innerText()).slice(-2000));
    throw error;
  } finally {await browser.close();}
}

verify().catch(error => {console.error(error);process.exitCode=1;});
