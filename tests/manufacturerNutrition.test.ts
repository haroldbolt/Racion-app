import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {FoodItem} from '../src/types';
import {enrichOnlineNutrition} from '../src/services/manufacturerNutrition';
import {labelDiscrepancies, parseLabelValues, readFeedingGuide} from '../src/utils/nutritionLabel';
import {selectFoodPackage} from '../src/services/onlineFoodCatalog';

const officialUrl = 'https://www.italcolmascotas.com/agility-gold-grandes-adultos-2/';
const merchantUrl = 'https://www.laiapets.com.co/productos/agility-gold-grandes-adultos/';
const formula = 'Agility Gold Grandes Adultos';
const storeTitle = formula + ' – Concentrado Super Premium para Perros 1,5 kg, 3 kg y 15 kg';
const time = '2026-11-21T12:00:00Z';
const food: FoodItem = {
  id:'online_laia_370514960', sourceFoodId:'online_laia_370514960', brand:'Agility Gold', name:'Grandes Adultos',
  species:'dog', type:'dry', lifeStage:'adult', country:'Colombia', kcalPerKg:0, proteinPct:0,
  fatPct:0, fiberPct:0, moisturePct:0, storeProductUrl:merchantUrl,
  availableSizesKg:[1.5,3,15], bagSizeKg:1.5,
  fichaNutricional:{coincidenciaEstado:'pendiente',fechaConsulta:time,fuenteUrl:merchantUrl},
};
const guide = '<table><tr><th>Peso (Kg)</th><th>Ración diaria</th></tr><tr><td>23 – 34</td><td>261 – 336 gramos</td></tr><tr><td>+45</td><td>411 g + 37 g por cada 4,5 kg</td></tr></table>';
const analysis = '<h3>Análisis garantizado</h3>Proteína mínimo 23%, Grasa mínimo 15%, Fibra máximo 4%, Ceniza máximo 8%, Humedad máximo 11%.';
const officialPage = '<p>Ingredientes: pollo, arroz, salmón.</p><h3>Instrucciones de alimentación</h3>' + guide + analysis + '<p>Registro ICA: 8548 AL</p>';
const commercial = 'Análisis garantizado: proteína mín. 24%, grasa mín. 15%, fibra máx. 4%. Registro ICA: 8548 AL';

test('generic guaranteed label, photo OCR, explicit energy and measurement basis', () => {
  const data = parseLabelValues('Proteína cruda (mín.): 22,5 %\nGrasa 16 % (máximo)\nEnergía metabolizable: 3.750 kcal/kg',false);
  assert.equal(data.proteina?.valor,22.5);
  assert.equal(data.proteina?.calificador,'minimo');
  assert.equal(data.grasa?.calificador,'maximo');
  assert.equal(data.kcalPerKg?.valor,3750);
  assert.equal(parseLabelValues('Contiene 8 % de grasa y 30 % de proteínas',true).grasa,undefined);
  assert.equal(parseLabelValues('Proteína mínimo 20 %',true).proteina,undefined);
  assert.equal(parseLabelValues('Análisis garantizado: grasa máx. 4% en materia seca',true).grasa?.baseMedicion,'materia_seca');
  assert.deepEqual(parseLabelValues('Análisis garantizado: grasa máx. 4% en materia seca, en base húmeda 3%',true),{});
  assert.equal(parseLabelValues('Energía metabolizable 375 kcal/taza',false).kcalPerKg,undefined);
  assert.equal(parseLabelValues('Análisis garantizado: proteína mínimo 20%, proteína mínimo 26%',true).proteina,undefined);
  assert.equal(parseLabelValues('Análisis garantizado: grasa 12%, fibra máx. 0%',true).grasa,undefined);
  assert.equal(parseLabelValues('Análisis garantizado: grasa 12%, fibra máx. 0%',true).fibra?.valor,0);
});

test('daily guides require two explicit columns and weight/gram ranges', () => {
  assert.deepEqual(readFeedingGuide(guide,officialUrl,'Italcol')?.ranges,[{minWeightKg:23,maxWeightKg:34,minGrams:261,maxGrams:336}]);
  assert.equal(readFeedingGuide(guide.replace('Peso (Kg)','Edad (meses)'),officialUrl,'Italcol'),undefined);
  assert.equal(readFeedingGuide(guide.replace('gramos','tazas'),officialUrl,'Italcol'),undefined);
});

test('Agility manufacturer is matched by full formula and registration, never price or package', async context => {
  const requested:URL[] = [];
  context.mock.method(globalThis,'fetch',async (url:URL, init?:RequestInit) => {
    requested.push(url);
    assert.equal(url.origin,'https://www.italcolmascotas.com');
    assert.equal(init?.credentials,'omit');
    if (url.pathname.endsWith('/search')) return Response.json([
      {id:8123,title:'Agility Gold Cuidado Especial Piel Grandes Adultos',url:'https://www.italcolmascotas.com/agility-gold-cuidado-especial-piel-grandes-adultos-2/',subtype:'post'},
      {id:416,title:formula,url:officialUrl,subtype:'post'},
    ]);
    assert.equal(url.pathname,'/wp-json/wp/v2/posts/416');
    return Response.json({id:416,link:officialUrl,title:{rendered:formula}, content:{rendered:officialPage}});
  });
  const signal = new AbortController().signal;
  const result = await enrichOnlineNutrition(food,storeTitle,commercial,signal);
  assert.equal(requested.length,2);
  assert.equal(result.labelStatus,'verified_manufacturer');
  assert.equal(result.proteinPct,23);
  assert.equal(result.fatPct,15);
  assert.equal(result.fiberPct,4);
  assert.equal(result.ashPct,8);
  assert.equal(result.moisturePct,11);
  assert.equal(result.carbsPct,undefined);
  assert.equal(result.fichaNutricional?.kcalPerKg,undefined);
  assert.equal(result.kcalPerKg,0);
  assert.equal(result.fichaNutricional?.grasa?.source?.url,officialUrl);
  assert.equal(result.fichaNutricional?.grasa?.source?.observedAt,time);
  assert.equal(result.fichaNutricional?.discrepancies?.[0]?.other.valor,24);
  assert.match(result.ingredientsSummary!,/pollo, arroz, salmón/);
  assert.equal(result.feedingGuide?.ranges[0].minGrams,261);
  assert.deepEqual(result.availableSizesKg,[1.5,3,15]);
  assert.equal(selectFoodPackage(result,99).buyUrl,merchantUrl);
  const mismatch = await enrichOnlineNutrition(food,storeTitle,commercial.replace('8548','9999'),signal);
  assert.equal(mismatch.labelStatus,'unconfirmed');
  assert.equal(mismatch.proteinPct,24);
  assert.equal(mismatch.feedingGuide,undefined);
  assert.equal(mismatch.fichaNutricional?.proteina?.source?.url,merchantUrl);
});

test('differing bases or guarantees are visible even if the number agrees', () => {
  const official = parseLabelValues('Análisis garantizado: grasa mínimo 15%',true);
  const store = parseLabelValues('Análisis garantizado: grasa máximo 15%',true);
  assert.deepEqual(labelDiscrepancies(official,store,merchantUrl),[{field:'grasa',other:store.grasa,sourceUrl:merchantUrl}]);
});

test('unavailable manufacturer retains declared store values for review and preserves omitted values', async context => {
  context.mock.method(globalThis,'fetch',async () => new Response(null,{status:503}));
  const result = await enrichOnlineNutrition(food,storeTitle,commercial,new AbortController().signal);
  assert.equal(result.labelStatus,'unconfirmed');
  assert.equal(result.fichaNutricional?.proteina?.source?.url,merchantUrl);
  assert.equal(result.feedingGuide,undefined);
  assert.equal(result.fichaNutricional?.kcalPerKg,undefined);
});

test('a different Colombian merchant and brand prefills SKU-specific nutrition pending label confirmation', async context => {
  context.mock.method(globalThis, 'fetch', () => { throw Error('Unknown brands have no inferred manufacturer URL'); });
  const productUrl = 'https://www.puppis.com.co/alimento-para-gato-monello-castrados/p';
  const merchant = {...food, brand:'Monello', name:'Castrados', species:'cat' as const, storeProductUrl:productUrl,
    fichaNutricional:{...food.fichaNutricional!, fuenteNombre:'Puppis Colombia', fuenteUrl:productUrl}};
  const retail = '<h3>Ingredientes del concentrado</h3><p>Pollo, arroz, aceite de pescado.</p>' +
    '<h3>Composición nutricional</h3><table><tr><th>Composición</th><th>Cantidad</th></tr>' +
    '<tr><td>Proteína Cruda (Mín)</td><td>36%</td></tr><tr><td>Lípidos (Mín)</td><td>9%</td></tr>' +
    '<tr><td>Materia Mineral (Máx)</td><td>4,5%</td></tr><tr><td>Humedad(Máx)</td><td>10%</td></tr></table>';
  const lookup = await enrichOnlineNutrition(merchant, 'Monello Castrados', retail, new AbortController().signal);
  assert.equal(lookup.labelStatus,'unconfirmed');
  assert.equal(lookup.fichaNutricional?.coincidenciaEstado,'revision_requerida');
  assert.equal(lookup.proteinPct,36);
  assert.equal(lookup.fatPct,9);
  assert.equal(lookup.ashPct,4.5);
  assert.equal(lookup.fichaNutricional?.humedad?.calificador,'maximo');
  assert.equal(lookup.fichaNutricional?.fibra,undefined);
  assert.equal(lookup.fichaNutricional?.carbohidratos,undefined);
  assert.deepEqual(lookup.fichaNutricional?.proteina?.source,{name:'Puppis Colombia',url:productUrl,observedAt:time});
  assert.equal(lookup.ingredientsSummary,'Pollo, arroz, aceite de pescado.');
});

test('retailer analyses support declared mass units and reject inconsistent paired quantities', () => {
  const data = parseLabelValues('Información nutricional: Lípidos (Mín) 120 g/kg (12%); Fibras (Máx) 30g/kg(12%); Materia Mineral (Máx) 90/kg(3%); Energía metabolizable (kcal/100 g): 89,2',true);
  assert.equal(data.grasa?.valor,12);
  assert.equal(data.grasa?.declaracionOriginal,'120 g/kg');
  assert.equal(data.fibra,undefined);
  assert.equal(data.cenizas,undefined);
  assert.equal(data.kcalPerKg?.valor,892);
  assert.equal(data.kcalPerKg?.declaracionOriginal,'89,2 kcal/100 g');
  assert.equal(parseLabelValues('Energía metabolizable: 89,2 kcal/lata',true).kcalPerKg,undefined);
  assert.equal(parseLabelValues('Información nutricional: Grasa mín. 5% (en materia seca y tal como se ofrece)', true).grasa,undefined);
  assert.equal(parseLabelValues('Información nutricional: Grasa mín. 4%. Información nutricional: Grasa mín. 10%.',true).grasa,undefined);
});

test('well-labelled individual rows identify an analysis on products lacking a section title', () => {
  const table = '<table><tr><td>Proteína cruda mín.</td><td>20%</td></tr><tr><td>Grasa cruda máx.</td><td>2%</td></tr></table>';
  const data = parseLabelValues('Ahorra un 30 % ' + table,true);
  assert.equal(data.proteina?.valor,20);
  assert.equal(data.grasa?.calificador,'maximo');
  assert.deepEqual(parseLabelValues(table + table.replace('20%','42%'),true),{});
});

test('published retail weight tables retain their provenance and require explicit grams per day', async () => {
  const productUrl = 'https://www.puppis.com.co/ficticio-prueba/p';
  const merchant = {...food, brand:'Marca de prueba', storeProductUrl:productUrl,
    fichaNutricional:{...food.fichaNutricional!, fuenteNombre:'Puppis', fuenteUrl:productUrl}};
  const table = '<table><tr><th>Peso de la mascota (kg)</th><th>Gramos diarios</th></tr><tr><td>10 a 15</td><td>120 a 155</td></tr><tr><td>20 kg</td><td>180</td></tr></table>';
  const result = await enrichOnlineNutrition(merchant,'Marca de prueba',table,new AbortController().signal);
  assert.deepEqual(result.feedingGuide,{sourceUrl:productUrl,sourceName:'Puppis',sourceType:'store',ranges:[
    {minWeightKg:10,maxWeightKg:15,minGrams:120,maxGrams:155},{minWeightKg:20,maxWeightKg:20,minGrams:180,maxGrams:180},
  ]});
  assert.equal(readFeedingGuide(table.replace('Gramos diarios','Gramos por porción'),productUrl,'Puppis'),undefined);
  assert.equal(readFeedingGuide(table + table.replace('180','250'),productUrl,'Puppis'),undefined);
});

test('merchant-only fields supplement a matched manufacturer without becoming manufacturer-verified', async context => {
  context.mock.method(globalThis, 'fetch', async (url:URL) => url.pathname.endsWith('/search')
    ? Response.json([{id:416,title:formula,url:officialUrl,subtype:'post'}])
    : Response.json({id:416,link:officialUrl,title:{rendered:formula},content:{rendered:officialPage}}));
  const result = await enrichOnlineNutrition(food,storeTitle,commercial + '. Energía metabolizable: 3500 kcal/kg.',new AbortController().signal);
  assert.equal(result.fichaNutricional?.proteina?.source?.url,officialUrl);
  assert.equal(result.fichaNutricional?.kcalPerKg?.source?.url,merchantUrl);
  assert.equal(result.fichaNutricional?.kcalPerKg?.valor,3500);
  assert.equal(result.fichaNutricional?.discrepancies?.[0]?.other.valor,24);
  assert.equal(result.labelStatus,'unconfirmed');
  assert.equal(result.kcalPerKg,0);
});
