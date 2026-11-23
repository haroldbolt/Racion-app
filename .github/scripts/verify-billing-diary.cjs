const assert = require('node:assert/strict');

// This runs once, on the billing registration screen of an isolated local browser context.
// Everything after linking uses the same controls as an existing beta customer.
async function seedLegacyDiary(page) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(page.url()).hostname));
  await page.evaluate(() => {
    if (localStorage.getItem('racion_pets_v1')) throw new Error('Expected a fresh regression context');
    const date = '2020-01-02';
    const rocky = { id:'legacy-rocky', name:'Rocky', species:'dog', breed:'Mestizo', sex:'male', isNeutered:true,
      ageYears:4, currentWeightKg:12, idealWeightKg:12, targetWeightKg:12, bcs:5, activityLevel:'moderate',
      specialState:'none', createdAt:date };
    const luna = {...rocky, id:'legacy-luna', name:'Luna de la beta', sex:'female',
      currentWeightKg:20.5, idealWeightKg:20.5, targetWeightKg:20.5 };
    const sharedFood = { id:'qa-shared-food', brand:'QA', name:'Bolsa compartida', species:'dog', type:'dry',
      lifeStage:'adult', labelStatus:'user_confirmed_label', country:'Colombia', bagSizeKg:10,
      kcalPerKg:3000, proteinPct:24, fatPct:14, fiberPct:3, moisturePct:10 };
    const receiptFood = {...sharedFood, id:'qa-receipt-food', name:'Alimento de factura', bagSizeKg:1.5};
    function plan(pet, food, portion) {
      return {id:'plan-' + pet.id, petId:pet.id, createdAt:date, foodId:food.id, foodBrand:food.brand,
        foodName:food.name, dryFood:food, foodType:'dry', mixedDryPct:100, mixedWetPct:0, mealsPerDay:2,
        mealTimes:['08:00','20:00'], gramsPerDay:portion*2, gramsPerMeal:portion, kcalPerMeal:portion*3,
        rer:portion*6, factor:1, mer:portion*6, manualAdjustmentPct:0, treatsBudgetKcal:0, treatsCountToday:0,
        bagWeightKg:food.bagSizeKg, rationConfirmed:true, scheduleConfigured:true};
    }
    const bag = {id:'qa-shared-bag', petId:luna.id, foodId:sharedFood.id, foodBrand:sharedFood.brand,
      foodName:sharedFood.name, foodType:'dry', date, createdAt:date, openedOn:date, quantity:1,
      bagSizeKg:10, pricePaidCop:150000, costPerKgCop:15000, sharedWithPetIds:[rocky.id]};
    const receipt = {...bag, id:'qa-receipt', foodId:receiptFood.id, foodName:receiptFood.name,
      bagSizeKg:3, quantity:2, pricePaidCop:90000, costPerKgCop:30000, sharedWithPetIds:[]};
    const records = {
      racion_pets_v1:[luna, rocky],
      racion_plans_v1:{[rocky.id]:plan(rocky, sharedFood, 100), [luna.id]:plan(luna, receiptFood, 150)},
      racion_weight_records_v1:[
        {id:'w_qa_luna', petId:luna.id, date, weightKg:20.5, notes:'Control previo a R0'},
        {id:'w_qa_rocky', petId:rocky.id, date, weightKg:12, notes:'Control de Rocky anterior al registro'},
      ],
      racion_food_purchases_v1:[bag, receipt],
    };
    for (const [key, data] of Object.entries(records)) localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('racion_active_pet_id_v1', luna.id);
  });
}

async function verifyLinkedDiary(page) {
  const button = name => page.getByRole('button', {name, exact:typeof name === 'string'});
  const pet = name => page.locator('header').getByRole('button').filter({has:page.getByText(name, {exact:true})});
  const foodRegion = page.getByRole('region', {name:'Alimento disponible', exact:true});
  const rockyRing = page.getByRole('region', {name:'Progreso diario de Rocky', exact:true});
  const lunaRing = page.getByRole('region', {name:'Progreso diario de Luna de la beta', exact:true});

  async function stock(expected, includeReceipt = false) {
    await button('Alimentos').click();
    await button('Gastos ($ COP)').click();
    const shared = foodRegion.getByText('QA Bolsa compartida', {exact:true}).locator('..');
    await shared.waitFor();
    const mass = expected === 10000 ? /10[.\s,]?000\s*g\b/ : /9[.\s,]?900\s*g\b/;
    const sharedText = await shared.innerText();
    assert.match(sharedText, /Luna de la beta \+ Rocky|Rocky \+ Luna de la beta/);
    assert.match(sharedText, mass, 'Saldo de la bolsa compartida');
    if (includeReceipt) {
      const separate = foodRegion.getByText('QA Alimento de factura', {exact:true}).locator('..');
      assert.match(await separate.innerText(), /3[.\s,]?000\s*g\b/);
      const invoice = page.getByRole('article').filter({has:page.getByRole('heading',{name:'QA Alimento de factura', exact:true})});
      const line = await invoice.innerText();
      assert.match(line, /2\s*×\s*1[.,]5\s*kg/i);
      assert.match(line, /90[.\s,]?000\s*COP/i);
    }
  }
  async function receiptCost() {
    await button('Hoy').click();
    await lunaRing.waitFor();
    const home = page.getByRole('region', {name:'Costo por toma', exact:true});
    assert.match(await home.innerText(), /150\s*g/);
    assert.match(await home.innerText(), /4[.\s,]?500\s*COP/);
    const costs = page.getByRole('region', {name:'Costo de su ración', exact:true});
    for (const time of ['08:00','20:00']) {
      assert.match(await costs.getByRole('listitem').filter({hasText:time}).innerText(), /4[.\s,]?500\s*COP/);
    }
  }
  async function weight(name, note) {
    await button('Progreso').click();
    await page.getByRole('heading', {name:'Historial de pesajes de ' + name, exact:true}).waitFor();
    await page.getByText(note,{exact:true}).waitFor();
  }

  await lunaRing.waitFor();
  await receiptCost();
  await stock(10000, true);
  await pet('Rocky').click();
  await stock(10000);
  await button('Hoy').click();
  await rockyRing.waitFor();
  await button('Ya comió').first().click();
  await button('Deshacer').waitFor();
  await page.getByText(/Servido:\s*100\s*g/).waitFor();
  await page.reload({waitUntil:'domcontentloaded'});
  await rockyRing.waitFor();
  await button('Deshacer').waitFor();
  await page.getByText(/Servido:\s*100\s*g/).waitFor();
  await stock(9900);
  await pet('Luna de la beta').click();
  await stock(9900, true);
  await receiptCost();
  await lunaRing.getByText('0 de 2 comidas', {exact:true}).waitFor();
  await pet('Rocky').click();
  await button('Deshacer').click();
  await rockyRing.getByText('0 de 2 comidas', {exact:true}).waitFor();
  await page.reload({waitUntil:'domcontentloaded'});
  await rockyRing.waitFor();
  await stock(10000);
  await weight('Rocky', 'Control de Rocky anterior al registro');
  await pet('Luna de la beta').click();
  await stock(10000, true);
  await receiptCost();
  await weight('Luna de la beta', 'Control previo a R0');
  console.log('Diario vinculado y recargado: 150 g cuestan $4.500 COP con la factura de 2 × 1,5 kg. Al servir y deshacer 100 g a Rocky, la otra bolsa compartida pasó por 10.000 → 9.900 → 10.000 g para ambas mascotas. Persistieron los dos planes, compras, pesajes y la toma al recargar.');
}

module.exports = { seedLegacyDiary, verifyLinkedDiary };
