const assert = require('node:assert/strict');

const merchantOrigin = 'https://storefront-api.tiendanube.com';
const storePath = '/2026-11/stores/5624899';
const searchQuery = 'Royal Canin Sterilised 37';
const formulaName = 'Sterilised 37 Concentrado para Gatos Adultos';
const formula = `Royal Canin ${formulaName}`;

// Public merchant sample. The weight field is deliberately unreliable, while the named
// variant values declare the package size. Nutrition in prose stays unconfirmed.
const merchantProduct = {
  id: 354674514,
  name: formula,
  handle: 'royal-canin-sterilised-37-x-400-g',
  brand: 'Royal Canin',
  description: '<p>Alimento completo para gatos adultos. Grasas (12%) y proteínas (37%).</p>',
  tags: 'feline health nutrition dry, Gato sterilised 37, gatos, royal canin',
  categories: [
    { id: 29873171, name: 'Gatos', handle: 'gatos', parent: null },
    { id: 29873185, name: 'Concentrado para Gatos', handle: 'concentrado-para-gato', parent: 29873171 },
  ],
  images: [],
  variants: [
    { id: 1600409989, values: ['400 g'], weight: '0.001', price: '30200.00' },
    { id: 1600409990, values: ['2 kg'], weight: '0.002', price: '137000.00' },
    { id: 1600409991, values: ['4 kg'], weight: '0.004', price: '253000.00' },
    { id: 1600409992, values: ['10 kg'], weight: '0.010', price: '499000.00' },
  ].map((variant) => ({
    ...variant,
    product_id: 354674514,
    visible: true,
    stock_management: false,
    stock: null,
    promotional_price: null,
    barcode: '3182550737555',
  })),
};

async function installMerchantFixtures(page) {
  const fixture = { unavailable: false };
  await page.route(`${merchantOrigin}/**`, async (route) => {
    if (fixture.unavailable) {
      await route.abort('internetdisconnected');
      return;
    }
    const request = route.request();
    const url = new URL(request.url());
    assert.equal(request.method(), 'GET');
    let json;
    if (url.pathname === storePath) {
      json = { id: 5624899, country: 'CO', currency: 'COP' };
    } else if (url.pathname === `${storePath}/search/products`) {
      assert.equal(url.searchParams.get('q'), searchQuery);
      json = {
        data: [{ id: merchantProduct.id }],
        pagination: { page: 1, per_page: 8, total: 1, total_pages: 1 },
      };
    } else {
      assert.equal(url.pathname, `${storePath}/products/${merchantProduct.id}`);
      json = merchantProduct;
    }
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      json,
    });
  });
  return fixture;
}

module.exports = { merchantOrigin, searchQuery, formulaName, formula, installMerchantFixtures };
