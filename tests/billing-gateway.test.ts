import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { createBillingGateway } from '../workers/billing/gateway';
import { handleBilling, type BillingWorkerEnv } from '../workers/billing/http';
import { firebaseAccount } from '../workers/billing/auth';
import { signedNotification } from '../workers/billing/webhook';

const key = 'sk_test_fixture';
const app = 'https://example.test/';
const landing = 'https://example.test/Racion-app/';
const uid = 'usuario-prueba';
const checkoutId = 'cs_test_example';
const intentId = 'pi_example';
const session = {
  id:checkoutId, object:'checkout.session', livemode:false, mode:'setup', status:'complete',
  url:'https://checkout.stripe.com/c/pay/cs_test_example', metadata:{racion_uid:uid}, customer:'cus_example',
  setup_intent:{status:'succeeded', livemode:false, customer:'cus_example', payment_method:'pm_example',
    metadata:{racion_uid:uid}, usage:'off_session'},
};
const intent = {
  id:intentId, object:'payment_intent', livemode:false, customer:'cus_example', metadata:{racion_uid:uid},
  amount:1800, amount_received:0, currency:'usd', status:'requires_confirmation',
};

test('checkout uses setup, binds return to the app path and stores an off-session method for its owner', async () => {
  const endpoints:string[] = [];
  const gateway = createBillingGateway({STRIPE_SECRET_KEY:key}, async (url, init) => {
    const path = new URL(url as string).pathname;
    endpoints.push(path);
    assert.equal(new URL(url as string).origin, 'https://api.stripe.com');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer ' + key);
    if (path.endsWith('/customers')) return Response.json({id:'cus_example',livemode:false});
    if (init?.method === 'POST') {
      const fields = init.body as URLSearchParams;
      assert.equal(fields.get('mode'), 'setup');
      assert.equal(fields.has('subscription_data'), false);
      assert.equal(fields.get('metadata[racion_uid]'), uid);
      assert.equal(fields.get('success_url'), landing + '?billing_session={CHECKOUT_SESSION_ID}');
      return Response.json(session);
    }
    return Response.json(session);
  });
  const opened = await gateway.createCheckout({uid,attemptId:'attempt-a',returnOrigin:landing});
  assert.equal(opened.id, checkoutId);
  assert.deepEqual(await gateway.getCheckout(opened.id), {
    status:'complete',uid,customerId:'cus_example',paymentMethodId:'pm_example',
  });
  assert.deepEqual(endpoints, ['/v1/customers', '/v1/checkout/sessions', '/v1/checkout/sessions/' + checkoutId]);
});

test('the adapter creates one unconfirmed USD 18 intent; confirmations reuse its ID and idempotency key', async () => {
  const commands:Array<{path:string;fields:URLSearchParams;idempotency:string|null}> = [];
  const gateway = createBillingGateway({STRIPE_SECRET_KEY:key}, async (url, init) => {
    const path = new URL(url as string).pathname;
    commands.push({path, fields:init?.body as URLSearchParams, idempotency:new Headers(init?.headers).get('Idempotency-Key')});
    return Response.json(path.endsWith('/confirm') ? {...intent, status:'succeeded', amount_received:1800} : intent);
  });
  const context = {uid,attemptId:'attempt-a',customerId:'cus_example',paymentMethodId:'pm_example'};
  assert.deepEqual(await gateway.createCharge(context), {id:intentId});
  assert.equal(commands[0].fields.get('amount'), '1800');
  assert.equal(commands[0].fields.get('currency'), 'usd');
  assert.equal(commands[0].fields.has('confirm'), false);
  assert.equal(commands[0].path, '/v1/payment_intents');
  assert.equal((await gateway.getCharge(intentId)).status, 'needs_confirmation');
  assert.equal((await gateway.confirmCharge(intentId, context.attemptId)).status, 'succeeded');
  assert.equal((await gateway.confirmCharge(intentId, context.attemptId)).status, 'succeeded');
  assert.equal(commands[2].path, '/v1/payment_intents/pi_example/confirm');
  assert.equal(commands[2].fields.get('off_session'), 'true');
  assert.equal(commands[2].idempotency, commands[3].idempotency);
});

test('adapter resolves declines on the same intent and only accepts a fully received sandbox payment', async () => {
  const input = {uid,attemptId:'attempt-a',returnOrigin:app};
  let called = false;
  const forbidden = createBillingGateway({STRIPE_SECRET_KEY:'live-is-not-a-test-key'}, async () => {
    called = true;
    throw new Error('unexpected_request');
  });
  await assert.rejects(forbidden.createCheckout(input), /sandbox_not_configured/);
  assert.equal(called, false);
  const declined = createBillingGateway({STRIPE_SECRET_KEY:key}, async () => Response.json({
    error:{payment_intent:{...intent,status:'requires_action'}},
  },{status:402}));
  assert.equal((await declined.confirmCharge(intentId, 'attempt-a')).status, 'failed');
  for (const changed of [{livemode:true}, {amount:1801}, {amount_received:2}, {id:'pi_other'}]) {
    const invalid = createBillingGateway({STRIPE_SECRET_KEY:key}, async () => Response.json({
      ...intent, status:'succeeded', amount_received:1800, ...changed,
    }));
    await assert.rejects(invalid.getCharge(intentId));
  }
  const mismatched = createBillingGateway({STRIPE_SECRET_KEY:key}, async () => Response.json({
    ...session, setup_intent:{...session.setup_intent, customer:'cus_other'},
  }));
  await assert.rejects(mismatched.getCheckout(checkoutId), /setup_unverified/);
});

test('Firebase account identity requires signed project-specific unexpired tokens', async () => {
  const project = 'racion-test';
  const keypair = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({keys:[{...await exportJWK(keypair.publicKey), use:'sig', kid:'fixture'}]});
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({auth_time:now, firebase:{sign_in_provider:'password'}})
    .setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer('https://securetoken.google.com/' + project)
    .setAudience(project).setSubject(uid).setIssuedAt(now).setExpirationTime(now + 3600).sign(keypair.privateKey);
  assert.equal(await firebaseAccount(token, project, keys), uid);
  await assert.rejects(firebaseAccount(token, 'other-project', keys));
  const expired = await new SignJWT({auth_time:now-3601, firebase:{sign_in_provider:'password'}})
    .setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer('https://securetoken.google.com/' + project)
    .setAudience(project).setSubject(uid).setIssuedAt(now - 3601).setExpirationTime(now - 1).sign(keypair.privateKey);
  await assert.rejects(firebaseAccount(expired, project, keys));
});

const event = {id:'evt_test',type:'checkout.session.completed',livemode:false,data:{object:session}};
const webhookKey = 'whsec_fixture';
const signature = (body:string, timestamp:number) =>
  't=' + timestamp + ',v1=' + createHmac('sha256', webhookKey).update(timestamp + '.' + body).digest('hex');

test('webhooks authenticate the raw body, reject stale deliveries and ignore unrelated events', async () => {
  const now = Date.now();
  const time = Math.floor(now / 1000);
  const raw = JSON.stringify(event);
  assert.deepEqual(await signedNotification(raw, signature(raw,time), webhookKey, now), {uid,sessionId:checkoutId});
  await assert.rejects(signedNotification(raw, signature(raw,time-301), webhookKey, now));
  await assert.rejects(signedNotification(raw, signature(raw+' ',time), webhookKey, now));
  const unrelated = JSON.stringify({...event,type:'customer.updated'});
  assert.equal(await signedNotification(unrelated,signature(unrelated,time),webhookKey,now),null);
});

test('router binds status, consent, cancellation, redirects and webhooks to the verified account', async () => {
  const calls:Array<{route:string;account:string;fields:Record<string,unknown>}> = [];
  const env: BillingWorkerEnv = {
    FIREBASE_PROJECT_ID:'racion-test', STRIPE_SECRET_KEY:key, ALLOWED_ORIGINS:landing, STRIPE_WEBHOOK_SECRET:webhookKey,
    BILLING_ACCOUNTS:{getByName(account) {return {async fetch(req) {
      calls.push({account,route:new URL(req.url).pathname,fields:await req.json()});
      return Response.json({checkoutUrl:session.url});
    }}}},
  };
  const auth = {Authorization:'Bearer fixture.identity.token', Origin:new URL(app).origin, 'Content-Type':'application/json'};
  function request(action:string, method:string, fields?:Record<string,unknown>, headers:Record<string,string> = auth) {
    return new Request('https://worker.test/api/billing/' + action, {method,headers,body:fields && JSON.stringify(fields)});
  }
  const identify = async () => uid;
  assert.equal((await handleBilling(request('status','GET'),env,identify)).status,200);
  assert.equal((await handleBilling(request('checkout','POST',{}),env,identify)).status,400);
  const checkout = await handleBilling(request('checkout','POST',{consentVersion:'trial-72h-usd18-v1'}),env,identify);
  assert.deepEqual(await checkout.json(), {url:session.url});
  assert.equal(calls.at(-1)?.fields.returnOrigin,landing);
  assert.equal((await handleBilling(request('cancel','POST',{}),env,identify)).status,200);
  assert.equal(calls.at(-1)?.route,'/cancel');
  assert.equal(calls.at(-1)?.account,uid);
  assert.equal((await handleBilling(request('cancel','POST',{}, {Origin:new URL(app).origin}),env,identify)).status,401);
  const confirm = await handleBilling(request('confirm','POST',{sessionId:checkoutId}),env,identify);
  assert.equal(confirm.status,200);
  assert.equal(calls.at(-1)?.route,'/refresh');
  assert.equal(calls.at(-1)?.fields.sessionId,checkoutId);
  const invalid = await handleBilling(request('status','GET',undefined,{...auth,Origin:'https://another.test'}),env,identify);
  assert.equal(invalid.status,403);
  const raw = JSON.stringify(event);
  const delivery = await handleBilling(new Request('https://worker.test/api/billing/webhook', {
    method:'POST',body:raw,headers:{'Stripe-Signature':signature(raw,Math.floor(Date.now()/1000))},
  }),env);
  assert.equal(delivery.status,200);
  assert.equal(calls.at(-1)?.route,'/notify');
  assert.equal(calls.at(-1)?.fields.uid,uid);
});
