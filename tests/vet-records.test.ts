import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pet, VetGuideline } from '../src/types';
import { buildFeedingPlan, calculateFeedingPlan } from '../src/utils/calculator';
import { StorageService } from '../src/utils/storage';
import { readVetOrder, vetPhoneNumber } from '../src/utils/vetRecords';

const pet: Pet = {id:'vet-cat',name:'Gata',species:'cat',breed:'Mestiza',sex:'female',isNeutered:true,
  currentWeightKg:4.3,idealWeightKg:4.3,targetWeightKg:4.3,bcs:5,activityLevel:'moderate',specialState:'none',createdAt:'2026-11-21'};
const sample: VetGuideline = {vetName:'Dra. Sofía Valenzuela',clinicName:'Clínica Veterinaria San Francisco',phone:'+54 9 11 4567-8900',
  prescribedKcal:500,prescribedGramsPerMeal:70,prescribedFoodName:'Alimento Terapéutico Prescrito',mealsPerDay:2,
  notes:'Control de glucosa y peso cada 15 días.',date:'2026-11-20',locked:true};

test('empty, whitespace, zero, invalid meals or unconfirmed input cannot lock a feeding plan', () => {
  const data = new FormData();
  assert.equal(readVetOrder(data), undefined);
  const fields = {vet:'Médica de prueba', clinic:'Clínica de prueba', kcal:'125.5', grams:'16.25', meals:'3', food:'Fórmula de prueba'};
  for (const [key,value] of Object.entries(fields)) data.set(key,value);
  assert.equal(readVetOrder(data), undefined);
  data.set('confirmed','on');
  assert.deepEqual(readVetOrder(data,'2026-11-20'), {vetName:fields.vet,clinicName:fields.clinic,prescribedKcal:125.5,
    prescribedGramsPerMeal:16.25,mealsPerDay:3,prescribedFoodName:fields.food,notes:'',date:'2026-11-20',locked:true,confirmedByGuardian:true});
  for (const [key,value] of [['kcal',''],['grams','-1'],['grams','0'],['kcal','Infinity'],['meals','2.5'],['meals','7'],['food','  '],['vet','  ']]) {
    const original = data.get(key) as string;
    data.set(key,value); assert.equal(readVetOrder(data),undefined,key+'='+value); data.set(key,original);
  }
});

test('emergency link uses a dialable phone and never the prefilled legacy contact', () => {
  for (const input of ['','123','1e8','12;34567890','+54 (9) 11-4567-8900']) assert.equal(vetPhoneNumber(input),undefined);
  assert.equal(vetPhoneNumber('+57 (601) 234 5678'),'+576012345678');
});

test('old saved examples are held for review, while genuine prescriptions and historical meals persist after reload', () => {
  const entries = new Map<string,string>();
  Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>entries.set(k,v),
  }});
  const needsReview = {...pet,hasVetGuideline:true,vetGuideline:sample};
  const genuine = {...pet,id:'second',hasVetGuideline:true,vetGuideline:{...sample,vetName:'Nombre registrado',clinicName:'Mi clínica',
    prescribedFoodName:'Fórmula indicada',prescribedKcal:277,notes:'Nota del cuidador',phone:'+576012345678'}};
  const inputs = {pet:needsReview,goal:'maintain' as const,bcs:5,foodType:'dry' as const,mealsPerDay:2};
  const plan=buildFeedingPlan(inputs,calculateFeedingPlan(inputs));
  assert.equal(plan.gramsPerDay,140);
  const meals='[{"id":"historic","petId":"vet-cat","gramsFed":70}]';
  entries.set('racion_local_diary_dates_v1','true');
  entries.set('racion_meal_logs_v1',meals);
  StorageService.savePets([needsReview,genuine]);StorageService.savePlan(plan);
  StorageService.initialize();
  const [old,real]=StorageService.getPets();
  assert.equal(old.vetGuideline?.needsReview,true);
  assert.equal(old.vetGuideline?.locked,false);
  assert.equal(old.vetGuideline?.phone,undefined);
  assert.equal(old.vetGuideline?.vetName,'');
  assert.equal(old.vetGuideline?.notes,'');
  assert.equal(StorageService.getPlan(old.id)?.rationConfirmed,false);
  assert.equal(StorageService.getPlan(old.id)?.gramsPerDay,0);
  assert.notEqual(StorageService.getPlan(old.id)?.foodName,sample.prescribedFoodName);
  assert.deepEqual(real,genuine);
  assert.equal(entries.get('racion_meal_logs_v1'),meals);
  const after=[...entries];StorageService.initialize();assert.deepEqual([...entries],after);
});
