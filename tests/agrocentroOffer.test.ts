import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgrocentroPriceIndex } from '../scripts/agrocentro-price-index.mjs';
import index from '../workers/live-prices/agrocentroIndex.json';
import { findAgrocentroOffer } from '../workers/live-prices/agrocentroOffer';

const product = {brand:'Royal Canin', name:'Sterilised 37', grams:2000};
const handle = 'alimento-para-gato-royal-canin-feline-health-nutrition-sterilised';
const title = 'Alimento Para Gato Royal Canin Feline Health Nutrition Sterilised';
const sku = {id:'gid://shopify/ProductVariant/52674296414488', title:'2 kg', availableForSale:false,
  barcode:'3182550737593', price:{amount:'132400.0', currencyCode:'COP'}};

function storefront(nodes: unknown[], titleOverride = title, hasNextPage = false): typeof fetch {
  return async (input, init) => {
    assert.equal(String(input), 'https://cultivacenter.com/api/2026-10/graphql.json');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init.body));
    assert.match(body.query, /@inContext\(country:\s*CO\)/);
    assert.deepEqual(body.variables, {handle});
    return Response.json({data:{product:{handle, title:titleOverride, variants:{nodes,pageInfo:{hasNextPage}}}}});
  };
}

test('bundle index matches the current shop inventory and official product names', async () => {
  assert.deepEqual(index, await buildAgrocentroPriceIndex());
});

test('exact adult Sterilised 37 names all read the same Colombian 2 kg SKU and its actual availability', async () => {
  for (const name of ['Sterilised 37', 'Sterilised 37 Neutered Cat Dry', 'Royal Canin Sterilised 37 Concentrado para Gatos Adultos', title]) {
    const offer = await findAgrocentroOffer({...product,name}, storefront([sku]));
    assert.equal(offer?.id, 'agrocentro-52674296414488');
    assert.equal(offer?.stock, 'out_of_stock');
    assert.equal(offer?.productPriceCop, 132400);
    assert.equal(offer?.pricePerKgCop, 66200);
    assert.equal(offer?.shippingCop, null);
    assert.equal(offer?.totalCop, null);
    assert.equal(offer?.productUrl, 'https://cultivacenter.com/products/' + handle + '?variant=52674296414488');
  }
  const available = await findAgrocentroOffer({...product,barcode:sku.barcode},
    storefront([{...sku, availableForSale:true, price:{amount:'140000.00',currencyCode:'COP'}}]));
  assert.equal(available?.productPriceCop,140000);
  assert.equal(available?.stock,'available');
});

test('ambiguous or incomplete size, stock, market, money and identity cannot produce a quote', async () => {
  const invalid = [
    storefront([sku, {...sku,id:'gid://shopify/ProductVariant/12'}]),
    storefront([{...sku,title:'2 × 2 kg'}]), storefront([{...sku,title:'400 g'}]),
    storefront([{...sku,price:{amount:'132400',currencyCode:'USD'}}]),
    storefront([{...sku,price:{amount:'132400.5',currencyCode:'COP'}}]),
    storefront([{...sku,price:null}]), storefront([{...sku,availableForSale:null}]),
    storefront([{...sku,id:'invalid'}]), storefront([sku],title,true),
    storefront([sku],title + ' Kitten'), storefront([sku], title + ' 7+'),
    async () => Response.json({errors:[{message:'not authorized'}]}),
  ];
  for (const fetcher of invalid) assert.equal(await findAgrocentroOffer(product,fetcher),null);
  assert.equal(await findAgrocentroOffer({...product,barcode:'3182550737555'},storefront([sku])),null);
  let calls = 0;
  const unused = async () => { calls++; return Response.json({}); };
  for (const name of ['Sterilised', 'Sterilised 37 Kitten', 'Sterilised 37 para perros', 'Sterilised 37 7+', 'Sterilised 37 4 kg']) {
    assert.equal(await findAgrocentroOffer({...product,name},unused),null);
  }
  assert.equal(await findAgrocentroOffer({brand:'ACANA',name:'Puppy Recipe Dry Dog Food',grams:2000},unused),null);
  assert.equal(calls,0);
});
