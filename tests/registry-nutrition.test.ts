import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FoodItem, Pet } from '../src/types';
import { enhanceRegistryFoods } from '../src/services/registryNutrition';
import { foodRegistration } from '../src/utils/nutritionLabel';
import { guideForDigest, guideUrl, readGaticosLabel, registryNutritionResponse } from '../workers/live-prices/registryNutrition';

import { getApplicableFeedingRange } from '../src/utils/manufacturerRation';
import { buildFeedingPlan, calculateFeedingPlan, recalculatePlanForPet, type CalculationInputs } from '../src/utils/calculator';
import { getPlanCostSummary } from '../src/utils/foodCosts';

const observedAt = '2026-11-21T18:00:00Z';
const html = '<h1>Mirringo gaticos</h1><p>INFORMACI&#211;N NUTRICIONAL</p>' +
  '<p>Mirringo Gaticos 360 Defense satisface todos los requerimientos nutricionales para el crecimiento.</p>' +
  'PROTEÍNA MÍNIMO 32% FIBRA MÁXIMO 3.5% GRASA MÍNIMO 12% CENIZA MÁXIMO 8% HUMEDAD MÁXIMO 10%' +
  '<p>LOS MEJORES BENEFICIOS</p><p>Otros productos: grasa mínimo 15%.</p>';
const official = readGaticosLabel(html, observedAt)!;
const row = {name:'MIRRINGO GATICOS',registration:'11705AL',cat:true,dog:false,category:'Alimentos completos o balanceados'};
const signal = new AbortController().signal;
const catalog = 'https://worker.example/api/colombia-foods';

test('reads only the exact Colombian manufacturer analysis with explicit qualifiers and no inferred energy', () => {
  assert.equal(official.fichaNutricional?.proteina?.valor,32);
  assert.equal(official.fichaNutricional?.fibra?.calificador,'maximo');
  assert.equal(official.fichaNutricional?.fibra?.valor,3.5);
  assert.equal(official.fatPct,12);
  assert.equal(official.ashPct,8);
  assert.equal(official.moisturePct,10);
  assert.equal(official.fichaNutricional?.kcalPerKg,undefined);
  assert.equal(official.fichaNutricional?.cenizas?.source?.observedAt,observedAt);
  assert.equal(readGaticosLabel(html.replace('<h1>Mirringo gaticos','<h1>Mirringo adultos'),observedAt),undefined);
  assert.equal(readGaticosLabel(html + '<h1>Otra presentación</h1>',observedAt),undefined);
});

test('an updated supply-table image cannot inherit a transcribed manufacturer guide', () => {
  assert.equal(guideForDigest('changed'),undefined);
  const guide = guideForDigest('e4516114b1c49e26753764d30b7c08745cde3d4b24804c352956f818a4729a4d');
  assert.equal(guide?.sourceUrl,guideUrl);
  assert.equal(guide?.lifeStage,'kitten');
  assert.deepEqual(guide?.ranges[1],{minWeightKg:1,maxWeightKg:3,minGrams:25,maxGrams:55});
  assert.deepEqual(guide?.aboveWeight,{afterKg:6,startGrams:85,gramsPerKg:7});
});

test('requests manufacturers only for matched registry identity and retains usable nutrition when the guide is unavailable', async t => {
  const network = t.mock.method(globalThis,'fetch',async (input:URL|string|Request) =>
    String(input) === guideUrl ? Response.error() : new Response(html));
  const url = new URL('https://worker.example/api/registry-nutrition?q=Mirringo+Gaticos&registration=11705AL&species=dog');
  assert.equal((await (await registryNutritionResponse(url,signal)).json()).food,null);
  assert.equal(network.mock.callCount(),0);
  url.searchParams.set('species','cat');
  url.searchParams.set('registration','9999AL');
  assert.equal((await (await registryNutritionResponse(url,signal)).json()).food,null);
  assert.equal(network.mock.callCount(),0);
  url.searchParams.set('registration','11705AL');
  const response = await registryNutritionResponse(url,signal);
  const data = await response.json();
  assert.equal(data.food.proteinPct,32);
  assert.equal(data.food.feedingGuide,undefined);
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('keeps each retailer purchase separate, supports no offers and an unreachable manufacturer', async t => {
  const retailer: FoodItem = {...official,id:'merchantA',name:'Gaticos',storeProductUrl:'https://tienda.co/gaticos',
    availableSizesKg:[1],packagePrices:[{packageKg:1,priceCop:15000,source:'online',observedAt}],
    fichaNutricional:{coincidenciaEstado:'revision_requerida',proteina:{valor:35,unidadOriginal:'%',calificador:'minimo',baseMedicion:'tal_como_se_vende'}}};
  const request = t.mock.method(globalThis,'fetch',async () => Response.json({food:official}));
  const [enriched] = await enhanceRegistryFoods([retailer],row,'cat',signal,catalog);
  assert.equal(enriched.id,'merchantA');
  assert.deepEqual(enriched.packagePrices,retailer.packagePrices);
  assert.equal(enriched.fichaNutricional?.proteina?.valor,32);
  assert.equal(enriched.fichaNutricional?.discrepancies?.[0].other.valor,35);
  const [withoutOffer] = await enhanceRegistryFoods([],row,'cat',signal,catalog);
  assert.equal(withoutOffer.packagePrices,undefined);
  assert.equal(withoutOffer.proteinPct,32);
  const [incompatibleOffer] = await enhanceRegistryFoods([{...retailer,type:'wet'}],row,'cat',signal,catalog);
  assert.equal(incompatibleOffer.storeProductUrl,undefined);
  assert.equal(incompatibleOffer.id,official.id);
  request.mock.mockImplementation(async () => Response.json({food:{...official,declaredIcaRegistration:'9898AL'}}));
  assert.deepEqual(await enhanceRegistryFoods([retailer],row,'cat',signal,catalog),[retailer]);
  request.mock.mockImplementation(async () => {throw new Error('offline');});
  assert.deepEqual(await enhanceRegistryFoods([retailer],row,'cat',signal,catalog),[retailer]);
});

test('accepts conventional Colombian registration formatting and rejects ambiguous references', () => {
  assert.equal(foodRegistration('Registro ICA: 11705-AL'),row.registration);
  assert.equal(foodRegistration('ICA 11705 AL. Registro ICA 11705-AL.'),row.registration);
  assert.equal(foodRegistration('ICA 11705 AL y registro ICA 9999 AL'),undefined);
});

const kitten: Pet = {id:'gatito',name:'Nube',species:'cat',breed:'Mestizo',sex:'male',isNeutered:false,
  ageMonths:6,currentWeightKg:2.5,idealWeightKg:2.5,targetWeightKg:2.5,bcs:5,activityLevel:'moderate',
  specialState:'none',createdAt:observedAt};
const foodWithGuide: FoodItem = {...official,
  feedingGuide:guideForDigest('e4516114b1c49e26753764d30b7c08745cde3d4b24804c352956f818a4729a4d'),
  bagSizeKg:0.5,priceBasis:{packageKg:0.5,priceCop:6400,source:'online',observedAt,storeName:'Mercacentro'}};
const kittenInputs: CalculationInputs = {pet:kitten,goal:'growth',bcs:5,foodType:'dry',dryFood:foodWithGuide,
  mealsPerDay:3,mealTimes:['07:00','13:00','19:00'],manufacturerGramsPerDay:45};

test('manufacturer kitten guide handles shared endpoints, one-sided rule and weight outside the chart', () => {
  const rangeAt = (weight: number) => getApplicableFeedingRange(foodWithGuide,{...kitten,currentWeightKg:weight},'growth');
  assert.equal(rangeAt(0.249),undefined);
  assert.deepEqual(rangeAt(0.25),{minGrams:10,maxGrams:25});
  assert.deepEqual(rangeAt(1),{minGrams:25,maxGrams:25});
  assert.deepEqual(rangeAt(2.5),{minGrams:25,maxGrams:55});
  assert.deepEqual(rangeAt(3),{minGrams:55,maxGrams:55});
  assert.deepEqual(rangeAt(6),{minGrams:55,maxGrams:85});
  assert.deepEqual(rangeAt(7),{minGrams:92,maxGrams:92});
  const conflicting: FoodItem = {...foodWithGuide,feedingGuide:{...foodWithGuide.feedingGuide!,ranges:[
    {minWeightKg:1,maxWeightKg:3,minGrams:20,maxGrams:30},{minWeightKg:3,maxWeightKg:6,minGrams:50,maxGrams:90}]}};
  assert.equal(getApplicableFeedingRange(conflicting,{...kitten,currentWeightKg:3},'growth'),undefined);
});

test('kitten ration uses the chart midpoint or an in-range adjustment for an eligible growing kitten', () => {
  for (const change of [
    {goal:'maintain'}, {pet:{...kitten,species:'dog'}}, {dryFood:{...foodWithGuide,lifeStage:'adult'}},
    {dryFood:{...foodWithGuide,labelStatus:'unconfirmed'}},{dryFood:{...foodWithGuide,suitableForGrowth:false}},
    {pet:{...kitten,ageMonths:0.8}},{pet:{...kitten,ageMonths:12}},{pet:{...kitten,ageMonths:undefined,ageYears:undefined}},
    {pet:{...kitten,dietType:'therapeutic'}},{pet:{...kitten,hasVetGuideline:true}},
    {manufacturerGramsPerDay:24},{manufacturerGramsPerDay:56},{manufacturerGramsPerDay:NaN},
  ] satisfies Partial<CalculationInputs>[]) {
    const inputs = {...kittenInputs,...change};
    const plan = buildFeedingPlan(inputs,calculateFeedingPlan(inputs));
    assert.equal(plan.rationConfirmed,false,JSON.stringify(change));
    assert.equal(plan.manufacturerGramsPerDay,undefined);
    assert.equal(getPlanCostSummary(plan).costPerDayCop,undefined);
  }
  assert.equal(calculateFeedingPlan({...kittenInputs,manufacturerGramsPerDay:undefined}).gramsPerDay,40);
  for (const grams of [25,45.5,55]) {
    assert.equal(calculateFeedingPlan({...kittenInputs,manufacturerGramsPerDay:grams}).rationConfirmed,true);
  }
});

test('saved 45 g kitten plan prices each 15 g meal from its selected 500 g package', () => {
  const plan = buildFeedingPlan(kittenInputs,calculateFeedingPlan(kittenInputs));
  assert.equal(plan.rationConfirmed,true);
  assert.equal(plan.manufacturerGramsPerDay,45);
  assert.equal(plan.gramsPerDay,45);
  assert.equal(plan.kcalPerMeal,0);
  const saved = JSON.parse(JSON.stringify(plan));
  const costs = getPlanCostSummary(saved);
  assert.deepEqual(costs.meals.map(({time,grams,costCop}) => ({time,grams,costCop})),[
    {time:'07:00',grams:15,costCop:192},{time:'13:00',grams:15,costCop:192},{time:'19:00',grams:15,costCop:192},
  ]);
  assert.equal(costs.costPerDayCop,576);
  assert.equal(recalculatePlanForPet({...kitten,currentWeightKg:2.8},saved).manufacturerGramsPerDay,45);
  assert.equal(recalculatePlanForPet({...kitten,currentWeightKg:4},saved).rationConfirmed,false);
});
