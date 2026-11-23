import assert from 'node:assert/strict';
import { test } from 'node:test';
import { receiptOcrWarnings, receiptPdfText } from '../src/services/receiptReader';

test('rebuilds PDF invoice table cells in reading order without mixing totals with a food row', () => {
  const cell = (str: string, x: number, y: number) => ({ str, transform: [12, 0, 0, 12, x, y], height: 12 });
  assert.equal(receiptPdfText([
    cell('274.000', 450, 500), cell('2 kg', 250, 501), cell('2', 10, 500),
    cell('Royal Canin Sterilised 37', 40, 500),
    cell('TOTAL FACTURA', 40, 460), cell('312.000', 450, 460), { type: 'beginMarkedContent' },
  ]), '2   Royal Canin Sterilised 37   2 kg   274.000\nTOTAL FACTURA   312.000');
});

test('ignores malformed PDF text positions instead of deriving misleading invoice lines', () => {
  assert.equal(receiptPdfText([null, {}, { str: '1', transform: [] }, { str: '234', transform: [1, 0, 0, 1, NaN, 0] }]), '');
});

test('flags unclear OCR words on a high-confidence page and preserves what the reader actually saw', () => {
  const word = (value: string, confidence: number) => ['5', '1', '1', '1', '1', '1', '0', '0', '20', '10', confidence, value].join('\t');
  const warnings = receiptOcrWarnings(94, [word('2028', 55), word('15kg', 68), word('Mascotas', 96)].join('\n'));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /«2028».*«15kg»/);
  assert.doesNotMatch(warnings[0], /Mascotas/);
  assert.deepEqual(receiptOcrWarnings(96, word('1,5', 94)), []);
});
