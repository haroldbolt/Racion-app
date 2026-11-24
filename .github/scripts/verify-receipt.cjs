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

function receiptPdf(lines, secondPage) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: false });
  pdf.setFont('courier', 'normal');
  pdf.setFontSize(13);
  pdf.text(lines, 36, 50, { lineHeightFactor: 1.7 });
  if (secondPage) {
    pdf.addPage();
    pdf.text(secondPage, 36, 180);
  }
  return Buffer.from(pdf.output('arraybuffer'));
}

function hybridReceiptPdf(png, imageHeight) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: false });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Digitalizado por el escáner de oficina. Documento de compra, página 1.', 28, 28);
  // Only the scanner watermark is native text. All purchase information is pixels.
  pdf.addImage(`data:image/png;base64,${png.toString('base64')}`, 'PNG', 28, 60, 540, 540 * imageHeight / 1900);
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
  await page.screenshot({ path: path.join(process.env.RECEIPT_SCREENSHOT_DIR, name), fullPage: false });
}

async function openStoredReceipt(page, card) {
  const tabCount = page.context().pages().length;
  await card.getByRole('button', { name: /Ver recibo/ }).click();
  const viewer = page.getByRole('dialog', { name: 'Recibo de la compra', exact: true });
  await viewer.waitFor();
  assert.equal(page.context().pages().length, tabCount, 'El comprobante debe abrirse en la app');
  return viewer;
}

function museInvoice(size) {
  return [
    'FACTURA DE VENTA MUSE-001',
    'Tienda: Mascotas Prueba S.A.S.',
    'Fecha: 22/11/2026',
    '',
    `Agility Gold Grandes Adultos  2 bolsas de ${size} kg`,
    '',
    'TOTAL: $90.000 COP',
  ];
}

async function verifyMuseReceipt(page, url) {
  const button = (name) => page.getByRole('button', { name, exact: typeof name === 'string' });
  const workerUrls = [];
  page.on('worker', worker => workerUrls.push(worker.url()));
  await page.clock.setFixedTime(new Date('2026-11-23T15:00:00-05:00'));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await button('Agregar mascota').click();
  await button('🐶 Perro').click();
  await page.getByRole('textbox', { name: 'Ej. Milo' }).fill('Milo facturas');
  await page.getByRole('spinbutton', { name: 'Peso Actual (kg)' }).fill('30');
  await button('Guardar mascota').click();
  await button('♂ Macho').click();
  await button(/continuar a condición/i).click();
  await button(/continuar a objetivo/i).click();
  await button(/continuar a alimento/i).click();
  await page.getByRole('textbox', { name: 'Buscar alimentos en internet' }).fill('Agility Gold Grandes Adultos');
  await button('Buscar en internet').click();
  const catalog = page.getByRole('region', { name: 'Alimentos de Agrocentro Pets' });
  const food = catalog.getByRole('article', { name: 'Agility Gold Adulto Raza Grande', exact: true });
  await food.getByRole('button', { name: 'Elegir 1.5 kg', exact: true }).click();
  // Two meals of 150 g are the purchase-cost reference specified by Muse.
  await page.getByRole('spinbutton', { name: 'Gramos diarios elegidos de la tabla' }).fill('300');
  await button(/continuar a comidas/i).click();
  await page.getByLabel('Hora de la toma 1', { exact: true }).fill('08:30');
  await page.getByLabel('Hora de la toma 2', { exact: true }).fill('19:30');
  await button(/ver su plan nutricional/i).click();
  await button('Guardar este plan').click();
  const todayCost = page.getByRole('region', { name: 'Costo de su ración', exact: true });
  const openPurchase = todayCost.getByRole('button', { name: 'Registrar compra o factura', exact: true });
  await openPurchase.click();
  const dialog = page.getByRole('dialog', { name: 'Gastos de alimentación', exact: true });
  const upload = dialog.getByLabel('Leer factura (foto o PDF)', { exact: true });
  const review = dialog.getByRole('region', { name: 'Revisión de la factura', exact: true });
  const recognized = review.getByRole('button', { name: /^Usar artículo:.*Agility Gold Grandes Adultos/i });
  const weight = dialog.getByLabel('Peso de cada empaque', { exact: true });
  const general = dialog.getByRole('checkbox', { name: 'Confirmo el importe y el peso de este alimento', exact: true });
  const sameFood = dialog.getByRole('checkbox', { name: 'Este artículo corresponde al alimento seleccionado', exact: true });
  const largeWeight = dialog.getByRole('checkbox', { name: /^Verifiqué en la factura que cada empaque pesa 15 kg/ });
  const save = dialog.getByRole('button', { name: 'Guardar compra', exact: true });

  const amount = dialog.getByLabel('Importe total de este alimento (COP)', { exact: true });
  async function checkReadValues(file, expectedKg, expectedAmount = '90000') {
    await upload.setInputFiles(file);
    await recognized.waitFor({ timeout: 120000 });
    // A single line is selected automatically. Every field below comes from the reader.
    await page.waitForFunction(expected => {
      const input = document.querySelector('input[name="packageWeight"]');
      return !!input && Number(input.value.replace(',', '.')) === expected;
    }, expectedKg);
    assert.equal(Number((await weight.inputValue()).replace(',', '.')), expectedKg);
    assert.equal(await dialog.getByLabel('Cantidad de empaques', { exact: true }).inputValue(), '2');
    assert.equal((await amount.inputValue()).replaceAll('.', ''), expectedAmount);
    assert.equal(await dialog.getByLabel('Fecha de compra', { exact: true }).inputValue(), '2026-11-22');
    assert.equal(await dialog.getByLabel('Tienda (opcional)', { exact: true }).inputValue(), 'Mascotas Prueba S.A.S.');
    assert.equal(await general.isChecked(), false);
    assert.equal(await sameFood.isChecked(), false);
  }
  const pdfFile = (size) => ({ name: 'factura-muse.pdf', mimeType: 'application/pdf', buffer: receiptPdf(museInvoice(size)) });
  try {
    const png = await receiptPng(page, museInvoice('1,5'));
    await checkReadValues({ name: 'factura-muse.png', mimeType: 'image/png', buffer: png }, 1.5);
    assert.ok(workerUrls.some(value => new URL(value).pathname.endsWith('/ocr/worker.min.js')), 'The original image must run local OCR');
    assert.equal(await largeWeight.count(), 0);
    const preview = dialog.getByRole('region', { name: 'Costo antes de guardar', exact: true });
    await expectMealCosts(preview, 9000, 4500);
    await page.getByText('Aún no hay compras registradas para esta mascota.', { exact: true }).waitFor();
    await preview.scrollIntoViewIfNeeded();
    await saveProof(page, 'muse-revision-150g.png');
    await general.check();
    await sameFood.check();
    await save.click();
    await expectMealCosts(dialog.getByRole('region', { name: 'Costo de la ración', exact: true }), 9000, 4500);
    await dialog.getByRole('button', { name: 'Cerrar gastos', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectMealCosts(todayCost, 9000, 4500);
    await button('Alimentos').click();
    await button('Gastos ($ COP)').click();
    const expenses = page.getByRole('region', { name: 'Gastos de alimentación', exact: true });
    const purchase = expenses.getByRole('article');
    await purchase.first().waitFor();
    assert.equal(await purchase.count(), 1);
    const savedText = await purchase.innerText();
    assert.match(savedText, /2026-11-22\s*·\s*Mascotas Prueba S\.A\.S\./);
    assert.match(savedText, /2\s*×\s*1,5 kg/);
    assert.match(savedText, /90[.\s]000\s+COP/);
    assert.match(savedText, /30[.\s]000\s+COP\s*\/\s*kg/);
    await purchase.getByText('Ración al comprar', { exact: true }).click();
    for (const time of ['08:30', '19:30']) {
      await purchase.getByText(new RegExp(time + '.*150 g.*4[.\\s]500\\s+COP')).waitFor();
    }
    await purchase.scrollIntoViewIfNeeded();
    await saveProof(page, 'muse-compra-tras-recarga.png');
    const imageViewer = await openStoredReceipt(page, purchase);
    const image = imageViewer.getByRole('img', { name: 'Imagen del recibo', exact: true });
    await image.waitFor();
    assert.ok(await image.evaluate(async element => {
      await element.decode();
      return element.naturalWidth > 100 && element.naturalHeight > 100;
    }), 'La foto guardada debe tener píxeles legibles');
    await saveProof(page, 'muse-imagen-abierta-tras-recarga.png');
    await imageViewer.getByRole('button', { name: 'Cerrar recibo' }).click();

    await button('Hoy').click();
    await openPurchase.click();
    await checkReadValues(pdfFile('1.5'), 1.5);
    assert.equal(await largeWeight.count(), 0);
    await checkReadValues(pdfFile('15'), 15);
    await general.check();
    await sameFood.check();
    assert.equal(await largeWeight.isChecked(), false);
    assert.equal(await save.isDisabled(), true, 'Even a manufacturer-listed 15 kg bag needs explicit approval when the selected pack is 1.5 kg');
    await largeWeight.scrollIntoViewIfNeeded();
    await saveProof(page, 'muse-alerta-peso-10x.png');
    await largeWeight.check();
    assert.equal(await save.isEnabled(), true);
    await weight.fill('8');
    await dialog.getByText(/8 kg no coincide con (?:las|ninguna de las) presentaciones/i).waitFor();
    await weight.fill('15');
    assert.equal(await largeWeight.isChecked(), false, 'Editing the amount invalidates the tenfold weight approval');
    assert.equal(await save.isDisabled(), true);
    assert.equal(await dialog.getByRole('article').count(), 1);

    const secondPage = 'Anexo de la factura MUSE-001. Conserve esta pagina con su comprobante.';
    const originalPdf = receiptPdf(museInvoice('1,5'), secondPage);
    // The annex contains unassigned text. Review the amount printed on the receipt.
    await checkReadValues({name:'factura-muse-dos-paginas.pdf', mimeType:'application/pdf', buffer:originalPdf}, 1.5, '');
    await amount.fill('90000');
    const pdfStore = 'Mascotas Prueba S.A.S. Sucursal PDF';
    await dialog.getByLabel('Tienda (opcional)', {exact:true}).fill(pdfStore);
    await general.check();
    await sameFood.check();
    await save.click();
    await dialog.getByRole('article').filter({hasText:pdfStore}).waitFor();
    await dialog.getByRole('button', { name: 'Cerrar gastos', exact:true }).click();
    await page.reload({waitUntil:'domcontentloaded'});
    await button('Alimentos').click();
    await button('Gastos ($ COP)').click();
    const savedPdf = expenses.getByRole('article').filter({hasText:pdfStore});
    const pdfViewer = await openStoredReceipt(page, savedPdf);
    const pageOne = pdfViewer.getByRole('img', {name:'Página 1 del recibo', exact:true});
    await pageOne.waitFor();
    await pdfViewer.getByRole('button', {name:'Página siguiente', exact:true}).click();
    await pdfViewer.getByText('Página 2 de 2', {exact:true}).waitFor();
    await pdfViewer.getByRole('img', {name:'Página 2 del recibo', exact:true}).waitFor();
    const storedBytes = await pdfViewer.getByRole('link', {name:'Descargar PDF'}).evaluate(async link =>
      Array.from(new Uint8Array(await (await fetch(link.href)).arrayBuffer())));
    assert.deepEqual(Buffer.from(storedBytes), originalPdf, 'Las dos páginas del PDF se recuperan intactas');
    await saveProof(page, 'muse-pdf-pagina-2-tras-recarga.png');
    await pdfViewer.getByRole('button', {name:'Cerrar recibo'}).click();
    console.log('R5 recibos: foto visible y PDF original de dos páginas recuperado íntegro en la app tras recargar.');
    console.log(JSON.stringify({ scenario:'R3 Muse', food:'Agility Gold Grandes Adultos', receipt:'real PNG OCR / digital PDF',
      quantity:2, packageKg:1.5, totalPaidCop:90000, merchant:'Mascotas Prueba S.A.S.', purchaseDate:'2026-11-22',
      costPerGramCop:30, gramsPerMeal:150, costPerMealCop:4500, persisted:true, warnedForUnlistedKg:8, blockedTenfoldKg:15 }));
  } catch (error) {
    console.error('R3 receipt test stopped:', (await page.locator('body').innerText()).slice(-9500));
    await saveProof(page, 'muse-fallo.png');
    throw error;
  }
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
    const preexistingFonts = new Set();
    const observeInitialFonts = (request) => {
      const target = new URL(request.url());
      const type = request.resourceType();
      if (request.method() === 'GET' && ['stylesheet', 'font'].includes(type) &&
        ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(target.hostname)) {
        preexistingFonts.add(`${type}\n${request.url()}`);
      }
    };
    page.context().on('request', observeInitialFonts);
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
    // Freeze exact font URLs observed before the invoice exists. Reloads may request
    // these static assets again; this never permits a new external URL or a POST.
    page.context().off('request', observeInitialFonts);
    const receiptNetwork = [];
    page.context().on('request', (request) => receiptNetwork.push({ method: request.method(), url: request.url(), type: request.resourceType() }));

    const png = await receiptPng(page, invoiceLines());
    await upload.setInputFiles({ name: 'factura-alimento-y-collar.png', mimeType: 'image/png', buffer: png });
    const review = await chooseReceiptFood(dialog);
    assert.ok(receiptNetwork.some((request) => new URL(request.url).pathname.endsWith('/ocr/worker.min.js')),
      'The receipt image must be read by the real local OCR worker');
    assert.match(await review.innerText(), /Royal Canin Sterilised 37/i);
    await saveProof(page, 'receipt-article-detected.png');
    assert.equal(await dialog.getByLabel('Peso de cada empaque', { exact: true }).inputValue(), '2');
    assert.equal(await dialog.getByLabel('Cantidad de empaques', { exact: true }).inputValue(), '2');
    const extractedAmount = await dialog.getByLabel('Importe total de este alimento (COP)', { exact: true }).inputValue();
    assert.equal(Number(extractedAmount.replace(/\./g, '').replace(',', '.')), 274000, 'OCR must select the food line total, not the invoice grand total');
    assert.equal(await confirm.isChecked(), false, 'Automatic extraction must never consent on the user’s behalf');
    assert.equal(await confirmFood.isChecked(), false, 'The user must confirm the receipt article belongs to the selected food');
    await page.getByText('Aún no hay compras registradas para esta mascota.', { exact: true }).waitFor();
    const preview = dialog.getByRole('region', { name: 'Costo antes de guardar', exact: true });
    await expectMealCosts(preview, 3699, 1850);
    await preview.scrollIntoViewIfNeeded();
    await saveProof(page, 'receipt-review-before-confirmation.png');
    if (await save.isEnabled()) await save.click();
    assert.equal(await dialog.getByRole('button', { name: /Ver recibo/ }).count(), 0, 'Unconfirmed OCR data must not be saved');
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
    await dialog.getByRole('button', { name: /Ver recibo/ }).waitFor();
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

    // A complete digital invoice must use its native text, without initializing OCR again.
    const ocrWorkerRequests = () => receiptNetwork.filter((request) =>
      new URL(request.url).pathname.endsWith('/ocr/worker.min.js')).length;
    const beforeDigitalPdf = ocrWorkerRequests();
    await button('Registrar compra o factura').click();
    await page.getByLabel('Leer factura (foto o PDF)', { exact: true }).setInputFiles({
      name: 'factura-digital-completa.pdf', mimeType: 'application/pdf', buffer: receiptPdf(invoiceLines()),
    });
    await chooseReceiptFood(page);
    assert.equal(await page.getByLabel('Peso de cada empaque', { exact: true }).inputValue(), '2');
    assert.equal(await page.getByLabel('Cantidad de empaques', { exact: true }).inputValue(), '2');
    assert.equal(await page.getByLabel('Importe total de este alimento (COP)', { exact: true }).inputValue(), '274000');
    await expectMealCosts(page.getByRole('region', { name: 'Costo antes de guardar', exact: true }), 3699, 1850);
    assert.equal(ocrWorkerRequests(), beforeDigitalPdf, 'A complete native PDF must not need OCR');
    assert.equal(await expenses.getByRole('article').count(), 1, 'Reviewing a PDF must not save another purchase');
    await page.getByRole('button', { name: 'Cerrar formulario de compra', exact: true }).click();

    // Scanner metadata is not a readable invoice. A hybrid PDF must still recognize
    // its receipt image instead of stopping at the native watermark.
    await button('Registrar compra o factura').click();
    await page.getByLabel('Leer factura (foto o PDF)', { exact: true }).setInputFiles({
      name: 'factura-escaneada-con-marca-nativa.pdf', mimeType: 'application/pdf',
      buffer: hybridReceiptPdf(png, 100 + invoiceLines().length * 72),
    });
    await chooseReceiptFood(page);
    assert.equal(await page.getByLabel('Peso de cada empaque', { exact: true }).inputValue(), '2');
    assert.equal(await page.getByLabel('Cantidad de empaques', { exact: true }).inputValue(), '2');
    assert.equal(await page.getByLabel('Importe total de este alimento (COP)', { exact: true }).inputValue(), '274000');
    assert.ok(ocrWorkerRequests() > beforeDigitalPdf, 'A scanned receipt with only native metadata must run OCR');
    await expectMealCosts(page.getByRole('region', { name: 'Costo antes de guardar', exact: true }), 3699, 1850);
    assert.equal(await page.getByRole('checkbox', { name: 'Confirmo el importe y el peso de este alimento', exact: true }).isChecked(), false);
    assert.equal(await page.getByRole('checkbox', { name: 'Este artículo corresponde al alimento seleccionado', exact: true }).isChecked(), false);
    assert.equal(await expenses.getByRole('article').count(), 1, 'Reviewing a scanned PDF must not save another purchase');
    await page.getByRole('button', { name: 'Cerrar formulario de compra', exact: true }).click();

    // A PDF is read locally too. Its missing package/quantity must remain missing,
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
    assert.equal(await page.getByRole('button', { name: /Ver recibo/ }).count(), 0);
    await button(/🐱\s*Nube recibos/).click();
    await button('Hoy').click();
    await expectMealCosts(todayCost, 3699, 1850);
    assert.deepEqual(receiptNetwork.filter((request) => /^https?:/.test(request.url) &&
      (request.method !== 'GET' || (new URL(request.url).origin !== url.origin &&
        !preexistingFonts.has(`${request.type}\n${request.url}`)))), [],
      'Receipt reading must use local pixels/text and same-origin support assets, without uploading the invoice');
    await todayCost.scrollIntoViewIfNeeded();
    await saveProof(page, 'receipt-costs-persisted.png');

    const musePage = await browser.newPage({ locale: 'es-CO', timezoneId: 'America/Bogota',
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    musePage.setDefaultTimeout(20000);
    try {
      await verifyMuseReceipt(musePage, url.href);
    } finally { await musePage.close(); }

    // Initialization failures need a clean IndexedDB context, otherwise cached languages
    // would hide a broken download. Only this isolated failure test replaces model GETs.
    const failureContext = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota',
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    try {
      let refusedModels = 0;
      await failureContext.route('**/ocr/lang/*.traineddata.gz', async (route) => {
        assert.equal(route.request().method(), 'GET');
        assert.equal(new URL(route.request().url()).origin, url.origin);
        refusedModels++;
        await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Model temporarily unavailable in the failure test' });
      });
      const failurePage = await failureContext.newPage();
      failurePage.setDefaultTimeout(15000);
      await failurePage.goto(url.href, { waitUntil: 'domcontentloaded' });
      await createPetWithRation(failurePage, 'Agregar mascota', 'Error de lectura');
      await failurePage.getByRole('region', { name: 'Costo de su ración', exact: true })
        .getByRole('button', { name: 'Registrar compra o factura', exact: true }).click();
      const failureDialog = failurePage.getByRole('dialog', { name: 'Gastos de alimentación', exact: true });
      const closedOcrWorkers = [];
      failurePage.on('worker', (worker) => {
        if (new URL(worker.url()).pathname.endsWith('/ocr/worker.min.js')) {
          closedOcrWorkers.push(new Promise((resolve) => worker.once('close', resolve)));
        }
      });
      const started = Date.now();
      await failureDialog.getByLabel('Leer factura (foto o PDF)', { exact: true }).setInputFiles({
        name: 'factura-con-modelo-no-disponible.png', mimeType: 'image/png', buffer: png,
      });
      await failureDialog.getByRole('alert').filter({ hasText: /manualmente/i }).waitFor({ timeout: 15000 });
      assert.ok(Date.now() - started < 15000, 'Model errors must become a manual fallback before the global OCR timeout');
      assert.ok(refusedModels > 0, 'The isolated failure must actually request an uncached language model');
      assert.ok(closedOcrWorkers.length > 0, 'OCR must have started a real worker before the initialization error');
      let workerTimeout;
      try {
        await Promise.race([
          Promise.all(closedOcrWorkers),
          new Promise((_, reject) => { workerTimeout = setTimeout(() => reject(new Error('Failed OCR worker was not closed')), 5000); }),
        ]);
      } finally { clearTimeout(workerTimeout); }
      assert.equal(failurePage.workers().filter((worker) => new URL(worker.url()).pathname.endsWith('/ocr/worker.min.js')).length, 0);
      for (const field of ['Peso de cada empaque', 'Cantidad de empaques', 'Importe total de este alimento (COP)', 'Fecha de compra']) {
        assert.equal(await failureDialog.getByLabel(field, { exact: true }).isEnabled(), true, `${field}: manual entry must recover after OCR failure`);
      }
      await failureDialog.getByLabel('Peso de cada empaque', { exact: true }).fill('2');
      await failureDialog.getByLabel('Cantidad de empaques', { exact: true }).fill('1');
      await failureDialog.getByLabel('Importe total de este alimento (COP)', { exact: true }).fill('137.000');
      await failureDialog.getByLabel('Fecha de compra', { exact: true }).fill(
        new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
      );
      await expectMealCosts(failureDialog.getByRole('region', { name: 'Costo antes de guardar', exact: true }), 3699, 1850);
      assert.equal(await failureDialog.getByRole('checkbox', { name: 'Confirmo el importe y el peso de este alimento', exact: true }).isChecked(), false);
      await failurePage.getByText('Aún no hay compras registradas para esta mascota.', { exact: true }).waitFor();
      assert.equal(await failurePage.getByRole('button', { name: /Ver recibo/ }).count(), 0);
      await failureDialog.getByRole('region', { name: 'Costo antes de guardar', exact: true }).scrollIntoViewIfNeeded();
      await saveProof(failurePage, 'receipt-manual-after-model-error.png');
    } finally { await failureContext.close(); }
    console.log('Facturas reales en el navegador: OCR PNG de dos artículos, total propio274000/2×2kg, revisión sin guardado automático, costo3699/día1850/toma, PDF digital nativo, PDF escaneado con marca nativa, datos ausentes, recarga y mascota aislada verificados.');
    console.log('Fallo de modelo503: aviso manual antes15s, campos recuperados, ningún guardado automático y workerOCR cerrado verificados en contexto nuevo.');
  } catch (error) {
    if (page) {
      console.error('Visible state at failure:', (await page.locator('body').innerText().catch(() => '')).slice(-16000));
      await saveProof(page, 'receipt-failure.png').catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
}

verifyReceipt().catch((error) => { console.error(error); process.exitCode = 1; });
