import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractReceipt } from '../src/utils/receiptExtraction';

test('extracts explicit food fields from a multi-item receipt without borrowing its general total', () => {
  const result = extractReceipt(`LAIA PETS
FACTURA DE VENTA TEST-001
Fecha: 21/11/2026
Royal Canin Sterilised 37 2 kg
Cantidad: 2  Precio unitario: $137.000
Total del articulo: $274.000
Collar rojo
Cantidad: 1  Precio unitario: $20.000
Total del articulo: $20.000
Subtotal: $294.000
Envio: $18.000
TOTAL A PAGAR: $312.000`);
  assert.equal(result.merchantName, 'LAIA PETS');
  assert.equal(result.purchaseDate, '2026-11-21');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].description, 'Royal Canin Sterilised 37 2 kg');
  assert.equal(result.items[0].packageKg, 2);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].unitPriceCop, 137000);
  assert.equal(result.items[0].totalPaidCop, 274000);
  assert.equal(result.items[1].totalPaidCop, 20000);
  assert.equal(result.items[1].packageKg, undefined);
  assert.ok(result.warnings.some((warning) => warning.includes('varios productos')));
  assert.ok(result.warnings.some((warning) => warning.includes('envíos generales')));
  assert.ok(result.items.every((item) => item.totalPaidCop !== 312000 && !item.evidence.includes('Subtotal')));
});

test('uses explicit quantity, unit-price and line-total columns with Colombian formatting', () => {
  const result = extractReceipt(`TIENDA MASCOTAS
Descripción Cantidad Precio unitario Total
Royal Canin Sterilised 37 2 kg 2 137.000 274.000
Purina Pro Plan húmedo 85 g 12 4.500 54.000
Subtotal 328.000
IVA 0
Total 328.000`);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map(({ packageKg, quantity, totalPaidCop, unitPriceCop }) => ({ packageKg, quantity, totalPaidCop, unitPriceCop })), [
    { packageKg: 2, quantity: 2, unitPriceCop: 137000, totalPaidCop: 274000 },
    { packageKg: 0.085, quantity: 12, unitPriceCop: 4500, totalPaidCop: 54000 },
  ]);
});

test('supports a leading quantity column and comma-grouped COP amounts', () => {
  const result = extractReceipt(`Cant Descripción Vr unit Total
2 Royal Canin Sterilised 37 2 kg 137,000 274,000
1 Alimento gatito 400 g 30200 30200
Total a pagar $304,200`);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].totalPaidCop, 274000);
  assert.equal(result.items[0].description, 'Royal Canin Sterilised 37 2 kg');
  assert.equal(result.items[1].packageKg, 0.4);
  assert.equal(result.items[1].quantity, 1);
});

test('reads gram packages, explicit package counts and unit arithmetic without inventing missing fields', () => {
  const result = extractReceipt(`Alimento húmedo 12 latas 85g
Precio unitario: $ 1.299,50
Alimento seco 2 x 2 k g
Precio unitario: COP137000
Alimento cachorro 400 g
TOTAL A PAGAR $999.999`);
  assert.equal(result.items[0].packageKg, 0.085);
  assert.equal(result.items[0].quantity, 12);
  assert.equal(result.items[0].unitPriceCop, 1299.5);
  assert.equal(result.items[0].totalPaidCop, 15594);
  assert.equal(result.items[1].packageKg, 2);
  assert.equal(result.items[1].quantity, 2);
  assert.equal(result.items[1].totalPaidCop, 274000);
  assert.equal(result.items[2].packageKg, 0.4);
  assert.equal(result.items[2].quantity, undefined);
  assert.equal(result.items[2].totalPaidCop, undefined);
});

test('does not treat product formula numbers as quantity or borrow an ambiguous unit price', () => {
  const result = extractReceipt(`Descripción Cantidad Precio unitario Total
Royal Canin Sterilised 37 2 kg 137.000 137.000
Royal Canin Senior 7+ 400 g
Subtotal 137.000
IVA 26.030
Envio 18.000
TOTAL A PAGAR 181.030`);
  assert.equal(result.items[0].quantity, undefined);
  assert.equal(result.items[0].unitPriceCop, 137000);
  assert.equal(result.items[0].totalPaidCop, 137000);
  assert.equal(result.items[1].quantity, undefined);
  assert.equal(result.items[1].totalPaidCop, undefined);
  assert.ok(!result.items.some((item) => item.totalPaidCop === 181030));
});

test('keeps conflicting sizes and quantities unset for manual review', () => {
  const result = extractReceipt(`Combo alimento 2 bolsas 2 kg + 400 g
Cantidad: 3
Total del producto: $137.000`);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].packageKg, undefined);
  assert.equal(result.items[0].quantity, undefined);
  assert.equal(result.items[0].totalPaidCop, 137000);
  assert.ok(result.items[0].warnings.some((warning) => warning.includes('varios tamaños')));
  assert.ok(result.items[0].warnings.some((warning) => warning.includes('cantidades distintas')));
});

test('uses an explicit discounted line total and leaves discounts and taxes out of the food identity', () => {
  const result = extractReceipt(`Descripción Cant Precio unitario Descuento Total
Alimento perro 2 kg 2 100.000 10 180.000
Descuento general 5.000
Envio 18.000
Total 193.000`);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].totalPaidCop, 180000);
  assert.equal(result.items[0].quantity, 2);
  assert.ok(result.items[0].warnings.some((warning) => warning.includes('difiere')));
  assert.ok(result.items[0].warnings.some((warning) => warning.includes('descuentos')));
});

test('does not derive a total from a unit value when the line has an unallocated tax or discount', () => {
  const result = extractReceipt(`Descripción Cantidad Precio unitario IVA
Alimento gato 85 g 2 1299 19
Total a pagar 3091,62`);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].unitPriceCop, 1299);
  assert.equal(result.items[0].totalPaidCop, undefined);
});

test('joins wrapped descriptions with explicit weight and counts, preserves evidence and validates dates', () => {
  const result = extractReceipt(`MASCOTAS
Fecha: 31/02/2026
Royal Canin Sterilised 37
Presentación: 2 kg
Cantidad: 2
Importe: $ 274 . 000`);
  assert.equal(result.items.length, 1);
  assert.equal(result.purchaseDate, undefined);
  assert.equal(result.items[0].packageKg, 2);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].totalPaidCop, 274000);
  assert.ok(result.items[0].evidence.includes('Presentación: 2 kg'));
});

test('returns no fabricated product for headers and a general total alone', () => {
  const result = extractReceipt('FACTURA ELECTRONICA\nNIT 123456789\nTOTAL A PAGAR: $137.000\nGracias por su compra');
  assert.equal(result.items.length, 0);
  assert.ok(result.warnings.length > 0);
});

test('handles actual Tesseract AUTO output with blank lines and orphan unit-price columns conservatively', () => {
  const result = extractReceipt(`LAIA PETS
FACTURA DE VENTA 2026-11-21
Royal Canin Sterilised 37 2 kg

Cantidad: 2    Precio unitario:

Total del articulo: $274.000

Collar rojo

Cantidad: 1    Precio unitario:

Total del articulo: $20.000

Subtotal: $294.000
Envio: $18.000
TOTAL A PAGAR: $312.000

$137.000

$20.000`);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].packageKg, 2);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(result.items[0].totalPaidCop, 274000);
  assert.equal(result.items[0].unitPriceCop, undefined);
  assert.equal(result.items[1].totalPaidCop, 20000);
  assert.ok(result.items.every((item) => item.totalPaidCop !== 312000));
  assert.ok(!result.items[0].evidence.includes('$137.000'));
});

test('recognizes abbreviated explicit unit-price columns and never treats a foreign amount as COP', () => {
  const local = extractReceipt('Descripción Cant Vlr. Unit Total\nAlimento gatos 2 kg 2 137000 274000');
  assert.equal(local.items[0].unitPriceCop, 137000);
  assert.equal(local.items[0].totalPaidCop, 274000);
  const foreign = extractReceipt('Alimento gatos 2 kg\nCantidad: 2\nPrecio unitario: USD $137.00\nTotal del articulo: USD $274.00');
  assert.equal(foreign.items[0].packageKg, 2);
  assert.equal(foreign.items[0].quantity, 2);
  assert.equal(foreign.items[0].unitPriceCop, undefined);
  assert.equal(foreign.items[0].totalPaidCop, undefined);
  assert.ok(foreign.warnings.some((warning) => warning.includes('moneda distinta')));
});

test('leaves a gram weight with an ambiguous thousands separator pending instead of pricing a tiny package', () => {
  for (const size of ['2.000 g', '1,000g']) {
    const result = extractReceipt(`Alimento gato ${size}\nCantidad: 1\nTotal del articulo: $137.000`);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].packageKg, undefined);
    assert.equal(result.items[0].quantity, 1);
    assert.equal(result.items[0].totalPaidCop, 137000);
    assert.ok(result.items[0].warnings.some((warning) => warning.includes('separador de miles o decimal')));
  }
  assert.equal(extractReceipt('Alimento gato 2000g\nCantidad: 1\nTotal del articulo: $137.000').items[0].packageKg, 2);
  assert.equal(extractReceipt('Alimento gato 0,085kg\nCantidad: 1\nTotal del articulo: $1299').items[0].packageKg, 0.085);
});
