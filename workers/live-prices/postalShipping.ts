import type { LivePriceOffer, LivePriceProduct, LivePriceResponse } from '../../src/types/livePrices';
import { matchesFormula, normalizePriceWords, packageGrams, rankShoppingOffers, withoutPackageWeight } from './offers';

const storeId = 5624899;
const storefront = `https://storefront-api.tiendanube.com/2026-11/stores/${storeId}`;
const retailerName = 'laia pets';
const variantFields = ['id', 'name', 'variants.id', 'variants.values', 'variants.barcode', 'variants.visible',
  'variants.price', 'variants.promotional_price', 'variants.stock', 'variants.stock_management'].join(',');
const productsPerPage = 8;
const storefrontTimeout = 4000;

type JsonRecord = Record<string, unknown>;
type VariantMatch = { productId: number; variantId: number; productPriceCop: number };

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function numericId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function decimalCop(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,9}\.00$/.test(value)) return null;
  return Number(value);
}

function displayTitle(value: string): string {
  return normalizePriceWords(withoutPackageWeight(value)).replace(/\s+x$/, '');
}

async function storefrontJson(fetcher: typeof fetch, url: string | URL, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(storefrontTimeout),
    redirect: 'error',
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error('Storefront ' + response.status);
  return record(await response.json());
}

function variantMatches(
  merchantProduct: JsonRecord, product: LivePriceProduct, offerPrices: Set<number>, requireSize = false,
): VariantMatch[] {
  if (!numericId(merchantProduct.id) || !Array.isArray(merchantProduct.variants)) return [];
  const productId = merchantProduct.id;
  return merchantProduct.variants.flatMap((item): VariantMatch[] => {
    const variant = record(item);
    const variantId = variant.id;
    if (!numericId(variantId) || variant.visible !== true) return [];
    // Search can omit labels. The details must confirm the pack's displayed size regardless of its logistical weight.
    const values = Array.isArray(variant.values) ? variant.values : [];
    const weights = values.map((value) => typeof value === 'string' ? packageGrams(value) : null)
      .filter((value) => value !== null);
    if ((requireSize || weights.length > 0) && (weights.length !== 1 || weights[0] !== product.grams)) return [];
    const stocked = variant.stock_management === false ? variant.stock === null :
      variant.stock_management === true && typeof variant.stock === 'number' && Number.isSafeInteger(variant.stock) && variant.stock > 0;
    if (!stocked) return [];
    if (product.barcode && typeof variant.barcode === 'string' && /^\d{8,14}$/.test(variant.barcode) &&
      variant.barcode !== product.barcode) return [];
    const productPriceCop = decimalCop(variant.promotional_price ?? variant.price);
    if (productPriceCop === null || !offerPrices.has(productPriceCop)) return [];
    return [{ productId, variantId, productPriceCop }];
  });
}

function postalShippingAmount(options: unknown): number | null {
  if (!Array.isArray(options)) return null;
  const amounts = options.flatMap((item): number[] => {
    const option = record(item);
    if (typeof option.code !== 'string' || !option.code.trim() || typeof option.name !== 'string' || !option.name.trim()) return [];
    const label = normalizePriceWords([option.code, option.name, option.detail].join(' '));
    if (/\b(?:retir[oa]\w*|recog\w*|recib\w* en tienda|pick\s*up|local pickup)\b/.test(label)) return [];
    const amount = decimalCop(option.price);
    return amount === null ? [] : [amount];
  });
  return amounts.length > 0 ? Math.min(...amounts) : null;
}

async function quoteLaiaDelivery(
  offers: LivePriceOffer[], product: LivePriceProduct, postalCode: string, fetcher: typeof fetch, setStage: (stage: string) => void,
): Promise<{ title: string; productPriceCop: number; shippingCop: number } | null> {
  const eligible = offers.filter((offer) => offer.grams === product.grams && normalizePriceWords(offer.retailer) === retailerName);
  if (!eligible.length) return null;
  const title = displayTitle(eligible[0].title);
  const offerPrices = new Set(eligible.filter((offer) => displayTitle(offer.title) === title).map((offer) => offer.productPriceCop));

  // A short query finds candidates even when the storefront indexes fewer words than Google returns.
  const query = title.split(' ').slice(0, 4).join(' ');
  if (query.length < 2 || query.length > 100) return null;
  const search = new URL(`${storefront}/search/products`);
  search.search = new URLSearchParams({ q: query, fields: variantFields, per_page: String(productsPerPage) }).toString();
  setStage('catalog');
  const [store, result] = await Promise.all([
    storefrontJson(fetcher, `${storefront}?fields=id,country,currency`),
    storefrontJson(fetcher, search),
  ]);
  if (store.id !== storeId || store.country !== 'CO' || store.currency !== 'COP' || !Array.isArray(result.data)) return null;
  setStage('variant');
  const candidates = result.data.slice(0, productsPerPage).flatMap((item) => variantMatches(record(item), product, offerPrices));
  if (candidates.length !== 1) return null;

  const candidate = candidates[0];
  const details = new URL(`${storefront}/products/${candidate.productId}`);
  details.searchParams.set('fields', variantFields);
  setStage('product');
  const detail = await storefrontJson(fetcher, details);
  if (detail.id !== candidate.productId || typeof detail.name !== 'string' || displayTitle(detail.name) !== title ||
    !matchesFormula(detail.name, product)) return null;
  if (!variantMatches(detail, product, offerPrices, true).some(({ variantId, productPriceCop }) =>
    variantId === candidate.variantId && productPriceCop === candidate.productPriceCop)) return null;

  setStage('shipping');
  const shipping = await storefrontJson(fetcher, `${storefront}/shipping-options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zip_code: postalCode, variant_id: candidate.variantId, quantity: 1 }),
  });
  const shippingCop = postalShippingAmount(shipping.shipping_options);
  return shippingCop === null ? null : { title, productPriceCop: candidate.productPriceCop, shippingCop };
}

export async function quotePostalOffers(
  baseline: LivePriceResponse, product: LivePriceProduct, postalCode: string, fetcher: typeof fetch,
): Promise<LivePriceResponse> {
  // Postal totals must refer to this destination. City-level delivery remains available in a city-only lookup.
  const offers = baseline.offers.map((offer) => ({ ...offer, shippingCop: null, shippingPostalCode: undefined, totalCop: null }));
  let stage = 'start';
  let outcome = 'no match';
  const quote = baseline.status === 'current' ? await quoteLaiaDelivery(offers, product, postalCode, fetcher, (current) => {
    stage = current;
  }).catch((error: unknown) => {
    if (error instanceof Error) outcome = /^Storefront \\d{3}$/.test(error.message) ? error.message : error.name;
    return null;
  }) : null;
  if (!quote) return Object.assign({ ...baseline, offers, cheapestOfferId: null }, { postalQuoteDiagnostic: [stage, outcome] });

  const updated = offers.map((offer): LivePriceOffer =>
    offer.grams === product.grams && normalizePriceWords(offer.retailer) === retailerName &&
    displayTitle(offer.title) === quote.title && offer.productPriceCop === quote.productPriceCop ? {
      ...offer,
      stock: 'available',
      shippingCop: quote.shippingCop,
      shippingPostalCode: postalCode,
      totalCop: offer.productPriceCop + quote.shippingCop,
    } : offer,
  );
  return { ...baseline, ...rankShoppingOffers(updated, product.grams) };
}
