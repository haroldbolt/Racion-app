import assert from 'node:assert/strict';
import test from 'node:test';
import { readAccess, readCheckoutUrl } from '../src/services/billingClient';

const trial = {
  status:'trial_active', canAccess:true, trialStartedAt:'2026-11-22T23:40:00.000Z',
  trialEndsAt:'2026-11-25T23:40:00.000Z', chargedAt:null,
  amountCents:1800, currency:'USD', renewal:false, serverTime:'2026-11-22T23:45:00.000Z',
};

test('the app accepts only the agreed trial and access state from the account service', () => {
  assert.deepEqual(readAccess(trial), trial);
  assert.throws(() => readAccess({ ...trial, amountCents:2000 }));
  assert.throws(() => readAccess({ ...trial, renewal:true }));
  assert.throws(() => readAccess({ ...trial, trialEndsAt:'2026-11-26T23:40:00.000Z' }));
  assert.throws(() => readAccess({ ...trial, status:'canceled', canAccess:true }));
  assert.throws(() => readAccess({ ...trial, status:'paid', chargedAt:null }));
});

test('the sandbox redirects only to a test session on Stripe Checkout', () => {
  const url = 'https://checkout.stripe.com/c/pay/cs_test_fixture#client';
  assert.equal(readCheckoutUrl({url}), url);
  assert.throws(() => readCheckoutUrl({url:url.replace('cs_test_', 'cs_live_')}));
  assert.throws(() => readCheckoutUrl({url:url.replace('checkout.stripe.com', 'example.org')}));
  assert.throws(() => readCheckoutUrl({}));
});
