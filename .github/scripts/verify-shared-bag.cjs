const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

const formula = 'Adultos compartida R4';
const store = 'Tienda de prueba R4';
const times = ['08:00', '20:00'];
const rocky = { name: 'Rocky', sex: '♂ Macho', kg: 12, grams: [100, 100] };
const luna = { name: 'Luna', sex: '♀ Hembra', kg: 20, grams: [140, 139] };
const weighedLuna = { ...luna, kg: 20.5, grams: [142, 142] };
const pricePerGram = 150000 / 10000;
const weightNote = 'Pesaje de prueba escenario Rocky y Luna. Luna pesó 20,5 kg al volver del paseo y se usó la misma báscula que en el control anterior.';
const button = (scope, name) => scope.getByRole('button', { name, exact: typeof name === 'string' });
const region = (scope, name) => scope.getByRole('region', { name, exact: true });
const petSwitch = (page, name) => page.locator('header').getByRole('button').filter({ has: page.getByText(name, { exact: true }) });
const dailyGrams = (pet) => pet.grams[0] + pet.grams[1];

function amountPattern(value) {
  return new RegExp('^\\$\\s*' + new Intl.NumberFormat('es-CO').format(Math.round(value)).replaceAll('.', '[.\\s]') + '\\s+COP$');
}

async function screenshot(locator, name) {
  if (!process.env.SHARED_BAG_SCREENSHOT_DIR) return;
  await fs.mkdir(process.env.SHARED_BAG_SCREENSHOT_DIR, { recursive: true });
  await locator.screenshot({ path: path.join(process.env.SHARED_BAG_SCREENSHOT_DIR, name) });
}

async function createPlan(page, pet, createLabel) {
  await button(page, createLabel ? 'Agregar mascota' : '+ Mascota').click();
  await button(page, '🐶 Perro').click();
  await page.getByRole('textbox', { name: 'Ej. Milo' }).fill(pet.name);
  await page.getByRole('spinbutton', { name: 'Peso Actual (kg)' }).fill(String(pet.kg));
  await button(page, 'Guardar mascota').click();
  await button(page, pet.sex).click();
  await button(page, 'Sí').click();
  await button(page, 'Moderado').click();
  await button(page, /continuar a condición/i).click();
  await button(page, /continuar a objetivo/i).click();
  await button(page, /continuar a alimento/i).click();
  if (createLabel) {
    await button(page, /agregar alimento/i).click();
    const label = page.getByRole('dialog', { name: 'Agregar alimento', exact: true });
    await label.getByLabel('Marca', { exact: true }).fill('Prueba');
    await label.getByLabel('Nombre de la fórmula', { exact: true }).fill(formula);
    await label.getByLabel('Etapa indicada en el empaque', { exact: true }).selectOption('adult');
    await label.getByLabel('Tamaño del empaque (kg)', { exact: true }).fill('10');
    // Synthetic label for both test pets, never added to a public catalogue.
    await label.getByLabel('Energía metabolizable (kcal/kg)', { exact: true }).fill('3610');
    await label.getByRole('checkbox', { name: /declara alimento completo y balanceado/i }).check();
    await button(label, 'Guardar ficha').click();
  } else {
    await button(page, 'Mis alimentos').click();
    await page.getByRole('textbox', { name: 'Buscar mis alimentos' }).fill(formula);
    await button(page, /Prueba.*Adultos compartida R4.*3610 kcal\/kg/i).click();
  }
  await button(page, /continuar a comidas/i).click();
  for (const [index, time] of times.entries()) {
    await page.getByLabel('Hora de la toma ' + (index + 1), { exact: true }).fill(time);
  }
  await button(page, /ver su plan nutricional/i).click();
  await button(page, 'Guardar este plan').click();
  await region(page, 'Progreso diario de ' + pet.name).getByText('Ración diaria: ' + dailyGrams(pet) + ' g', { exact: true }).waitFor();
}

async function assertCost(summary, pet) {
  const perDay = dailyGrams(pet) * pricePerGram;
  await summary.getByText('Por día', { exact: true }).locator('..').getByText(amountPattern(perDay)).waitFor();
  await summary.getByText('Por mes estimado', { exact: true }).locator('..').getByText(amountPattern(perDay * 30.5)).waitFor();
  for (const [index, time] of times.entries()) {
    await summary.getByRole('listitem').filter({ hasText: time }).getByText(amountPattern(pet.grams[index] * pricePerGram)).waitFor();
  }
}

async function assertHome(page, pet) {
  await button(page, 'Hoy').click();
  await region(page, 'Progreso diario de ' + pet.name).getByText('Ración diaria: ' + dailyGrams(pet) + ' g', { exact: true }).waitFor();
  await assertCost(region(page, 'Costo de su ración'), pet);
}

async function expenses(page) {
  await button(page, 'Alimentos').click();
  await button(page, 'Gastos ($ COP)').click();
  const panel = region(page, 'Gastos de alimentación');
  await panel.waitFor();
  return panel;
}

async function bagHistory(page, pet, gramsRemaining) {
  const panel = await expenses(page);
  const cost = region(panel, 'Costo de la ración');
  await assertCost(cost, pet);
  assert.doesNotMatch(await panel.innerText(), /Por definir|Sin precio asociado|\$\s*0\s*COP/i);
  const available = region(panel, 'Alimento disponible');
  const mass = String(gramsRemaining).replace(/(\d)(\d{3})$/, '$1[.\\s,]?$2');
  await available.getByText(new RegExp('(?:Rocky \\+ Luna|Luna \\+ Rocky).*' + mass + '\\s*g\\b')).waitFor();
  const entry = panel.getByRole('article');
  assert.equal(await entry.count(), 1, 'One physical bag appears in this profile');
  assert.match(await entry.innerText(), /150[.\s]000\s+COP/);
  assert.equal(await button(entry, 'Eliminar compra').count(), pet.name === luna.name ? 1 : 0);
  return cost;
}

async function run() {
  const url = new URL(process.argv[2]);
  assert.ok(url.hostname === '127.0.0.1' || url.hostname === 'localhost', 'Run the shared bag fixture in a local test build');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ locale: 'es-CO', timezoneId: 'America/Bogota', viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  page.setDefaultTimeout(20000);
  try {
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await createPlan(page, rocky, true);
    await createPlan(page, luna, false);
    const history = region(page, 'Historial de pesajes de Luna');
    const initialWeight = history.getByRole('listitem').filter({ hasText: 'Peso inicial' });
    await button(page, 'Progreso').click();
    await initialWeight.getByText(/^20(?:[.,]0)? kg$/).waitFor();
    assert.equal(await history.getByRole('listitem').count(), 1);
    const panel = await expenses(page);
    await button(panel, 'Registrar compra o factura').click();
    assert.equal(await panel.getByLabel('Peso de cada empaque', { exact: true }).inputValue(), '10');
    assert.equal(await panel.getByLabel('Cantidad de empaques', { exact: true }).inputValue(), '1');
    await panel.getByLabel('Importe total de este alimento (COP)', { exact: true }).fill('150000');
    await panel.getByLabel('Tienda (opcional)', { exact: true }).fill(store);
    await panel.getByRole('checkbox', { name: 'Confirmo el importe y el peso de este alimento', exact: true }).check();
    await button(panel, 'Guardar compra').click();
    await button(panel, 'Registrar apertura de esta compra').click();
    await panel.getByRole('checkbox', { name: rocky.name, exact: true }).check();
    await button(panel, 'Guardar apertura').click();
    await bagHistory(page, luna, 10000);
    await assertHome(page, luna);
    await petSwitch(page, rocky.name).click();
    await assertHome(page, rocky);

    await button(page, 'Ya comió').first().click();
    await button(page, 'Deshacer').waitFor();
    await bagHistory(page, rocky, 9900);
    await petSwitch(page, luna.name).click();
    await bagHistory(page, luna, 9900);
    await assertHome(page, luna);
    await button(page, 'Registrar peso').click();
    const weightForm = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Registrar peso de Luna' }) });
    await weightForm.getByRole('spinbutton').fill('20.5');
    await weightForm.getByPlaceholder('Ej. Control mensual en báscula').fill(weightNote);
    await button(weightForm, 'Guardar peso').click();
    await assertHome(page, weighedLuna);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await assertHome(page, weighedLuna);
    await button(page, 'Progreso').click();
    await initialWeight.getByText(/^20(?:[.,]0)? kg$/).waitFor();
    assert.equal(await history.getByRole('listitem').count(), 2);
    const weighIn = history.getByRole('listitem').filter({ hasText: weightNote });
    await weighIn.getByText(/^20[.,]5 kg$/).waitFor();
    const note = weighIn.getByText(weightNote, { exact: true });
    await note.scrollIntoViewIfNeeded();
    const wholeNoteFits = await note.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rowBounds = element.closest('li').getBoundingClientRect();
      const lines = Array.from(range.getClientRects());
      return lines.length > 1 && lines.every(line =>
        line.left >= Math.max(0, rowBounds.left) - 1 && line.right <= Math.min(innerWidth, rowBounds.right) + 1 &&
        line.top >= rowBounds.top - 1 && line.bottom <= rowBounds.bottom + 1);
    });
    assert.ok(wholeNoteFits, 'La nota completa debe ocupar varias líneas dentro del historial móvil');
    await screenshot(history, 'luna-historial-tras-recarga.png');
    console.log('R5 pesajes: 20 kg iniciales y 20,5 kg con nota completa en móvil después de recargar.');
    await screenshot(await bagHistory(page, weighedLuna, 9900), 'luna-tras-pesaje.png');
    await petSwitch(page, rocky.name).click();
    await assertHome(page, rocky);
    await button(page, 'Deshacer').click();
    await region(page, 'Progreso diario de Rocky').getByText('0 de 2 comidas', { exact: true }).waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await assertHome(page, rocky);
    await screenshot(await bagHistory(page, rocky, 10000), 'rocky-precio-compartido.png');
    await petSwitch(page, luna.name).click();
    await bagHistory(page, weighedLuna, 10000);
    await assertHome(page, weighedLuna);
    console.log(JSON.stringify({ scenario:'R4 shared purchase', bagKg:10, costCop:150000, costPerGramCop:15,
      rocky:{kg:12, mealsCop:[1500,1500], dayCop:3000, monthCop:91500}, luna:{
        kg:20.5, gramsPerDay:284, mealsCop:[2130,2130], dayCop:4260, monthCop:129930},
      sharedInventoryGrams:[10000,9900,10000], persisted:true }));
  } catch (error) {
    console.error('R4 shared purchase:', (await page.locator('body').innerText()).slice(-6500));
    await screenshot(page, 'r4-error.png');
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
