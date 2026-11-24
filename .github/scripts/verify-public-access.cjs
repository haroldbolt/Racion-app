const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

async function openRelease(page, url, expectedSha) {
  const deadline = Date.now() + 120_000;
  let observed;
  do {
    const response = await page.goto(url.href, {waitUntil:'domcontentloaded'});
    const marker = page.locator('meta[name="racion-release"]');
    if (response?.ok() && await marker.count() === 1) {
      observed = await marker.getAttribute('content');
      if (observed === expectedSha) return;
    } else {
      observed = 'HTTP ' + response?.status() + ' sin marcador';
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  } while (Date.now() < deadline);
  throw new Error('La versión publicada en ' + url.origin + url.pathname + ' no coincide. Esperada ' + expectedSha + ', observada ' + observed);
}

async function checkRegistration(page, url, sha) {
  assert.equal(new URL(page.url()).origin, url.origin, 'El registro debe abrir en el dominio solicitado');
  assert.equal(await page.locator('meta[name="racion-release"]').getAttribute('content'), sha);
  const main = page.getByRole('main');
  await main.getByRole('heading', {name:'Crea tu cuenta', exact:true}).waitFor();
  await main.getByLabel('Correo electrónico', {exact:true}).waitFor();
  const password = main.getByLabel('Contraseña', {exact:true});
  await password.waitFor();
  assert.equal(await password.getAttribute('type'), 'password');
  assert.ok(await main.getByRole('button', {name:'Crear cuenta', exact:true}).isEnabled());
  const terms = await main.innerText();
  assert.match(terms, /72 horas de prueba/i);
  assert.match(terms, /único cobro de\s+18 USD, sin renovación/i);
  assert.match(terms, /cancelar antes del vencimiento/i);
  assert.match(terms, /solo tarjetas de prueba/i);
  assert.equal(await page.getByRole('navigation').count(), 0);
  for (const name of ['Agregar mascota', 'Hoy', 'Alimentos', '+ Calcular', 'Progreso']) {
    assert.equal(await page.getByRole('button', {name, exact:true}).count(), 0, 'El diario expuso el control ' + name);
  }
}

async function verify() {
  const url = new URL(process.argv[2] || 'https://racion-app.pages.dev/');
  const sha = process.argv[3] || process.env.GITHUB_SHA;
  assert.match(sha || '', /^[a-f0-9]{40}$/i, 'Se requiere el SHA completo que debe estar publicado');
  assert.ok(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage({locale:'es-CO', timezoneId:'America/Bogota', viewport:{width:390,height:844}});
    page.setDefaultTimeout(15000);
    await openRelease(page, url, sha);
    await checkRegistration(page, url, sha);
    await page.getByRole('button', {name:'Ingresar a mi cuenta', exact:true}).click();
    await page.getByRole('heading', {name:'Ingresa a tu cuenta', exact:true}).waitFor();
    await page.reload({waitUntil:'domcontentloaded'});
    await checkRegistration(page, url, sha);
    console.log(JSON.stringify({site:url.origin + url.pathname, commit:sha, registrationBeforeAndAfterReload:true,
      anonymousDiaryAccessible:false, trialHoursShown:72, oneTimeUsdShown:18, testCardsOnly:true}));
  } finally { await browser.close(); }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
