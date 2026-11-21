import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FoodItem, FoodCostEntry, MealLog, Pet } from '../src/types';
import { calculateFeedingPlan, buildFeedingPlan, recalculatePlanForPet, type CalculationInputs } from '../src/utils/calculator';
import { getStockBalances } from '../src/utils/foodInventory';
import { getPlanCostSummary } from '../src/utils/foodCosts';
import { previewFoodChoice } from '../src/utils/offerPlan';
import { getPlanFoodKcalForGrams } from '../src/utils/mealPortions';

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
  for (const changes of [{manufacturerGramsPerDay:undefined},{manufacturerGramsPerDay:337},{goal:'lose' as const},
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
