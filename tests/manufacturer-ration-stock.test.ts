import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FoodItem, FoodCostEntry, MealLog, Pet } from '../src/types';
import { calculateFeedingPlan, buildFeedingPlan, recalculatePlanForPet, type CalculationInputs } from '../src/utils/calculator';
import { getStockBalances } from '../src/utils/foodInventory';
import { getPlanCostSummary } from '../src/utils/foodCosts';
import { previewFoodChoice } from '../src/utils/offerPlan';
import { createFeedingPlanAdjustment, previewFeedingPlanAdjustment } from '../src/utils/feedingPlanAdjustment';
import { searchStoreManufacturerFoods, selectStoreManufacturerFood } from '../src/services/storeManufacturerCatalog';
import { getFoodKcalPerKg, getPlannedMeals, getPreviewMeals, getPlanFoodKcalForGrams } from '../src/utils/mealPortions';

const food: FoodItem = {id:'agility',name:'Grandes Adultos',brand:'Agility Gold',species:'dog',type:'dry',lifeStage:'adult',
  kcalPerKg:0,proteinPct:23,fatPct:15,fiberPct:4,moisturePct:11,ashPct:8,labelStatus:'verified_manufacturer',country:'Colombia',
  bagSizeKg:3, priceBasis:{packageKg:3,priceCop:65900,source:'online',observedAt:'2026-11-21'},
  feedingGuide:{sourceName:'Italcol',sourceUrl:'https://www.italcolmascotas.com/agility-gold-grandes-adultos-2/',
    ranges:[{minWeightKg:23,maxWeightKg:34,minGrams:261,maxGrams:336}]} };
const pet: Pet = {id:'luna',name:'Luna',breed:'Golden Retriever',sex:'female',isNeutered:true,species:'dog',
  ageYears:4,currentWeightKg:29,idealWeightKg:29,targetWeightKg:29,bcs:5,activityLevel:'moderate',specialState:'none',createdAt:'2026-11-01'};
const inputs: CalculationInputs = {pet,bcs:5,goal:'maintain',foodType:'dry',dryFood:food,mealsPerDay:2,manufacturerGramsPerDay:300};
const original = buildFeedingPlan(inputs, calculateFeedingPlan(inputs));
test('confirmed manufacturer portion supports meal cost without treating a maintenance target as measured energy', () => {
  assert.equal(original.gramsPerDay,300);
  assert.equal(original.kcalPerMeal,0);
  assert.equal(getPlanFoodKcalForGrams(original,150),0);
  assert.equal(original.manufacturerGramsPerDay,300);
  assert.equal(Math.round(getPlanCostSummary(original).meals[0].costCop!),3295);
  assert.equal(recalculatePlanForPet({...pet,currentWeightKg:29.2},original).gramsPerDay,300);
  assert.equal(recalculatePlanForPet({...pet,currentWeightKg:45},original).rationConfirmed,false);
  for (const changes of [{manufacturerGramsPerDay:NaN},{manufacturerGramsPerDay:337},{goal:'lose' as const},
    {pet:{...pet,ageYears:0.5}},{pet:{...pet,species:'cat' as const}}]) {
    assert.equal(calculateFeedingPlan({...inputs,...changes}).rationConfirmed,false);
  }
  const newBag = previewFoodChoice(pet,original,food,{packageKg:15,priceCop:287000,source:'online',observedAt:'2026-11-21'});
  assert.equal(newBag.gramsPerDay,300);
  assert.equal(newBag.bagWeightKg,15);
  assert.equal(Math.round(getPlanCostSummary(newBag).meals[0].costCop!),2870);
});
const purchase: FoodCostEntry = {id:'A',petId:'luna',foodId:food.id,foodName:food.name,foodBrand:food.brand,foodType:'dry',
  date:'2026-11-01',createdAt:'2026-11-01',openedOn:'2026-11-03',bagSizeKg:3,pricePaidCop:65900,costPerKgCop:65900/3,
  sharedWithPetIds:['milo']};
function meal(petId:string,date:string,grams:number): MealLog {
  return {id:petId+date,petId,date,mealIndex:0,mealTime:'08:00',gramsFed:grams,gramsEaten:0,fedBy:'Test',completed:true,
    mixedComponents:[{foodId:food.id,foodName:food.name,brand:food.brand,gramsFed:grams,gramsEaten:0,gramsPlanned:grams,role:'main'}]};
}
test('one shared stock balance uses servings after opening for named pets, allocates overlapping lots once, forecasts a single date', () => {
  const p2 = {...purchase,id:'B',openedOn:'2026-11-04',bagSizeKg:0.5};
  const logs = [meal('luna','2026-11-01',400),meal('luna','2026-11-04',1700),meal('milo','2026-11-04',1400),
    meal('third','2026-11-04',100),{...meal('milo','2026-11-04',110),completed:false}];
  const plans = [original,{...original,petId:'milo'}];
  const [balance] = getStockBalances([purchase,p2,{...purchase,openedOn:undefined}],logs,plans,'2026-11-05');
  assert.equal(balance.servedGrams,3100);
  assert.equal(balance.remainingGrams,400);
  assert.equal(balance.runsOut,'2026-11-05');
  assert.deepEqual(balance.petIds,['luna','milo']);
  assert.equal(getStockBalances([purchase],[],[],'2026-11-05')[0].runsOut,undefined);
});

test('Milo, 30 kg: verified Agility chart supplies midpoint, editable daily ration and exact portions', async () => {
  const [row] = await searchStoreManufacturerFoods('Agility Gold Grandes Adultos', 'dog');
  const agility = selectStoreManufacturerFood(row, 3);
  const milo: Pet = {...pet, id:'milo', name:'Milo', currentWeightKg:30};
  const selected = {...inputs, pet:milo, dryFood:agility, manufacturerGramsPerDay:undefined};
  const plan = buildFeedingPlan(selected, calculateFeedingPlan(selected));
  assert.equal(getFoodKcalPerKg(agility),undefined);
  assert.ok(agility.feedingGuide?.sourceUrl.includes('italcolmascotas.com'));
  assert.equal(plan.rationSource,'manufacturer_midpoint');
  assert.equal(plan.rationConfirmed,true);
  assert.equal(plan.manufacturerGramsPerDay,298.5);
  assert.equal(plan.gramsPerDay,298.5);
  assert.deepEqual(getPlannedMeals(plan).map(portion => portion.grams),[149.25,149.25]);
  assert.equal(plan.kcalPerMeal,0);
  const restored = JSON.parse(JSON.stringify(plan));
  const draft = createFeedingPlanAdjustment(restored);
  assert.equal(draft.manufacturerGramsPerDay,undefined);
  const schedule = previewFeedingPlanAdjustment(milo,restored,{...draft,mealsPerDay:3,mealTimes:['08:00','13:00','20:00']},[]);
  assert.ok('plan' in schedule);
  assert.equal(schedule.plan.rationSource,'manufacturer_midpoint');
  assert.deepEqual(getPlannedMeals(schedule.plan).map(portion => portion.grams),[99.5,99.5,99.5]);
  const edit = previewFeedingPlanAdjustment(milo,restored,{...draft,manufacturerGramsPerDay:301.25},[]);
  assert.ok('plan' in edit);
  const saved = JSON.parse(JSON.stringify(edit.plan));
  assert.equal(saved.rationSource,'manufacturer_adjusted');
  assert.equal(createFeedingPlanAdjustment(saved).manufacturerGramsPerDay,301.25);
  const reset = previewFeedingPlanAdjustment(milo,saved,{...createFeedingPlanAdjustment(saved),manufacturerGramsPerDay:undefined},[]);
  assert.ok('plan' in reset);
  assert.equal(reset.plan.rationSource,'manufacturer_midpoint');
  assert.equal(reset.plan.gramsPerDay,298.5);
  assert.deepEqual(getPlannedMeals(saved).map(portion => portion.grams),[150.63,150.62]);
  assert.equal(recalculatePlanForPet({...milo,currentWeightKg:36},restored).gramsPerDay,373.5);
  assert.equal(recalculatePlanForPet({...milo,currentWeightKg:36},saved).rationConfirmed,false);
  for (const grams of [0, 260.99, 336.01, NaN, Infinity]) {
    assert.deepEqual(previewFeedingPlanAdjustment(milo,restored,{...draft,manufacturerGramsPerDay:grams},[]),{error:'guide'});
  }
  const labeled = previewFeedingPlanAdjustment(milo,saved,{...createFeedingPlanAdjustment(saved),dryEnergy:'3800'},[]);
  assert.ok('plan' in labeled);
  assert.equal(labeled.plan.rationSource,'label');
  assert.equal(getFoodKcalPerKg(labeled.plan.dryFood),3800);
  assert.equal(labeled.plan.manufacturerGramsPerDay,undefined);
});

test('entering grams without energy or an applicable manufacturer guide saves a pending daily quantity', () => {
  const dryFood: FoodItem = {...food, feedingGuide:undefined};
  const entry = {...inputs,dryFood,manufacturerGramsPerDay:undefined,manualGramsPerDay:210.5};
  const pending = buildFeedingPlan(entry,calculateFeedingPlan(entry));
  assert.equal(pending.rationSource,'manual');
  assert.equal(pending.rationConfirmed,false);
  assert.equal(pending.kcalPerMeal,0);
  assert.equal(pending.gramsPerMeal,105.25);
  const restored = JSON.parse(JSON.stringify(pending));
  const draft = createFeedingPlanAdjustment(restored);
  assert.equal(draft.manualGramsPerDay,210.5);
  const changed = previewFeedingPlanAdjustment(pet,restored,{...draft,mealTimes:['07:30','18:30'],manualGramsPerDay:225.5},[]);
  assert.ok('plan' in changed);
  assert.equal(changed.plan.gramsPerDay,225.5);
  assert.equal(changed.plan.gramsPerMeal,112.75);
  assert.deepEqual(changed.plan.mealTimes,['07:30','18:30']);
  assert.equal(changed.plan.rationConfirmed,false);
  assert.equal(getPlanCostSummary(changed.plan).costPerDayCop,undefined);
  assert.deepEqual(getPlannedMeals(changed.plan).map(x=>x.grams),[0,0]);
  assert.deepEqual(getPreviewMeals(changed.plan).map(x=>x.grams),[112.75,112.75]);
  assert.deepEqual(previewFeedingPlanAdjustment(pet,restored,{...draft,manualGramsPerDay:NaN},[]),{error:'guide'});
  const protectedPet = { ...pet,hasVetGuideline:true };
  assert.equal(calculateFeedingPlan({...entry,pet:protectedPet}).gramsPerDay,0);
  const unverified = {...food,feedingGuide:{...food.feedingGuide!,sourceType:'store' as const}};
  assert.equal(calculateFeedingPlan({...inputs,dryFood:unverified}).rationConfirmed,false);
  const fromStore = {...entry,dryFood:unverified};
  const manual = buildFeedingPlan(fromStore,calculateFeedingPlan(fromStore));
  assert.equal(manual.rationSource,'manual');
  assert.equal(manual.manualGramsPerDay,210.5);
  const legacyStore = {...original,dryFood:unverified,rationSource:undefined};
  assert.equal(createFeedingPlanAdjustment(legacyStore).manualGramsPerDay,300);
  assert.equal(recalculatePlanForPet(pet,legacyStore).manualGramsPerDay,300);
});
