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

async function verifyDiary() {
  const url = new URL(process.argv[2]);
  assert.equal(url.protocol, 'https:');
  await waitForPages(url);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ locale: 'es-CO', timezoneId: 'America/Bogota' });
    const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
    const text = (value) => page.getByText(value, { exact: true });
    page.setDefaultTimeout(10000);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await button('Agregar mascota').click();
    await button('🐱 Gato').click();
    await page.getByRole('textbox', { name: 'Ej. Milo' }).fill('Luna');
    await page.getByRole('spinbutton', { name: 'Peso Actual (kg)' }).fill('4.3');
    await button('Guardar mascota').click();
    await button('♀ Hembra').click();
    await button(/continuar a condición/i).click();
    await button(/continuar a objetivo/i).click();
    await button(/continuar a alimento/i).click();
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
    console.log('Chrome público anónimo: Luna conservó 59 g, horarios 08:30 y 19:30, toma servida de 29 g y pesaje de 4.3 kg tras recargar.');
  } finally {
    await browser.close();
  }
}

verifyDiary().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
