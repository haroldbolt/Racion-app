import assert from 'node:assert/strict';
import test from 'node:test';
import { readAccess, readCheckoutUrl } from '../src/services/billingClient';

const terms = {amountCents:2500, currency:'USD', renewal:false};
const offer = {...terms, provider:'hotmart', checkoutUrl:'https://pay.hotmart.com/A123456B?off=example'};

test('only a confirmed single USD 25 purchase opens the workspace', () => {
  for (const status of ['not_purchased', 'pending', 'paid', 'revoked']) {
    const entry = {...terms, status, canAccess:status === 'paid'};
    assert.deepEqual(readAccess(entry), entry);
    assert.throws(() => readAccess({...entry, canAccess:!entry.canAccess}));
  }
  for (const invalid of [{amountCents:1800}, {currency:'COP'}, {renewal:true}, {status:'trial_active'}]) {
    assert.throws(() => readAccess({...terms, status:'paid', canAccess:true, ...invalid}));
  }
});

test('the offer links to Hotmart only for the configured single USD 25 payment', () => {
  assert.equal(readCheckoutUrl(offer), offer.checkoutUrl);
  for (const checkoutUrl of ['https://pay.hotmart.com/', 'https://elsewhere.example/A123456B', 'https://pay.hotmart.com.evil.invalid/A123456B',
    'https://someone@pay.hotmart.com/A123456B','http://pay.hotmart.com/A123456B']) {
    assert.throws(() => readCheckoutUrl({...offer,checkoutUrl}));
  }
  assert.throws(() => readCheckoutUrl({...offer,amountCents:1800}));
  assert.throws(() => readCheckoutUrl({...offer,renewal:true}));
  assert.throws(() => readCheckoutUrl({...offer,provider:'other'}));
});
