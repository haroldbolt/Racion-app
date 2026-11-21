const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { jsPDF } = require('jspdf');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

const formula = 'Royal Canin Sterilised 37';
const cop = (amount) => new RegExp(`^\\$\\s*${new Intl.NumberFormat('es-CO').format(amount).replaceAll('.', '[.\\s]')}\\s+COP$`);

function invoiceLines(complete = true) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [year, month, day] = today.split('-');
  return [
    'LAIA PETS',
    'FACTURA DE VENTA TEST-001',
    `Fecha: ${day}/${month}/${year}`,
    '',
    complete ? `${formula} 2 kg` : formula,
    ...(complete ? ['Cantidad: 2   Precio unitario: $137.000', 'Total del articulo: $274.000'] : ['Precio del articulo: $137.000']),
    '',
    ...(complete ? ['Collar rojo', 'Cantidad: 1   Precio unitario: $20.000', 'Total del articulo: $20.000', '', 'Subtotal: $294.000', 'Envio: $18.000', 'TOTAL A PAGAR: $312.000'] : ['TOTAL A PAGAR: $137.000']),
  ];
}

// The image is an ordinary receipt fixture. The app must actually recognize its pixels;
// no OCR API, text extraction result or application state is replaced by the test.
async function receiptPng(page, lines) {
  const base64 = await page.evaluate((content) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1900;
    canvas.height = 100 + content.length * 72;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111';
    context.font = '38px monospace';
    context.textBaseline = 'top';
    content.forEach((line, index) => context.fillText(line, 75, 45 + index * 72));
    return canvas.toDataURL('image/png').split(',')[1];
  }, lines);
  return Buffer.from(base64, 'base64');
}

function receiptPdf(lines) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: false });
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(13);
  pdf.text(lines, 36, 50, { lineHeightFactor: 1.7 });
  return Buffer.from(pdf.output('arraybuffer'));
}

async function waitForSite(url) {
  let failure;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok && (await response.text()).includes('<title>Ración App</title>')) return;
      failure = new Error(`Unexpected site response: HTTP ${response.status}`);
    } catch (error) { failure = error; }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw failure;
}

async function createPetWithRation(page, trigger, name) {
  const button = (value) => page.getByRole('button', { name: value, exact: typeof value === 'string' });
  await button(trigger).click();
  await button('🐱 Gato').click();
  await page.getByRole('textbox', { name: 'Ej. Milo' }).fill(name);
  await page.getByRole('spinbutton', { name: 'Peso Actual (kg)' }).fill('4.3');
  await button('Guardar mascota').click();
  await button('♀ Hembra').click();
  await button(/continuar a condición/i).click();
  await button(/continuar a objetivo/i).click();
  await button(/continuar a alimento/i).click();
  await button(/agregar alimento/i).click();
  const label = page.getByRole('dialog', { name: 'Agregar alimento', exact: true });
  await label.getByLabel('Marca', { exact: true }).fill('Royal Canin');
  await label.getByLabel('Nombre de la fórmula', { exact: true }).fill('Sterilised 37');
  await label.getByLabel('Tamaño del empaque (kg)', { exact: true }).fill('2');
  await label.getByLabel('Energía metabolizable (kcal/kg)', { exact: true }).fill('4000');
  await label.getByRole('checkbox', { name: /declara alimento completo y balanceado/i }).check();
  await label.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
  await page.getByRole('spinbutton').nth(0).fill('2');
  await page.getByRole('spinbutton').nth(1).fill('15');
  await button(/continuar a comidas/i).click();
  await page.getByLabel('Hora de la toma 1', { exact: true }).fill('08:30');
  await page.getByLabel('Hora de la toma 2', { exact: true }).fill('19:30');
  await button(/ver su plan nutricional/i).click();
  await page.getByText('54 g', { exact: true }).waitFor();
  await button('Guardar este plan').click();
  await page.getByText('Ración diaria: 54 g', { exact: true }).waitFor();
}

async function chooseReceiptFood(dialog) {
  const review = dialog.getByRole('region', { name: 'Revisión de la factura', exact: true });
  const candidate = review.getByRole('button', { name: /^Usar artículo:.*Royal Canin Sterilised 37/i });
  await candidate.waitFor({ timeout: 120000 });
  await candidate.click();
  return review;
}

async function expectMealCosts(region, dailyCost, mealCost) {
  await region.getByText(cop(dailyCost)).waitFor();
  for (const [index, time] of [[1, '08:30'], [2, '19:30']]) {
    const meal = region.getByRole('listitem').filter({ hasText: `Toma ${index} · ${time}` });
    await meal.getByText(cop(mealCost)).waitFor();
  }
}

async function saveProof(page, name) {
  if (!process.env.RECEIPT_SCREENSHOT_DIR) return;
  await fs.mkdir(process.env.RECEIPT_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.RECEIPT_SCREENSHOT_DIR, name), fullPage: true });
}

async function verifyReceipt() {
  const url = new URL(process.argv[2]);
  const isLocal = url.protocol === 'http:' && url.hostname === '127.0.0.1';
  assert.ok(isLocal || url.origin === 'https://racion-app.pages.dev', 'Use local test preview or the branded public beta');
  if (process.env.GITHUB_SHA) url.searchParams.set('receipt-check', process.env.GITHUB_SHA);
  await waitForSite(url);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let page;
  try {
    page = await browser.newPage({ locale: 'es-CO', timezoneId: 'America/Bogota', viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    page.setDefaultTimeout(15000);
    const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await createPetWithRation(page, 'Agregar mascota', 'Bruma recibos');
    await createPetWithRation(page, '+ Mascota', 'Nube recibos');
    const todayCost = page.getByRole('region', { name: 'Costo de su ración', exact: true });
    assert.match(await todayCost.innerText(), /Por definir/);
    await todayCost.getByRole('button', { name: 'Registrar compra o factura', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Gastos de alimentación', exact: true });
    const upload = dialog.getByLabel('Leer factura (foto o PDF)', { exact: true });
    const confirm = dialog.getByRole('checkbox', { name: 'Confirmo el importe y el peso de este alimento', exact: true });
    const confirmFood = dialog.getByRole('checkbox', { name: 'Este artículo corresponde al alimento seleccionado', exact: true });
    const save = dialog.getByRole('button', { name: 'Guardar compra', exact: true });
    const receiptNetwork = [];
    page.context().on('request', (request) => receiptNetwork.push({ method: request.method(), url: request.url() }));

    const png = await receiptPng(page, invoiceLines());
    await upload.setInputFiles({ name: 'factura-alimento-y-collar.png', mimeType: 'image/png', buffer: png });
    const review = await chooseReceiptFood(dialog);
    assert.ok(receiptNetwork.some((request) => new URL(request.url).pathname.endsWith('/ocr/worker.min.js')),
      'The receipt image must be read by the real local OCR worker');
    assert.match(await review.innerText(), /Royal Canin Sterilised 37/i);
    assert.equal(await dialog.getByLabel('Peso de cada empaque', { exact: true }).inputValue(), '2');
    assert.equal(await dialog.getByLabel('Cantidad de empaques', { exact: true }).inputValue(), '2');
    const extractedAmount = await dialog.getByLabel('Importe total de este alimento (COP)', { exact: true }).inputValue();
    assert.equal(Number(extractedAmount.replace(/\./g, '').replace(',', '.')), 274000, 'OCR must select the food line total, not the invoice grand total');
    assert.equal(await confirm.isChecked(), false, 'Automatic extraction must never consent on the user’s behalf');
    assert.equal(await confirmFood.isChecked(), false, 'The user must confirm the receipt article belongs to the selected food');
    await page.getByText('Aún no hay compras registradas para esta mascota.', { exact: true }).waitFor();
    const preview = dialog.getByRole('region', { name: 'Costo antes de guardar', exact: true });
    await expectMealCosts(preview, 3699, 1850);
    await saveProof(page, 'receipt-review-before-confirmation.png');
    if (await save.isEnabled()) await save.click();
    assert.equal(await dialog.getByRole('link', { name: /Ver recibo/ }).count(), 0, 'Unconfirmed OCR data must not be saved');
    await confirm.check();
    await confirmFood.check();
    // Editing a field after review invalidates confirmation, even when the user re-enters the same amount.
    await dialog.getByLabel('Cantidad de empaques', { exact: true }).fill('3');
    assert.equal(await confirm.isChecked(), false);
    assert.equal(await confirmFood.isChecked(), false);
    await dialog.getByLabel('Cantidad de empaques', { exact: true }).fill('2');
    await confirm.check();
    await confirmFood.check();
    await save.click();
    await expectMealCosts(dialog.getByRole('region', { name: 'Costo de la ración', exact: true }), 3699, 1850);
    await dialog.getByRole('link', { name: /Ver recibo/ }).waitFor();
    await dialog.getByRole('button', { name: 'Cerrar gastos', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectMealCosts(todayCost, 3699, 1850);

    await button('Alimentos').click();
    await button('Gastos ($ COP)').click();
    const expenses = page.getByRole('region', { name: 'Gastos de alimentación', exact: true });
    const purchase = expenses.getByRole('article').filter({ has: page.getByRole('heading', { name: formula, exact: true }) });
    await purchase.waitFor();
    assert.match(await purchase.innerText(), /2\s*×\s*2 kg/);
    assert.match(await purchase.innerText(), /274[.\s]000\s+COP/);
    assert.doesNotMatch(await purchase.innerText(), /312[.\s]000\s+COP/);
    await purchase.getByRole('img', { name: 'Factura de esta compra', exact: true }).waitFor();

    // A digital PDF is read locally too. Its missing package/quantity must remain missing,
    // rather than inheriting the previous receipt or the selected plan’s 2 kg / 1 pack.
    await button('Registrar compra o factura').click();
    await page.getByLabel('Leer factura (foto o PDF)', { exact: true }).setInputFiles({
      name: 'factura-sin-cantidad-ni-peso.pdf', mimeType: 'application/pdf', buffer: receiptPdf(invoiceLines(false)),
    });
    const pdfReview = await chooseReceiptFood(page);
    assert.match(await pdfReview.innerText(), /Royal Canin Sterilised 37/i);
    assert.equal(await page.getByLabel('Peso de cada empaque', { exact: true }).inputValue(), '');
    assert.equal(await page.getByLabel('Cantidad de empaques', { exact: true }).inputValue(), '');
    assert.equal(await page.getByRole('checkbox', { name: 'Confirmo el importe y el peso de este alimento', exact: true }).isChecked(), false);
    assert.equal(await expenses.getByRole('article').count(), 1, 'Reading another invoice must not create another purchase');
    await page.getByRole('button', { name: 'Cerrar formulario de compra', exact: true }).click();

    await button(/🐱\s*Bruma recibos/).click();
    await button('Hoy').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.match(await todayCost.innerText(), /Por definir/);
    await button('Alimentos').click();
    await button('Gastos ($ COP)').click();
    await page.getByText('Aún no hay compras registradas para esta mascota.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: /Ver recibo/ }).count(), 0);
    await button(/🐱\s*Nube recibos/).click();
    await button('Hoy').click();
    await expectMealCosts(todayCost, 3699, 1850);
    assert.deepEqual(receiptNetwork.filter((request) => /^https?:/.test(request.url) &&
      (request.method !== 'GET' || new URL(request.url).origin !== url.origin)), [],
      'Receipt reading must use local pixels/text and same-origin support assets, without uploading the invoice');
    console.log('Facturas reales en el navegador: OCR PNG de dos artículos, total propio274000/2×2kg, revisión sin guardado automático, costo3699/día1850/toma, PDF con datos ausentes, recarga y mascota aislada verificados.');
    await saveProof(page, 'receipt-costs-persisted.png');
  } catch (error) {
    if (page) {
      console.error('Visible state at failure:', (await page.locator('body').innerText().catch(() => '')).slice(-16000));
      await saveProof(page, 'receipt-failure.png').catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
}

verifyReceipt().catch((error) => { console.error(error); process.exitCode = 1; });
