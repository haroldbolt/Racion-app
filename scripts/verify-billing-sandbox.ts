// Explicit opt-in integration test. Both modes contact Stripe's sandbox; neither accepts live credentials.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import {
  BillingEngine, BILLING_CONSENT_VERSION, TRIAL_DURATION_MS, type BillingGateway, type BillingRecord,
} from '../workers/billing/engine';
import { createBillingGateway, hasStripeTestKey } from '../workers/billing/gateway';

const secret = process.env.STRIPE_SECRET_KEY;
const mode = process.argv[2];
const apiVersion = '2025-08-27.basil';
const returnOrigin = 'http://localhost:3000/';

interface SandboxObject {
  id: string;
  livemode: boolean;
  status?: string;
  customer?: string;
  payment_method?: string;
  usage?: string;
  metadata?: { racion_uid?: string };
  amount?: number;
  currency?: string;
  paid?: boolean;
}

async function stripe<T>(path: string, fields?: Record<string, string>, idempotency?: string): Promise<T> {
  if (!hasStripeTestKey(secret)) throw new Error('Se requiere STRIPE_SECRET_KEY del sandbox.');
  const headers = new Headers({Authorization: 'Bearer ' + secret, 'Stripe-Version': apiVersion});
  if (idempotency) headers.set('Idempotency-Key', 'racion-qa/' + idempotency);
  const response = await fetch('https://api.stripe.com/v1/' + path, {
    method: fields ? 'POST' : 'GET', headers, body: fields && new URLSearchParams(fields),
    redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as {error?:{code?: string;type?: string;param?: string}} | null;
    const detail = [failure?.error?.type, failure?.error?.code, failure?.error?.param]
      .filter(v => typeof v === 'string' && /^[a-z_\[\]]{1,64}$/i.test(v)).join('/');
    throw new Error('Stripe ' + response.status + ' (' + detail + ') en ' + path.split('?')[0]);
  }
  return await response.json() as T;
}

// An unattended API check enrolls the documented Stripe test card using an actual SetupIntent.
// The hosted checkout entry and its interactive completion are exercised by the separate --hosted mode.
function apiSetupGateway(gateway: BillingGateway): BillingGateway {
  return {
    ...gateway,
    async createCheckout({uid, attemptId}) {
      const customer = await stripe<SandboxObject>('customers', {'metadata[racion_uid]':uid}, attemptId + '/customer');
      assert.equal(customer.livemode, false);
      const setup = await stripe<SandboxObject>('setup_intents', {
        customer:customer.id, usage:'off_session', payment_method:'pm_card_visa',
        'payment_method_types[0]':'card', 'metadata[racion_uid]':uid, confirm:'true',
      }, attemptId + '/setup');
      assert.equal(setup.livemode, false);
      assert.equal(setup.status, 'succeeded');
      return {id:setup.id, url:'https://dashboard.stripe.com/test/setup_intents/' + setup.id};
    },
    async getCheckout(id) {
      assert.match(id, /^seti_[A-Za-z0-9_]+$/);
      const setup = await stripe<SandboxObject>('setup_intents/' + id);
      assert.equal(setup.livemode, false);
      assert.equal(setup.status, 'succeeded');
      assert.equal(setup.usage, 'off_session');
      assert.ok(setup.customer && setup.payment_method && setup.metadata?.racion_uid);
      return {status:'complete', uid:setup.metadata.racion_uid, customerId:setup.customer, paymentMethodId:setup.payment_method};
    },
  };
}

async function charges(customer: string) {
  const result = await stripe<{data:SandboxObject[];has_more:boolean}>(
    'charges?' + new URLSearchParams({customer, limit:'10'}));
  assert.equal(result.has_more, false);
  for (const charge of result.data) {
    assert.equal(charge.livemode, false);
    assert.equal(charge.customer, customer);
  }
  return result.data;
}

async function openTrial(gateway: BillingGateway, uid: string, hosted: boolean) {
  let record: BillingRecord | undefined;
  let now = Date.now();
  const store = {
    async read() { return record && structuredClone(record); },
    async save(next: BillingRecord) { record = structuredClone(next); },
  };
  const newEngine = () => new BillingEngine(store, gateway, () => now);
  const engine = newEngine();
  const identity = {uid, consentVersion:BILLING_CONSENT_VERSION, returnOrigin};
  const first = await engine.run('checkout', identity);
  assert.equal(first.status, 'setup_pending');
  if (hosted) {
    console.log('Abre la sesión de prueba de ' + uid + ' y registra una tarjeta de pruebas de Stripe:');
    console.log(first.checkoutUrl);
  }
  const deadline = Date.now() + 10 * 60000;
  let access = await engine.run('refresh', {uid});
  while (hosted && access.status === 'setup_pending' && Date.now() < deadline) {
    await wait(2000);
    now = Date.now();
    access = await engine.run('refresh', {uid});
  }
  assert.equal(access.status, 'trial_active', 'Stripe debe confirmar el registro del método.');
  assert.equal(access.canAccess, true);
  assert.equal(Date.parse(access.trialEndsAt!) - Date.parse(access.trialStartedAt!), TRIAL_DURATION_MS);
  const registered = await store.read();
  assert.ok(registered?.customerId && registered.trialEndsAt);
  assert.equal((await charges(registered.customerId)).length, 0);
  return {
    uid, customerId:registered.customerId, engine, newEngine, deadline:registered.trialEndsAt,
    advanceTo: (time: number) => { now = time; },
  };
}

async function run() {
  if (!['--api-setup', '--hosted'].includes(mode) || process.argv.length !== 3) {
    throw new Error('Usa: node --import tsx scripts/verify-billing-sandbox.ts --api-setup | --hosted');
  }
  if (!hasStripeTestKey(secret)) throw new Error('Se requiere STRIPE_SECRET_KEY del sandbox.');
  const id = randomUUID();
  const gateway = createBillingGateway({STRIPE_SECRET_KEY:secret});
  const hosted = mode === '--hosted';
  if (!hosted) {
    // Verify the public gateway contract against an actual hosted setup session without pretending it was completed.
    const session = await gateway.createCheckout({uid:'qa-checkout-' + id, attemptId:id, returnOrigin});
    assert.equal((await gateway.getCheckout(session.id)).status, 'open');
    await stripe('checkout/sessions/' + session.id + '/expire', {}, id + '/expire');
    assert.equal((await gateway.getCheckout(session.id)).status, 'expired');
  }
  const registration = hosted ? gateway : apiSetupGateway(gateway);
  const cancel = await openTrial(registration, 'qa-cancel-' + id, hosted);
  cancel.advanceTo(cancel.deadline - 1000);
  assert.equal((await cancel.engine.run('cancel', {uid:cancel.uid})).status, 'canceled');
  cancel.advanceTo(cancel.deadline);
  const canceled = cancel.newEngine();
  await canceled.run('alarm');
  assert.equal((await canceled.run('notify', {uid:cancel.uid})).status, 'canceled');
  assert.equal((await charges(cancel.customerId)).length, 0);
  console.log('Cancelación a las 71:59:59 confirmada en el sandbox: 0 cargos.');

  const keep = await openTrial(registration, 'qa-charge-' + id, hosted);
  keep.advanceTo(keep.deadline - 1);
  assert.equal((await keep.engine.run('alarm')).status, 'trial_active');
  assert.equal((await charges(keep.customerId)).length, 0);
  keep.advanceTo(keep.deadline);
  assert.equal((await keep.newEngine().run('alarm')).status, 'paid');
  keep.advanceTo(keep.deadline + 30 * 86400000);
  const reopened = keep.newEngine();
  const results = await Promise.all([reopened.run('alarm'), reopened.run('notify', {uid:keep.uid})]);
  assert.ok(results.every(result => result.status === 'paid' && result.renewal === false));
  const captured = await charges(keep.customerId);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].amount, 1800);
  assert.equal(captured[0].currency, 'usd');
  assert.equal(captured[0].paid, true);
  console.log(JSON.stringify({
    mode, sandbox:'Stripe', trialHours:72, cancelCharges:0, dayFourCharges:captured.length,
    amountCents:captured[0].amount, currency:'USD', renewal:false, chargeId:captured[0].id,
  }));
}

run().catch((err: Error) => {
  console.error(err.message);
  process.exitCode = 1;
});
