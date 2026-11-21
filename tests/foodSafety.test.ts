import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoodItem, Pet, VetNutrientLimit, NutrientValue } from '../src/types';
import { assessFoodForPet, assessVetLimits, getPlanSafetyNotices, isValidLimit } from '../src/utils/foodSafety';
import { buildFeedingPlan, calculateFeedingPlan, type CalculationInputs } from '../src/utils/calculator';
import { evaluateCurrentFood } from '../src/utils/feedingGuide';

const pet: Pet = { id:'luna',name:'Luna',species:'dog',breed:'Golden Retriever',breedSize:'large',sex:'female',
  isNeutered:true,ageYears:4,currentWeightKg:29,targetWeightKg:29,idealWeightKg:29,bcs:5,activityLevel:'moderate',specialState:'none',createdAt:'2026-10-01' };
const pct = (valor:number, calificador:NutrientValue['calificador'],baseMedicion:NutrientValue['baseMedicion']='tal_como_se_vende'):NutrientValue => ({valor,calificador,baseMedicion,unidadOriginal:'%'});
const food: FoodItem = { id:'ag',brand:'Agility Gold',name:'Grandes Adultos',species:'dog',lifeStage:'adult',lifeStageKnown:true,type:'dry',kcalPerKg:0,proteinPct:23,
  fatPct:15,fiberPct:4,moisturePct:11,country:'Colombia',labelStatus:'verified_manufacturer',ingredientsSummary:'Pollo, arroz cristal, harina de pollo, aceite de salmón.',
  fichaNutricional:{coincidenciaEstado:'verificado',grasa:pct(15,'minimo'),fibra:pct(4,'maximo')} };
const planInputs: CalculationInputs = { pet, goal:'maintain', bcs:5, foodType:'dry', dryFood:food, mealsPerDay:2 };
const plan = buildFeedingPlan(planInputs,calculateFeedingPlan(planInputs));
const limit = (maximum: number, unit: VetNutrientLimit['unit']='pct_as_fed'): VetNutrientLimit => ({nutrient:'grasa', maximum, unit});
const check = (restriction: VetNutrientLimit, parts = [{food, grams:100}]) => assessVetLimits({...pet,vetNutrientLimits:[restriction]},parts)[0];

test('Agility adulto warns for puppy, different species, and explicitly avoided ingredients before kcal are known', () => {
  assert.deepEqual(assessFoodForPet(pet,food),[]);
  const puppy = {...pet,ageMonths:5};
  assert.equal(evaluateCurrentFood(puppy,plan).status, 'incompatible');
  assert.equal(assessFoodForPet(puppy,food)[0].key,'stage');
  assert.equal(assessFoodForPet({...pet,species:'cat'},food)[0].key,'species');
  const avoid = assessFoodForPet({...pet,avoidedIngredients:['CHÍCKEN']},food);
  assert.equal(avoid.length,1);
  assert.equal(assessFoodForPet({...pet,avoidedIngredients:['pollo']},{...food,ingredientsSummary:'Pollo sin huesos'})[0].level,'mismatch');
  assert.deepEqual(assessFoodForPet({...pet,avoidedIngredients:['pollo']},{...food,ingredientsSummary:'Arroz sin pollo'}),[]);
  assert.match(avoid[0].message,/«Pollo»/);
  assert.deepEqual(assessFoodForPet({...pet,avoidedIngredients:['res']},{...food,ingredientsSummary:'Vegetales frescos, harina de maíz'}),[]);
  assert.deepEqual(assessFoodForPet({...pet,restrictionNotes:'Tolera el pollo'},food),[]);
  assert.equal(assessFoodForPet({...pet,restrictionNotes:'Sin pollo'},food)[0].level,'mismatch');
});

test('checks a complementary product used as sole food and combines only active components', () => {
  const complement = {...food,nutritionalUse:'complementary' as const};
  assert.equal(getPlanSafetyNotices(pet,{...plan,dryFood:complement})[0].level,'mismatch');
  const wet = {...complement,type:'wet' as const,nutritionalUse:'treat' as const};
  assert.ok(getPlanSafetyNotices(pet,{...plan,foodType:'mixed',mixedDryPct:50,dryFood:complement,wetFood:wet}).some((notice)=>notice.key === 'only-supplements'));
  assert.deepEqual(getPlanSafetyNotices(pet,{...plan,foodType:'mixed',mixedDryPct:100,wetFood:wet}),[]);
});

test('compares prescribed limits to bounds in like units and leaves ambiguous guarantees pending', () => {
  assert.equal(check(limit(10)).level,'mismatch');
  assert.equal(check(limit(10),[{food:{...food,labelStatus:'unconfirmed'},grams:100}]).level,'review');
  const conflicting = {...food, fichaNutricional:{...food.fichaNutricional!, discrepancies:[{field:'grasa',other:pct(8,'maximo'),sourceUrl:'https://example.test/food'}]}};
  assert.equal(check(limit(10),[{food:conflicting,grams:100}]).level,'review');
  assert.equal(check(limit(15)).level,'review');
  assert.equal(check(limit(20)).level,'review');
  assert.equal(check({...limit(4), nutrient:'fibra'}).level,'within');
  assert.equal(check({...limit(3), nutrient:'fibra'}).level,'review');
  assert.equal(check(limit(10,'pct_dry_matter')).level,'review');
  assert.equal(check(limit(10,'grams_per_day')).level,'mismatch');
  assert.equal(check(limit(20,'grams_per_day')).level,'review');
  assert.equal(assessVetLimits({...pet,vetNutrientLimits:[limit(10,'grams_per_day')]},[{food}])[0].level,'review');
  assert.equal(check(limit(10),[{food:{...food,fichaNutricional:{coincidenciaEstado:'verificado',grasa:pct(15,'tipico')}},grams:100}]).level,'review');
  assert.deepEqual(assessVetLimits(pet,[{food}]),[]);
  assert.equal(isValidLimit(limit(Infinity)),false);
  assert.equal(isValidLimit(limit(110)),false);
});

test('a mixed nutrient bound uses the portion masses and a missing constituent cannot imply certainty', () => {
  const other={...food,id:'b',fichaNutricional:{coincidenciaEstado:'verificado' as const,grasa:pct(3,'minimo')}};
  assert.equal(check(limit(10),[{food,grams:20},{food:other,grams:80}]).level,'review');
  assert.equal(check(limit(10),[{food,grams:70},{food:other,grams:30}]).level,'mismatch');
  assert.equal(check(limit(12),[{food,grams:50},{food:{...other,fichaNutricional:undefined},grams:50}]).level,'review');
  assert.deepEqual(getPlanSafetyNotices({...pet,avoidedIngredients:['pollo']},{...plan,isVetLocked:true}),[]);
});
