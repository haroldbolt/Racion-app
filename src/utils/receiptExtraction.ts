import { parsePurchasedPriceCop } from './purchaseInput';

export interface ReceiptItemCandidate {
  id: string;
  description: string;
  packageKg?: number;
  quantity?: number;
  totalPaidCop?: number;
  unitPriceCop?: number;
  evidence: string;
  warnings: string[];
}

export interface ReceiptExtraction {
  items: ReceiptItemCandidate[];
  merchantName?: string;
  purchaseDate?: string;
  warnings: string[];
}

type Column = 'quantity' | 'unitPrice' | 'total' | 'discount' | 'tax';
type Header = { columns: Column[]; leadingQuantity: boolean };
type Block = { lines: string[]; header?: Header };
type NumberToken = { raw: string; value: number; start: number; end: number; moneyLike: boolean };
type Weight = { kg: number; start: number; end: number };

const numberSource = String.raw`(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const weightPattern = /(\d+(?:[.,]\d{1,3})?)\s*(k\s*g|kilogramos?|kilos?|g|gr|gramos?)\b/giu;
const itemTotalPattern = /\b(?:total|importe|valor)\s+(?:(?:del?|por)\s+)?(?:art[ií]culos?|productos?|l[ií]nea|[ií]tems?)\b|\bimporte\s*:/giu;
const unitPattern = /\b(?:precio|valor|vr|vlr|p)\s*\.?\s*(?:unit(?:ario)?\.?|\/\s*u\b)|\bunitario\b|\bp\s*\/\s*u\b/giu;
const quantityPattern = /\b(?:cantidad|cant\.?|qty|unidades?|unds?|uds?)\s*[:=]?\s*(\d{1,4})\b/giu;
const labeledContinuation = /^(?:(?:presentaci[oó]n|peso|contenido|cantidad|cant\.?|qty|unidades?|unds?|uds?|precio\b|valor\s+unit|vr\s+unit|vlr\s+unit|unitario|(?:total|importe|valor)\s+(?:(?:del?|por)\s+)?(?:art[ií]culo|producto|l[ií]nea|[ií]tem))\b|importe\s*:)/i;
const footer = /^(?:sub\s*total|total\b|gran\s+total|importe\s+total|iva\b|impuestos?\b|env[ií]o\b|flete\b|domicilio\b|propina\b|descuentos?\b|dto\.?\b|ahorro\b|efectivo\b|cambio\b|saldo\b|base\s+(?:gravable|imponible)|retenci[oó]n|vuelto\b|recibido\b|forma\s+de\s+pago|medio\s+de\s+pago|pago\b|visa\b|mastercard\b)/i;
const metadata = /^(?:nit\b|rut\b|factura\b|resoluci[oó]n\b|cufe\b|cude\b|cliente\b|tel[eé]fono\b|tel\.?\s*:|direcci[oó]n\b|email\b|fecha\b|hora\b|vendedor\b|cajero\b|caja\b|gracias\b|www\.|https?:|@)/i;

function cleanLine(line: string): string {
  return line.normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function uniqueValue(values: number[], tolerance = 0): number | undefined {
  const unique = values.filter((value, index) => values.findIndex((other) => Math.abs(other - value) <= tolerance) === index);
  return unique.length === 1 ? unique[0] : undefined;
}

function weights(text: string): Weight[] {
  return [...text.matchAll(weightPattern)].flatMap((match): Weight[] => {
    const amount = Number(match[1].replace(',', '.'));
    const kg = /^k/i.test(match[2]) ? amount : amount / 1000;
    return kg > 0 && kg <= 100 ? [{ kg, start: match.index!, end: match.index! + match[0].length }] : [];
  });
}

function tokens(text: string): NumberToken[] {
  const pattern = new RegExp(String.raw`(?:COP\s*)?\$?\s*(${numberSource})(?:\s*COP\b)?`, 'giu');
  return [...text.matchAll(pattern)].flatMap((match): NumberToken[] => {
    const raw = match[1];
    const value = raw === '0' ? 0 : parsePurchasedPriceCop(raw);
    return value === undefined ? [] : [{ raw, value, start: match.index!, end: match.index! + match[0].length,
      moneyLike: /\$|\bCOP\b/i.test(match[0]) || /[.,]\d{3}/.test(raw) || value >= 1000 }];
  });
}

function headerFrom(line: string): Header | undefined {
  const normalized = fold(line);
  const description = /\b(?:descripci[oó]n|producto|articulo|detalle|referencia|concepto)\b/i.exec(normalized);
  const fields: Array<{ kind: Column; start: number; end: number }> = [];
  const add = (pattern: RegExp, kind: Column) => {
    for (const match of normalized.matchAll(pattern)) {
      const start = match.index!;
      const end = start + match[0].length;
      if (!fields.some((field) => start < field.end && end > field.start)) fields.push({ kind, start, end });
    }
  };
  add(/\b(?:precio|valor|vr|vlr|p)\s*\.?\s*(?:unit(?:ario)?\.?|\/\s*u\b)|\bunitario\b|\bp\s*\/\s*u\b/g, 'unitPrice');
  add(/\b(?:cantidad|cant\.?|qty|unidades?|unds?|uds?)\b/g, 'quantity');
  add(/\b(?:descuento|dto|dcto)\b/g, 'discount');
  add(/\b(?:iva|impuesto)\b/g, 'tax');
  add(/\b(?:total|importe)\b/g, 'total');
  const hasValues = fields.some((field) => field.kind === 'unitPrice' || field.kind === 'total');
  if (!hasValues || (!description && fields.length < 2) || /\d/.test(line)) return undefined;
  fields.sort((left, right) => left.start - right.start);
  const leadingQuantity = Boolean(description && fields.some((field) => field.kind === 'quantity' && field.start < description.index));
  return { columns: fields.filter((field) => !(leadingQuantity && field.kind === 'quantity')).map((field) => field.kind), leadingQuantity };
}

function readLabeledAmounts(text: string, label: RegExp): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(label)) {
    const tail = text.slice(match.index! + match[0].length);
    const value = new RegExp(String.raw`^\s*[:=.]?\s*(?:COP\s*)?\$?\s*(${numberSource})(?:\s*COP\b)?`, 'i').exec(tail);
    const parsed = value ? parsePurchasedPriceCop(value[1]) : undefined;
    if (parsed !== undefined) amounts.push(parsed);
  }
  return amounts;
}

function rowColumns(line: string, header?: Header): Partial<Record<Column, number>> {
  if (!header) return {};
  const rowWeights = weights(line);
  const letters = [...line.matchAll(/[\p{L}]+/gu)].filter((match) => !/^COP$/i.test(match[0]));
  const tailStart = Math.max(0, ...rowWeights.map((weight) => weight.end), ...letters.map((match) => match.index! + match[0].length));
  const numeric = tokens(line).filter((token) => token.start >= tailStart || line.slice(token.start, tailStart).trim() === '');
  const values: Partial<Record<Column, number>> = {};
  if (header.leadingQuantity) {
    const leading = /^(\d{1,4})\s+(?=[\p{L}])/u.exec(line);
    if (leading && Number(leading[1]) > 0 && Number(leading[1]) <= 1000) values.quantity = Number(leading[1]);
  }
  if (numeric.length === header.columns.length) {
    header.columns.forEach((kind, index) => { values[kind] = numeric[index].value; });
  } else {
    const prices = header.columns.filter((kind) => kind === 'unitPrice' || kind === 'total');
    if (header.columns.every((kind) => kind === 'quantity' || kind === 'unitPrice' || kind === 'total') &&
      numeric.length === prices.length && numeric.every((token) => token.moneyLike)) {
      prices.forEach((kind, index) => { values[kind] = numeric[index].value; });
    }
  }
  return values;
}

function itemFrom(block: Block, index: number): ReceiptItemCandidate {
  const evidence = block.lines.join('\n');
  const allWeights = weights(evidence);
  const ambiguousGramSizes = [...evidence.matchAll(weightPattern)].filter((match) =>
    !/^k/i.test(match[2]) && /^\d{1,3}[.,]\d{3}$/.test(match[1]));
  const distinctWeight = uniqueValue(allWeights.map((weight) => weight.kg), 0.000001);
  const packageKg = ambiguousGramSizes.length ? undefined : distinctWeight;
  const quantities = [...evidence.matchAll(quantityPattern)].map((match) => Number(match[1]));
  for (const match of evidence.matchAll(/\b(\d{1,4})\s*(?:x|×)\s*\d+(?:[.,]\d{1,3})?\s*(?:k\s*g|g|gr|gramos?|kilogramos?)\b/giu)) quantities.push(Number(match[1]));
  for (const match of evidence.matchAll(/\b\d+(?:[.,]\d{1,3})?\s*(?:k\s*g|g|gr|gramos?|kilogramos?)\s*(?:x|×)\s*(\d{1,4})\b/giu)) quantities.push(Number(match[1]));
  for (const match of evidence.matchAll(/\b(\d{1,4})\s*(?:bolsas?|sacos?|bultos?|latas?|sobres?|paquetes?|unidades?|unds?|uds?)\b/giu)) quantities.push(Number(match[1]));
  const fromColumns = rowColumns(block.lines[0], block.header);
  if (fromColumns.quantity !== undefined) quantities.push(fromColumns.quantity);
  const quantity = uniqueValue(quantities.filter((value) => Number.isInteger(value) && value > 0 && value <= 1000));
  const unitAmounts = readLabeledAmounts(evidence, unitPattern);
  const totalAmounts = readLabeledAmounts(evidence, itemTotalPattern);
  if (fromColumns.unitPrice !== undefined && fromColumns.unitPrice > 0) unitAmounts.push(fromColumns.unitPrice);
  if (fromColumns.total !== undefined && fromColumns.total > 0) totalAmounts.push(fromColumns.total);
  const unitPriceCop = uniqueValue(unitAmounts);
  let totalPaidCop = uniqueValue(totalAmounts);
  const warnings: string[] = [];
  const hasAdjustments = /\b(?:descuento|dto|dcto|iva|impuesto|envio|flete)\b/i.test(fold(evidence)) ||
    block.header?.columns.some((column) => column === 'discount' || column === 'tax');
  if (totalAmounts.length === 0 && unitPriceCop !== undefined && quantity !== undefined && !hasAdjustments) {
    const computed = unitPriceCop * quantity;
    if (Number.isFinite(computed) && computed <= Number.MAX_SAFE_INTEGER / 100) {
      totalPaidCop = computed;
      warnings.push('El importe de la línea se calculó con el precio unitario y la cantidad explícitos. Confírmalo en la factura.');
    }
  }
  if (ambiguousGramSizes.length) warnings.push(`El tamaño «${ambiguousGramSizes[0][0]}» puede usar un separador de miles o decimal. Confirma el peso de cada empaque.`);
  else if (allWeights.length && distinctWeight === undefined) warnings.push('Hay varios tamaños posibles en esta línea. Confirma el peso de cada empaque.');
  if (quantities.length && quantity === undefined) warnings.push('Hay cantidades distintas en esta línea. Confirma cuántos empaques compraste.');
  if (totalAmounts.length && totalPaidCop === undefined) warnings.push('Hay importes distintos en esta línea. Confirma el importe final del alimento.');
  if (packageKg === undefined) warnings.push('No se identificó el peso de cada empaque.');
  if (quantity === undefined) warnings.push('No se identificó una cantidad explícita de empaques.');
  if (totalPaidCop === undefined) warnings.push('No se identificó el importe total de esta línea. No se usó el total general de la factura.');
  if (hasAdjustments) warnings.push('Revisa los descuentos e impuestos de esta línea antes de confirmar el importe.');
  if (totalPaidCop !== undefined && unitPriceCop !== undefined && quantity !== undefined &&
    Math.abs(unitPriceCop * quantity - totalPaidCop) > 1) {
    warnings.push('El importe de la línea difiere del precio unitario por la cantidad. Confirma descuentos o impuestos.');
  }
  let description = block.lines[0].replace(/\s+(?:COP\s*)?\$.*$/i, '').trim();
  if (block.header) {
    const firstWeight = weights(description);
    if (firstWeight.length) description = description.slice(0, firstWeight[firstWeight.length - 1].end).trim();
    if (block.header.leadingQuantity) description = description.replace(/^\d{1,4}\s+/, '');
  }
  return { id: `receipt-item-${index + 1}`, description, packageKg, quantity, totalPaidCop, unitPriceCop, evidence, warnings };
}

function purchaseDate(text: string): string | undefined {
  const labeled = /\bfecha(?:\s+de\s+(?:compra|emisi[oó]n|venta|factura))?\s*[:=]?\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})/i.exec(text);
  if (!labeled) return undefined;
  const parts = labeled[1].split(/[/-]/).map(Number);
  const [year, month, day] = parts[0] > 31 ? parts : [parts[2], parts[1], parts[0]];
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : undefined;
}

/** Extracts candidates and explicit evidence; the caller must review them before saving. */
export function extractReceipt(text: string): ReceiptExtraction {
  const normalized = text.slice(0, 200000).replace(/(?<=\d)\s*([.,])\s*(?=\d)/g, '$1');
  const lines = normalized.split(/\r?\n/).map(cleanLine).slice(0, 2000);
  const warnings: string[] = [];
  const blocks: Block[] = [];
  let block: Block | undefined;
  let header: Header | undefined;
  const finish = () => {
    if (block && blocks.length < 50) blocks.push(block);
    block = undefined;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    // OCR often inserts blank lines between a product and its labeled fields.
    // Only an explicit new product, header or footer ends that association.
    if (!line) continue;
    const nextHeader = headerFrom(line);
    if (nextHeader) { finish(); header = nextHeader; continue; }
    const continuation = labeledContinuation.test(line) && !headerFrom(line);
    if (block && continuation) { block.lines.push(line); continue; }
    if (footer.test(line) || metadata.test(line)) { finish(); continue; }
    if (block && !/[\p{L}]/u.test(line.replace(/\bCOP\b/gi, '')) && tokens(line).some((token) => token.moneyLike)) {
      block.lines[block.lines.length - 1] += ` ${line}`;
      continue;
    }
    const hasLetters = /[\p{L}]{2}/u.test(line);
    const hasFollowingDetails = labeledContinuation.test(lines.slice(index + 1).find(Boolean) ?? '');
    const candidate = hasLetters && !continuation && (weights(line).length > 0 ||
      tokens(line).some((token) => token.moneyLike) || hasFollowingDetails ||
      (header && !/^(?:descripcion|producto|detalle|cantidad|precio|total)\b/i.test(fold(line))));
    finish();
    if (candidate) block = { lines: [line], header };
  }
  finish();
  const items = blocks.map(itemFrom);
  if (/\b(?:USD|EUR|MXN|ARS|CLP|PEN|BRL)\b|US\s*\$|€/i.test(normalized)) {
    const message = 'La factura menciona una moneda distinta de COP. Confirma el importe en pesos colombianos; no se convirtió automáticamente.';
    warnings.push(message);
    for (const item of items) {
      item.totalPaidCop = undefined;
      item.unitPriceCop = undefined;
      item.warnings.push(message);
    }
  }
  const merchantName = lines.slice(0, 5).find((line, index) => line.length >= 3 && line.length <= 100 &&
    /[\p{L}]{3}/u.test(line) && !metadata.test(line) && !weights(line).length && !tokens(line).some((token) => token.moneyLike) &&
    (/\b(?:pets|mascotas|tienda|veterinaria|laika)\b/i.test(line) || /^(?:factura|nit)\b/i.test(lines[index + 1] ?? '')));
  if (items.length === 0) warnings.push('No se identificaron líneas de productos. Puedes ingresar los datos manualmente.');
  if (items.length > 1) warnings.push('La factura contiene varios productos. Elige la línea que corresponde al alimento.');
  if (lines.some((line) => footer.test(line) && /\b(?:descuento|dto|dcto|iva|impuesto|envio|flete|domicilio)\b/i.test(fold(line)))) {
    warnings.push('Los descuentos, impuestos y envíos generales no se asignaron al alimento. Revisa el importe que le corresponde.');
  }
  if (text.length > 200000 || lines.length === 2000 || blocks.length === 50) warnings.push('La lectura se limitó a una parte de la factura. Revisa el documento completo.');
  return { items, merchantName, purchaseDate: purchaseDate(lines.join('\n')), warnings };
}
