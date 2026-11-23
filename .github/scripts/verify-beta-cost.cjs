const assert = require('node:assert/strict');

function pesos(value) {
  // Browsers can insert a regular or non-breaking space beside the currency sign.
  const digits = String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '[.\\s]?');
  return new RegExp('(?<![\\d.])' + digits + '(?!\\d)');
}

async function verifyQuickCost(page) {
  const section = page.getByRole('region', { name: 'Costo por toma', exact: true });
  await section.waitFor();
  const position = await section.boundingBox();
  assert.ok(position && position.y >= 0 && position.y < page.viewportSize().height, 'Quick cost should be on the first screen');
  const set = async (name, value) => section.getByLabel(name, { exact: true }).fill(value);
  await set('Importe total pagado (COP)', '19200');
  await set('Cantidad de empaques', '2');
  await set('Peso por empaque (kg)', '1');
  await set('Gramos por toma (g)', '15');
  const result = section.getByLabel('Costo calculado por toma', { exact: true });
  await result.waitFor();
  assert.match(await result.innerText(),pesos(144));
  await set('Peso por empaque (kg)', '0');
  assert.doesNotMatch(await section.innerText(), pesos(144));
  await page.reload({waitUntil:'domcontentloaded'});
  console.log('Inicio sin mascota: 2 bolsas de 1 kg por $19.200 COP, 15 g cuestan $144. Se descarta la cifra al quitar el peso válido.');
}

async function verifyEmptyVet(page) {
  const btn = name => page.getByRole('button',{name});
  await btn(/Módulo Veterinario y Urgencias/i).click();
  await btn('Pauta del Vet').click();
  const form = page.locator('main form').filter({has:page.getByLabel('Kcal / día',{exact:true})});
  await form.waitFor();
  const prescribed = form.locator('input:not([type=checkbox]):not([type=hidden]), textarea');
  assert.ok(await prescribed.count() >= 5);
  for(const field of await prescribed.all()) assert.equal(await field.inputValue(),'');
  const consent = form.getByRole('checkbox',{name:/confirmo.*orden/i});
  assert.equal(await consent.isChecked(),false);
  const save = form.locator('button[type=submit]');
  assert.ok(await save.isDisabled() || !await form.evaluate(el=>el.checkValidity()), 'A blank form must not save a prescription');
  await btn('Monitoreo Médico').click();
  assert.equal(await page.getByLabel('Glucosa (mg/dL)',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('Insulina administrada (U)',{exact:true}).inputValue(),'');
  await btn('Emergencias 24h').click();
  assert.equal(await page.locator('main a[href^="tel:"]').count(),0);
  await btn(/Volver a Más/).click();
  console.log('Veterinario: pauta y registros sin valores de muestra, sin enlace de llamadas hasta guardar un contacto.');
}

async function priceField(card, label) {
  // Match the definition term itself, including when it contains no nested text nodes.
  const dd = card.getByText(label, {exact:true}).and(card.locator('dt')).locator('xpath=following-sibling::dd[1]');
  return dd.innerText();
}

async function verifyOffer(card, bag, total, amounts) {
  assert.match(await priceField(card,'Precio de la bolsa'),pesos(bag));
  const shippingTotal = await priceField(card,'Total con envío');
  if (total === null) assert.equal(shippingTotal, 'No calculable');
  else assert.match(shippingTotal,pesos(total));
  const perMeal = await priceField(card,'Costo por toma');
  assert.match(perMeal, total === null ? /sin envío/i : /con envío/i);
  for (const amount of amounts) assert.match(perMeal,pesos(amount));
}

async function verifyPublishedOffer(page) {
  const button = name => page.getByRole('button',{name});
  await button('Hoy').click();
  await button(/comparar precios|ver precios/i).first().click();
  await page.getByLabel('Presentación (kg)').fill('2');
  await page.getByLabel('Ciudad').selectOption('Bogotá');
  await page.getByLabel('Código postal de Bogotá').fill('110111');
  const [response] = await Promise.all([
    page.waitForResponse(r=>new URL(r.url()).pathname==='/api/live-prices' && r.request().method()==='POST',{timeout:45000}),
    button('Consultar precios').click(),
  ]);
  const payload = await response.json();
  assert.equal(payload.status,'current');
  const offer = payload.offers.find(o=>o.id===payload.cheapestOfferId && o.shippingPostalCode==='110111' && o.grams===2000);
  assert.ok(offer && typeof offer.totalCop==='number', 'Expected a live exact-package offer including postal delivery');
  const card = page.getByRole('region',{name:'Resultado de precios'}).getByRole('article').filter({has:page.getByRole('heading',{name:offer.retailer,exact:true})}).filter({hasText:/Más barato hoy|Menor total confirmado/i});
  const amounts = [29,30].map(g=>Math.round(offer.totalCop*g/offer.grams));
  await verifyOffer(card,offer.productPriceCop,offer.totalCop,amounts);
  await card.getByText('Ver costo por horario', {exact:true}).click();
  for (const [index, grams] of [29, 30].entries()) {
    const row = card.getByRole('listitem').filter({hasText: grams + ' g'});
    assert.match(await row.innerText(), pesos(amounts[index]));
  }
  console.log(JSON.stringify({site:new URL(page.url()).origin,retailer:offer.retailer,grams:offer.grams,postalCode:'110111',bagCop:offer.productPriceCop,deliveryCop:offer.shippingCop,totalCop:offer.totalCop,mealGrams:[29,30],mealCop:amounts}));
  await button('Volver al plan').click();
  await button('Más').click();
}
module.exports = { verifyQuickCost, verifyEmptyVet, verifyOffer, verifyPublishedOffer };
