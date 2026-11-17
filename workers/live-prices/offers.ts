import type { LivePriceOffer, LivePriceProduct } from '../../src/types/livePrices';

const wordAliases: Record<string, string> = {
  adult: 'adulto', adulta: 'adulto', adults: 'adulto', adultos: 'adulto',
  cat: 'gato', cats: 'gato', gatos: 'gato', gato: 'gato', gata: 'gato',
  dog: 'perro', dogs: 'perro', perros: 'perro', perro: 'perro', perra: 'perro',
  puppy: 'cachorro', puppies: 'cachorro', cachorros: 'cachorro',
  kitten: 'gatito', kittens: 'gatito', gatitos: 'gatito',
  chicken: 'pollo', salmon: 'salmon', turkey: 'pavo', lamb: 'cordero', rice: 'arroz',
  sterilised: 'esterilizado', sterilized: 'esterilizado', neutered: 'esterilizado', esterilizados: 'esterilizado',
  dry: 'seco', wet: 'humedo', junior: 'cachorro', mediano: 'medium', mediana: 'medium',
  small: 'mini', grande: 'maxi', large: 'maxi',
};
const descriptors = new Set(['de', 'del', 'the', 'with', 'for', 'and', 'y', 'para', 'con', 'alimento', 'food']);
const weightPattern = /(?<![\p{L}\p{N}])([0-9]+(?:[.,][0-9]+)?)\s*(kg|kilogramos?|kilos?|g|gr|gramos?|lbs?|libras?)\b/giu;
const invalidPackage = /\b(?:combos?|multipacks?|packs?|lotes?|fraccionad[oa]s?|reempacad[oa]s?|repackaged|surtid[oa]s?|probar|muestras?)\b|\b[2-9]\d*\s*(?:x|×|unidades?|unds?|und|uds|sacos?|bultos?|bolsas?|latas?)\s*(?:\d|\b)|\b1\d+\s*[x×]\s*\d|\+\s*\d/i;

export function normalizePriceWords(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function formulaTokens(value: string): string[] {
  return normalizePriceWords(value.replace(weightPattern, '')).split(' ')
    .filter((word) => word !== '' && !descriptors.has(word))
    .map((word) => Object.hasOwn(wordAliases, word) ? wordAliases[word] : word);
}

export function formulaSearchName(product: LivePriceProduct): string {
  const name = product.name.replace(weightPattern, '').trim();
  return normalizePriceWords(name).startsWith(`${normalizePriceWords(product.brand)} `)
    ? name
    : `${product.brand} ${name}`;
}

function packageGrams(title: string): number | null {
  if (invalidPackage.test(title) || /\b(?:reacondicionad[oa]|usad[oa]|segunda mano|granel|por kilo|desde|a partir de)\b/i.test(title)) {
    return null;
  }
  if (/\s(?:kg|g|gr|lbs?|kilos?)\s*[x×]\s*(?:[2-9]\d*|1\d+)\b/i.test(title)) return null;
  const weights = [...title.matchAll(weightPattern)].map((match) => {
    const unit = match[2].toLowerCase();
    const raw = unit.startsWith('g') && /^\d{1,2}[.,]\d{3}$/.test(match[1])
      ? match[1].replace(/[.,]/, '') : match[1].replace(',', '.');
    const amount = Number(raw);
    if (unit.startsWith('l')) return { grams: Math.round(amount * 453.59237), imperial: true };
    return { grams: Math.round(amount * (unit.startsWith('k') ? 1000 : 1)), imperial: false };
  });
  const selected = weights.find((weight) => !weight.imperial) ?? weights[0];
  if (!selected || selected.grams < 10 || selected.grams > 50000) return null;
  // A listing may describe the same package in metric and imperial units.
  const matchesOnePackage = weights.every(({ grams, imperial }) =>
    grams === selected.grams || (imperial !== selected.imperial && Math.abs(grams - selected.grams) <= selected.grams * 0.01)
  );
  return matchesOnePackage ? selected.grams : null;
}

function matchesFormula(title: string, product: LivePriceProduct): boolean {
  const titleTokens = new Set(formulaTokens(title));
  const model = new Set(formulaTokens(formulaSearchName(product)));
  const optional = new Set(['gato', 'perro', 'seco', 'humedo']);
  const required = [...model].filter((word) => !optional.has(word));
  if (!required.length || !required.every((word) => titleTokens.has(word))) return false;
  // Species and texture often disappear from a localized title, but an explicit conflict excludes it.
  const pairs = [['gato', 'perro'], ['seco', 'humedo']];
  if (pairs.some(([a, b]) => (model.has(a) && titleTokens.has(b)) || (model.has(b) && titleTokens.has(a)))) return false;
  const variants = ['cachorro', 'gatito', 'senior', 'pollo', 'salmon', 'pavo', 'cordero', 'esterilizado', 'mini', 'medium', 'maxi', 'light', 'indoor'];
  return !variants.some((word) => titleTokens.has(word) && !model.has(word));
}

function textField(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function retailerUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function parseCop(value: string): number | null {
  const explicitCop = /\bCOP\b|\bCOL\s*\$/i.test(value);
  if (/\b(?:USD|EUR|MXN|ARS|BRL|US)\b|[€£]|\bpor mes\b|\/\s*(?:kg|mes)\b/i.test(value)) return null;
  const digits = value.replace(/\bCOP\b|COL(?=\s*\$)|\$/gi, '').replace(/\s/g, '');
  // An unqualified dollar amount with US-style cents is not grounded in COP.
  if (!explicitCop && /\.\d{2}$/.test(digits)) return null;
  let normalized: string;
  if (/^\d+$/.test(digits)) normalized = digits;
  else if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(digits)) normalized = digits.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(digits)) normalized = digits.replace(/,/g, '');
  else if (/^\d+[.,]\d{1,2}$/.test(digits)) normalized = digits.replace(',', '.');
  else return null;
  const amount = Math.round(Number(normalized));
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 100000000 ? amount : null;
}

export function quotedShippingCop(delivery: unknown, extensions: unknown): number | null {
  const extensionText = Array.isArray(extensions) ? extensions.filter((item): item is string =>
    typeof item === 'string' && /env[ií]o|entrega|shipping|delivery/.test(item.toLowerCase())) : [];
  const fields = typeof delivery === 'string' ? [delivery, ...extensionText] : extensionText;
  for (const field of fields) {
    const value = normalizePriceWords(field);
    if (/\b(?:desde|minimo|compras|superiores|por encima|a partir|cupon|suscripcion|membresia|solo|aplica|after|over|orders|starting|minimum|between|entre|hasta|if|members|pickup|recogida|retiro)\b/.test(value)) continue;
    const amounts = [...field.matchAll(/(?:COL\s*\$|\bCOP\b\s*\$?|\$)\s*[\d.,]+|[\d.,]+\s*\bCOP\b/gi)];
    if (amounts.length > 1 || /\b(?:USD|EUR|MXN|ARS|BRL|US)\b|[€£]|\b[\d.,]+\s+a\s+[\d.,]+/i.test(field)) continue;
    const free = /^(?:gratis|free|sin costo)\b|\b(?:envio|entrega|domicilio) (?:gratis|gratuit[oa]|incluid[oa]|sin costo)\b|\bfree (?:shipping|delivery)\b/.test(value) ||
      /\(\s*(?:gratis|free)\s*\)\s*$/i.test(field);
    if (free) {
      if (amounts.length === 0) return 0;
      continue;
    }
    if (amounts.length === 1) {
      const amount = parseCop(amounts[0][0]);
      if (amount !== null) return amount;
    }
  }
  return null;
}

interface ShoppingResult {
  title?: unknown;
  source?: unknown;
  price?: unknown;
  link?: unknown;
  product_link?: unknown;
  delivery?: unknown;
  extensions?: unknown;
  availability?: unknown;
  tag?: unknown;
  badge?: unknown;
  gtin?: unknown;
  ean?: unknown;
  second_hand_condition?: unknown;
}

export function collectShoppingOffers(results: unknown[], product: LivePriceProduct): LivePriceOffer[] {
  const offers = new Map<string, LivePriceOffer>();
  for (const [index, value] of results.entries()) {
    if (!value || typeof value !== 'object') continue;
    const item: ShoppingResult = value;
    const title = textField(item.title, 220);
    const retailer = textField(item.source, 120);
    const productUrl = retailerUrl(item.link) ?? retailerUrl(item.product_link);
    const priceText = textField(item.price, 70);
    if (!title || !retailer || !productUrl || !priceText || item.second_hand_condition) continue;
    const grams = packageGrams(title);
    if (grams === null || !matchesFormula(title, product)) continue;
    const listedBarcode = String(item.gtin ?? item.ean ?? '');
    if (grams === product.grams && product.barcode && /^\d{8,14}$/.test(listedBarcode) && listedBarcode !== product.barcode) continue;
    const stockText = normalizePriceWords([
      item.availability, item.tag, item.badge, title, ...(Array.isArray(item.extensions) ? item.extensions : []),
    ].join(' '));
    if (/\b(?:agotad[oa]|sin stock|sin existencias|no hay stock|no disponible|out of stock|sold out)\b/.test(stockText)) continue;
    const productPriceCop = parseCop(priceText);
    if (productPriceCop === null || productPriceCop <= 0 ||
      (productPriceCop < 1000 && !/\bCOP\b|\bCOL\s*\$/i.test(priceText))) continue;
    const shippingCop = quotedShippingCop(item.delivery, item.extensions);
    const offer: LivePriceOffer = {
      id: `offer-${index + 1}`,
      title,
      retailer,
      grams,
      productPriceCop,
      shippingCop,
      totalCop: shippingCop === null ? null : productPriceCop + shippingCop,
      pricePerKgCop: Math.round(productPriceCop * 1000 / grams),
      productUrl,
      linkSource: /(?:^|\.)google\.(?:com(?:\.co)?|co)$/i.test(new URL(productUrl).hostname) ? 'google_shopping' : 'retailer',
      stock: /\b(?:disponible|en stock|in stock)\b/.test(stockText) ? 'available' : 'unknown',
    };
    const key = `${normalizePriceWords(retailer)}:${grams}:${productUrl}`;
    const previous = offers.get(key);
    if (!previous || (offer.totalCop ?? Infinity) < (previous.totalCop ?? Infinity) ||
      (offer.totalCop === previous.totalCop && offer.productPriceCop < previous.productPriceCop)) offers.set(key, offer);
  }
  return [...offers.values()];
}

export function rankShoppingOffers(offers: LivePriceOffer[], grams: number) {
  const exact = offers.filter((offer) => offer.grams === grams);
  const alternatives = offers.filter((offer) => offer.grams !== grams);
  exact.sort((a, b) => (a.totalCop ?? Infinity) - (b.totalCop ?? Infinity) || a.productPriceCop - b.productPriceCop);
  alternatives.sort((a, b) => a.pricePerKgCop - b.pricePerKgCop);
  const cheapestOfferId = exact[0]?.totalCop != null ? exact[0].id : null;
  return { offers: [...exact, ...alternatives].slice(0, 40), cheapestOfferId };
}
