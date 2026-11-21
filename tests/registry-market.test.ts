import assert from 'node:assert/strict';
import test from 'node:test';
import { matchRegistryFood, registryFormulaKey } from '../src/services/registryMarket';
import type { RegistryFood } from '../src/utils/colombiaRegistryRows';
import type { FoodItem } from '../src/types';

const kittens: RegistryFood = {registration:'11705AL',name:'MIRRINGO GATICOS',category:'Alimentos completos o balanceados',dog:false,cat:true};
const sku: FoodItem = {id:'jumbo:1', brand:'Mirringo',name:'Gaticos x1kg',species:'cat',type:'dry',lifeStage:'kitten',
  country:'Colombia',kcalPerKg:0, proteinPct:0,fatPct:0,fiberPct:0,moisturePct:0};

test('ICA and retailer must identify the same formula, even when the package or name varies', () => {
  assert.ok(matchRegistryFood(kittens,sku,'cat'));
  assert.ok(matchRegistryFood(kittens,{...sku,name:'Concentrado para gatitos por 500 gramos'},'cat'));
  assert.ok(matchRegistryFood(kittens,{...sku,name:'Mirringo Gaticos'},'cat'));
  assert.equal(matchRegistryFood(kittens,{...sku,brand:'Otra Marca'},'cat'),false);
  assert.equal(matchRegistryFood(kittens,{...sku,name:'Gaticos Salmón'},'cat'),false);
  assert.equal(matchRegistryFood(kittens,{...sku,name:'Adultos'},'cat'),false);
  assert.equal(matchRegistryFood(kittens,{...sku,species:'dog'},'dog'),false);
  assert.notEqual(registryFormulaKey('Fórmula 37'),registryFormulaKey('Fórmula 36'));
  assert.notEqual(registryFormulaKey('Salud+'),registryFormulaKey('Salud'));
});

test('an explicit contradictory registration or growth stage cannot take data from the selected record', () => {
  assert.equal(matchRegistryFood(kittens,{...sku,declaredIcaRegistration:'11706AL'},'cat'),false);
  assert.equal(matchRegistryFood(kittens,sku,'cat',true),false);
  assert.equal(matchRegistryFood(kittens,{...sku,name:'Envase de crecimiento',declaredIcaRegistration:'11705AL'},'cat',true),true);
  assert.equal(matchRegistryFood(kittens,{...sku,name:'Adulto pollo',declaredIcaRegistration:'11705AL'},'cat'),false);
  // Registrations where the product is only "ADULTOS" cannot match every brand's adult food.
  assert.equal(matchRegistryFood({...kittens,name:'ADULTOS'},{...sku,name:'Adultos'},'cat'),false);
});
