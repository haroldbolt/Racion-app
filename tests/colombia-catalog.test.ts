import assert from 'node:assert/strict';
import test from 'node:test';
import { searchColombiaCatalog } from '../workers/live-prices/colombiaCatalog';

function sku(itemId: string, name: string, price: number, available = true) {
  return {
    itemId, name, ean:'7898349701350', isKit:false, images:[],
    sellers:[{sellerDefault:true, commertialOffer:{Price:price, IsAvailable:available, AvailableQuantity:available ? 5 : 0}}],
  };
}

function sample(origin: string) {
  return {
    productId:'52', productName:'Alimento Para Gato Marca Nueva Adultos', brand:'Marca Nueva',
    link:origin + '/marca-nueva-adultos/p', categories:['/Gatos/Alimentos/Alimento Seco/'],
    'Descripción':['<div class="ingredientes">Pollo, arroz</div><div class="contenido">{Composición|Cantidad};Proteína Cruda (Mín)|36%;Humedad(Máx)|10%</div>'],
    items:[sku('52','1 kg',29200),sku('53','10,1 kg',223900),sku('54','5 kg',50000,false)],
  };
}

test('reads the public Colombian stores by formula without a brand list; keeps exact SKU weights, prices, URLs and label data', async t => {
  const calls: URL[] = [];
  t.mock.method(globalThis,'fetch',async (request: URL) => {
    calls.push(request);
    const good = sample(request.origin);
    return Response.json([
      good, {...good, productId:'71', productName:'Comedero Marca Nueva', categories:['/Gatos/Accesorios/']},
      {...good, productId:'72', link:'https://foreign.example/other/p'},
      {...good, productId:'74', categories:['/Perros/Alimentos/Alimentos secos/']},
      {...good, productId:'75', categories:['/Gatos/Alimentos/Alimento húmedo/']},
      {...good, productId:'76', items:[
        {...sku('76','1 kg',10000),variations:['Sabor'],Sabor:['Salmón']},
        {...sku('77','2 kg',20000),variations:['Sabor'],Sabor:['Pollo']},
      ]},
    ]);
  });
  const {foods,unavailableSources} = await searchColombiaCatalog('Marca Nueva','cat','dry');
  assert.equal(calls.length,4);
  for (const url of calls) {
    assert.equal(url.searchParams.get('ft'),'Marca Nueva');
    assert.ok(url.href.includes('Marca%20Nueva'));
    assert.equal(url.pathname,'/api/catalog_system/pub/products/search/');
  }
  assert.deepEqual(unavailableSources,[]);
  assert.equal(foods.length,4);
  assert.equal(new Set(foods.map(food=>food.id)).size,4);
  for (const food of foods) {
    assert.equal(food.name,'Marca Nueva Adultos');
    assert.deepEqual(food.presentations.map(p=>[p.packageKg,p.priceCop]),[[1,29200],[10.1,223900]]);
    assert.ok(food.presentations[1].sourceUrl.endsWith('?skuId=53'));
    assert.equal(food.presentations[0].barcode,'7898349701350');
    assert.match(food.description,/<h3>Ingredientes<\/h3>/);
    assert.match(food.description,/<td>Proteína Cruda \(Mín\)<\/td><td>36%<\/td>/);
  }
});

test('keeps resolvable stores when one is offline and does not price mixed, unknown or duplicated packages', async t=>{
  t.mock.method(globalThis,'fetch',async (url:URL)=>{
    if (url.hostname.includes('puppis')) return new Response('',{status:503});
    const food = sample(url.origin);
    return Response.json([{...food,items:[
      sku('56','3x100g',30000),sku('57','24/100g',4000),sku('58','100g x 12',7500),
      sku('71','1 kg',30000),sku('72','1 kg',42000),sku('73','Caja',120000),
    ]}]);
  });
  const result=await searchColombiaCatalog('Marca','cat','dry');
  assert.deepEqual(result.unavailableSources,['Puppis']);
  assert.equal(result.foods.length,3);
  for (const food of result.foods) {
    assert.deepEqual(food.presentations,[{packageKg:1,sourceUrl:food.productUrl}]);
  }
});

test('distinguishes complete source failure, a confirmed empty result and cancellation', async t=>{
  const fetchMock=t.mock.method(globalThis,'fetch',async ()=>new Response('',{status:429}));
  await assert.rejects(searchColombiaCatalog('Marca','dog'),/unavailable/);
  fetchMock.mock.mockImplementation(async ()=>Response.json([]));
  assert.deepEqual(await searchColombiaCatalog('Marca','dog'),{foods:[],unavailableSources:[]});
  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await assert.rejects(searchColombiaCatalog('Marca','dog',undefined,controller.signal),/cancelled/);
});
