import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeedingPlan, FoodItem, Pet, VetGuideline } from '../src/types';
import type { LivePriceOffer } from '../src/types/livePrices';
import { getOfferCosts, getOfferPortions } from '../src/utils/offerCosts';

const pet: Pet = { id:'luna', name:'Luna', species:'cat', breed:'Mestiza', sex:'female', isNeutered:true,
  ageYears:3, currentWeightKg:4.3, idealWeightKg:4.3, targetWeightKg:4.3, bcs:5, activityLevel:'moderate',
  createdAt:'2026-01-01', specialState:'none' };
const dry: FoodItem = { id:'bag', brand:'Marca', name:'Fórmula 7+', species:'cat', type:'dry', lifeStage:'adult',
  country:'Colombia', fatPct:0, fiberPct:0, moisturePct:0, proteinPct:0, kcalPerKg:4000, bagSizeKg:2 };
const plan: FeedingPlan = { id:'p', petId:pet.id, foodId:dry.id, foodName:dry.name, foodBrand:dry.brand,
  createdAt:'2026-01-01', foodType:'dry', dryFood:dry, mealsPerDay:2, mealTimes:['08:30','19:30'],
  gramsPerDay:59, gramsPerMeal:30, rationConfirmed:true, bagWeightKg:2, rer:200, mer:216, factor:1,
  mixedDryPct:100, mixedWetPct:0, kcalPerMeal:108, treatsBudgetKcal:0, treatsCountToday:0, manualAdjustmentPct:0 };
const offer: LivePriceOffer = { id:'sku1', retailer:'Tienda', title:'Fórmula 7+ 2 kg', grams:2000, productPriceCop:90000,
  shippingCop:18000, totalCop:108000, pricePerKgCop:45000, productUrl:'https://tienda.example/sku1', stock:'available' };

test('quotes each real serving against its own package and applicable delivery charge', () => {
  const portions = getOfferPortions(pet,plan,dry);
  assert.deepEqual(portions?.meals.map(m => [m.time,m.grams]), [['08:30',30],['19:30',29]]);
  assert.deepEqual(getOfferCosts(offer,undefined,portions).meals?.map(m => m.costCop),[1620,1566]);
  const scoped = {...offer, shippingPostalCode:'110111'};
  const missing = getOfferCosts(scoped,'110851',portions);
  assert.equal(missing.shippingCop,null);
  assert.equal(missing.totalCop,null);
  assert.deepEqual(missing.meals?.map(m=>m.costCop),[1350,1305]);
  assert.deepEqual(getOfferCosts(scoped,'110111',portions).meals?.map(m=>m.costCop),[1620,1566]);
  const small = {...offer,grams:500,productPriceCop:6400,shippingCop:0,totalCop:6400};
  assert.equal(getOfferCosts(small,undefined,{mixed:false,meals:[{grams:15}]}).meals?.[0].costCop,192);
  assert.equal(getOfferCosts(offer,undefined).meals,undefined);
});

test('quotes only the dry component from this bag and the rest from its own purchase basis', () => {
  const wet: FoodItem = {...dry,id:'can',name:'Lata',type:'wet',bagSizeKg:0.1,
    priceBasis:{source:'manual',observedAt:'2026-01-01',priceCop:2500,packageKg:0.1}};
  const mixed: FeedingPlan = {...plan,foodType:'mixed',wetFood:wet,gramsPerDay:110,dryGramsPerDay:30,wetGramsPerDay:80};
  const costs = getOfferCosts(offer,undefined,getOfferPortions(pet,mixed,dry));
  assert.deepEqual(costs.meals?.map(m=>[m.grams,m.costCop,m.mixedMealCop]),[[15,810,1810],[15,810,1810]]);
  const withoutWetPrice = {...mixed,wetFood:{...wet,priceBasis:undefined}};
  assert.equal(getOfferCosts(offer,undefined,getOfferPortions(pet,withoutWetPrice,dry)).meals?.[0].mixedMealCop,undefined);
  assert.equal(getOfferPortions(pet,{...mixed,rationConfirmed:false},dry),undefined);
  assert.equal(getOfferPortions(pet,{...mixed,petId:'otro'},dry),undefined);
});

test('quotes locked portions only for the written prescription and never mutates the saved plan', () => {
  const order: VetGuideline = {vetName:'Profesional',clinicName:'Consultorio',prescribedKcal:240,
    prescribedFoodName:'Marca Fórmula 7+',prescribedGramsPerMeal:19,mealsPerDay:3,locked:true,date:'2026-01-01',notes:''};
  const locked = {...plan,isVetLocked:true};
  const original = structuredClone(locked);
  assert.deepEqual(getOfferPortions({...pet,vetGuideline:order},locked,dry)?.meals.map(m=>m.grams), [19,19,19]);
  for (const prescribedFoodName of ['Marca Fórmula 7','Otro Marca Fórmula 7+','Fórmula']) {
    assert.equal(getOfferPortions({...pet,vetGuideline:{...order,prescribedFoodName}},locked,dry),undefined);
  }
  assert.equal(getOfferPortions(pet,locked,dry),undefined);
  assert.deepEqual(locked,original);
});
