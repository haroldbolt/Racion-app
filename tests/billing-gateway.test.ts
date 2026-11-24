import assert from 'node:assert/strict';
import test from 'node:test';
import {SignJWT, createLocalJWKSet, exportJWK, generateKeyPair} from 'jose';
import {firebaseAccount} from '../workers/billing/auth';
import {buyerKey} from '../workers/billing/engine';
import {handleBilling, type BillingWorkerEnv} from '../workers/billing/http';
import {purchaseNotice} from '../workers/billing/webhook';

const origin = 'https://example.test';
const offer = 'offer25';
const product = '1234567';
const config = {
  ALLOWED_ORIGINS: origin + '/Racion-app/,http://localhost:3000',
  FIREBASE_PROJECT_ID:'firebase-fixture',
  HOTMART_PRODUCT_ID: product,
  HOTMART_OFFER_CODE:offer,
  HOTMART_CHECKOUT_URL:'https://pay.hotmart.com/A123TEST?off=' + offer,
  HOTMART_HOTTOK:'test-fixture-hottok',
};
const email = 'Compradora@Example.test';
function approved() {
  return {id:'event-1', creation_date:123456789, version:'2.0.0', event:'PURCHASE_APPROVED', data:{
    product:{id:Number(product)}, buyer:{email},
    purchase:{offer:{code:offer}, transaction:'HP1234', status:'APPROVED',
      original_offer_price:{value:25,currency_value:'USD'}, price:{value:100000,currency_value:'COP'}},
  }};
}
const rejectStorage = {getByName() {throw new Error('unexpected ledger access');}};
const env: BillingWorkerEnv = {...config, BILLING_ACCOUNTS:rejectStorage};
const browser = (path:string, init:RequestInit = {}) => new Request(origin + '/api/billing/' + path,
  {...init, headers:{Origin:origin, ...init.headers}});
const notification = (event:unknown, token = config.HOTMART_HOTTOK) => new Request(origin + '/api/billing/webhook', {
  method:'POST', headers:{'X-HOTMART-HOTTOK':token, 'Content-Type':'application/json'}, body:JSON.stringify(event),
});

test('public offer is USD 25 once; configuration and allowed browser origin must be valid', async () => {
  const response = await handleBilling(browser('offer'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {provider:'hotmart', checkoutUrl:config.HOTMART_CHECKOUT_URL,
    amountCents:2500, currency:'USD', renewal:false});
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const options = await handleBilling(browser('offer', {method:'OPTIONS'}), env);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.equal((await handleBilling(browser('offer',{headers:{Origin:'https://unrelated.test'}}), env)).status, 403);
  for (const missing of ['HOTMART_HOTTOK','HOTMART_PRODUCT_ID','HOTMART_OFFER_CODE','HOTMART_CHECKOUT_URL','FIREBASE_PROJECT_ID']) {
    assert.equal((await handleBilling(browser('offer'), {...env,[missing]:''})).status, 503);
  }
  for (const invalid of ['http://pay.hotmart.com/A123TEST','https://pay.hotmart.com.evil.test/X',
    'https://name@pay.hotmart.com/X','https://pay.hotmart.com/A123TEST?off=wrong',
    'https://pay.hotmart.com/A123TEST?off=offer25&off=offer25']) {
    assert.equal((await handleBilling(browser('offer'), {...env,HOTMART_CHECKOUT_URL:invalid})).status, 503);
  }
  for (const action of ['checkout','confirm','cancel']) {
    assert.equal((await handleBilling(browser(action,{method:'POST'}), env)).status, 404);
  }
});

test('status uses only the verified Firebase email and remains available if the checkout is later paused', async () => {
  const request = browser('status?email=another%40example.test', {headers:{Authorization:'Bearer valid-test-identity'}});
  const account = {uid:'account-a', email, emailVerified:true};
  const key = await buyerKey('compradora@example.test');
  const withStore: BillingWorkerEnv = {...env,HOTMART_CHECKOUT_URL:undefined,BILLING_ACCOUNTS:{
    getByName(name) {
      assert.equal(name,'hotmart-product:' + product);
      return {async fetch(r) {
        assert.equal(new URL(r.url).pathname,'/status');
        assert.deepEqual(await r.json(), {buyer:key});
        return Response.json({status:'paid', canAccess:true, amountCents:2500, currency:'USD', renewal:false});
      }};
    },
  }};
  assert.equal((await handleBilling(browser('status'), env)).status,401);
  assert.equal((await handleBilling(request, env, async () => {throw new Error('invalid');})).status,401);
  const denied = await handleBilling(request, env, async () => ({...account,emailVerified:false}));
  assert.equal(denied.status,403);
  assert.equal((await denied.json()).error,'email_not_verified');
  const ok = await handleBilling(request, withStore, async () => account);
  assert.equal(ok.status,200);
  assert.equal((await ok.json()).canAccess,true);
});

test('signed Firebase tokens bind issuer, project and verified email from the authenticated account', async () => {
  const project = config.FIREBASE_PROJECT_ID;
  const kp = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({keys:[{...await exportJWK(kp.publicKey),use:'sig',kid:'fixture'}]});
  const current = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({auth_time:current, email, email_verified:true, firebase:{sign_in_provider:'password'}})
    .setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer('https://securetoken.google.com/'+project)
    .setAudience(project).setSubject('account-a').setIssuedAt(current).setExpirationTime(current+3600).sign(kp.privateKey);
  assert.deepEqual(await firebaseAccount(token,project,keys), {uid:'account-a',email:'compradora@example.test',emailVerified:true});
  await assert.rejects(firebaseAccount(token,'other-project',keys));
});

test('grant requires the configured one-time 25 USD offer, including for a purchase in local currency', async () => {
  const notice = approved();
  const result = await purchaseNotice(notice, config);
  assert.deepEqual(result, {state:'paid',eventId:'event-1',transaction:'HP1234',buyerKey:await buyerKey(email.toLowerCase())});
  for (const patch of [{offer:{code:'other'}},{original_offer_price:{value:18,currency_value:'USD'}},
    {original_offer_price:{value:25,currency_value:'EUR'}},{price:{value:20,currency_value:'USD'}},
    {offer:{code:offer, coupon_code:'discount'}},{recurrence_number:2},{subscription_anticipation_purchase:true}]) {
    assert.equal(await purchaseNotice({...notice, data:{...notice.data,purchase:{...notice.data.purchase,...patch}}},config),null);
  }
  assert.equal(await purchaseNotice({...notice, data:{...notice.data,subscription:{plan:{id:123}}}}, config),null);
  assert.equal(await purchaseNotice({...notice,data:{...notice.data,product:{id:9}}}, config),null);
  await assert.rejects(purchaseNotice({...notice,data:{...notice.data,purchase:{...notice.data.purchase,status:'WAITING_PAYMENT'}}},config));
  await assert.rejects(purchaseNotice({...notice,data:{...notice.data,buyer:{email:'bad input'}}},config));
  const refund = {...notice,event:'PURCHASE_REFUNDED',data:{product:notice.data.product,
    purchase:{transaction:'HP1234',status:'REFUNDED'}}};
  assert.deepEqual(await purchaseNotice(refund,config),{eventId:notice.id,transaction:'HP1234',buyerKey:null,state:'revoked'});
  const pending = {...notice,event:'PURCHASE_BILLET_PRINTED',data:{...notice.data,purchase:{...notice.data.purchase,status:'PRINTED_BILLET'}}};
  assert.equal((await purchaseNotice(pending,config))?.state,'pending');
});

test('webhook checks the Hotmart header before handling orders and asks for retry if storage fails', async () => {
  const evt = approved();
  assert.equal((await handleBilling(notification(evt,''),env)).status,401);
  assert.equal((await handleBilling(notification(evt,'wrong-key'),env)).status,401);
  assert.equal((await handleBilling(notification(evt),{...env,HOTMART_HOTTOK:undefined})).status,503);
  assert.equal((await handleBilling(notification(evt),env)).status,503);
  assert.equal((await handleBilling(notification({...evt,event:'UNRELATED'}),env)).status,200);
  const ok = await handleBilling(notification(evt), {...env,BILLING_ACCOUNTS:{
    getByName() {return {async fetch(r) {
      assert.equal(new URL(r.url).pathname,'/event');
      const data = await r.json();
      assert.equal(data.buyerKey,await buyerKey(email.toLowerCase()));
      assert.equal(data.state,'paid');
      assert.equal(data.email,undefined);
      return Response.json({received:true});
    }};},
  }});
  assert.equal(ok.status,200);
});
