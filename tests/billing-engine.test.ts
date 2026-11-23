import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BILLING_CONSENT_VERSION, BillingEngine, BillingError, CHARGE_CENTS, TRIAL_DURATION_MS,
  type BillingGateway, type BillingRecord, type BillingStore, type ChargeResult, type CheckoutResult,
} from '../workers/billing/engine';

const user = { uid: 'buyer-test' };
const checkoutInput = {
  ...user, consentVersion: BILLING_CONSENT_VERSION, returnOrigin: 'https://app.example/',
};
const start = Date.parse('2026-11-22T18:40:00-05:00');

function scenario() {
  const db: { record?: BillingRecord; alarm: number | null } = { alarm: null };
  const store: BillingStore = {
    async read() { return structuredClone(db.record); },
    async save(record, alarm) { db.record = structuredClone(record); db.alarm = alarm; },
  };
  const remote = {
    session: { status: 'open' } as CheckoutResult,
    checkouts: 0, intentCreates: 0, confirmations: 0, charges: 0,
    loseResponse: false, decline: false,
    charge: {
      id: 'pi_test_1', uid: user.uid, amountCents: 1800, currency: 'usd',
      customerId: 'cus_test', status: 'needs_confirmation',
    } as ChargeResult,
  };
  let now = start;
  const gateway: BillingGateway = {
    async createCheckout() {
      remote.checkouts++;
      return { id: 'cs_test_1', url: 'https://checkout.example/test/1' };
    },
    async getCheckout(id) { assert.equal(id, 'cs_test_1'); return remote.session; },
    async createCharge(input) {
      assert.equal(input.uid, user.uid);
      assert.equal(input.customerId, 'cus_test');
      assert.equal(input.paymentMethodId, 'pm_test');
      remote.intentCreates++;
      return { id: remote.charge.id };
    },
    async getCharge(id) { assert.equal(id, remote.charge.id); return { ...remote.charge }; },
    async confirmCharge(id, attempt) {
      assert.equal(db.record?.intentId, id);
      assert.equal(db.record?.attemptId, attempt);
      assert.ok(now >= start + TRIAL_DURATION_MS);
      remote.confirmations++;
      remote.charge.status = remote.decline ? 'failed' : 'succeeded';
      if (remote.charge.status === 'succeeded') remote.charges++;
      if (remote.loseResponse) throw Error('connection_lost_after_charge');
      return { ...remote.charge };
    },
  };
  const restart = () => new BillingEngine(store, gateway, () => now, () => 'attempt-test-1');
  const engine = restart();
  const startTrial = async () => {
    await engine.run('checkout', checkoutInput);
    remote.session = { status: 'complete', uid: user.uid, customerId: 'cus_test', paymentMethodId: 'pm_test' };
    return engine.run('refresh', { ...user, sessionId: 'cs_test_1' });
  };
  return { db, remote, engine, restart, startTrial, at: (time: number) => { now = time; } };
}

test('account requires explicit terms and confirmed payment method before the 72-hour trial starts', async () => {
  const s = scenario();
  assert.equal((await s.engine.run('status', user)).canAccess, false);
  await assert.rejects(s.engine.run('checkout', { ...checkoutInput, consentVersion: '' }), BillingError);
  assert.equal(s.remote.checkouts, 0);
  const [first, second] = await Promise.all([s.engine.run('checkout', checkoutInput), s.engine.run('checkout', checkoutInput)]);
  assert.equal(first.status, 'setup_pending');
  assert.equal(first.canAccess, false);
  assert.equal(first.checkoutUrl, second.checkoutUrl);
  assert.equal(s.remote.checkouts, 1);
  await assert.rejects(s.engine.run('refresh', { ...user, sessionId: 'another-users-session' }), BillingError);
  await assert.rejects(s.engine.run('status', { uid: 'another-account' }), BillingError);
  const later = start + 3600000;
  s.at(later);
  s.remote.session = { status: 'complete', uid: user.uid, customerId: 'cus_test', paymentMethodId: 'pm_test' };
  const active = await s.engine.run('notify', user);
  assert.equal(active.canAccess, true);
  assert.equal(active.trialStartedAt, new Date(later).toISOString());
  assert.equal(active.trialEndsAt, new Date(later + TRIAL_DURATION_MS).toISOString());
  assert.equal(s.db.alarm, later + TRIAL_DURATION_MS);
  assert.equal(s.db.record?.consentVersion, BILLING_CONSENT_VERSION);
  assert.equal(s.db.record?.consentAt, start);
  s.at(later + 86400000);
  assert.equal((await s.restart().run('notify', user)).trialEndsAt, active.trialEndsAt);
  assert.equal(s.remote.intentCreates, 0);
});

test('cancellation at 71:59:59 survives reloads, stale alarms and duplicate webhooks with zero charges', async () => {
  const s = scenario();
  await s.startTrial();
  s.at(start + TRIAL_DURATION_MS - 1000);
  const canceled = await s.engine.run('cancel', user);
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.canAccess, false);
  assert.equal(s.db.alarm, null);
  s.at(start + TRIAL_DURATION_MS);
  const restarted = s.restart();
  await Promise.all([restarted.run('alarm'), restarted.run('notify', user), restarted.run('cancel', user)]);
  await assert.rejects(restarted.run('checkout', checkoutInput), BillingError);
  assert.equal(s.remote.intentCreates, 0);
  assert.equal(s.remote.charges, 0);
  assert.equal((await restarted.run('status', user)).status, 'canceled');
});

test('cancellation received before expiry wins even if another operation delays the handler', async () => {
  const s = scenario();
  await s.startTrial();
  s.at(start + TRIAL_DURATION_MS - 1);
  const pending = s.engine.run('cancel', user);
  s.at(start + TRIAL_DURATION_MS);
  const alarm = s.engine.run('alarm');
  assert.equal((await pending).status, 'canceled');
  assert.equal((await alarm).status, 'canceled');
  assert.equal(s.remote.charges, 0);
});

test('offline day-four alarm charges 18 USD exactly once, including simultaneous callbacks and future visits', async () => {
  const s = scenario();
  await s.startTrial();
  s.at(start + TRIAL_DURATION_MS - 1);
  assert.equal((await s.engine.run('alarm')).status, 'trial_active');
  assert.equal(s.remote.confirmations, 0);
  s.at(start + TRIAL_DURATION_MS);
  const fresh = s.restart();
  assert.equal((await fresh.run('status', user)).canAccess, false);
  await assert.rejects(fresh.run('cancel', user), BillingError);
  const [payment] = await Promise.all([fresh.run('alarm'), fresh.run('alarm'), fresh.run('notify', user)]);
  assert.equal(payment.status, 'paid');
  assert.equal(payment.amountCents, CHARGE_CENTS);
  assert.equal(payment.currency, 'USD');
  assert.equal(payment.renewal, false);
  assert.equal(payment.chargedAt, '2026-11-25T23:40:00.000Z');
  assert.equal(s.db.alarm, null);
  s.at(start + 370 * 86400000);
  const nextYear = s.restart();
  assert.equal((await nextYear.run('alarm')).canAccess, true);
  assert.equal((await nextYear.run('notify', user)).chargedAt, payment.chargedAt);
  assert.equal(s.remote.intentCreates, 1);
  assert.equal(s.remote.confirmations, 1);
  assert.equal(s.remote.charges, 1);
});

test('ambiguous confirmation resumes the persisted intent after a process restart without a second charge', async () => {
  const s = scenario();
  await s.startTrial();
  s.at(start + TRIAL_DURATION_MS);
  s.remote.loseResponse = true;
  await assert.rejects(s.engine.run('alarm'), /connection_lost/);
  assert.equal(s.db.record?.intentId, 'pi_test_1');
  assert.equal(s.db.record?.status, 'charge_pending');
  assert.ok(s.db.alarm! > start + TRIAL_DURATION_MS);
  s.at(start + TRIAL_DURATION_MS + 2 * 86400000);
  assert.equal((await s.restart().run('alarm')).status, 'paid');
  assert.equal(s.remote.charges, 1);
  assert.equal(s.remote.confirmations, 1);
  assert.equal(s.remote.intentCreates, 1);
});

test('a failed charge is visible and not automatically charged again', async () => {
  const s = scenario();
  await s.startTrial();
  s.remote.decline = true;
  s.at(start + TRIAL_DURATION_MS);
  const failed = await s.engine.run('alarm');
  assert.equal(failed.status, 'payment_failed');
  assert.equal(failed.canAccess, false);
  assert.equal(s.db.alarm, null);
  await s.engine.run('notify', user);
  assert.equal(s.remote.confirmations, 1);
  assert.equal(s.remote.charges, 0);
});

test('mismatched setup or charge cannot grant access or confirm the wrong amount', async () => {
  const s = scenario();
  await s.engine.run('checkout', checkoutInput);
  s.remote.session = { status: 'complete', uid: 'another-account', customerId: 'cus_other', paymentMethodId: 'pm_other' };
  await assert.rejects(s.engine.run('notify', user), /invalid_gateway_setup/);
  assert.equal((await s.engine.run('status', user)).canAccess, false);
  s.remote.session = { status: 'complete', uid: user.uid, customerId: 'cus_test', paymentMethodId: 'pm_test' };
  await s.engine.run('notify', user);
  s.at(start + TRIAL_DURATION_MS);
  s.remote.charge.amountCents = 2000;
  await assert.rejects(s.engine.run('alarm'), /invalid_gateway_charge/);
  assert.equal(s.remote.confirmations, 0);
  assert.equal((await s.engine.run('status', user)).canAccess, false);
});
