const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright-core');

async function openRelease(page, url, expectedSha) {
  const deadline = Date.now() + 120000;
  do {
    const response = await page.goto(url.href, {waitUntil:'domcontentloaded'});
    const marker = page.locator('meta[name="racion-release"]');
    if (response?.ok() && await marker.count() && await marker.getAttribute('content') === expectedSha) return;
    await new Promise(resolve => setTimeout(resolve, 5000));
  } while (Date.now() < deadline);
  throw new Error('La versión publicada en ' + url.origin + url.pathname + ' no coincide con ' + expectedSha);
}

async function checkOffer(page) {
  const main = page.getByRole('main');
  const purchase = main.getByRole('link', {name:'Comprar',exact:true});
  await purchase.waitFor();
  const checkout = new URL(await purchase.getAttribute('href'));
  assert.equal(checkout.origin, 'https://pay.hotmart.com');
  assert.ok(checkout.pathname.length > 1, 'The checkout must select a Hotmart offer');
  assert.ok(await main.getByRole('button', {name:'Ya compré',exact:true}).isEnabled());
  const text = await main.innerText();
  assert.match(text, /25\s*USD|USD\s*25/i);
  assert.match(text, /pago único|único pago/i);
  assert.doesNotMatch(text, /Stripe|72 horas|18\s*USD|cuarto día|registrar tarjeta/i);
  assert.equal(await page.getByRole('button',{name:'Progreso',exact:true}).count(), 0);
  return checkout.href;
}

async function verify() {
  const url = new URL(process.argv[2]);
  const sha = process.argv[3] || process.env.GITHUB_SHA;
  assert.match(sha || '', /^[a-f0-9]{40}$/i);
  assert.ok(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)));
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({locale:'es-CO',timezoneId:'America/Bogota',viewport:{width:390,height:844}});
    await openRelease(page, url, sha);
    await checkOffer(page);
    await page.getByRole('button', {name:'Ya compré',exact:true}).click();
    await page.getByLabel('Correo electrónico', {exact:true}).waitFor();
    await page.reload({waitUntil:'domcontentloaded'});
    await checkOffer(page);
    console.log(JSON.stringify({site:url.origin + url.pathname, commit:sha, checkout:'Hotmart', oneTimeUsd:25,
      paidEntryVisibleAfterReload:true, anonymousDiaryAccessible:false}));
  } finally { await browser.close(); }
}

module.exports = { checkOffer };
if (require.main === module) verify().catch(error => { console.error(error); process.exitCode = 1; });
