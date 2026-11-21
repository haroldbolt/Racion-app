import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePurchasedPriceCop } from '../src/utils/purchaseInput';

test('reads COP amounts from an entered price or Colombian invoice formatting', () => {
  for (const value of ['140000', '140.000', '140,000', ' 140.000 ']) {
    assert.equal(parsePurchasedPriceCop(value), 140000, value);
  }
  assert.equal(parsePurchasedPriceCop('1.299,50'), 1299.5);
  assert.equal(parsePurchasedPriceCop('1299,50'), 1299.5);
  assert.equal(parsePurchasedPriceCop('1299.50'), 1299.5);
  assert.equal(parsePurchasedPriceCop('1,299.50'), 1299.5);
  assert.equal(parsePurchasedPriceCop('0,50'), 0.5);
  assert.equal(parsePurchasedPriceCop('1.234.567,89'), 1234567.89);
});

test('rejects malformed, ambiguous or non-positive COP values', () => {
  for (const value of ['', '0', '-140000', '0.000', '140.00.0', '1,29,9', '140000,000', '140000.000',
    '1.299,500', '1.234,567', 'USD 140000', '140000 COP', '$140.000', 'Infinity', '1e5', '999999999999999']) {
    assert.equal(parsePurchasedPriceCop(value), undefined, value);
  }
  assert.equal(parsePurchasedPriceCop(null), undefined);
});
